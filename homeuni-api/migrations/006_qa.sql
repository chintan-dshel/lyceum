-- ============================================================
-- 006 — QA Pipeline: course specs, verdict telemetry, regen tracking
-- ============================================================

-- Programs: learner profile, draft mode, qa status
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS learner_profile   JSONB,
  ADD COLUMN IF NOT EXISTS draft_mode        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qa_status         TEXT;
-- qa_status: null | 'passed' | 'needs_review'

-- Courses: generation progress label, qa status
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS generation_phase  TEXT,
  ADD COLUMN IF NOT EXISTS qa_status         TEXT;
-- generation_phase: null when idle, text label while QA pipeline is running
-- qa_status: null | 'passed' | 'needs_review' | 'flagged'

-- Lessons: full Phase 4 spec, regen tracking, qa status
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS lesson_spec   JSONB,
  ADD COLUMN IF NOT EXISTS regen_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qa_status     TEXT;
-- lesson_spec: full Phase 4 lesson object (richer than content JSONB)
-- qa_status: null | 'passed' | 'needs_review' | 'flagged'

-- Course specs: Phase 1-3 output, stored per course
CREATE TABLE IF NOT EXISTS course_specs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  spec       JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id)
);

-- QA verdict telemetry: every reviewer run stored for drift analysis
CREATE TABLE IF NOT EXISTS qa_verdicts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID REFERENCES programs(id) ON DELETE CASCADE,
  course_id   UUID REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   UUID REFERENCES lessons(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL CHECK (scope IN ('spec', 'lesson')),
  rubric_set  TEXT NOT NULL,   -- 'structural' (1,4,5) | 'content' (2,3,6)
  verdict     TEXT NOT NULL CHECK (verdict IN ('PASS', 'REVISE', 'REGENERATE')),
  critique    JSONB,           -- structured critique for generator retry input
  raw_output  JSONB,           -- full reviewer JSON response
  attempt_num INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_specs_course ON course_specs(course_id);
CREATE INDEX IF NOT EXISTS idx_qa_verdicts_program  ON qa_verdicts(program_id);
CREATE INDEX IF NOT EXISTS idx_qa_verdicts_course   ON qa_verdicts(course_id);
CREATE INDEX IF NOT EXISTS idx_qa_verdicts_lesson   ON qa_verdicts(lesson_id);
