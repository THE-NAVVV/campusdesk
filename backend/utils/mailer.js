// ============ backend/utils/mailer.js ============
import "dotenv/config";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export async function sendMail({ to, subject, text }) {
  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: "CampusDesk", email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || `Brevo API error (status ${res.status})`);
    }

    console.log(`Mail sent to ${to}: ${subject}`);
    return data;
  } catch (err) {
    console.error("BREVO ERROR:", err.message);
    console.log(`[DEV MAIL FALLBACK] To: ${to} | Subject: ${subject} | ${text}`);
  }
}