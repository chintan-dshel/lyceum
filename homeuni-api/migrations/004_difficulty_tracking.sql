-- ============================================================
-- 004 — Difficulty Tracking & Advisor Nudges
-- ============================================================

-- DIFFICULTY EVENTS (passive signal log)
CREATE TYPE difficulty_signal AS ENUM (
  'lesson_time_exceeded',      -- weight: low
  'lesson_reopened',           -- weight: medium
  'confusion_keyword',         -- weight: medium  (from professor chat NLP)
  'assignment_low_score',      -- weight: high
  'exam_low_score',            -- weight: high
  'exam_reattempted',          -- weight: medium
  'session_gap',               -- weight: medium
  'user_explicit'              -- weight: immediate (user clicked "I'm struggling")
);

CREATE TYPE difficulty_weight AS ENUM ('low', 'medium', 'high', 'immediate');

CREATE TABLE IF NOT EXISTS difficulty_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id  UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   UUID REFERENCES lessons(id) ON DELETE CASCADE,
  signal      difficulty_signal NOT NULL,
  weight      difficulty_weight NOT NULL,
  metadata    JSONB DEFAULT '{}',
  -- metadata: { score?, visit_count?, time_spent_secs?, keyword? }
  resolved    BOOLEAN DEFAULT FALSE,   -- marked true after nudge sent or user moves on
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_difficulty_events_user
  ON difficulty_events(user_id, program_id, created_at);

CREATE INDEX IF NOT EXISTS idx_difficulty_events_unresolved
  ON difficulty_events(user_id, resolved, created_at)
  WHERE resolved = FALSE;

-- NUDGES (advisor check-in messages sent to user)
CREATE TYPE nudge_type AS ENUM (
  'different_angle',       -- offer alternative explanation
  'prerequisite',          -- suggest revisiting earlier concept
  'slow_down',             -- suggest breaking topic into smaller parts
  'take_break',            -- disengagement detected
  'encouragement',         -- general positive reinforcement
  'semester_review'        -- end-of-semester advisor message
);

CREATE TABLE IF NOT EXISTS nudges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id   UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  course_id    UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id    UUID REFERENCES lessons(id) ON DELETE CASCADE,
  nudge_type   nudge_type NOT NULL,
  message      TEXT NOT NULL,             -- the advisor's actual nudge text
  read_at      TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nudges_user_unread
  ON nudges(user_id, created_at)
  WHERE read_at IS NULL;
