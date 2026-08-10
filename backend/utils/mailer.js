// ============ backend/utils/mailer.js ============
import { Resend } from "resend";
import "dotenv/config";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendMail({ to, subject, text }) {
  try {
    const { data, error } = await resend.emails.send({
      from: "CampusDesk <onboarding@resend.dev>", // swap to your verified domain later
      to,
      subject,
      text,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    console.log(`Mail sent to ${to}: ${subject}`);
    return data;
  } catch (err) {
    console.error("RESEND ERROR:", err.message);
    console.log(`[DEV MAIL FALLBACK] To: ${to} | Subject: ${subject} | ${text}`);
  }
}