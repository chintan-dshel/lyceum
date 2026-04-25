-- ============================================================
-- 001 — Users & Programs
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- PROGRAMS (one active degree per user, but history preserved)
CREATE TYPE program_status AS ENUM ('onboarding', 'generating', 'active', 'graduated', 'paused');
CREATE TYPE degree_type AS ENUM ('certificate', 'diploma', 'associate', 'bachelor', 'master', 'doctorate', 'custom');

CREATE TABLE IF NOT EXISTS programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,           -- e.g. "BSc Computer Science"
  degree_type     degree_type NOT NULL,
  field_of_study  TEXT NOT NULL,
  total_semesters INT NOT NULL DEFAULT 6,
  description     TEXT,
  goals           TEXT,                    -- user's stated learning goals from advisor chat
  gpa             NUMERIC(3,2) DEFAULT 0,
  status          program_status NOT NULL DEFAULT 'onboarding',
  program_brief   JSONB,                   -- advisor output before curriculum generation
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SEMESTERS
CREATE TYPE semester_status AS ENUM ('locked', 'active', 'complete');

CREATE TABLE IF NOT EXISTS semesters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id   UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  number       INT NOT NULL,              -- 1-based
  title        TEXT NOT NULL,             -- e.g. "Semester 1 — Foundations"
  theme        TEXT,                      -- optional semester theme
  status       semester_status NOT NULL DEFAULT 'active',
  gpa          NUMERIC(3,2),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(program_id, number)
);

-- ADVISOR CONVERSATIONS (persist onboarding + check-in history)
CREATE TABLE IF NOT EXISTS advisor_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  stage      TEXT,                         -- 'onboarding' | 'check_in' | 'semester_review'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advisor_conv_user ON advisor_conversations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_programs_user ON programs(user_id);
CREATE INDEX IF NOT EXISTS idx_semesters_program ON semesters(program_id, number);
