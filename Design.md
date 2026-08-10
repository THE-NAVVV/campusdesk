# DESIGN.md — CampusDesk

This document explains the design decisions behind CampusDesk, with a focus on
the one requirement that actually carries the marks: **making sure two people
can never book the same resource for an overlapping time slot.**

---

## 1. Tech stack

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3` (synchronous driver, WAL mode),
  persisted on a Railway volume so data survives restarts and redeploys
- **Auth:** Email OTP (6-digit, 5 min expiry, single-use) → JWT (24h expiry, `{ id, role }`)
- **Email:** Brevo transactional email HTTP API, with a console-log dev
  fallback when the request fails or credentials are missing
- **Cron:** `node-cron`, runs every minute
- **Frontend:** Vanilla HTML/CSS/JS (no framework), warm minimal theme, dark/light toggle

---

## 2. The core problem: preventing double-booking

Two confirmed bookings on the same resource must never overlap. The standard
interval-overlap check used everywhere in this project is:

```
startA < endB  AND  startB < endA
```

This correctly allows back-to-back bookings (10:00–11:00 and 11:00–12:00 do
**not** overlap, since `endA == startB`) while rejecting any real clash.

### Where the race condition actually lives

The dangerous scenario is two students hitting `POST /api/bookings` for the
*same slot* at *nearly the same instant*:

1. Request A reads the bookings table → sees no clash.
2. Request B reads the bookings table → also sees no clash (A hasn't written yet).
3. Both A and B insert → double-booking, the exact bug the assignment is
   testing for.

This is a classic **check-then-act** race condition. A single `SELECT` and a
separate `INSERT`, even if the SQL itself is correct, are not atomic against
each other unless something serializes the two requests.

### How CampusDesk avoids it

`better-sqlite3` is a **synchronous** driver running against a single SQLite
connection in a single Node.js process. Because:

- Node.js is single-threaded for JS execution (no worker pool involved here),
  and
- `better-sqlite3`'s API is synchronous (no `await` between the read and the
  write inside a request handler),

the `SELECT ... clash check` and the subsequent `INSERT` inside
`POST /api/bookings` run as one uninterrupted block of synchronous code. The
event loop cannot switch to handling Request B in the middle of Request A's
check-then-insert sequence — there is no `await` point for it to interleave
at. So request A's clash-check-and-insert completes fully before request B's
handler ever starts running.

This gives the same practical guarantee as wrapping the check + insert in a
transaction, **without needing an explicit transaction**, because the
underlying primitive (one synchronous connection, one JS thread, no `await`
in the hot path) already serializes it.

```js
// routes/bookings.js — the critical section, no awaits in between
const clash = db.prepare(
  `SELECT * FROM bookings WHERE resourceId = ? AND status = 'confirmed'
   AND startTime < ? AND endTime > ?`
).get(resourceId, endTime, startTime);

if (clash) return res.status(409).json({ ... });

const info = db.prepare(
  `INSERT INTO bookings (userId, resourceId, startTime, endTime, purpose)
   VALUES (?, ?, ?, ?, ?)`
).run(req.user.id, resourceId, startTime, endTime, purpose || "");
```

**Caveat, stated honestly:** this guarantee holds only as long as (a) the app
runs as a single Node process with a single SQLite connection, and (b) no
`await` is introduced between the read and the write in this handler. If the
app were ever scaled horizontally (multiple Node processes/containers behind
a load balancer, each with its own DB connection) or moved to a
multi-connection Postgres setup, this in-process serialization no longer
applies, and the race would need to be closed with a DB-level primitive
instead (see below). SQLite's own file-level write lock also acts as a
second line of defense: only one writer can hold the database at a time, so
even a hypothetical multi-process deployment against the *same* SQLite file
would serialize writes, though it would still return generic "database is
locked" errors rather than clean 409s.

### If this were scaled beyond a single connection

The production-safe version of this fix — and the one used for the
**recurring bookings** feature, which needs true multi-row atomicity — is a
real database transaction:

```js
const insertMany = db.transaction((occurrences) => {
  const ids = [];
  for (const occ of occurrences) {
    const info = insertStmt.run(...);
    ids.push(info.lastInsertRowid);
  }
  return ids;
});
```

`better-sqlite3`'s `db.transaction()` wraps the whole callback in
`BEGIN ... COMMIT`, so if any occurrence fails validation partway through,
nothing is committed (all-or-nothing). For recurring bookings, every
occurrence is validated **before** any insert happens (`validateOccurrence`
loop runs fully first), so the transaction itself never needs to roll back on
a clash — it only protects against partial writes from an unexpected error
(e.g. a crash mid-loop).

For a Postgres-backed version of this project, the equivalent fix would be
either:
- `SELECT ... FOR UPDATE` on the resource row before the clash check, inside
  a transaction, or
- a Postgres `EXCLUDE` constraint using `tstzrange` and the `btree_gist`
  extension, which makes overlapping bookings *impossible to insert* at the
  database level regardless of application logic — the strongest guarantee,
  because it holds even under app bugs or multiple app instances.

---

## 3. Data model

```
User        id, name, email (unique), role (student|admin), createdAt
Resource    id, name, description, location, category, openTime, closeTime, isActive
Booking     id, userId → User, resourceId → Resource, startTime, endTime,
            purpose, status (confirmed|cancelled|completed), reminderSent,
            recurringGroupId, createdAt
Waitlist    id, userId → User, resourceId → Resource, startTime, endTime,
            purpose, status (waiting|promoted|cancelled), createdAt
