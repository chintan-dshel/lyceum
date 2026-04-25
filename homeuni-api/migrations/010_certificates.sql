CREATE TABLE IF NOT EXISTS certificates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_code UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  program_id        UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  program_title     TEXT NOT NULL,
  degree_type       TEXT NOT NULL,
  field_of_study    TEXT NOT NULL,
  total_semesters   INT NOT NULL,
  gpa               NUMERIC(4,2),
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates (user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_code ON certificates (verification_code);
