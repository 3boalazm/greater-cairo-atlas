-- Migration 004: Feature provenance and Greater Cairo coverage guard.
-- Earlier applied migrations (000-003) are immutable.
-- Coordinates are WGS84 longitude/latitude; the broad operational envelope
-- covers Greater Cairo and its documented regional transit/road corridors.

ALTER TABLE features
  ADD CONSTRAINT features_greater_cairo_bbox_chk CHECK (
    ST_XMin(Box3D(geometry)) >= 30.5
    AND ST_YMin(Box3D(geometry)) >= 29.2
    AND ST_XMax(Box3D(geometry)) <= 32.1
    AND ST_YMax(Box3D(geometry)) <= 30.8
  );

ALTER TABLE features
  ADD CONSTRAINT features_provenance_metadata_chk CHECK (
    jsonb_typeof(properties -> 'source') = 'string'
    AND btrim(properties ->> 'source') <> ''
    AND jsonb_typeof(properties -> 'attribution') = 'string'
    AND btrim(properties ->> 'attribution') <> ''
    AND jsonb_typeof(properties -> 'retrieval_date') = 'string'
    AND properties ->> 'retrieval_date' ~ '^\d{4}-\d{2}-\d{2}$'
  );
