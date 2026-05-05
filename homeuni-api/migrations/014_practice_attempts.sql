-- ============================================================
-- 014 — Practice Attempts
--
-- lessons.js references practice_attempts for GET /lessons/:id/practice
-- and POST /lessons/:id/practice/:n but the table was never created.
-- ============================================================

CREATE TABLE IF NOT EXISTS practice_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  problem_index INT  NOT NULL,
  answer_text   TEXT NOT NULL,
  feedback      TEXT,
  score         NUMERIC(5,2),
  verdict       TEXT,
  hint          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_lesson_user
  ON practice_attempts(lesson_id, user_id, created_at DESC);
