-- BATCH 13: data administration workspace.
--
-- Two principles drive this migration:
--   1. Review actions NEVER delete or overwrite canonical data. Every decision is appended to
--      admin_audit_log with who/when/before/after/reason, so the history is reconstructable.
--   2. `verified` keeps meaning exactly what migration 008 says it means: an official evidence row
--      with a URL. This migration adds a review flag next to the fact, not a second source of truth
--      for verification_state.

-- ---------------------------------------------------------------------------
-- Review state per fact. One row per fact; absence means "not reviewed".
-- This is deliberately separate from facts.verification_state so that a reviewer can say
-- "I looked at this" without silently promoting evidence-free claims to verified.
-- ---------------------------------------------------------------------------
CREATE TABLE fact_reviews (
  fact_code TEXT PRIMARY KEY REFERENCES facts(code) ON DELETE RESTRICT,
  review_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_state IN ('pending', 'approved', 'rejected', 'disputed')),
  -- Rejection and dispute always need a written reason; approval does not.
  reason TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 2000),
  reviewer TEXT NOT NULL CHECK (char_length(reviewer) BETWEEN 1 AND 120),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fact_reviews_reason_required_chk CHECK (
    review_state IN ('pending', 'approved') OR (reason IS NOT NULL AND char_length(btrim(reason)) > 0)
  )
);

CREATE INDEX fact_reviews_state_idx ON fact_reviews (review_state, reviewed_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only audit log. There is no UPDATE/DELETE path in the application, and the triggers
-- below enforce that at the database level so a future bug cannot rewrite history.
-- ---------------------------------------------------------------------------
CREATE TABLE admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL CHECK (char_length(actor) BETWEEN 1 AND 120),
  action TEXT NOT NULL CHECK (action IN (
    'fact.approve', 'fact.reject', 'fact.dispute', 'fact.reset',
    'evidence.attach', 'evidence.detach',
    'geometry.replace',
    'import.preview', 'import.commit',
    'submission.accept', 'submission.reject'
  )),
  entity_code TEXT REFERENCES entities(code) ON DELETE RESTRICT,
  fact_code TEXT REFERENCES facts(code) ON DELETE RESTRICT,
  evidence_code TEXT REFERENCES evidence(code) ON DELETE RESTRICT,
  submission_id UUID REFERENCES submissions(id) ON DELETE RESTRICT,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 2000),
  -- The full before/after snapshots. Kept as JSONB so a reviewer can see exactly what changed
  -- without joining half the schema.
  before_state JSONB,
  after_state JSONB,
  request_fingerprint TEXT CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[a-f0-9]{64}$')
);

CREATE INDEX admin_audit_log_occurred_idx ON admin_audit_log (occurred_at DESC);
CREATE INDEX admin_audit_log_entity_idx ON admin_audit_log (entity_code, occurred_at DESC);
CREATE INDEX admin_audit_log_fact_idx ON admin_audit_log (fact_code, occurred_at DESC);

CREATE OR REPLACE FUNCTION admin_audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_audit_log_no_update
  BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_append_only();

-- ---------------------------------------------------------------------------
-- Geometry history. Replacing a geometry must never lose the previous one, and a geometry may only
-- come from an uploaded source with a declared licence.
-- ---------------------------------------------------------------------------
CREATE TABLE geometry_history (
  id BIGSERIAL PRIMARY KEY,
  feature_code TEXT NOT NULL,
  entity_code TEXT NOT NULL REFERENCES entities(code) ON DELETE RESTRICT,
  geometry JSONB NOT NULL,
  source_label TEXT NOT NULL CHECK (char_length(source_label) BETWEEN 1 AND 200),
  license TEXT NOT NULL CHECK (license IN ('ODbL-1.0', 'CC-BY-IGO', 'CC-BY-4.0')),
  attribution TEXT NOT NULL CHECK (char_length(attribution) BETWEEN 1 AND 500),
  replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replaced_by TEXT NOT NULL CHECK (char_length(replaced_by) BETWEEN 1 AND 120),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 2000)
);

CREATE INDEX geometry_history_entity_idx ON geometry_history (entity_code, replaced_at DESC);

-- ---------------------------------------------------------------------------
-- Import previews. A dry run is stored so the person who approves a commit is approving exactly
-- the diff they previewed, not a re-computation of it.
-- ---------------------------------------------------------------------------
CREATE TABLE admin_import_previews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 120),
  source_filename TEXT NOT NULL CHECK (char_length(source_filename) BETWEEN 1 AND 260),
  source_format TEXT NOT NULL CHECK (source_format IN ('json', 'csv')),
  -- SHA-256 of the uploaded payload, so a commit must present the same bytes.
  payload_checksum TEXT NOT NULL CHECK (payload_checksum ~ '^[a-f0-9]{64}$'),
  summary JSONB NOT NULL,
  diff JSONB NOT NULL,
  committed_at TIMESTAMPTZ,
  committed_by TEXT,
  CONSTRAINT admin_import_previews_commit_actor_chk CHECK (
    (committed_at IS NULL AND committed_by IS NULL) OR (committed_at IS NOT NULL AND committed_by IS NOT NULL)
  )
);

CREATE INDEX admin_import_previews_created_idx ON admin_import_previews (created_at DESC);

COMMENT ON TABLE fact_reviews IS 'BATCH 13: human review state for a fact. Never overwrites facts.verification_state.';
COMMENT ON TABLE admin_audit_log IS 'BATCH 13: append-only audit trail for every admin mutation.';
COMMENT ON TABLE geometry_history IS 'BATCH 13: previous geometry of every replaced feature, with source and licence.';
COMMENT ON TABLE admin_import_previews IS 'BATCH 13: stored dry-run diffs so a commit approves exactly what was previewed.';

-- ---------------------------------------------------------------------------
-- Reversal (no down-migration runner exists; this is the reviewed reverse script).
-- It is safe to run because every object here is new: nothing existing is altered.
--
--   DROP TRIGGER IF EXISTS admin_audit_log_no_update ON admin_audit_log;
--   DROP FUNCTION IF EXISTS admin_audit_log_append_only();
--   DROP TABLE IF EXISTS admin_import_previews;
--   DROP TABLE IF EXISTS geometry_history;
--   DROP TABLE IF EXISTS admin_audit_log;   -- history is lost; export it first
--   DROP TABLE IF EXISTS fact_reviews;
--
-- Reversing does not touch facts, evidence, entities, features, or submissions, because this
-- migration never modified them.
-- ---------------------------------------------------------------------------
