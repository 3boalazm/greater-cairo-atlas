-- A single vocabulary for both current geometry and its history.
CREATE FUNCTION atlas_geometry_license_allowed(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT value IN ('ODbL', 'ODbL-1.0', 'CC-BY-4.0', 'CC-BY-IGO', 'CC0-1.0', 'official_gazette', 'custom_documented')
$$;
ALTER TABLE features DROP CONSTRAINT features_license_chk;
ALTER TABLE features ADD CONSTRAINT features_license_chk CHECK (atlas_geometry_license_allowed(license));
ALTER TABLE geometry_history DROP CONSTRAINT geometry_history_license_check;
ALTER TABLE geometry_history ADD CONSTRAINT geometry_history_license_check CHECK (atlas_geometry_license_allowed(license));
-- features_osm_requires_odbl_chk remains in force independently.
