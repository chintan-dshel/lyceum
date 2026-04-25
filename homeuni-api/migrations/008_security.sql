-- Security events: injection blocks and PII detections
-- Rate limit violations are only logged to console (high-frequency, no DB needed)

CREATE TABLE IF NOT EXISTS security_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL
               CHECK (event_type IN ('injection_blocked', 'pii_detected')),
  detail     JSONB,
  ip_hash    VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events (user_id);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events (event_type);
CREATE INDEX IF NOT EXISTS security_events_time_idx ON security_events (created_at DESC);
