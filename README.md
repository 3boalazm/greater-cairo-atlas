# Greater Cairo Atlas

A documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.

Greater Cairo Atlas is an **open-evidence urban documentation project**, not a real-estate marketplace or promotional directory:

- **Every fact keeps its source**: no unattributed measurements, dates, or claims.
- **Disagreements coexist**: conflicting claims across sources are stored side by side, never silently overwritten.
- **Lifecycle honesty**: planned, announced, or under-construction projects are never rendered as operational without an explicit `status` change.
- **Source-strength discipline**: weak `'secondary'` sources (Wikipedia, blogs, aggregators) can record candidate/disputed claims, but must never by themselves mark a fact `'verified'`.
- **Spatial lineage**: geometries use WGS 84 (`SRID 4326`) in PostGIS with GiST indexes and preserve upstream OpenStreetMap `type`, `id`, and `version` under `ODbL`.

## Current Phase

**Phase 02.1 — Vercel Build Migrations & Taxonomy Extension** (see [`PROJECT_STATE.md`](./PROJECT_STATE.md) for the full phase roadmap and architectural decisions).

## Core Database Schema (`000` + `001` + `002`)

| Table | Purpose | Key Constraints |
| :--- | :--- | :--- |
| `entities` | Canonical urban/geospatial subjects (`ROAD-MIDDLE-RING`, bridges, lines, stops, authorities) | Unique `code`, `name_ar` + `name_en`, `entity_type` `CHECK` (15 researcher types: `city`, `district`, `neighborhood`, `road`, `bridge`, `interchange`, `tunnel`, `transit_line`, `transit_stop`, `project`, `authority`, `landmark`, `facility`, `waterway`, `utility` + 4 legacy compatibility types), `sector` (`NORTH`/`EAST`/`SOUTH`/`WEST`/`CENTRAL`), `status` (`operational`/`partial`/`under_construction`/`planned`/`approved_planned`/`unknown`, default `'unknown'`) |
| `facts` | Multi-valued claims per entity (`attribute`, `value`, `unit`, `valid_as_of`, `verification_state`) | Unique `code`, `entity_id` FK (`ON DELETE RESTRICT`), `verification_state` (`candidate`/`single_source`/`corroborated`/`verified`/`disputed`/`rejected`/`superseded`), **no unique constraint on `(entity_id, attribute)`**, deferred constraint trigger requiring `>= 1` non-`'secondary'` source when `'verified'` |
| `evidence` | Verifiable provenance records (`url`, `publisher`, `source_type`, `published_date`, `accessed_date`) | Unique `code`, HTTP(S) `url` `CHECK`, `source_type` (`official`/`news`/`dataset`/`map`/`pdf`/`secondary`) |
| `fact_evidence` | Many-to-many link between `facts` and `evidence` | Composite PK `(fact_id, evidence_id)`, both FKs `ON DELETE RESTRICT` |
| `features` | Spatial features (`geometry(Geometry, 4326)`) | Unique `code`, `ST_SRID = 4326` + `ST_IsValid`, GiST index, all-or-nothing `(osm_type, osm_id, osm_version)`, `license` (`ODbL`) |

## How SQL Migrations Run (Vercel & Local)

### Automatic Migrations on Vercel (`vercel-build`)

`vercel.json` configures Vercel deployments (Production and Preview) to run `npm run vercel-build` (`scripts/vercel-build.ts`), while keeping plain `npm run build` (`next build`) completely DB-free for local/offline builds:

1. **Environment Gate**: Migrations execute **only** when `VERCEL=1` and a database URL (`DATABASE_URL` or `DATABASE_URL_UNPOOLED`) is present.
2. **Missing URL Fallback**: If `VERCEL=1` is set without `DATABASE_URL`, `vercel-build` logs a clear warning and still completes `next build`.
3. **Unpooled Connection Preference (`DATABASE_URL_UNPOOLED`)**: Neon's pooled PgBouncer URL (`DATABASE_URL`) can interfere with session-level `pg_advisory_lock` and multi-statement DDL transactions. The migrator automatically prefers `DATABASE_URL_UNPOOLED` (injected by the Neon Vercel Integration for both Production and Preview branches) and falls back to `DATABASE_URL` when `DATABASE_URL_UNPOOLED` is unset.
4. **Fail-Closed Guarantee**: Checksum immutability (`schema_migrations`), `pg_advisory_lock`, and per-file `BEGIN`/`COMMIT`/`ROLLBACK` remain enforced. If any migration fails, `vercel-build` logs a redacted error (`redactSecrets`) and exits non-zero **before** `next build` so broken schemas are never deployed.

### Manual GitHub Workflows (`workflow_dispatch` only)

`.github/workflows/ci.yml` and `.github/workflows/migrate.yml` are configured with `on: workflow_dispatch` only so pushes and pull requests never consume GitHub Actions minutes.

## Local Setup

### 1. Install Dependencies

```bash
npm ci
```

### 2. Configure Environment Variables

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` (and optionally `DATABASE_URL_UNPOOLED`) in `.env.local`—never commit `.env` or `.env.local`.

### 3. Run SQL Migrations Locally

```bash
# Offline verification of 000, 001, and 002 (no DATABASE_URL required)
npm run db:migrate:dry-run

# Apply pending migrations to Neon (prefers DATABASE_URL_UNPOOLED, falls back to DATABASE_URL)
npm run db:migrate
```

### 4. Seed Validation & Idempotent Import

`scripts/import-seed.ts` reads `entities.csv`, `evidence.json`, and `facts.json` from `data/seed/` (or `--dir <path>`), validates all enums, codes, cross-references, and the secondary-source verification rule **all at once**, and upserts idempotently by `code`.

```bash
# Validate canonical data/seed/ offline
npm run seed:check

# Validate the synthetic TEST-* test fixture offline
npx tsx scripts/import-seed.ts --dir tests/fixtures/seed-valid --dry-run

# Import data/seed/ into Neon idempotently (requires DATABASE_URL)
npm run seed:import
```

## API Endpoints

- **`GET /api/health`**: Executes `PostGIS_Version()`, `ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(31.2357,30.0444),4326))`, and `(SELECT COUNT(*)::int FROM schema_migrations)` (`Cache-Control: no-store, max-age=0`). Returns `HTTP 200` with `database.appliedMigrationsCount: 3` once migrations `000`, `001`, and `002` are applied.
- **`GET /api/atlas/stats`**: Returns row counts across `{ entities, facts, evidence, features, fact_evidence }`.

## Quality Checks

```bash
npm run lint                # ESLint flat config
npm run typecheck           # tsc --noEmit (strict)
npm test                    # Vitest unit, schema, seed, vercel-build & route tests
npm run db:migrate:dry-run  # Offline SQL migration verification (000 + 001 + 002)
npm run seed:check          # Offline seed bundle validation
npm run build               # DB-free production Next.js build
```
