/**
 * Streak reminder job.
 * Runs hourly. Between 20:00–21:00 server time, emails users whose streak
 * is at risk (active streak but no activity today). Deduplicates within a day.
 */
import { query } from '../db/pool.js';
import { sendEmail, buildStreakReminderEmail } from '../lib/email.service.js';

// In-memory dedup: set of user IDs that got a reminder today
const sentToday = new Set();
let lastResetDate = new Date().toDateString();

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    sentToday.clear();
    lastResetDate = today;
  }
}

async function runStreakCheck() {
  resetIfNewDay();

  const hour = new Date().getHours();
  if (hour < 20 || hour >= 21) return; // only fire in the 20:00–21:00 window

  const { rows: atRisk } = await query(
    `SELECT id, email, full_name, current_streak
     FROM users
     WHERE last_active_date = CURRENT_DATE - 1
       AND current_streak > 0`
  );

  if (!atRisk.length) return;

  console.log(`[StreakJob] ${atRisk.length} user(s) at risk — sending reminders`);

  for (const user of atRisk) {
    if (sentToday.has(user.id)) continue;
    sentToday.add(user.id);

    const { subject, html, text } = buildStreakReminderEmail(user.full_name, user.current_streak);
    try {
      await sendEmail({ to: user.email, subject, html, text });
      console.log(`[StreakJob] Reminder sent to ${user.email} (streak: ${user.current_streak})`);
    } catch (err) {
      console.error(`[StreakJob] Failed to email ${user.email}:`, err.message);
      sentToday.delete(user.id); // allow retry next hour
    }
  }
}

export function startStreakJob() {
  runStreakCheck().catch(err => console.error('[StreakJob] Error:', err.message));
  setInterval(() => {
    runStreakCheck().catch(err => console.error('[StreakJob] Error:', err.message));
  }, 60 * 60 * 1000); // every hour
}
