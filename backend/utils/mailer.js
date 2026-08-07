// ============ backend/utils/mailer.js ============
import nodemailer from "nodemailer";
import "dotenv/config";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail({ to, subject, text }) {
  try {
    const info = await transporter.sendMail({
      from: '"CampusDesk" <no-reply@campusdesk.app>',
      to,
      subject,
      text,
    });
    console.log(`Mail sent to ${to}: ${subject}`);
    return info;
  } catch (err) {
    // Dev fallback: agar SMTP creds nahi hain toh console pe hi print kardo
    console.error("SMTP ERROR:", err.message); 
    console.log(`[DEV MAIL FALLBACK] To: ${to} | Subject: ${subject} | ${text}`);
  }
}