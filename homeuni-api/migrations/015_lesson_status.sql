-- ============================================================
-- 015 — Lesson Status
--
-- Adds explicit per-lesson status so the UI can show accurate
-- state (not_started / in_progress / complete) rather than
-- inferring from scroll depth or a 90-second timer.
-- 'generating' is runtime-only (in-memory) and not stored here.
-- ============================================================

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'complete'));
