# Greater Cairo Atlas — Project State

Last updated: `2026-11-13`

## Project Charter Summary

- **Objective**: Documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.
- **Positioning**: Data-first urban research & geospatial documentation project — **not** a real-estate platform.
- **Non-Negotiable Epistemic Rules**:
  1. Every recorded fact and geometry retains explicit source provenance (`evidence`).
  2. Conflicting claims across sources are stored side by side, never silently overwritten.
  3. Planned or under-construction projects are never displayed as operational.
  4. Never fabricate sources, coordinates, measurements, statuses, or boundaries.
- **Pilot Coverage Scope (Phase 03+ Ingestion)**:
  - New Cairo, Nasr City, Shorouk, Badr, New Administrative Capital, Mostakbal City, Obour, New Obour.

---

## Phase Tracker

| Phase | Name | Status | Summary |
| :--- | :--- | :--- | :--- |
| **Phase 01** | **Foundation** | **In Review (PR Open)** | App scaffold (Next.js App Router + TS strict + Tailwind + `shadcn/ui`), Neon connection layer, Zod env validation, plain-SQL migration runner + `000_enable_postgis.sql`, structured logging/error handling, minimal landing page, `/api/health` PostGIS probe, docs, and tests. |
| **Phase 02** | **Core Spatial & Evidentiary Schema** | Planned | SQL migration `001` creating the four core tables (`entities`, `facts`, `evidence`, `features`) with strict enum `CHECK` constraints, `updated_at` triggers, `SRID 4326` geometries, GiST indexes, and preserved OSM `type`/`id`/`version`. |
| **Phase 03** | **Batch Python Ingestion Pipeline** | Planned | Local/batch Python ingestion tooling (never run in Vercel serverless) for documented OSM & authoritative sources across the 8 pilot areas. |
| **Phase 04** | **Read API & Provenance Query Layer** | Planned | Typed Next.js API routes & server queries surfacing entities, side-by-side conflicting facts, lifecycle states, and source citations. |
| **Phase 05** | **Interactive MapLibre GL JS Atlas UI** | Planned | Cartographic MapLibre GL JS interface distinguishing operational vs. planned features, conflict indicators, and source inspection panels. |
| **Phase 06** | **Open Exports & Release Hardening** | Planned | Reproducible open-data export pipelines (`CSV`, `JSON`, `GeoJSON`, `GeoPackage`) with full provenance metadata and end-to-end verification. |

---

## Phase 01 Architectural Decisions & Limitations

### Key Decisions
1. **Two-tier Zod Environment Validation (`src/lib/env.ts`)**:
   - Runtime settings (`NODE_ENV`, `LOG_LEVEL`, `VERCEL_ENV`) validate safely during `next build` and cold starts.
   - Database connectivity (`requireDatabaseEnv()`) strictly validates `process.env.DATABASE_URL` on demand, throwing `DatabaseNotConfiguredError` (`HTTP 503`) when unset and `EnvValidationError` (`HTTP 500`) when malformed. This satisfies strict runtime failure guarantees without breaking CI or Vercel Preview builds prior to Neon provisioning.
2. **Dual Neon Driver Modes (`src/lib/db/client.ts`)**:
   - Stateless HTTP queries via `neon(DATABASE_URL)` for Next.js Route Handlers and Vercel Serverless Functions (`/api/health`).
   - Session WebSocket `Client` for transactional CLI scripts (`scripts/migrate.ts`), enabling PostgreSQL advisory locks (`pg_advisory_lock`) and `BEGIN` / `COMMIT` / `ROLLBACK` per migration file.
3. **Immutable Checksummed Plain-SQL Migrations (`src/lib/db/migrate.ts`)**:
   - Plain `NNN_description.sql` files in `db/migrations/` are hashed (`SHA-256`, LF-normalized) and recorded in `schema_migrations`. Modifying an already-applied migration fails loudly.
4. **Automatic Credential Redaction (`src/lib/errors.ts`, `src/lib/logger.ts`)**:
   - Embedded `postgres://` / `postgresql://` URIs and sensitive context keys (`DATABASE_URL`, `password`, `token`, `secret`) are automatically redacted before reaching console/Vercel logs or API error payloads.
5. **Hermetic Build Compatibility**:
   - System typography stacks are used instead of remote font fetches during `next build`, ensuring deterministic builds in restricted network / CI environments as well as Vercel.

### Known Limitations in Phase 01
- **Neon database not yet provisioned**: Live execution of `npm run db:migrate` and HTTP `200` responses from `/api/health` await owner provisioning of Neon PostgreSQL and configuration of `DATABASE_URL`.
- **No domain tables yet**: `entities`, `facts`, `evidence`, and `features` are intentionally deferred to Phase 02.
- **No geospatial map canvas yet**: MapLibre GL JS integration awaits Phase 05 once real, provenance-backed geometries exist in PostGIS.
