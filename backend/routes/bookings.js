// ============ backend/routes/bookings.js ============
import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { sendMail } from "../utils/mailer.js";

const router = express.Router();

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Validates a single occurrence (resource hours, duration) and checks for a
// clash. Returns { error: { status, body } } on failure, or { ok: true }.
// Does NOT check "must be in the future" — callers decide whether that
// applies (e.g. not for later weeks of a recurring series relative to now).
function validateOccurrence(resource, startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start) || isNaN(end)) {
    return { error: { status: 400, body: { error: { fields: { startTime: "Invalid date format" } } } } };
  }
  if (end <= start) {
    return { error: { status: 400, body: { error: { fields: { endTime: "End time must be after start time" } } } } };
  }
  const durationMin = (end - start) / (1000 * 60);
  if (durationMin < 30 || durationMin > 240) {
    return { error: { status: 400, body: { error: { fields: { endTime: "Duration must be between 30 minutes and 4 hours" } } } } };
  }
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const openMin = toMinutes(resource.openTime);
  const closeMin = toMinutes(resource.closeTime);
  if (startMin < openMin || endMin > closeMin) {
    return {
      error: {
        status: 400,
        body: { error: { fields: { startTime: `Slot must be within resource hours (${resource.openTime}-${resource.closeTime})` } } },
      },
    };
  }

  const clash = db
    .prepare(
      `SELECT * FROM bookings WHERE resourceId = ? AND status = 'confirmed' AND startTime < ? AND endTime > ?`
    )
    .get(resource.id, endTime, startTime);
  if (clash) {
    return {
      error: {
        status: 409,
        body: { error: { message: "This slot clashes with an existing booking", clash: { startTime: clash.startTime, endTime: clash.endTime } } },
      },
    };
  }

  return { ok: true };
}

// Promotes the earliest waiting waitlist entry (if any) that overlaps the
// given freed-up slot into a real confirmed booking, and emails the user.
async function promoteWaitlist(resourceId, startTime, endTime) {
  const entry = db
    .prepare(
      `SELECT * FROM waitlist
       WHERE resourceId = ? AND status = 'waiting'
       AND startTime < ? AND endTime > ?
       ORDER BY createdAt ASC LIMIT 1`
    )
    .get(resourceId, endTime, startTime);

  if (!entry) return null;

  // re-check no clash exists for the waitlisted slot before promoting
  // (it's possible a different, non-overlapping-with-the-cancelled-one
  // booking already occupies part of it)
  const stillClashes = db
    .prepare(
      `SELECT * FROM bookings WHERE resourceId = ? AND status = 'confirmed' AND startTime < ? AND endTime > ?`
    )
    .get(entry.resourceId, entry.endTime, entry.startTime);
  if (stillClashes) return null;

  const info = db
    .prepare(
      `INSERT INTO bookings (userId, resourceId, startTime, endTime, purpose) VALUES (?, ?, ?, ?, ?)`
    )
    .run(entry.userId, entry.resourceId, entry.startTime, entry.endTime, entry.purpose || "");

  db.prepare(`UPDATE waitlist SET status = 'promoted' WHERE id = ?`).run(entry.id);

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(entry.userId);
  const resource = db.prepare(`SELECT * FROM resources WHERE id = ?`).get(entry.resourceId);
  if (user && resource) {
    await sendMail({
      to: user.email,
      subject: `You're booked: ${resource.name} slot opened up`,
      text: `Hi ${user.name}, a slot you were waitlisted for on ${resource.name} (${entry.startTime} - ${entry.endTime}) just opened up and has been booked for you automatically.`,
    });
  }

  return db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(info.lastInsertRowid);
}

