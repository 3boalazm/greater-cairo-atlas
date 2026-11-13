-- Migration 003: Research Seed Extensions (REGIONAL Sector, Airport/Rail Types, Aliases & Partial Date Precision)
-- Phase 03 — Greater Cairo Atlas
--
-- Note: 000_enable_postgis.sql, 001_core_schema.sql, and 002_entity_taxonomy.sql are never
-- edited because applied migration checksums are immutable.
--
-- Changes:
--   1. Extend `entities_sector_chk` with 'REGIONAL' for cross-sector corridors, intercity roads,
--      high-speed rail lines, and regional cities.
--   2. Extend `entities_entity_type_chk` with 'airport' and 'rail_station'.
--   3. Add `entities.aliases TEXT[] NOT NULL DEFAULT '{}'::text[]` with a non-blank element guard.
--   4. Add `facts.valid_as_of_precision` ('day' | 'month' | 'year', default 'day') so partial
--      dates (e.g. 2026-02, 2024-10, 2025) are stored as first-of-period DATE + precision
--      rather than inventing day precision.
--   5. Relax `evidence.url` to allow NULL when a documented non-empty `title` + `publisher`
--      identifies an offline document or named official release awaiting its exact URL,
--      and add `evidence.published_date_precision` ('day' | 'month' | 'year', default 'day').

-- ---------------------------------------------------------------------------
-- 1. Extend entities.sector CHECK constraint with 'REGIONAL'
-- ---------------------------------------------------------------------------
ALTER TABLE entities
  DROP CONSTRAINT entities_sector_chk;

ALTER TABLE entities
  ADD CONSTRAINT entities_sector_chk CHECK (
    sector IN (
      'NORTH',
      'EAST',
      'SOUTH',
      'WEST',
      'CENTRAL',
      'REGIONAL'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Extend entities.entity_type CHECK constraint with 'airport' and 'rail_station'
-- ---------------------------------------------------------------------------
ALTER TABLE entities
  DROP CONSTRAINT entities_entity_type_chk;

ALTER TABLE entities
  ADD CONSTRAINT entities_entity_type_chk CHECK (
    entity_type IN (
      -- Researcher taxonomy (17 canonical types)
      'city',
      'district',
      'neighborhood',
      'road',
      'bridge',
      'interchange',
      'tunnel',
      'transit_line',
      'transit_stop',
      'rail_station',
      'airport',
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
-- 3. Add entities.aliases TEXT[] if missing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION text_array_has_no_blank_items(arr TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM unnest(arr) AS item
     WHERE item IS NULL OR btrim(item) = ''
  );
$$;

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE entities
  DROP CONSTRAINT IF EXISTS entities_aliases_nonblank_chk;

ALTER TABLE entities
  ADD CONSTRAINT entities_aliases_nonblank_chk CHECK (
    text_array_has_no_blank_items(aliases)
  );

-- ---------------------------------------------------------------------------
-- 4. Add facts.valid_as_of_precision ('day' | 'month' | 'year', default 'day')
-- ---------------------------------------------------------------------------
ALTER TABLE facts
  ADD COLUMN IF NOT EXISTS valid_as_of_precision TEXT NOT NULL DEFAULT 'day';

ALTER TABLE facts
  DROP CONSTRAINT IF EXISTS facts_valid_as_of_precision_chk;

ALTER TABLE facts
  ADD CONSTRAINT facts_valid_as_of_precision_chk CHECK (
    valid_as_of_precision IN ('day', 'month', 'year')
  );

-- ---------------------------------------------------------------------------
-- 5. Evidence URL nullability for documented offline/pending-URL sources + published_date_precision
-- ---------------------------------------------------------------------------
ALTER TABLE evidence
  ALTER COLUMN url DROP NOT NULL;

ALTER TABLE evidence
  DROP CONSTRAINT IF EXISTS evidence_url_http_chk;

ALTER TABLE evidence
  ADD CONSTRAINT evidence_url_http_chk CHECK (
    url IS NULL OR url ~ '^https?://[^[:space:]]+$'
  );

ALTER TABLE evidence
  DROP CONSTRAINT IF EXISTS evidence_locator_or_title_chk;

ALTER TABLE evidence
  ADD CONSTRAINT evidence_locator_or_title_chk CHECK (
    url IS NOT NULL OR title IS NOT NULL
  );

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS published_date_precision TEXT NOT NULL DEFAULT 'day';

ALTER TABLE evidence
  DROP CONSTRAINT IF EXISTS evidence_published_date_precision_chk;

ALTER TABLE evidence
  ADD CONSTRAINT evidence_published_date_precision_chk CHECK (
    published_date_precision IN ('day', 'month', 'year')
  );
