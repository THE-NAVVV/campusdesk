// ============ backend/routes/resources.js ============
import express from "express";
import db from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET /api/resources?search=&category=&page=&limit=
router.get("/", requireAuth, (req, res) => {
  const { search = "", category = "", page = 1, limit = 10 } = req.query;
  const p = Math.max(1, Number(page));
  const l = Math.max(1, Number(limit));
  const offset = (p - 1) * l;

  let where = "WHERE isActive = 1";
  const params = [];

  if (search) {
    where += " AND (name LIKE ? OR description LIKE ? OR location LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (category) {
    where += " AND category = ?";
    params.push(category);
  }

  const total = db
    .prepare(`SELECT COUNT(*) as c FROM resources ${where}`)
    .get(...params).c;

  const data = db
    .prepare(`SELECT * FROM resources ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, l, offset);

  res.json({ data, page: p, limit: l, total });
});

// POST /api/resources (admin only)
router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, description, location, category, openTime, closeTime } = req.body;

  const errors = {};
  if (!name) errors.name = "Name is required";
  if (!category || !["hall", "equipment", "room", "other"].includes(category))
    errors.category = "Valid category is required";
  if (!openTime || !closeTime) errors.openTime = "Open and close time are required";
  if (Object.keys(errors).length) return res.status(400).json({ error: { fields: errors } });

  const info = db
    .prepare(
      `INSERT INTO resources (name, description, location, category, openTime, closeTime)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, description || "", location || "", category, openTime, closeTime);

  const resource = db.prepare(`SELECT * FROM resources WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(resource);
});

// PATCH /api/resources/:id (admin only)
router.patch("/:id", requireAuth, requireAdmin, (req, res) => {
  const resource = db.prepare(`SELECT * FROM resources WHERE id = ?`).get(req.params.id);
  if (!resource) return res.status(404).json({ error: { message: "Resource not found" } });

  const fields = ["name", "description", "location", "category", "openTime", "closeTime", "isActive"];
  const updates = [];
  const params = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }
  if (!updates.length) return res.status(400).json({ error: { message: "No fields to update" } });

  params.push(req.params.id);
  db.prepare(`UPDATE resources SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  res.json(db.prepare(`SELECT * FROM resources WHERE id = ?`).get(req.params.id));
});

// DELETE /api/resources/:id (soft delete, admin only)
router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  const resource = db.prepare(`SELECT * FROM resources WHERE id = ?`).get(req.params.id);
  if (!resource) return res.status(404).json({ error: { message: "Resource not found" } });

  db.prepare(`UPDATE resources SET isActive = 0 WHERE id = ?`).run(req.params.id);
  res.json({ message: "Resource deactivated" });
});

// GET /api/resources/:id/bookings?date=YYYY-MM-DD
router.get("/:id/bookings", requireAuth, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: { message: "date query param is required" } });

  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const bookings = db
    .prepare(
      `SELECT id, userId, startTime, endTime, status FROM bookings
       WHERE resourceId = ? AND status = 'confirmed'
       AND startTime <= ? AND endTime >= ?`
    )
    .all(req.params.id, dayEnd, dayStart);

  res.json({ data: bookings });
});

export default router;