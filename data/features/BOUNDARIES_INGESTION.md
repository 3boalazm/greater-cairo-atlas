# OSM area boundary ingestion

Only versioned OSM `boundary=administrative` or supported `place=*` polygons are eligible. Exact entity names/aliases, compatible `admin_level`, WGS84 bounds, valid polygon geometry, OSM way/relation ID+version, ODbL-1.0 license, and attribution are required. The boundary store is separate from point/line features and served one entity at a time by `/api/atlas/entities/{code}/boundary`.

When supplied, place the owner-provided source at:

`data/raw/cairo-osm-boundaries-2026-11-14.json.gz`

Then rerun `scripts/ingest-features.py` with the saved OSM extracts and existing match rules. The script auto-detects and decompresses this file, writes matched polygons to `data/features/boundaries.geojson`, and records the source hash, per-object audit, license, and attribution in the ingestion manifest. If the raw source is absent, an existing generated boundary store is preserved; when no store exists an empty FeatureCollection is created, so no boundary button is shown for unsupported entities.

The boundary raw file is not present in this checkout yet; the pipeline and empty store are ready for it.
