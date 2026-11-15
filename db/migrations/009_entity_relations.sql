-- PHASE 09.0: Explicit, provenance-backed relations between canonical entities.
-- Relations are directional unless the predicate's consumer chooses to display both ends.
CREATE TABLE entity_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_code TEXT NOT NULL REFERENCES entities(code) ON DELETE RESTRICT,
  predicate TEXT NOT NULL,
  object_code TEXT NOT NULL REFERENCES entities(code) ON DELETE RESTRICT,
  ordinal INTEGER,
  valid_as_of DATE,
  evidence_ref TEXT REFERENCES evidence(code) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entity_relations_predicate_chk CHECK (
    predicate IN ('has_station', 'interchange_with', 'part_of', 'crosses', 'connects', 'located_in', 'operated_by', 'developed_by')
  ),
  CONSTRAINT entity_relations_ordinal_positive_chk CHECK (ordinal IS NULL OR ordinal > 0),
  CONSTRAINT entity_relations_no_self_reference_chk CHECK (subject_code <> object_code),
  CONSTRAINT entity_relations_unique_triplet UNIQUE (subject_code, predicate, object_code)
);

CREATE INDEX entity_relations_subject_predicate_idx ON entity_relations (subject_code, predicate, ordinal);
CREATE INDEX entity_relations_object_predicate_idx ON entity_relations (object_code, predicate);
CREATE INDEX entity_relations_evidence_ref_idx ON entity_relations (evidence_ref) WHERE evidence_ref IS NOT NULL;
