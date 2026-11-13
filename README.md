# Greater Cairo Atlas

A documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.

Greater Cairo Atlas is an **open-evidence urban documentation project**, not a real-estate marketplace or promotional directory:

- **Every fact keeps its source**: no unattributed measurements, dates, or claims.
- **Disagreements coexist**: conflicting claims across sources are stored side by side, never silently overwritten.
- **Lifecycle honesty**: planned, announced, or under-construction projects are never rendered as operational without an explicit `status` change.
- **Spatial lineage**: geometries use WGS 84 (`SRID 4326`) in PostGIS with GiST indexes and preserve upstream OpenStreetMap `type`, `id`, and `version` under `ODbL`.

## Current Phase

**Phase 02 — Core Schema & Migration Automation** (see [`PROJECT_STATE.md`](./PROJECT_STATE.md) for the full phase roadmap and architectural decisions).

- **Phase 01 (Merged)**: Next.js App Router + TypeScript strict + Tailwind CSS + `shadcn/ui`, `@neondatabase/serverless` connection layer, Zod env validation, plain-SQL migration runner + `000_enable_postgis.sql`, structured secret-redacting logger, landing page, and `/api/health`.
- **Phase 02**:
  - `db/migrations/001_core_schema.sql` defining the 4 core tables (`entities`, `facts`, `evidence`, `features`) plus many-to-many `fact_evidence` join table, strict enum `CHECK` constraints, `ON DELETE RESTRICT` foreign keys, `updated_at` triggers, and GiST spatial indexing.
  - Strict Zod schemas (`src/lib/atlas/schema.ts`) mirroring all tables, enums, WGS 84 GeoJSON geometries, and OSM lineage rules.
  - Holistic seed validator & idempotent importer (`scripts/import-seed.ts` + `src/lib/atlas/seed.ts`) reading `data/seed/{entities.csv,evidence.json,facts.json}`, reporting all errors at once, and upserting by `code`.
  - GitHub Actions CI (`.github/workflows/ci.yml`) and automated Neon migration workflow (`.github/workflows/migrate.yml`).
  - Extended `GET /api/health` (`appliedMigrationsCount`) and added `GET /api/atlas/stats` returning per-table row counts.

## Core Database Schema (`001_core_schema.sql`)

| Table | Purpose | Key Constraints |
| :--- | :--- | :--- |
| `entities` | Canonical urban/geospatial subjects (`ROAD-MIDDLE-RING`, districts, lines, stations) | Unique `code`, `name_ar` + `name_en`, `entity_type` `CHECK`, `sector` (`NORTH`/`EAST`/`SOUTH`/`WEST`/`CENTRAL`), `status` (`operational`/`partial`/`under_construction`/`planned`/`approved_planned`/`unknown`, default `'unknown'`) |
| `facts` | Multi-valued claims per entity (`attribute`, `value`, `unit`, `valid_as_of`, `verification_state`) | Unique `code`, `entity_id` FK (`ON DELETE RESTRICT`), `verification_state` (`candidate`/`single_source`/`corroborated`/`verified`/`disputed`/`rejected`/`superseded`), **no unique constraint on `(entity_id, attribute)`** |
| `evidence` | Verifiable provenance records (`url`, `publisher`, `source_type`, `published_date`, `accessed_date`) | Unique `code`, HTTP(S) `url` `CHECK`, `source_type` (`official`/`news`/`dataset`/`map`/`pdf`) |
| `fact_evidence` | Many-to-many link between `facts` and `evidence` | Composite PK `(fact_id, evidence_id)`, both FKs `ON DELETE RESTRICT` |
| `features` | Spatial features (`geometry(Geometry, 4326)`) | Unique `code`, `ST_SRID = 4326` + `ST_IsValid`, GiST index, all-or-nothing `(osm_type, osm_id, osm_version)`, `license` (`ODbL`) |

## Local Setup

### 1. Install Dependencies

```bash
npm ci
```

### 2. Configure Environment Variables

```bash
cp .env.example .env.local
```

Set `DATABASE_URL` in `.env.local` (never commit `.env` or `.env.local`):

```dotenv
DATABASE_URL="postgresql://<role>:<password>@<endpoint>.neon.tech/<database>?sslmode=require"
LOG_LEVEL="info"
```

### 3. Run SQL Migrations

```bash
# Offline verification (no DATABASE_URL required)
npm run db:migrate:dry-run

# Apply pending migrations to Neon (requires DATABASE_URL)
npm run db:migrate
```

### 4. Seed Validation & Idempotent Import

`scripts/import-seed.ts` reads `entities.csv`, `evidence.json`, and `facts.json` from `data/seed/` by default (or any directory passed via `--dir`). It validates all files and cross-file references (`entity_code`, `evidence_codes`) in a single pass—reporting **all** validation errors at once before opening a database transaction—and upserts idempotently by `code`.

```bash
# Validate canonical data/seed/ offline (no DATABASE_URL required)
npm run seed:check

# Validate the synthetic TEST-* test fixture offline
npx tsx scripts/import-seed.ts --dir tests/fixtures/seed-valid --dry-run

# Import data/seed/ into Neon idempotently (requires DATABASE_URL)
npm run seed:import
```

#### Seed File Formats (`data/seed/`)

- `entities.csv` columns: `code,name_ar,name_en,entity_type,sector,status,description`
- `evidence.json`: array of `{ code, title?, url, publisher, source_type, published_date?, accessed_date, notes? }`
- `facts.json`: array of `{ code, entity_code, attribute, value, unit?, valid_as_of?, verification_state, evidence_codes: string[], notes? }`

## CI & Automated Migrations (GitHub Actions)

- **`.github/workflows/ci.yml`**: Runs on every `pull_request` and `push` to `main` (`npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:migrate:dry-run`, `npm run seed:check`, `npm run build`). Does **not** require database access or secrets.
- **`.github/workflows/migrate.yml`**:
  - Triggered manually via **Actions → Migrate Database → Run workflow** (`workflow_dispatch`) and automatically on pushes to `main` modifying `db/migrations/**`.
  - Reads the GitHub Actions repository secret **`DATABASE_URL`** (`secrets.DATABASE_URL`), fails immediately with a clear annotation if the secret is unset, never echoes the value (`set +x`), and runs `npm run db:migrate` under serialized concurrency (`group: neon-database-migrations`).

## API Endpoints

- **`GET /api/health`**: Executes `PostGIS_Version()`, `ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(31.2357,30.0444),4326))`, and `(SELECT COUNT(*)::int FROM schema_migrations)` (`Cache-Control: no-store, max-age=0`). Returns `HTTP 200` with `database.appliedMigrationsCount` when healthy, or `HTTP 503` (`DATABASE_NOT_CONFIGURED` / `POSTGIS_NOT_ENABLED`) when unconfigured or unmigrated.
- **`GET /api/atlas/stats`**: Returns row counts across `{ entities, facts, evidence, features, fact_evidence }` (`HTTP 200`, `0` counts when empty; `HTTP 503` `DATABASE_NOT_CONFIGURED` or `SCHEMA_NOT_MIGRATED` before setup/migration).

## Quality Checks

```bash
npm run lint                # ESLint flat config
npm run typecheck           # tsc --noEmit (strict)
npm test                    # Vitest unit, schema, seed & route tests
npm run db:migrate:dry-run  # Offline SQL migration verification
npm run seed:check          # Offline seed bundle validation
npm run build               # Production Next.js build
```
