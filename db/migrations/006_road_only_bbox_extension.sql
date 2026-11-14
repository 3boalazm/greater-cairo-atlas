-- Migration 006: Extend the road-only WGS84 envelope without widening non-road features.
-- Existing migration 004 remains immutable. Road geometry accepts [30.5, 29.2, 32.35, 30.9];
-- all other geometry retains the original [30.5, 29.2, 32.1, 30.8] coverage envelope.

ALTER TABLE features DROP CONSTRAINT features_greater_cairo_bbox_chk;

CREATE OR REPLACE FUNCTION enforce_entity_geometry_bbox()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  feature_entity_type TEXT;
  west DOUBLE PRECISION := 30.5;
  south DOUBLE PRECISION := 29.2;
  east DOUBLE PRECISION := 32.1;
  north DOUBLE PRECISION := 30.8;
BEGIN
  SELECT entity_type INTO feature_entity_type FROM entities WHERE id = NEW.entity_id;
  IF feature_entity_type = 'road' THEN
    east := 32.35;
    north := 30.9;
  END IF;
  IF ST_XMin(Box3D(NEW.geometry)) < west OR ST_YMin(Box3D(NEW.geometry)) < south
     OR ST_XMax(Box3D(NEW.geometry)) > east OR ST_YMax(Box3D(NEW.geometry)) > north THEN
    RAISE EXCEPTION 'feature geometry outside % WGS84 bbox',
      CASE WHEN feature_entity_type = 'road' THEN 'road-only' ELSE 'Greater Cairo' END
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_features_entity_geometry_bbox
BEFORE INSERT OR UPDATE OF entity_id, geometry ON features
FOR EACH ROW EXECUTE FUNCTION enforce_entity_geometry_bbox();
