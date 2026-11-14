-- Migration 007: align the Regional Ring road exception with the validated seed envelope.
-- Migration 006 remains immutable; all non-Regional-Ring rules are unchanged.

CREATE OR REPLACE FUNCTION enforce_entity_geometry_bbox()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  feature_entity_type TEXT;
  feature_entity_code TEXT;
  west DOUBLE PRECISION := 30.5;
  south DOUBLE PRECISION := 29.2;
  east DOUBLE PRECISION := 32.1;
  north DOUBLE PRECISION := 30.8;
BEGIN
  SELECT entity_type, code
    INTO feature_entity_type, feature_entity_code
    FROM entities
   WHERE id = NEW.entity_id;

  IF feature_entity_type = 'road' THEN
    east := 32.35;
    north := 30.9;
    IF feature_entity_code = 'ROAD-REGIONAL-RING' THEN
      west := 30.25;
    END IF;
  END IF;

  IF ST_XMin(Box3D(NEW.geometry)) < west OR ST_YMin(Box3D(NEW.geometry)) < south
     OR ST_XMax(Box3D(NEW.geometry)) > east OR ST_YMax(Box3D(NEW.geometry)) > north THEN
    RAISE EXCEPTION 'feature geometry outside % WGS84 bbox',
      CASE
        WHEN feature_entity_type = 'road' AND feature_entity_code = 'ROAD-REGIONAL-RING' THEN 'Regional Ring road-only'
        WHEN feature_entity_type = 'road' THEN 'road-only'
        ELSE 'Greater Cairo'
      END
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
