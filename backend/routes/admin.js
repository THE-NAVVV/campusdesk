// ============ backend/routes/admin.js ============
import express from "express";
import db from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();


router.get("/bookings", requireAuth, requireAdmin, (req, res) => {
  const { resourceId = "", status = "", date = "", page = 1, limit = 10 } = req.query;
  const p = Math.max(1, Number(page));
  const l = Math.max(1, Number(limit));
  const offset = (p - 1) * l;

  let where = "WHERE 1=1";
  const params = [];

  if (resourceId) {
    where += " AND resourceId = ?";
    params.push(resourceId);
  }
  if (status) {
    where += " AND status = ?";
    params.push(status);
  }
  if (date) {
    where += " AND startTime <= ? AND endTime >= ?";
    params.push(`${date}T23:59:59`, `${date}T00:00:00`);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM bookings ${where}`).get(...params).c;
  const data = db
    .prepare(
      `SELECT b.*, u.name as userName, u.email as userEmail, r.name as resourceName
       FROM bookings b
       JOIN users u ON u.id = b.userId
       JOIN resources r ON r.id = b.resourceId
       ${where}
       ORDER BY b.startTime DESC LIMIT ? OFFSET ?`
    )
    .all(...params, l, offset);

  res.json({ data, page: p, limit: l, total });
});

export default router;