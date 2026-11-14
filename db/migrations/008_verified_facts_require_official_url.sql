-- Align the database invariant with the documented verification rule: a verified
-- claim must retain at least one linked official evidence record with a URL.
CREATE OR REPLACE FUNCTION assert_fact_verified_has_primary_source(p_fact_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_state TEXT;
BEGIN
  SELECT code, verification_state INTO v_code, v_state
    FROM facts WHERE id = p_fact_id;
  IF NOT FOUND OR v_state <> 'verified' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM fact_evidence fe
      JOIN evidence ev ON ev.id = fe.evidence_id
     WHERE fe.fact_id = p_fact_id
       AND ev.source_type = 'official'
       AND ev.url IS NOT NULL
       AND btrim(ev.url) <> ''
  ) THEN
    RAISE EXCEPTION
      'Fact "%" cannot have verification_state = ''verified'' without linked official evidence with a URL.',
      v_code
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_fn_check_verified_fact_on_fact_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_fact_verified_has_primary_source(OLD.fact_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM assert_fact_verified_has_primary_source(NEW.fact_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fact_evidence_verified_requires_primary_source ON fact_evidence;
CREATE CONSTRAINT TRIGGER trg_fact_evidence_verified_requires_primary_source
AFTER INSERT OR DELETE OR UPDATE ON fact_evidence
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_fn_check_verified_fact_on_fact_evidence();

CREATE OR REPLACE FUNCTION trg_fn_check_verified_fact_on_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT fact_id FROM fact_evidence WHERE evidence_id = NEW.id
  LOOP
    PERFORM assert_fact_verified_has_primary_source(r.fact_id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_evidence_secondary_verified_guard ON evidence;
CREATE CONSTRAINT TRIGGER trg_evidence_secondary_verified_guard
AFTER UPDATE OF source_type, url ON evidence
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_fn_check_verified_fact_on_evidence();
