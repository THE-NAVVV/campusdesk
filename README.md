# CampusDesk

A full-stack campus resource booking app — students discover halls, labs, and
equipment, book time slots without clashing with anyone else, and get
automated email reminders before their booking starts.

Built for the GDG LNMIIT Web Development Recruitment task.

## 🔗 Live

- **Frontend:** https://sunny-jelly-cb0b14.netlify.app/
- **Backend API:** https://campusdesk-production.up.railway.app/api

## ✨ Features

- Email OTP authentication (no passwords) → JWT sessions
  - Email-first login flow: you enter your email, the backend checks if
    you're already registered, and only asks for your name if you're new —
    returning users go straight from email to OTP.
- Role-based access: student / admin
- Resource discovery — paginated, debounced search, category filters
- Booking with a live availability timeline (click a free slot to book)
- No-overlap guarantee on bookings, with 30 min–4 h duration and open/close
  hours validation
- My Bookings — status filter tabs, optimistic cancel with rollback
- Admin panel — add/deactivate resources, view & filter all bookings
- **Waitlist** — join a waitlist for a taken slot, auto-promoted + emailed
  when it frees up
- **Recurring bookings** — weekly series created atomically (all-or-nothing)
- Automated cron reminders 1 hour before a booking starts + auto-marking
  past bookings as completed
- Dark/light theme with persisted preference

See [DESIGN.md](./DESIGN.md) for the concurrency/double-booking approach and
other design decisions.

## 🧱 Tech stack

| Layer    | Tech |
|----------|------|
| Backend  | Node.js, Express |
| Database | SQLite (`better-sqlite3`, WAL mode), persisted on a Railway volume |
| Auth     | Email OTP + JWT (`jsonwebtoken`) |
| Email    | Brevo transactional email HTTP API (console fallback in dev / on failure) |
| Cron     | `node-cron` |
| Frontend | Vanilla HTML / CSS / JS |
| Hosting  | Railway (backend + DB), Netlify (frontend) |

## 📁 Project structure

```
backend/
  routes/        auth.js, resources.js, bookings.js, admin.js
  middleware/     auth.js (requireAuth/requireAdmin), rateLimiter.js
  utils/          mailer.js
  cron/           reminders.js
  db.js           schema + migrations
  seed.js         seeds resources only (leaves users/bookings untouched)
  server.js

frontend/
  index.html, resources.html, resource.html, my-bookings.html, admin.html
  js/  api.js, auth.js, resources.js, bookings.js, my-bookings.js, admin.js, theme.js
  css/ style.css
```

## ⚙️ Local setup

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in JWT_SECRET, BREVO_API_KEY, BREVO_SENDER_EMAIL
npm run seed            # seeds resources (and an admin user, if none exists)
npm start                # runs on PORT (default 5000)
```

**.env.example**

```
PORT=5000
JWT_SECRET=change_me
JWT_EXPIRES_IN=24h

BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=your_verified_sender@example.com

# Optional: absolute path for the SQLite file. On Railway this points at a
# mounted volume (e.g. /data/campusdesk.db) so data survives restarts/redeploys.
# If unset, defaults to ./campusdesk.db (fine for local dev).
DB_PATH=

OTP_EXPIRY_MIN=5
OTP_MAX_REQUESTS=3
OTP_WINDOW_MIN=10
```

**Why Brevo instead of raw SMTP:** Railway blocks outbound SMTP ports (25,
465, 587) on its free/hobby tier, so `nodemailer` over SMTP times out in
production even with correct credentials. Brevo's HTTP API sends over normal
HTTPS (443), which isn't blocked, and its free tier (300 emails/day) doesn't
require a verified domain — just one verified sender email.

### Frontend

Just open `index.html` via a static server (or Live Server) — it talks to
`API_BASE` set in `js/api.js`. Update that constant to `http://localhost:5000/api`
for local backend testing, or leave it pointed at the Railway URL above.

## 🔐 How login works

CampusDesk has no passwords — everything is email OTP + JWT.

1. **Enter email** — the frontend calls `GET /api/auth/check-email?email=...`
   to check if that email is already registered.
2. **Branch:**
   - **New email** → a "what's your name?" step appears. Name is only ever
     asked once, at signup.
   - **Already registered** → the app skips straight to sending the OTP, no
     name needed.
3. **OTP sent** — `POST /api/auth/send-otp` generates a 6-digit code (5 min
   expiry, single-use), stores it in the `otps` table, and emails it via
   Brevo. If Brevo fails for any reason, the OTP is also logged to the
   Railway deploy console as a fallback so login is never fully blocked.
4. **Verify** — `POST /api/auth/verify-otp` checks the code, marks it used,
   creates the user row if this is truly their first login (only reachable
   after step 2's name was collected), and returns a JWT (`{ id, role }`,
   24h expiry) plus the user object. The frontend stores both in
   `localStorage` and redirects to the resources page.

There is currently only **one seeded account**: `admin@lnmiit.ac.in` (role:
`admin`). Every other account is created organically the first time someone
logs in with a new email — there's no fixed list of "test students" anymore,
since `seed.js` no longer touches the `users` table if an admin already
exists (see [DESIGN.md](./DESIGN.md#seeding) for why).

## 📡 API overview

| Method | Endpoint                          | Auth        |
|--------|-----------------------------------|-------------|
| GET    | `/api/auth/check-email`           | —           |
| POST   | `/api/auth/send-otp`              | —           |
| POST   | `/api/auth/verify-otp`            | —           |
| GET    | `/api/resources`                  | student     |
| POST   | `/api/resources`                  | admin       |
| PATCH  | `/api/resources/:id`               | admin       |
| DELETE | `/api/resources/:id`               | admin       |
| GET    | `/api/resources/:id/bookings`      | student     |
| POST   | `/api/bookings`                    | student     |
| GET    | `/api/bookings/me`                 | student     |
| PATCH  | `/api/bookings/:id/cancel`         | owner/admin |
| POST   | `/api/bookings/recurring`          | student     |
| POST   | `/api/bookings/:resourceId/waitlist` | student   |
| GET    | `/api/bookings/waitlist/me`        | student     |
| DELETE | `/api/bookings/waitlist/:id`       | student     |
| GET    | `/api/admin/bookings`              | admin       |

All non-auth routes require `Authorization: Bearer <token>`. Errors follow a
consistent `{ error: { message, fields?, clash? } }` envelope with correct
status codes (400/401/403/404/409/429).

## 👤 Author

Nav Vardhan Singh (https://the-navvv.github.io/portfolio-website/) — GDG LNMIIT recruitment
assignment.
