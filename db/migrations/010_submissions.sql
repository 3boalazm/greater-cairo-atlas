-- PHASE 09.1: user-submitted suggestions remain separate from canonical facts.
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_code TEXT NOT NULL REFERENCES entities(code) ON DELETE RESTRICT,
  attribute TEXT NOT NULL CHECK (char_length(attribute) BETWEEN 1 AND 120),
  proposed_value TEXT NOT NULL CHECK (char_length(proposed_value) BETWEEN 1 AND 1000),
  source_url TEXT NOT NULL CHECK (char_length(source_url) BETWEEN 1 AND 2048),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 254),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewer_note TEXT CHECK (reviewer_note IS NULL OR char_length(reviewer_note) <= 1000),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX submissions_status_created_idx ON submissions (status, created_at DESC);
CREATE INDEX submissions_rate_limit_idx ON submissions (request_fingerprint, created_at DESC);
