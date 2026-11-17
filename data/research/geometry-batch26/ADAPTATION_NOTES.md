# Batch 26 adaptation notes

`README.md` and `accepts.json` are copied byte-for-byte from `research/geometry-batch26`; the raw archive
`data/raw/cairo-osm-east-batch26-2026-11-17.json` was likewise copied unchanged and its sha256 matches
`accepts.json` (`4c6fff0c...`). Nothing else was added to or removed from the research folder.

`scripts/geometry_batch26.py` imports exactly the 30 reviewed accepts and nothing else:

- Scope comes only from `accepts.json` — no name matching, no discovery. Reviewed identity bypasses the
  Batch 20b name-label and kind gates (for example `shop=mall`, `amenity=conference_centre`,
  `office=government`, `building=commercial`, `place=square`).
- Archived Overpass entries load the element (`type`, `id`) from the named `.json.gz` under `data/raw/`
  and build the shape with the reused `osm_geometry` (polygon for ways and relations, point for nodes).
  Nominatim lookup entries use `shapely.geometry.shape(item["geojson"])` with tags and version from `meta`.
  Coordinates are never simplified, repaired or edited before storage.
- Gates applied and passed for all 30 entries: accepted `osm_version` equals the source version; geometry
  is valid, inside the Batch 20 bbox (lon 30.70–31.90, lat 29.70–30.50) and of the stated `geometry_kind`;
  the entity exists in `data/seed/entities.csv`, has no feature and no entity-map geometry yet, and is not
  planned / `approved_planned` / under construction and not a project or authority.
- The CAPMAS sector distance is computed exactly as in `geometry_batch20b.py` and written to the report,
  but it is not a gate: the Cathedral of the Nativity (0.0234°) and the New Egyptian Parliament (0.0614°)
  exceed 0.01° because the 2017 CAPMAS units do not cover the New Administrative Capital.
- One feature per entity, id prefix `BATCH26-`, through `ingest.feature`: ODbL-1.0, OpenStreetMap
  attribution, `osm_type` / `osm_id` / `osm_version`, full OSM tag set as `osm_tags`,
  `match_method` "reviewed identity (Batch 26 accepts.json)", `source_file`, retrieval date from the
  source file name (2026-11-14, 2026-11-16 or 2026-11-17).
- Appended (never rewrote) to `data/features/features.geojson`, `data/derived/entity-map-geometries.json`
  and `data/features/manifest.json`: `feature_count` 3,031 → 3,061,
  `entities_with_geometry` 280 → 310, plus a `geometry_batch26` manifest block with the report path,
  counts and the sha256 of every source file used. Pre-existing feature bytes are unchanged.
- `data/research/geometry-batch26/geometry_import_report.json` records one entry per accept: decision,
  geometry type, vertex count, sector distance and source file. All 30 entries are `matched`; none
  rejected at import.
- The script is idempotent: a second run changes nothing and refuses to overwrite any existing feature or
  entity-map geometry whose content differs. No seed, fact, evidence, label, unit or UI file was changed:
  entities 564, facts 2,849, evidence 810, links 3,202 and unknown-status entities 6 are unchanged.
- Entities without a map shape fall from 284 to 254 (564 − 310).

No deletions anywhere.
