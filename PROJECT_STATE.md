# Greater Cairo Atlas — Project State

Last updated: `2026-11-13`

## Project Charter Summary

- **Objective**: Documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.
- **Positioning**: Data-first urban research & geospatial documentation project — **not** a real-estate platform.
- **Non-Negotiable Epistemic Rules**:
  1. Every recorded fact and geometry retains explicit source provenance (`evidence`).
  2. Conflicting claims across sources are stored side by side, never silently overwritten.
  3. Planned or under-construction projects are never displayed as operational without an explicit `status` change (`status` defaults to `'unknown'`).
  4. Weak `'secondary'` sources (Wikipedia, real-estate blogs, aggregators, internal guides) must never by themselves mark a fact `'verified'`.
  5. Never fabricate sources, URLs, coordinates, measurements, dates, statuses, or boundaries.
- **Pilot Coverage Scope**:
  - New Cairo, Nasr City, Shorouk, Badr, New Administrative Capital, Mostakbal City, Obour, New Obour (plus connected regional corridors).

---

## Phase Tracker

| Phase | Name | Status | Summary |
| :--- | :--- | :--- | :--- |
| **Phase 01** | **Foundation** | **Completed (Merged — PR #1)** | App scaffold (Next.js App Router + TS strict + Tailwind + `shadcn/ui`), Neon connection layer, Zod env validation, plain-SQL migration runner + `000_enable_postgis.sql`, structured logging/error handling, minimal landing page, and `/api/health` PostGIS probe. |
| **Phase 02** | **Core Schema & Seed Importer** | **Completed (Merged — PR #2)** | `001_core_schema.sql` (`entities`, `facts`, `evidence`, `features` + `fact_evidence` M2M link), mirroring Zod schemas, holistic seed validator & idempotent `import-seed.ts` CLI, `appliedMigrationsCount` in `/api/health`, and `GET /api/atlas/stats`. |
| **Phase 02.1** | **Vercel Build Migrations & Taxonomy Extension** | **Completed (Merged — PR #3)** | Vercel build-time migration runner (`scripts/vercel-build.ts` + `vercel.json`, preferring `DATABASE_URL_UNPOOLED`), `workflow_dispatch`-only GitHub workflows, `002_entity_taxonomy.sql` (15 researcher `entity_type`s + `'secondary'` `source_type` + deferred verified-fact trigger), verified live on Production (`/api/health` -> `appliedMigrationsCount: 3`). |
| **Phase 03** | **Research-Seed Adapter, Migration `003` & Protected Import** | **Completed (Merged — PR #4)** | `003_research_seed_extensions.sql`, deterministic research-seed adapter, and protected `POST /api/admin/import-seed` (dry-run by default). |
| **Phase 03.1** | **Seed Revision 3** | **In Review (PR #5)** | Mixed-revision seed: 213 entities, 59 evidence records, 278 facts, 304 fact-evidence links; three unresolved official URLs are explicit non-blocking warnings. |
| **Phase 04** | **Batch Python Spatial Ingestion & Read API** | Planned | Local/batch Python spatial ingestion (OSM & official geometries, never in Vercel serverless) + typed Next.js read APIs surfacing entities, conflicting facts, and provenance. |
| **Phase 05** | **Interactive MapLibre GL JS Atlas UI** | Planned | Cartographic MapLibre GL JS interface distinguishing operational vs. planned features, conflict indicators, and source inspection panels. |
| **Phase 06** | **Open Exports & Release Hardening** | Planned | Reproducible open-data export pipelines (`CSV`, `JSON`, `GeoJSON`, `GeoPackage`) with full provenance metadata and end-to-end verification. |

---

## Phase 03 Architectural Decisions & Open Data Notes

1. **Migration `003_research_seed_extensions.sql` (Immutable Prior Migrations)**:
   - `000_enable_postgis.sql`, `001_core_schema.sql`, and `002_entity_taxonomy.sql` remain byte-for-byte untouched.
   - Adds sector `'REGIONAL'`, entity types `'airport'` and `'rail_station'`, `entities.aliases TEXT[]`, and `facts.valid_as_of_precision` (`'day' | 'month' | 'year'`, default `'day'`).
   - Relaxes `evidence.url` to nullable while enforcing `url IS NOT NULL OR title IS NOT NULL` (`evidence_locator_or_title_chk`) and adds `evidence.published_date_precision` so internal documents (`EV-000`, `EV-051`), unresolved official records (`EV-042`, `EV-045`, `EV-046`), and month-precision publication dates (`EV-046`: `2026-08`; `EV-058`: `2026-05`) are preserved honestly without fabricating URLs or days.
2. **Deterministic, Order-Independent Research Adapter (`scripts/adapt-research-seed.ts`)**:
   - Auto-selects the highest available revision independently for each file and supports mixed bundles (e.g. `entities_rev2.csv` + `evidence_rev3.json` + `facts_rev3.json`); `--rev3` uses the same per-file fallback.
   - Rejects `rev1` cleanly with the full 52-item `missingSourceTypeEvidenceRefs` list (`rev2` required before import) without writing anything to `data/seed/`.
   - Converts rev3 cleanly into `data/seed/` (213 entities, 59 evidence records, 278 facts, 304 `fact_evidence` links) with run-stable `F-<ENTITY>-<ATTR>-<N>` codes independent of JSON array ordering or `verification_state` changes.
   - All five URL-less records remain non-blocking warnings: internal secondary `EV-000` and `EV-051`, plus unresolved official `EV-042`, `EV-045`, and `EV-046`. Dry-run output identifies the three official codes explicitly; no URLs are fabricated.
3. **Zero-`DATABASE_URL`-Exposure Import (`POST /api/admin/import-seed`)**:
   - Guarded by `ADMIN_IMPORT_TOKEN` (>= 16 chars, verified via constant-time SHA-256 `timingSafeEqual` in `Authorization: Bearer <token>` or `x-admin-import-token`, redacted in logs, rejected in URL query strings).
   - Defaults to `dryRun: true` when invoked with an empty body or `{}`; performs transactional idempotent upsert inside Vercel only when `{"dryRun": false}` is explicitly sent.
   - `next.config.ts` includes `outputFileTracingIncludes` for `./data/seed/**/*` on `/api/admin/import-seed` so serverless deployments always bundle the validated seed files.
