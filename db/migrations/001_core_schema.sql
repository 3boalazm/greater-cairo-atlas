-- Migration 001: Core Evidentiary & Spatial Schema
-- Phase 02 — Greater Cairo Atlas
--
-- Core domain tables:
--   1. entities      — Canonical urban/geospatial subjects (stable text code, bilingual names, sector, lifecycle status)
--   2. evidence      — Verifiable provenance records (URL, publisher, source_type, publication/access dates)
--   3. facts         — Multi-valued assertions allowing conflicting claims side by side (no UNIQUE on entity_id + attribute)
--   4. features      — PostGIS geometries in WGS 84 (SRID 4326) with GiST index, OSM lineage, and license (ODbL)
-- Associative table:
--   - fact_evidence  — Many-to-many provenance links between facts and evidence (ON DELETE RESTRICT)

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. entities
-- ---------------------------------------------------------------------------
-- Lifecycle invariant: `status` defaults to 'unknown' (never 'operational') and is the sole
-- representation of operational state. A 'planned' or 'approved_planned' entity cannot be
-- represented as operational without an explicit `status` update.
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  sector TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT entities_code_format_chk CHECK (
    code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND char_length(code) BETWEEN 3 AND 120
  ),
  CONSTRAINT entities_name_ar_nonempty_chk CHECK (btrim(name_ar) <> ''),
  CONSTRAINT entities_name_en_nonempty_chk CHECK (btrim(name_en) <> ''),
  CONSTRAINT entities_entity_type_chk CHECK (
    entity_type IN (
      'city',
      'district',
      'neighborhood',
      'road',
      'transit_line',
      'transit_station',
      'bridge_interchange',
      'utility',
      'public_facility',
      'development_zone',
      'landmark',
      'waterway'
    )
  ),
  CONSTRAINT entities_sector_chk CHECK (
    sector IN ('NORTH', 'EAST', 'SOUTH', 'WEST', 'CENTRAL')
  ),
  CONSTRAINT entities_status_chk CHECK (
    status IN (
      'operational',
      'partial',
      'under_construction',
      'planned',
      'approved_planned',
      'unknown'
    )
  ),
  CONSTRAINT entities_description_nonempty_chk CHECK (
    description IS NULL OR btrim(description) <> ''
  )
);

CREATE INDEX entities_sector_idx ON entities (sector);
CREATE INDEX entities_status_idx ON entities (status);
CREATE INDEX entities_entity_type_idx ON entities (entity_type);

CREATE TRIGGER trg_entities_set_updated_at
BEFORE UPDATE ON entities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- 2. evidence
-- ---------------------------------------------------------------------------
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT,
  url TEXT NOT NULL,
  publisher TEXT NOT NULL,
  source_type TEXT NOT NULL,
  published_date DATE,
  accessed_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT evidence_code_format_chk CHECK (
    code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND char_length(code) BETWEEN 3 AND 120
  ),
  CONSTRAINT evidence_title_nonempty_chk CHECK (
    title IS NULL OR btrim(title) <> ''
  ),
  CONSTRAINT evidence_url_http_chk CHECK (
    url ~ '^https?://[^[:space:]]+$'
  ),
  CONSTRAINT evidence_publisher_nonempty_chk CHECK (btrim(publisher) <> ''),
  CONSTRAINT evidence_source_type_chk CHECK (
    source_type IN ('official', 'news', 'dataset', 'map', 'pdf')
  ),
  CONSTRAINT evidence_notes_nonempty_chk CHECK (
    notes IS NULL OR btrim(notes) <> ''
  )
);

CREATE INDEX evidence_source_type_idx ON evidence (source_type);
CREATE INDEX evidence_publisher_idx ON evidence (publisher);

