-- ============================================================
-- 003 — Assignments, Exams, Submissions
-- ============================================================

-- ASSIGNMENTS
CREATE TYPE assignment_type AS ENUM ('essay', 'short_answer', 'problem_set', 'code', 'project', 'reflection');

CREATE TABLE IF NOT EXISTS assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id        UUID REFERENCES lessons(id) ON DELETE SET NULL,  -- optional: tied to a lesson
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  assignment_type  assignment_type NOT NULL DEFAULT 'essay',
  prompt           TEXT NOT NULL,
  rubric           JSONB NOT NULL DEFAULT '[]',
  -- rubric shape: [{ criterion, description, max_points }]
  max_score        INT NOT NULL DEFAULT 100,
  position         INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- SUBMISSIONS
CREATE TABLE IF NOT EXISTS submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_text    TEXT,
  file_path       TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  score           NUMERIC(5,2),
  grade_letter    TEXT,
  feedback_text   TEXT,
  rubric_scores   JSONB DEFAULT '[]',
  -- rubric_scores shape: [{ criterion, score, max_points, feedback }]
  graded_at       TIMESTAMPTZ,
  attempt_number  INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id, user_id);

-- EXAMS
CREATE TYPE exam_type AS ENUM ('midterm', 'final', 'quiz', 'knowledge_check');

CREATE TABLE IF NOT EXISTS exams (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  exam_type        exam_type NOT NULL DEFAULT 'final',
  instructions     TEXT,
  questions        JSONB NOT NULL DEFAULT '[]',
  -- questions shape: [{ id, type: 'multiple_choice'|'short_answer'|'essay',
  --                      question, options?: string[], correct_answer?: string,
  --                      points, topic }]
  time_limit_mins  INT,                        -- null = no limit (honor system)
  max_score        INT NOT NULL DEFAULT 100,
  position         INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- EXAM ATTEMPTS
CREATE TABLE IF NOT EXISTS exam_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id      UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL DEFAULT '{}',
  -- answers shape: { [question_id]: user_answer_string }
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  score        NUMERIC(5,2),
  grade_letter TEXT,
  feedback     JSONB DEFAULT '[]',
  -- feedback shape: [{ question_id, score, max_points, correct_answer, explanation }]
  attempt_number INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id, user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);
