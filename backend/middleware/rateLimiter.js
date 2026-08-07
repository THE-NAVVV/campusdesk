// ============ backend/middleware/rateLimiter.js ============
import db from "../db.js";
import "dotenv/config";

const MAX_REQUESTS = Number(process.env.OTP_MAX_REQUESTS || 3);
const WINDOW_MIN = Number(process.env.OTP_WINDOW_MIN || 10);

export function checkOtpRateLimit(req, res, next) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: { message: "Email is required" } });

  const windowStart = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString();

  const count = db
    .prepare(`SELECT COUNT(*) as c FROM otps WHERE email = ? AND createdAt >= ?`)
    .get(email, windowStart).c;

  if (count >= MAX_REQUESTS) {
    return res.status(429).json({
      error: { message: `Too many OTP requests. Try again after some time.` },
    });
  }

  next();
}