CREATE TRIGGER trg_evidence_set_updated_at
BEFORE UPDATE ON evidence
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- 3. facts
-- ---------------------------------------------------------------------------
-- Disagreement invariant: NO UNIQUE constraint on (entity_id, attribute).
-- Multiple conflicting facts for the same entity and attribute coexist side by side.
CREATE TABLE facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  valid_as_of DATE,
  verification_state TEXT NOT NULL DEFAULT 'candidate',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT facts_code_format_chk CHECK (
    code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND char_length(code) BETWEEN 3 AND 120
  ),
  CONSTRAINT facts_attribute_format_chk CHECK (
    attribute ~ '^[a-z][a-z0-9_]*$' AND char_length(attribute) BETWEEN 2 AND 100
  ),
  CONSTRAINT facts_value_nonempty_chk CHECK (btrim(value) <> ''),
  CONSTRAINT facts_unit_nonempty_chk CHECK (
    unit IS NULL OR btrim(unit) <> ''
  ),
  CONSTRAINT facts_verification_state_chk CHECK (
    verification_state IN (
      'candidate',
      'single_source',
      'corroborated',
      'verified',
      'disputed',
      'rejected',
      'superseded'
    )
  ),
  CONSTRAINT facts_notes_nonempty_chk CHECK (
    notes IS NULL OR btrim(notes) <> ''
  )
);

CREATE INDEX facts_entity_id_idx ON facts (entity_id);
CREATE INDEX facts_entity_attribute_idx ON facts (entity_id, attribute);
CREATE INDEX facts_verification_state_idx ON facts (verification_state);

CREATE TRIGGER trg_facts_set_updated_at
BEFORE UPDATE ON facts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- ---------------------------------------------------------------------------
-- Associative Link: fact_evidence (many-to-many between facts and evidence)
-- ---------------------------------------------------------------------------
CREATE TABLE fact_evidence (
  fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE RESTRICT,
  evidence_id UUID NOT NULL REFERENCES evidence(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fact_id, evidence_id)
);

CREATE INDEX fact_evidence_evidence_id_idx ON fact_evidence (evidence_id);

-- ---------------------------------------------------------------------------
-- 4. features
-- ---------------------------------------------------------------------------
CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  evidence_id UUID REFERENCES evidence(id) ON DELETE RESTRICT,
  geometry geometry(Geometry, 4326) NOT NULL,
  osm_type TEXT,
  osm_id BIGINT,
  osm_version INTEGER,
  license TEXT NOT NULL DEFAULT 'ODbL',
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT features_code_format_chk CHECK (
    code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND char_length(code) BETWEEN 3 AND 120
  ),
  CONSTRAINT features_geometry_valid_wgs84_chk CHECK (
    ST_SRID(geometry) = 4326 AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
  ),
  CONSTRAINT features_osm_type_chk CHECK (
    osm_type IS NULL OR osm_type IN ('node', 'way', 'relation')
  ),
  CONSTRAINT features_osm_id_positive_chk CHECK (
    osm_id IS NULL OR osm_id > 0
  ),
  CONSTRAINT features_osm_version_positive_chk CHECK (
    osm_version IS NULL OR osm_version > 0
  ),
  CONSTRAINT features_osm_lineage_complete_chk CHECK (
    (osm_type IS NULL AND osm_id IS NULL AND osm_version IS NULL)
    OR (osm_type IS NOT NULL AND osm_id IS NOT NULL AND osm_version IS NOT NULL)
  ),
  CONSTRAINT features_license_chk CHECK (
    license IN (
      'ODbL',
      'ODbL-1.0',
      'CC-BY-4.0',
      'CC0-1.0',
      'official_gazette',
      'custom_documented'
    )
  ),
  CONSTRAINT features_osm_requires_odbl_chk CHECK (
    osm_type IS NULL OR license IN ('ODbL', 'ODbL-1.0')
  ),
  CONSTRAINT features_properties_object_chk CHECK (
    jsonb_typeof(properties) = 'object'
  )
);

CREATE INDEX features_geometry_gist_idx ON features USING GIST (geometry);
CREATE INDEX features_entity_id_idx ON features (entity_id);
CREATE INDEX features_evidence_id_idx ON features (evidence_id) WHERE evidence_id IS NOT NULL;
CREATE INDEX features_osm_ref_idx ON features (osm_type, osm_id, osm_version) WHERE osm_type IS NOT NULL;

CREATE TRIGGER trg_features_set_updated_at
BEFORE UPDATE ON features
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();