OTP         id, email, code, expiresAt, used, createdAt
```

Foreign keys are enforced (`PRAGMA foreign_keys = ON`). Indexes on
`(resourceId, startTime, endTime)` for both `bookings` and `waitlist` keep the
clash-check query fast as data grows.

---

## 4. Validation rules (applied on every booking write path)

- `startTime` must be in the future
- `endTime` must be after `startTime`
- Duration must be between 30 minutes and 4 hours
- Slot must fall inside the resource's `openTime`–`closeTime` window
- A student may hold at most **2 upcoming confirmed bookings per resource**
  (deliberately *not* enforced on recurring series — see comment in
  `bookings.js`, since a series is inherently multiple bookings by design)

All violations return `400` with field-level messages; overlap conflicts
return `409` with the clashing slot's start/end time so the frontend can
display it without a second round trip.

---

## 5. Bonus features implemented

### Waitlist
Joining a waitlist is only allowed if the slot is genuinely taken (checked
against real confirmed bookings). When a booking is cancelled
(`PATCH /api/bookings/:id/cancel`), `promoteWaitlist()` runs in the same
request: it finds the earliest (`ORDER BY createdAt ASC`) waiting entry that
overlaps the freed slot, re-verifies no clash exists (in case a different
booking already fills part of that time), inserts a confirmed booking for
that user, marks the waitlist entry `promoted`, and emails them — all before
the cancel request returns.

### Recurring bookings
`POST /api/bookings/recurring` builds all N weekly occurrences up front,
**validates every single one** (hours, duration, clash) before writing
anything, and only then inserts all of them inside a single
`db.transaction()`. If week 3 of a 6-week series would clash, the whole
series is rejected and zero rows are written — true all-or-nothing atomicity.

### Automated reminders (cron)
A `node-cron` job runs every minute and:
1. Emails users whose confirmed, not-yet-reminded booking starts within the
   next hour, then flips `reminderSent = 1` so it's never sent twice.
2. Flips any confirmed booking whose `endTime` has passed to `completed`.

### Dark/light theme
Persisted via `localStorage`, applied before first paint (script runs before
`<body>` renders) to avoid a flash of the wrong theme, driven entirely by CSS
custom properties in `style.css`.

---

## 6. Email delivery: why Brevo, not raw SMTP

The original implementation used `nodemailer` over SMTP (Gmail). It worked
locally but failed in production on Railway with connection timeouts —
Railway's free/hobby tier blocks outbound traffic on standard SMTP ports
(25, 465, 587) as an anti-abuse measure, so the TCP handshake never
completes regardless of how correct the host/port/credentials are.

The fix was to switch to Brevo's transactional email **HTTP API**
(`POST https://api.brevo.com/v3/smtp/email`), which travels over standard
HTTPS (443) and isn't subject to the same port blocking. It also doesn't
require a verified domain on the free tier — only a single verified sender
email — which matters for a student project with no owned domain.

`sendMail()` in `utils/mailer.js` never throws out of the request handler:
if the Brevo call fails for any reason (bad key, rate limit, network blip),
the error is logged and the OTP/reminder text is also printed to the
console as a fallback, so a transient email failure never fully blocks
login or booking flows — worst case, the user (or an admin checking logs)
can still read the OTP from the Railway deploy log.

---

## 7. Auth flow: email-first, name only when needed

Login is OTP-only, no passwords. The flow is intentionally split into three
steps so returning users never have to re-enter their name:

1. **`GET /api/auth/check-email?email=...`** — looks up the email in
   `users` and returns `{ exists: boolean }`. This is a cheap, unauthenticated
   read with no side effects.
2. The frontend branches on that result:
   - `exists: false` → show a "what's your name?" field, since this is the
     one and only place a new user's name is ever collected.
   - `exists: true` → skip straight to sending the OTP.
3. **`POST /api/auth/verify-otp`** creates the `users` row (if it doesn't
   already exist) using the name collected in step 2. If someone races this
   flow and an account was created between steps 1 and 3 by another request,
   the `find or create` logic in `verify-otp` still resolves correctly since
   it re-checks by email rather than trusting the earlier `exists` result.

This avoids the earlier UX problem where every login — first-time or
returning — showed the same "Name (optional)" field with no indication of
whether it was actually needed, which was confusing and, combined with the
seeding issue below, made it look like accounts were being silently reset.

---

## 8. Seeding

`seed.js` originally wiped and recreated `users`, `bookings`, and
`resources` on every run — convenient for a fresh demo, but dangerous once
real accounts exist: re-running it during later debugging deleted a real
user's account and every booking tied to it, since `bookings.userId`
references `users.id` and both tables were unconditionally cleared before
being repopulated with a fixed set of test accounts.

It now only touches `resources`:

```js
db.exec(`DELETE FROM resources;`);
db.prepare(
  `INSERT OR IGNORE INTO users (name, email, role) VALUES (?, ?, 'admin')`
).run("Admin User", "admin@lnmiit.ac.in");
```

`users`, `otps`, and `bookings` are never touched, so `npm run seed` can be
re-run at any time (e.g. to reset the resource catalog after a demo) without
wiping real signups or their booking history. The admin insert uses
`INSERT OR IGNORE`, so it's a no-op once an admin exists — there is
currently exactly one seeded account, `admin@lnmiit.ac.in`. Every student
account is created organically via the normal signup flow in §7.

---

## 9. Known limitations

- Single SQLite file — fine for this assignment's scale and for a single
  Railway instance, but the concurrency guarantee described in §2 depends on
  staying single-process/single-connection.
- Email delivery depends on Brevo's free tier (300 emails/day); if that
  quota is exhausted, sends fall back to console-only logging until it
  resets.
- No pagination on `GET /resources/:id/bookings` since it's scoped to a
  single day, which is bounded by nature.
