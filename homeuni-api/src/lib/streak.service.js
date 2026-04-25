import { query } from '../db/pool.js';

/**
 * Call on any meaningful learning activity (lesson visit, study session).
 * Updates current_streak, longest_streak, last_active_date atomically.
 * No-ops if the user already has activity recorded for today.
 */
export async function updateStreak(userId) {
  if (!userId) return;

  await query(
    `UPDATE users
     SET
       last_active_date = CURRENT_DATE,
       current_streak = CASE
         WHEN last_active_date = CURRENT_DATE         THEN current_streak
         WHEN last_active_date = CURRENT_DATE - 1     THEN current_streak + 1
         ELSE 1
       END,
       longest_streak = GREATEST(
         longest_streak,
         CASE
           WHEN last_active_date = CURRENT_DATE         THEN current_streak
           WHEN last_active_date = CURRENT_DATE - 1     THEN current_streak + 1
           ELSE 1
         END
       )
     WHERE id = $1`,
    [userId]
  );
}

export async function getStreak(userId) {
  const { rows: [row] } = await query(
    'SELECT current_streak, longest_streak, last_active_date FROM users WHERE id = $1',
    [userId]
  );
  return row || { current_streak: 0, longest_streak: 0, last_active_date: null };
}
