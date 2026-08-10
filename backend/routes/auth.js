// ============ backend/routes/auth.js ============
import express from "express";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { sendMail } from "../utils/mailer.js";
import { checkOtpRateLimit } from "../middleware/rateLimiter.js";
import "dotenv/config";

const router = express.Router();
const OTP_EXPIRY_MIN = Number(process.env.OTP_EXPIRY_MIN || 5);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}


router.get("/check-email", (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: { message: "Email is required" } });

  const existingUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  res.json({ exists: !!existingUser });
});

// POST /api/auth/send-otp
router.post("/send-otp", checkOtpRateLimit, async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: { message: "Email is required" } });

  
  const existingUser = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!existingUser && !name) {
    return res.status(400).json({ error: { message: "Name is required for signup" } });
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MIN * 60 * 1000).toISOString();

  db.prepare(`INSERT INTO otps (email, code, expiresAt) VALUES (?, ?, ?)`).run(
    email,
    code,
    expiresAt
  );

  console.log(`[OTP] ${email} -> ${code}`); 

  await sendMail({
    to: email,
    subject: "Your CampusDesk OTP",
    text: `Your OTP is ${code}. It expires in ${OTP_EXPIRY_MIN} minutes.`,
  });

  res.json({ message: "OTP sent successfully" });
});

// POST /api/auth/verify-otp
router.post("/verify-otp", (req, res) => {
  const { email, code, name } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: { message: "Email and code are required" } });
  }

  const otpRow = db
    .prepare(
      `SELECT * FROM otps WHERE email = ? AND code = ? AND used = 0 ORDER BY id DESC LIMIT 1`
    )
    .get(email, code);

  if (!otpRow) {
    return res.status(400).json({ error: { message: "Invalid OTP" } });
  }
  if (new Date(otpRow.expiresAt) < new Date()) {
    return res.status(400).json({ error: { message: "OTP has expired" } });
  }

  db.prepare(`UPDATE otps SET used = 1 WHERE id = ?`).run(otpRow.id);

  // find or create user
  let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (!user) {
    const info = db
      .prepare(`INSERT INTO users (name, email, role) VALUES (?, ?, 'student')`)
      .run(name || "Student", email);
    user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid);
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

export default router;