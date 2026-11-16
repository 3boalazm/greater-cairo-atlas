-- Retire incorrect historical claims without removing facts or their evidence.
ALTER TABLE facts ADD COLUMN retired_at timestamptz, ADD COLUMN retired_reason text;
ALTER TABLE facts ADD CONSTRAINT facts_retirement_pair_chk CHECK (
  (retired_at IS NULL AND retired_reason IS NULL) OR
  (retired_at IS NOT NULL AND retired_reason IS NOT NULL AND btrim(retired_reason) <> '')
);

ALTER TABLE admin_audit_log DROP CONSTRAINT admin_audit_log_action_check;
ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_action_check CHECK (action IN (
  'fact.approve', 'fact.reject', 'fact.dispute', 'fact.reset', 'fact.retire',
  'evidence.attach', 'evidence.detach', 'geometry.replace', 'import.preview',
  'import.commit', 'submission.accept', 'submission.reject'
));

CREATE FUNCTION guard_fact_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'facts cannot be deleted; retire them instead';
  END IF;
  IF OLD.retired_at IS NOT NULL AND (NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.retired_reason IS DISTINCT FROM OLD.retired_reason) THEN
    RAISE EXCEPTION 'fact retirement is append-only';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER facts_retirement_guard BEFORE UPDATE OR DELETE ON facts
  FOR EACH ROW EXECUTE FUNCTION guard_fact_retirement();

-- Record the before and after image only when an existing, active candidate is retired.
WITH retired AS (
  UPDATE facts SET retired_at = now(),
    retired_reason = 'removed from canonical seed in d9abd04 (wrong OSM node for HSR station)'
  WHERE code IN ('F-STOP-AHMED-OMAR-HASHEM-OSM-NODE-ID-1', 'F-STOP-AHMED-OMAR-HASHEM-OSM-NODE-ID-2')
    AND retired_at IS NULL AND verification_state = 'candidate'
  RETURNING *
)
INSERT INTO admin_audit_log (actor, action, entity_code, fact_code, reason, before_state, after_state)
SELECT 'migration-012', 'fact.retire', e.code, r.code, r.retired_reason,
  to_jsonb(r) || jsonb_build_object('retired_at', NULL, 'retired_reason', NULL), to_jsonb(r)
FROM retired r JOIN entities e ON e.id = r.entity_id;
