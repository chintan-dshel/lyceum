-- ============================================================
-- 013 — Add streak tracking columns to users
--
-- streak.service.js references current_streak, longest_streak,
-- and last_active_date but they were never added to the users table.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_streak   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak   INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date DATE;
