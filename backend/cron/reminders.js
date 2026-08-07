// ============ backend/cron/reminders.js ============
import cron from "node-cron";
import db from "../db.js";
import { sendMail } from "../utils/mailer.js";

// runs every minute
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  // 1) send reminder emails for bookings starting in ~the next hour, not sent yet
  const upcoming = db
    .prepare(
      `SELECT b.*, u.email as userEmail, u.name as userName, r.name as resourceName
       FROM bookings b
       JOIN users u ON u.id = b.userId
       JOIN resources r ON r.id = b.resourceId
       WHERE b.status = 'confirmed'
         AND b.reminderSent = 0
         AND b.startTime <= ?
         AND b.startTime > ?`
    )
    .all(oneHourLater.toISOString(), now.toISOString());

  for (const b of upcoming) {
    await sendMail({
      to: b.userEmail,
      subject: `Reminder: ${b.resourceName} booking starts soon`,
      text: `Hi ${b.userName}, your booking for ${b.resourceName} starts at ${b.startTime}. Don't be late!`,
    });
    db.prepare(`UPDATE bookings SET reminderSent = 1 WHERE id = ?`).run(b.id);
  }

  // 2) mark past confirmed bookings as completed
  db.prepare(
    `UPDATE bookings SET status = 'completed'
     WHERE status = 'confirmed' AND endTime <= ?`
  ).run(now.toISOString());
});

console.log("Reminder cron job scheduled (runs every minute)");