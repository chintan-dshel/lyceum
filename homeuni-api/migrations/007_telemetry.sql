-- ============================================================
-- 007 — LLM Telemetry: cost, token, and latency tracking
-- ============================================================

-- One row per callClaude() invocation. Cost stored as snapshot at
-- write time so historical records survive future price changes.

CREATE TABLE IF NOT EXISTS agent_traces (
  id                   BIGSERIAL PRIMARY KEY,
  -- Identity
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  program_id           UUID REFERENCES programs(id) ON DELETE SET NULL,
  course_id            UUID REFERENCES courses(id) ON DELETE SET NULL,
  agent                VARCHAR(80) NOT NULL,   -- e.g. 'professor', 'generator', '__judge__'
  -- Model
  model                VARCHAR(100) NOT NULL,
  -- Tokens
  input_tokens         INT NOT NULL DEFAULT 0,
  output_tokens        INT NOT NULL DEFAULT 0,
  -- Cost snapshot (rates at time of call)
  input_price_per_mtok NUMERIC(10,6) NOT NULL DEFAULT 0,
  output_price_per_mtok NUMERIC(10,6) NOT NULL DEFAULT 0,
  cost_usd             NUMERIC(12,8) NOT NULL DEFAULT 0,
  -- Performance
  latency_ms           INT NOT NULL DEFAULT 0,
  -- Outcome
  status               VARCHAR(20) NOT NULL DEFAULT 'success'
                         CHECK (status IN ('success', 'error', 'timeout')),
  error_message        VARCHAR(500),
  -- Timestamp
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_traces_user       ON agent_traces(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_program    ON agent_traces(program_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_course     ON agent_traces(course_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_agent      ON agent_traces(agent);
CREATE INDEX IF NOT EXISTS idx_agent_traces_created    ON agent_traces(created_at);
