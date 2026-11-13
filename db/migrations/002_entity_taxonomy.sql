-- Migration 002: Researcher Entity Taxonomy & Secondary Evidence Epistemic Guard
-- Phase 02.1 — Greater Cairo Atlas
--
-- Note: 001_core_schema.sql is never edited because applied migration checksums are immutable.
--
-- Changes:
--   1. Extend `entities_entity_type_chk` to support the full 15-type researcher taxonomy
--      (city, district, neighborhood, road, bridge, interchange, tunnel, transit_line,
--      transit_stop, project, authority, landmark, facility, waterway, utility) while
--      retaining the 4 Phase 02 types (transit_station, bridge_interchange, public_facility,
--      development_zone) for backward compatibility.
--   2. Extend `evidence_source_type_chk` with 'secondary' (Wikipedia, real-estate blogs,
--      aggregators).
--   3. Add DEFERRABLE INITIALLY DEFERRED constraint triggers enforcing that a fact with
--      `verification_state = 'verified'` must be linked to at least one non-'secondary'
--      evidence record at transaction commit.

-- ---------------------------------------------------------------------------
-- 1. Extend entities.entity_type CHECK constraint
-- ---------------------------------------------------------------------------
ALTER TABLE entities
  DROP CONSTRAINT entities_entity_type_chk;

ALTER TABLE entities
  ADD CONSTRAINT entities_entity_type_chk CHECK (
    entity_type IN (
      -- Researcher taxonomy (15 canonical types)
      'city',
      'district',
      'neighborhood',
      'road',
      'bridge',
      'interchange',
      'tunnel',
      'transit_line',
      'transit_stop',
      'project',
      'authority',
      'landmark',
      'facility',
      'waterway',
      'utility',
      -- Retained Phase 02 compatibility types
      'transit_station',
      'bridge_interchange',
      'public_facility',
      'development_zone'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Extend evidence.source_type CHECK constraint with 'secondary'
-- ---------------------------------------------------------------------------
ALTER TABLE evidence
  DROP CONSTRAINT evidence_source_type_chk;

ALTER TABLE evidence
  ADD CONSTRAINT evidence_source_type_chk CHECK (
    source_type IN (
      'official',
      'news',
      'dataset',
      'map',
      'pdf',
      'secondary'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Enforce that 'secondary' sources alone can never make a fact 'verified'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_fact_verified_has_primary_source(p_fact_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_state TEXT;
BEGIN
  SELECT code, verification_state
    INTO v_code, v_state
    FROM facts
   WHERE id = p_fact_id;

  IF NOT FOUND OR v_state <> 'verified' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM fact_evidence fe
      JOIN evidence ev ON ev.id = fe.evidence_id
     WHERE fe.fact_id = p_fact_id
       AND ev.source_type <> 'secondary'
  ) THEN
    RAISE EXCEPTION
      'Fact "%" cannot have verification_state = ''verified'' when backed only by secondary (or missing) evidence; at least one non-secondary source is required.',
      v_code
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_fn_check_verified_fact_on_facts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_fact_verified_has_primary_source(NEW.id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_fn_check_verified_fact_on_fact_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_fact_verified_has_primary_source(OLD.fact_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_fn_check_verified_fact_on_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.source_type = 'secondary' THEN
    FOR r IN
      SELECT fact_id FROM fact_evidence WHERE evidence_id = NEW.id
    LOOP
      PERFORM assert_fact_verified_has_primary_source(r.fact_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_facts_verified_requires_primary_source
AFTER INSERT OR UPDATE OF verification_state ON facts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_fn_check_verified_fact_on_facts();

CREATE CONSTRAINT TRIGGER trg_fact_evidence_verified_requires_primary_source
AFTER DELETE OR UPDATE ON fact_evidence
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_fn_check_verified_fact_on_fact_evidence();

CREATE CONSTRAINT TRIGGER trg_evidence_secondary_verified_guard
AFTER UPDATE OF source_type ON evidence
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_fn_check_verified_fact_on_evidence();
