CREATE TABLE IF NOT EXISTS survey_responses (
  id BIGSERIAL PRIMARY KEY,
  q1 TEXT NOT NULL CHECK (q1 IN ('ja', 'nei', 'usikker')),
  q2 TEXT NOT NULL CHECK (q2 IN ('ja', 'nei', 'usikker')),
  q3 TEXT NOT NULL CHECK (q3 IN ('ja', 'nei', 'usikker')),
  q4 TEXT NOT NULL CHECK (q4 IN ('ja', 'nei', 'usikker')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS survey_responses_created_at_idx
  ON survey_responses (created_at DESC);
