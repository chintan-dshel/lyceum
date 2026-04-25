-- Flashcard decks: one per lesson, auto-generated from lesson_spec
CREATE TABLE IF NOT EXISTS flashcard_decks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  cards       JSONB NOT NULL DEFAULT '[]',   -- [{front, back, tags}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id)
);

-- Per-user SM-2 state for each card
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  card_index      INT NOT NULL,
  easiness        NUMERIC(4,2) NOT NULL DEFAULT 2.5,   -- SM-2 EF
  interval_days   INT NOT NULL DEFAULT 0,
  repetitions     INT NOT NULL DEFAULT 0,
  due_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  last_quality    INT,                                  -- 0-5 last rating
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id, card_index)
);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_due
  ON flashcard_reviews (user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_lesson
  ON flashcard_reviews (user_id, lesson_id);
