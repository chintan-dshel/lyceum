-- ============================================================
-- 002 — Courses, Lessons, Lecture Scripts
-- ============================================================

-- COURSES
CREATE TYPE course_status AS ENUM ('not_started', 'in_progress', 'complete');
CREATE TYPE course_type AS ENUM ('core', 'elective');

CREATE TABLE IF NOT EXISTS courses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id         UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  program_id          UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,           -- e.g. "CS101"
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  course_type         course_type NOT NULL DEFAULT 'core',
  credit_hours        INT NOT NULL DEFAULT 3,
  learning_objectives JSONB NOT NULL DEFAULT '[]',   -- string[]
  prerequisites       JSONB NOT NULL DEFAULT '[]',   -- course codes string[]
  position            INT NOT NULL DEFAULT 0,
  status              course_status NOT NULL DEFAULT 'not_started',
  final_grade         NUMERIC(5,2),
  grade_letter        TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- LESSONS
CREATE TYPE lesson_type AS ENUM ('lecture', 'lab', 'seminar', 'workshop', 'reading');

CREATE TABLE IF NOT EXISTS lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number           INT NOT NULL,              -- 1-based within course
  title            TEXT NOT NULL,
  summary          TEXT,
  content          JSONB NOT NULL DEFAULT '{}',
  -- content shape: { sections: [{ heading, body, type: 'text'|'example'|'key_concept'|'summary' }],
  --                  key_terms: [{ term, definition }], further_reading: string[] }
  lesson_type      lesson_type NOT NULL DEFAULT 'lecture',
  estimated_minutes INT NOT NULL DEFAULT 30,
  position         INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, number)
);

-- LESSON VISITS (difficulty signal source)
CREATE TABLE IF NOT EXISTS lesson_visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at       TIMESTAMPTZ DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ DEFAULT NOW(),
  time_spent_secs INT DEFAULT 0,             -- accumulated seconds
  scroll_depth    NUMERIC(5,2) DEFAULT 0,    -- 0-100 percentage
  visit_count     INT DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_visits_unique
  ON lesson_visits(lesson_id, user_id);

-- PROFESSOR CONVERSATIONS (per lesson session)
CREATE TABLE IF NOT EXISTS professor_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LECTURE SCRIPTS (Phase 2 — voice lectures, pre-generated)
CREATE TABLE IF NOT EXISTS lecture_scripts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  script_text         TEXT NOT NULL,
  whiteboard_timeline JSONB NOT NULL DEFAULT '[]',
  -- timeline shape: [{ at_second, op, ...params }]
  tts_voice           TEXT DEFAULT 'default',
  generated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_courses_semester ON courses(semester_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, number);
CREATE INDEX IF NOT EXISTS idx_prof_conv_lesson ON professor_conversations(lesson_id, user_id, created_at);
