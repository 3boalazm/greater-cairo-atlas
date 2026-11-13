# Greater Cairo Atlas — Project State

Last updated: `2026-11-13`

## Project Charter Summary

- **Objective**: Documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.
- **Positioning**: Data-first urban research & geospatial documentation project — **not** a real-estate platform.
- **Non-Negotiable Epistemic Rules**:
  1. Every recorded fact and geometry retains explicit source provenance (`evidence`).
  2. Conflicting claims across sources are stored side by side, never silently overwritten.
  3. Planned or under-construction projects are never displayed as operational without an explicit `status` change.
  4. Weak `'secondary'` sources (Wikipedia, real-estate blogs, aggregators) must never by themselves mark a fact `'verified'`.
  5. Never fabricate sources, coordinates, measurements, statuses, or boundaries.
- **Pilot Coverage Scope (Phase 03+ Ingestion)**:
  - New Cairo, Nasr City, Shorouk, Badr, New Administrative Capital, Mostakbal City, Obour, New Obour.

---

## Phase Tracker

| Phase | Name | Status | Summary |
| :--- | :--- | :--- | :--- |
| **Phase 01** | **Foundation** | **Completed (Merged — PR #1)** | App scaffold (Next.js App Router + TS strict + Tailwind + `shadcn/ui`), Neon connection layer, Zod env validation, plain-SQL migration runner + `000_enable_postgis.sql`, structured logging/error handling, minimal landing page, and `/api/health` PostGIS probe. |
| **Phase 02** | **Core Schema & Seed Importer** | **Completed (Merged — PR #2)** | `001_core_schema.sql` (`entities`, `facts`, `evidence`, `features` + `fact_evidence` M2M link), mirroring Zod schemas, holistic seed validator & idempotent `import-seed.ts` CLI, `appliedMigrationsCount` in `/api/health`, and `GET /api/atlas/stats`. |
| **Phase 02.1** | **Vercel Build Migrations & Taxonomy Extension** | **In Review (PR #3 Open)** | Vercel build-time migration runner (`scripts/vercel-build.ts` + `vercel.json`, preferring `DATABASE_URL_UNPOOLED`), `workflow_dispatch`-only GitHub workflows, `002_entity_taxonomy.sql` (15 researcher `entity_type`s + `'secondary'` `source_type` + deferred verified-fact trigger), and updated schemas/tests/fixtures. |
| **Phase 03** | **Batch Python Ingestion Pipeline** | Planned | Local/batch Python ingestion tooling (never run in Vercel serverless) for documented OSM & authoritative sources across the 8 pilot areas. |
| **Phase 04** | **Read API & Provenance Query Layer** | Planned | Typed Next.js API routes & server queries surfacing entities, side-by-side conflicting facts, lifecycle states, and source citations. |
| **Phase 05** | **Interactive MapLibre GL JS Atlas UI** | Planned | Cartographic MapLibre GL JS interface distinguishing operational vs. planned features, conflict indicators, and source inspection panels. |
| **Phase 06** | **Open Exports & Release Hardening** | Planned | Reproducible open-data export pipelines (`CSV`, `JSON`, `GeoJSON`, `GeoPackage`) with full provenance metadata and end-to-end verification. |

---

## Phase 02.1 Architectural Decisions & Limitations

### Key Decisions
1. **Vercel Build-Time SQL Migrations (`scripts/vercel-build.ts` + `vercel.json`)**:
   - Because GitHub Actions minutes are exhausted and `DATABASE_URL` is managed exclusively via the Neon Vercel Integration (with isolated Neon preview branches per PR), Vercel builds execute `npm run vercel-build` (`tsx scripts/vercel-build.ts`) while plain `npm run build` remains DB-free (`next build`) for local/offline verification.
   - `executeVercelBuild` runs migrations **only** when `VERCEL=1` and a database URL is present. If `DATABASE_URL` is absent on Vercel, it logs a clear warning and still runs `next build`. If any migration or checksum verification fails, the build exits non-zero **before** `next build` so half-migrated schemas are never deployed.
   - **Unpooled Neon connection preference**: Neon's PgBouncer pooler (`DATABASE_URL`) operates in transaction pooling mode, which can interfere with session-scoped `pg_advisory_lock`. Therefore `requireMigrationDatabaseEnv()` prefers `DATABASE_URL_UNPOOLED` (automatically injected by the Neon Vercel Integration) and falls back to `DATABASE_URL` when omitted.
2. **Manual-Only GitHub Workflows (`.github/workflows/ci.yml`, `.github/workflows/migrate.yml`)**:
   - Both workflows are retained with `on: workflow_dispatch` only so pushes and pull requests do not consume GitHub Actions minutes or produce billing-related red checks.
3. **Direct Constraint Extension for Researcher Taxonomy (`db/migrations/002_entity_taxonomy.sql`)**:
   - We chose to **extend `entities_entity_type_chk` in SQL and Zod** rather than aliasing researcher types in the importer. Collapsing `bridge`, `interchange`, and `tunnel` into `bridge_interchange`, or collapsing `project` and `authority`, would lose real urban/cartographic distinctions needed in Phase 03 Python scripts, Phase 05 MapLibre layers, and Phase 06 exports. All 15 researcher types (`city`, `district`, `neighborhood`, `road`, `bridge`, `interchange`, `tunnel`, `transit_line`, `transit_stop`, `project`, `authority`, `landmark`, `facility`, `waterway`, `utility`) are accepted alongside the 4 Phase 02 compatibility types (`transit_station`, `bridge_interchange`, `public_facility`, `development_zone`). `001_core_schema.sql` remains untouched so its SHA-256 checksum stays immutable.
4. **Dual-Layer Enforcement for Weak `'secondary'` Evidence**:
   - `'secondary'` is added to `evidence.source_type` for Wikipedia, real-estate blogs, and aggregators.
   - Both the TypeScript seed validator (`canVerifyFactWithSources` in `src/lib/atlas/seed.ts`) **and** PostgreSQL (`DEFERRABLE INITIALLY DEFERRED` constraint triggers in `002_entity_taxonomy.sql`) forbid `verification_state = 'verified'` unless the fact is linked to at least one non-`'secondary'` source.
