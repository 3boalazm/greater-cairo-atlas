# Greater Cairo Atlas

A bilingual, source-backed urban and geographic atlas of Greater Cairo. The atlas records conflicting claims and their evidence rather than reconciling them by guesswork. Coordinates are sourced, not invented, and planned or unknown projects are not promoted to operational without evidence.

## Current state

Batches 15–17 brought the South research and reviewed South OSM geometry into the atlas and refined the search and map experience. Batch 18 (PR #45) is merged; Batch 19 adds Central and unknown-status research without UI changes. See [PROJECT_STATE.md](PROJECT_STATE.md), [the phase log](docs/CHANGELOG.md), and [methodology](METHODOLOGY.md).

The checked-in seed validates to **483 entities, 2,426 facts, 580 evidence records, 2,779 fact-evidence links, 194 relations and 2,983 features**. These are offline snapshot counts, not a measurement of the live database. CAPMAS COD-AB supplies 838 administrative units (75 ADM2, 763 ADM3), separately from the features table.

## Run and verify

Node 20.9+ and Python 3.12 are supported. Install dependencies with `npm ci` and `python -m pip install -r requirements-ingest.txt`, then use `npm run dev`. For a production build use `npm run build` and `npm start`.

```sh
npm run lint
npm run typecheck
npm test -- --maxWorkers=2
npm run seed:check
npm run db:migrate:dry-run
python -m unittest scripts.test_road_gap_fill
python -m unittest discover -s tests -p test_ingest_bbox.py
python scripts/ingest-features.py --check-geojson data/features/features.geojson
npm run build
```

Tests include in-process PGlite/PostGIS; applying migrations or importing to a real database requires the configured Neon connection. See `.env.example` and `scripts/` for setup. Do not expose admin tokens in URLs.

## Data, API and operations

Canonical input lives in `data/seed`; source research, OSM features and reports live under `data/research` and `data/features`. The public atlas supports entity detail, GeoJSON, CSV, JSON, GeoPackage, and API documentation. Exports use the checked-in canonical snapshot and filter database-retired facts when the database is configured; public stats describe the same snapshot. The admin dashboard reports DB-only codes as drift; it does not silently delete them.

Migrations `000`–`014` are checksum-verified and serialized. In production, Vercel build runs migrations, then a checksum-gated seed import under an advisory transaction lock; preview builds do not import. Verified claims require official evidence with a URL (migration 008). Retired facts and their evidence remain stored, their retirement metadata is immutable, and deletion of facts is prohibited (012). Migration 013 aligns geometry licences; 014 attaches timestamp triggers.

## Licences and provenance

- **Existing Atlas research data published through 2026-11-17:** remains under CC BY 4.0 as originally released. This includes the current canonical seed and its existing exports; the earlier licence is not being withdrawn.
- **New original research material first published from 2026-11-18:** CC BY-NC 4.0, with attribution to Mustafa Aboalazm and Greater Cairo Atlas. Commercial use requires separate prior written permission.
- **Software source code:** PolyForm Noncommercial License 1.0.0, in [LICENSE](LICENSE). This is source-available, noncommercial software, not an OSI-approved Open Source release.
- **Third-party material:** OpenStreetMap geometry remains ODbL 1.0; CAPMAS administrative boundaries via OCHA/HDX remain CC BY-IGO; any TfC GTFS or other third-party material retains its own licence and attribution.

The root [LICENSE](LICENSE) applies to software code only. [DATA_LICENSE.md](DATA_LICENSE.md) defines the separate research-data policy. Do not treat the repository as one uniformly licensed work. The existing export pipeline describes the legacy CC BY 4.0 snapshot; future NC-licensed research must not be mixed into those exports until per-batch/per-record licence metadata and export attribution are implemented. The geometry schema's accepted licence identifiers remain `ODbL`, `ODbL-1.0`, `CC-BY-4.0`, `CC-BY-IGO`, `CC0-1.0`, `official_gazette`, and `custom_documented`; OSM features additionally require ODbL.