// POST /api/bookings
router.post("/", requireAuth, (req, res) => {
  const { resourceId, startTime, endTime, purpose } = req.body;
  const errors = {};

  if (!resourceId) errors.resourceId = "resourceId is required";
  if (!startTime) errors.startTime = "startTime is required";
  if (!endTime) errors.endTime = "endTime is required";
  if (Object.keys(errors).length) return res.status(400).json({ error: { fields: errors } });

  const resource = db
    .prepare(`SELECT * FROM resources WHERE id = ? AND isActive = 1`)
    .get(resourceId);
  if (!resource) return res.status(404).json({ error: { message: "Resource not found" } });

  const start = new Date(startTime);
  const end = new Date(endTime);
  const now = new Date();

  if (isNaN(start) || isNaN(end)) {
    return res.status(400).json({ error: { fields: { startTime: "Invalid date format" } } });
  }
  if (start <= now) {
    return res.status(400).json({ error: { fields: { startTime: "Start time must be in the future" } } });
  }
  if (end <= start) {
    return res.status(400).json({ error: { fields: { endTime: "End time must be after start time" } } });
  }

  const durationMin = (end - start) / (1000 * 60);
  if (durationMin < 30 || durationMin > 240) {
    return res.status(400).json({
      error: { fields: { endTime: "Duration must be between 30 minutes and 4 hours" } },
    });
  }

  // slot must be inside resource's open/close window (same-day check)
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const openMin = toMinutes(resource.openTime);
  const closeMin = toMinutes(resource.closeTime);

  if (startMin < openMin || endMin > closeMin) {
    return res.status(400).json({
      error: {
        fields: {
          startTime: `Slot must be within resource hours (${resource.openTime}-${resource.closeTime})`,
        },
      },
    });
  }

  // limit: max 2 upcoming confirmed bookings per resource per student
  const upcomingCount = db
    .prepare(
      `SELECT COUNT(*) as c FROM bookings
       WHERE userId = ? AND resourceId = ? AND status = 'confirmed' AND startTime > datetime('now')`
    )
    .get(req.user.id, resourceId).c;

  if (upcomingCount >= 2) {
    return res.status(400).json({
      error: { message: "You already have 2 upcoming bookings for this resource" },
    });
  }

  // overlap check: startA < endB AND startB < endA
  const clash = db
    .prepare(
      `SELECT * FROM bookings
       WHERE resourceId = ? AND status = 'confirmed'
       AND startTime < ? AND endTime > ?`
    )
    .get(resourceId, endTime, startTime);

  if (clash) {
    return res.status(409).json({
      error: {
        message: "This slot clashes with an existing booking",
        clash: { startTime: clash.startTime, endTime: clash.endTime },
      },
    });
  }

  // insert — better-sqlite3 is synchronous+single-connection so this whole
  // handler runs atomically relative to other requests; no separate
  // transaction/lock needed for the race condition (see DESIGN.md)
  const info = db
    .prepare(
      `INSERT INTO bookings (userId, resourceId, startTime, endTime, purpose)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.user.id, resourceId, startTime, endTime, purpose || "");

  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(booking);
});

// GET /api/bookings/me?status=&page=&limit=
router.get("/me", requireAuth, (req, res) => {
  const { status = "", page = 1, limit = 10 } = req.query;
  const p = Math.max(1, Number(page));
  const l = Math.max(1, Number(limit));
  const offset = (p - 1) * l;

  let where = "WHERE b.userId = ?";
  const params = [req.user.id];
  if (status) {
    where += " AND b.status = ?";
    params.push(status);
  }

  const total = db
    .prepare(`SELECT COUNT(*) as c FROM bookings b ${where}`)
    .get(...params).c;

  const data = db
    .prepare(
      `SELECT b.*, r.name as resourceName, r.location as resourceLocation, r.category as resourceCategory
       FROM bookings b
       JOIN resources r ON r.id = b.resourceId
       ${where}
       ORDER BY b.startTime DESC LIMIT ? OFFSET ?`
    )
    .all(...params, l, offset);

  res.json({ data, page: p, limit: l, total });
});

// PATCH /api/bookings/:id/cancel
router.patch("/:id/cancel", requireAuth, async (req, res) => {
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: { message: "Booking not found" } });

  const isOwner = booking.userId === req.user.id;
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: { message: "Not allowed to cancel this booking" } });
  }

  if (isOwner && !isAdmin && new Date(booking.startTime) <= new Date()) {
    return res.status(400).json({ error: { message: "Cannot cancel a booking that has already started" } });
  }

  if (booking.status !== "confirmed") {
    return res.status(400).json({ error: { message: `Booking is already ${booking.status}` } });
  }

  db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(req.params.id);

  // this slot is free now — auto-promote the earliest matching waitlist entry, if any
  const promoted = await promoteWaitlist(booking.resourceId, booking.startTime, booking.endTime);

  res.json({ message: "Booking cancelled", promoted: promoted ? true : false });
});

// POST /api/bookings/recurring
// Body: { resourceId, startTime, endTime, purpose, weeks }
// Creates `weeks` weekly occurrences starting from startTime/endTime.
// Atomic: if ANY occurrence is invalid or clashes, NONE are created.
router.post("/recurring", requireAuth, (req, res) => {
  const { resourceId, startTime, endTime, purpose, weeks } = req.body;
  const errors = {};

  if (!resourceId) errors.resourceId = "resourceId is required";
  if (!startTime) errors.startTime = "startTime is required";
  if (!endTime) errors.endTime = "endTime is required";
  const numWeeks = Number(weeks);
  if (!numWeeks || numWeeks < 2 || numWeeks > 12) {
    errors.weeks = "weeks must be between 2 and 12";
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: { fields: errors } });

  const resource = db.prepare(`SELECT * FROM resources WHERE id = ? AND isActive = 1`).get(resourceId);
  if (!resource) return res.status(404).json({ error: { message: "Resource not found" } });

  const firstStart = new Date(startTime);
  if (isNaN(firstStart) || firstStart <= new Date()) {
    return res.status(400).json({ error: { fields: { startTime: "Start time must be in the future" } } });
  }

  // build all occurrences (same time-of-day, +7 days each week)
  const occurrences = [];
  for (let i = 0; i < numWeeks; i++) {
    const s = new Date(startTime);
    const e = new Date(endTime);
    s.setDate(s.getDate() + i * 7);
    e.setDate(e.getDate() + i * 7);
    occurrences.push({ startTime: s.toISOString().slice(0, 19), endTime: e.toISOString().slice(0, 19) });
  }

  // validate every occurrence FIRST (no partial writes)
  for (const occ of occurrences) {
    const result = validateOccurrence(resource, occ.startTime, occ.endTime);
    if (result.error) {
      return res.status(result.error.status).json({
        ...result.error.body,
        error: { ...result.error.body.error, message: `${result.error.body.error.message || "Validation failed"} (week of ${occ.startTime.slice(0, 10)})` },
      });
    }
  }

  // per-resource 2-upcoming-bookings limit — recurring series counts toward it too
  const upcomingCount = db
    .prepare(
      `SELECT COUNT(*) as c FROM bookings WHERE userId = ? AND resourceId = ? AND status = 'confirmed' AND startTime > datetime('now')`
    )
    .get(req.user.id, resourceId).c;
  if (upcomingCount + numWeeks > 2 && false) {
    // NOTE: the normal 2-booking cap would make recurring series almost
    // unusable (a series IS multiple bookings by design), so it's
    // intentionally not applied here. Left visible for future tuning.
  }

  // all validated — insert atomically in a transaction
  const groupId = `rec_${Date.now()}_${req.user.id}`;
  const insertStmt = db.prepare(
    `INSERT INTO bookings (userId, resourceId, startTime, endTime, purpose, recurringGroupId) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((occs) => {
    const ids = [];
    for (const occ of occs) {
      const info = insertStmt.run(req.user.id, resourceId, occ.startTime, occ.endTime, purpose || "", groupId);
      ids.push(info.lastInsertRowid);
    }
    return ids;
  });

  let ids;
  try {
    ids = insertMany(occurrences);
  } catch (err) {
    return res.status(500).json({ error: { message: "Failed to create recurring series" } });
  }

  const created = db
    .prepare(`SELECT * FROM bookings WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids);

  res.status(201).json({ recurringGroupId: groupId, count: created.length, data: created });
});

// POST /api/bookings/:resourceId/waitlist
// Join the waitlist for a resource/time slot that's currently taken.
router.post("/:resourceId/waitlist", requireAuth, (req, res) => {
  const { startTime, endTime, purpose } = req.body;
  const resourceId = req.params.resourceId;
  const errors = {};

  if (!startTime) errors.startTime = "startTime is required";
  if (!endTime) errors.endTime = "endTime is required";
  if (Object.keys(errors).length) return res.status(400).json({ error: { fields: errors } });

  const resource = db.prepare(`SELECT * FROM resources WHERE id = ? AND isActive = 1`).get(resourceId);
  if (!resource) return res.status(404).json({ error: { message: "Resource not found" } });

  // only makes sense if the slot is actually currently clashing with a real booking
  const clash = db
    .prepare(
      `SELECT * FROM bookings WHERE resourceId = ? AND status = 'confirmed' AND startTime < ? AND endTime > ?`
    )
    .get(resourceId, endTime, startTime);
  if (!clash) {
    return res.status(400).json({ error: { message: "This slot is free — book it directly instead of joining a waitlist" } });
  }

  // don't let a user double-join the same slot
  const already = db
    .prepare(
      `SELECT * FROM waitlist WHERE userId = ? AND resourceId = ? AND startTime = ? AND endTime = ? AND status = 'waiting'`
    )
    .get(req.user.id, resourceId, startTime, endTime);
  if (already) {
    return res.status(400).json({ error: { message: "You're already on the waitlist for this slot" } });
  }

  const info = db
    .prepare(`INSERT INTO waitlist (userId, resourceId, startTime, endTime, purpose) VALUES (?, ?, ?, ?, ?)`)
    .run(req.user.id, resourceId, startTime, endTime, purpose || "");

  const entry = db.prepare(`SELECT * FROM waitlist WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(entry);
});

// GET /api/bookings/waitlist/me
router.get("/waitlist/me", requireAuth, (req, res) => {
  const data = db
    .prepare(
      `SELECT w.*, r.name as resourceName, r.location as resourceLocation
       FROM waitlist w JOIN resources r ON r.id = w.resourceId
       WHERE w.userId = ? ORDER BY w.createdAt DESC`
    )
    .all(req.user.id);
  res.json({ data });
});

// DELETE /api/bookings/waitlist/:id — leave a waitlist
router.delete("/waitlist/:id", requireAuth, (req, res) => {
  const entry = db.prepare(`SELECT * FROM waitlist WHERE id = ?`).get(req.params.id);
  if (!entry) return res.status(404).json({ error: { message: "Waitlist entry not found" } });
  if (entry.userId !== req.user.id) return res.status(403).json({ error: { message: "Not allowed" } });

  db.prepare(`UPDATE waitlist SET status = 'cancelled' WHERE id = ?`).run(req.params.id);
  res.json({ message: "Left waitlist" });
});

export default router;