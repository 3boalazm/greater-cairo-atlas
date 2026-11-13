# Greater Cairo Atlas — Project State

Last updated: `2026-11-13`

## Project Charter Summary

- **Objective**: Documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.
- **Positioning**: Data-first urban research & geospatial documentation project — **not** a real-estate platform.
- **Non-Negotiable Epistemic Rules**:
  1. Every recorded fact and geometry retains explicit source provenance (`evidence`).
  2. Conflicting claims across sources are stored side by side, never silently overwritten.
  3. Planned or under-construction projects are never displayed as operational without an explicit `status` change.
  4. Never fabricate sources, coordinates, measurements, statuses, or boundaries.
- **Pilot Coverage Scope (Phase 03+ Ingestion)**:
  - New Cairo, Nasr City, Shorouk, Badr, New Administrative Capital, Mostakbal City, Obour, New Obour.

---

## Phase Tracker

| Phase | Name | Status | Summary |
| :--- | :--- | :--- | :--- |
| **Phase 01** | **Foundation** | **Completed (Merged — PR #1)** | App scaffold (Next.js App Router + TS strict + Tailwind + `shadcn/ui`), Neon connection layer, Zod env validation, plain-SQL migration runner + `000_enable_postgis.sql`, structured logging/error handling, minimal landing page, and `/api/health` PostGIS probe. |
| **Phase 02** | **Core Schema & Migration Automation** | **In Review (PR #2 Open)** | GitHub Actions `ci.yml` + `migrate.yml`, `001_core_schema.sql` (`entities`, `facts`, `evidence`, `features` + `fact_evidence` M2M link), mirroring Zod schemas, holistic seed validator & idempotent `import-seed.ts` CLI, synthetic `TEST-*` test fixture, `appliedMigrationsCount` in `/api/health`, and `GET /api/atlas/stats`. |
| **Phase 03** | **Batch Python Ingestion Pipeline** | Planned | Local/batch Python ingestion tooling (never run in Vercel serverless) for documented OSM & authoritative sources across the 8 pilot areas. |
| **Phase 04** | **Read API & Provenance Query Layer** | Planned | Typed Next.js API routes & server queries surfacing entities, side-by-side conflicting facts, lifecycle states, and source citations. |
| **Phase 05** | **Interactive MapLibre GL JS Atlas UI** | Planned | Cartographic MapLibre GL JS interface distinguishing operational vs. planned features, conflict indicators, and source inspection panels. |
| **Phase 06** | **Open Exports & Release Hardening** | Planned | Reproducible open-data export pipelines (`CSV`, `JSON`, `GeoJSON`, `GeoPackage`) with full provenance metadata and end-to-end verification. |

---

## Phase 02 Architectural Decisions & Limitations

### Key Decisions
1. **Core Four-Table Blueprint + Associative Provenance Table (`db/migrations/001_core_schema.sql`)**:
   - `entities`, `facts`, `evidence`, and `features` form the four core domain tables, accompanied by `fact_evidence` to enforce many-to-many `facts <-> evidence` provenance with PostgreSQL `ON DELETE RESTRICT` foreign keys.
   - Stable human-readable uppercase `code` (`^[A-Z0-9]+(-[A-Z0-9]+)*$`) on `entities`, `evidence`, `facts`, and `features` enables deterministic, idempotent `ON CONFLICT (code) DO UPDATE` upserts across seed files and batch pipelines.
   - **Disagreement preservation**: `facts` intentionally omits any `UNIQUE` constraint on `(entity_id, attribute)`, indexing `(entity_id, attribute)` with a non-unique B-tree index so conflicting measurements coexist side by side.
   - **Lifecycle honesty**: `entities.status` defaults to `'unknown'` (never `'operational'`) and has no shadow boolean flag; `isOperationalStatus(status)` is `true` exclusively when `status === 'operational'`.
   - **OSM & Spatial integrity**: `features.geometry` enforces `geometry(Geometry, 4326)`, `ST_SRID(geometry) = 4326`, `NOT ST_IsEmpty(geometry)`, `ST_IsValid(geometry)`, a GiST index, all-or-nothing `(osm_type, osm_id, osm_version)` lineage, and `ODbL`/`ODbL-1.0` licensing whenever OSM lineage is present.
2. **All-at-Once Seed Validation (`src/lib/atlas/seed.ts`)**:
   - `validateSeedSources()` validates `entities.csv`, `evidence.json`, and `facts.json` together—collecting every header, row, Zod enum/format, duplicate-code, and cross-file reference error (`entity_code`, `evidence_codes`) in one pass before touching PostgreSQL.
3. **CI & Automated Migrations (`.github/workflows/ci.yml`, `.github/workflows/migrate.yml`)**:
   - `ci.yml` runs `npm ci`, lint, typecheck, unit tests, offline migration check, offline seed check, and Next.js production build without needing `DATABASE_URL`.
   - `migrate.yml` runs on `workflow_dispatch` and on pushes to `main` touching `db/migrations/**`, verifying `secrets.DATABASE_URL` is non-empty with `set +x` (never echoing credentials) and running `npm run db:migrate` under serialized concurrency.

### Known Limitations in Phase 02
- **Pending initial migration run on Neon**: Live Neon currently has `DATABASE_URL` linked in Vercel; once the owner sets the `DATABASE_URL` GitHub Actions repository secret and triggers `Migrate Database` (or merges PR #2), `000_enable_postgis.sql` and `001_core_schema.sql` will apply and `/api/health` will transition from `POSTGIS_NOT_ENABLED` to `healthy` (`appliedMigrationsCount: 2`).
- **Empty canonical `data/seed/`**: `data/seed/` contains empty valid scaffolds only (`0` rows). Real documented Greater Cairo data ingestion begins in Phase 03.
