-- Persistent learner memory: cross-lesson facts about each student.
-- One row per user; facts is an ordered JSONB array, newest first.
-- Populated by the professor agent after every 4th conversation turn.

CREATE TABLE learner_memory (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  facts      JSONB        NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
