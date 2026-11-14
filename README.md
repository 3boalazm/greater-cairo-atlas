# Greater Cairo Atlas

A documented, source-backed interactive geospatial atlas of Greater Cairo, Egypt.

Greater Cairo Atlas is an **open-evidence urban documentation project**, not a real-estate marketplace or promotional directory:

- **Every fact keeps its source**: no unattributed measurements, dates, or claims.
- **Disagreements coexist**: conflicting claims across sources are stored side by side, never silently overwritten.
- **Lifecycle honesty**: planned, announced, or under-construction projects are never rendered as operational without an explicit `status` change (`status` defaults to `'unknown'`, never `'operational'`).
- **Source-strength discipline**: weak `'secondary'` sources (Wikipedia, blogs, aggregators, internal notes) can record candidate/disputed claims, but must never by themselves mark a fact `'verified'`.
- **Precision without guessing**: partial dates (`YYYY-MM` or `YYYY`) are stored as first-of-period `DATE` values alongside an explicit precision (`'day' | 'month' | 'year'`), never fabricated days.
- **Spatial lineage**: geometries use WGS 84 (`SRID 4326`) in PostGIS with GiST indexes and preserve upstream OpenStreetMap `type`, `id`, and `version` under `ODbL`.

## Current Phase

**Phase 04 — Real Geometry (`features`)** (see [`PROJECT_STATE.md`](./PROJECT_STATE.md) for the full phase roadmap and architectural decisions).

## Core Database Schema (`000` + `001` + `002` + `003`)

| Table | Purpose | Key Constraints |
| :--- | :--- | :--- |
| `entities` | Canonical urban/geospatial subjects (`ROAD-MIDDLE-RING`, bridges, lines, stops, airports, rail stations, authorities) | Unique `code`, `name_ar` + `name_en`, `aliases text[]` (non-blank elements), `entity_type` `CHECK` (17 researcher types including `airport` & `rail_station` + 4 legacy compatibility types), `sector` (`NORTH`/`EAST`/`SOUTH`/`WEST`/`CENTRAL`/`REGIONAL`), `status` (`operational`/`partial`/`under_construction`/`planned`/`approved_planned`/`unknown`, default `'unknown'`) |
| `facts` | Multi-valued claims per entity (`attribute`, `value`, `unit`, `valid_as_of`, `valid_as_of_precision`, `verification_state`) | Unique `code`, `entity_id` FK (`ON DELETE RESTRICT`), `valid_as_of_precision` (`day`/`month`/`year`, default `'day'`), `verification_state` (`candidate`/`single_source`/`corroborated`/`verified`/`disputed`/`rejected`/`superseded`), **no unique constraint on `(entity_id, attribute)`**, deferred constraint trigger requiring `>= 1` non-`'secondary'` source when `'verified'` |
| `evidence` | Verifiable provenance records (`url`, `title`, `publisher`, `source_type`, `published_date`, `published_date_precision`, `accessed_date`) | Unique `code`, nullable `url` (`http(s)://` when present; requires non-empty `title` when `url IS NULL`), `published_date_precision` (`day`/`month`/`year`), `source_type` (`official`/`news`/`dataset`/`map`/`pdf`/`secondary`) |
| `fact_evidence` | Many-to-many link between `facts` and `evidence` | Composite PK `(fact_id, evidence_id)`, both FKs `ON DELETE RESTRICT` |
| `features` | Spatial features (`geometry(Geometry, 4326)`) | Unique `code`, `ST_SRID = 4326` + `ST_IsValid`, GiST index, all-or-nothing `(osm_type, osm_id, osm_version)`, `license` (`ODbL`) |

## How SQL Migrations Run (Vercel & Local)

### Automatic Migrations on Vercel (`vercel-build`)

`vercel.json` configures Vercel deployments (Production and Preview) to run `npm run vercel-build` (`scripts/vercel-build.ts`), while keeping plain `npm run build` (`next build`) completely DB-free for local/offline builds:

1. **Environment Gate**: Migrations execute **only** when `VERCEL=1` and a database URL (`DATABASE_URL` or `DATABASE_URL_UNPOOLED`) is present.
2. **Unpooled Connection Preference (`DATABASE_URL_UNPOOLED`)**: Prefers `DATABASE_URL_UNPOOLED` (injected by the Neon Vercel Integration) for session-scoped `pg_advisory_lock` and DDL transactions, falling back to `DATABASE_URL`.
3. **Fail-Closed Guarantee**: Checksum immutability (`schema_migrations`), `pg_advisory_lock`, and per-file `BEGIN`/`COMMIT`/`ROLLBACK` remain enforced. If any migration fails, `vercel-build` exits non-zero **before** `next build`.

### Manual GitHub Workflows (`workflow_dispatch` only)

`.github/workflows/ci.yml` and `.github/workflows/migrate.yml` are configured with `on: workflow_dispatch` only so pushes and pull requests never consume GitHub Actions minutes.

## Research-Seed Adapter & Protected Import

### 1. Adapt Research Seed (`scripts/adapt-research-seed.ts`)

Deterministically converts mixed-revision research inputs into canonical `data/seed/` files (`entities.csv`, `evidence.json`, `facts.json`) while enforcing strict epistemic validation. Revision 3 uses unchanged `entities_rev2.csv` with `evidence_rev3.json` and `facts_rev3.json`; auto-resolution selects the highest available revision independently for each input file.

- Missing/blank `status` -> `'unknown'` (never guessed as `'operational'`).
- Missing `source_type` -> fails with an explicit list of offending `evidence_ref`s (`rev2` required before import).
- `'verified'` fact without at least one non-`'secondary'` source -> fails.
- Partial dates (`YYYY-MM` or `YYYY`) -> stored as `YYYY-MM-01` / `YYYY-01-01` + `valid_as_of_precision` (`'month'` / `'year'`).
- Generates run-stable, order-independent fact codes (`F-<ENTITY_CODE>-<ATTRIBUTE>-<N>`).

```bash
# Convert a mixed-revision seed directory (auto-selects highest available revision per file)
npm run seed:adapt -- --in /path/to/greater-cairo-atlas-seed --report /tmp/seed-report.json

# Or target rev3 explicitly (entities falls back to rev2)
npm run seed:adapt -- --in /path/to/greater-cairo-atlas-seed --rev3 --report /tmp/seed-report.json

# Validate canonical data/seed/ offline
npm run seed:check
```

### Revision 3 dry-run expectations

The canonical bundle has **213 entities, 59 evidence records, 278 facts, and 304 fact-evidence links**. Five evidence records have no URL: internal secondary records `EV-000` and `EV-051`, and unresolved official records `EV-042`, `EV-045`, and `EV-046`. A dry run should pass with **0 errors and 5 non-blocking URL warnings**, explicitly listing the three unresolved official codes.

### 2. Protected Server-Side Seed Import (`POST /api/admin/import-seed`)

Allows the project owner to validate and idempotently import `data/seed/` into Neon directly inside Vercel **without ever copying or exposing `DATABASE_URL`**:

1. Configure **`ADMIN_IMPORT_TOKEN`** (at least 16 characters, e.g. `openssl rand -hex 32`) in Vercel Environment Variables (`Production` / `Preview`).
2. **Dry-run validation (default)**:
   ```bash
   curl -sS -X POST "https://<deployment-domain>/api/admin/import-seed" \
     -H "Authorization: Bearer $ADMIN_IMPORT_TOKEN"
   ```
3. **Execute idempotent transactional upsert**:
   ```bash
   curl -sS -X POST "https://<deployment-domain>/api/admin/import-seed" \
     -H "Authorization: Bearer $ADMIN_IMPORT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"dryRun": false}'
   ```

## Phase 04 — Geometry Ingestion & GeoJSON API

`python3 scripts/ingest-features.py` is a local-only ingestion command; it is never run in a Vercel handler. It performs exact normalized Arabic/English name and alias matches against existing entities, gated by entity type. It does not create entities and reports unmatched/ambiguous source records in `data/features/match-report.json`. Every geometry must be valid WGS84 and wholly inside the Greater Cairo bbox `[30.5, 29.2, 32.1, 30.8]`. Planned, approved-planned, and under-construction items require a linked official alignment source; unknown status remains unknown and is never promoted by the geometry import.

Source policy:
- OSM geometry uses ODbL-1.0 and stores OSM element type/id/version and attribution.
- TfC GTFS is accepted only with a verified `CC-BY-4.0` license; the script rejects unknown or `CC-BY-NC` licenses. Do not use the old 2016 Metro-GTFS (CC BY-NC).
- Download the approved TfC GTFS zip from the Transport Data Commons portal separately, verify its license, then run:
  ```bash
  python3 scripts/ingest-features.py --fetch-osm --gtfs-zip /path/to/tfc-gtfs.zip --gtfs-retrieval-date YYYY-MM-DD --gtfs-license CC-BY-4.0 --gtfs-license-evidence-url "$TFC_LICENSE_PAGE_URL"
  ```
- If a GTFS archive is supplied without network fetching, use `--osm-json /path/to/overpass.json` instead of `--fetch-osm`.

The 2026-11-14 owner-supplied Overpass extract is recorded in `data/raw/osm-overpass-2026-11-14.json.gz`; its SHA-256 and the uncompressed input hash are recorded in `data/features/manifest.json`. The generated collection contains 723 features across 18 entities. `ROAD-NASR` is excluded via `data/features/match-rules.json` and its 73 OSM candidates are reported as ambiguous. `data/features/alias-suggestions.json` is research-only: none of its proposed aliases are applied. Extract coverage is limited to route relations (subway/light_rail/monorail/train), selected railway ways, station/platform/stop nodes, and named motorway/trunk roads; it does not include primary/secondary highways or bus routes. No TfC GTFS or NC data is included. Do not run a real import as part of this phase.

The protected import validates `data/features/features.geojson` and idempotently upserts features by code in the existing transaction. To validate locally without writing to the database, run `npm run db:migrate:dry-run` and `npm run seed:check`; no real import was run for this phase.

## API Endpoints

- **`GET /api/health`**: PostGIS smoke probe + `schema_migrations` count (`appliedMigrationsCount: 5` once `000`–`004` are applied).
- **`GET /api/atlas/stats`**: Returns row counts across `{ entities, facts, evidence, features, fact_evidence }`.
- **`GET /api/atlas/features?type=&sector=&status=&zoom=`**: Cached GeoJSON FeatureCollection with entity names/status, license, attribution, and source IDs; at zoom ≤7 the query groups geometries into one simplified feature per entity; results are capped at 1,000 features. OSM responses carry explicit `© OpenStreetMap contributors, ODbL 1.0` attribution.

Example read-only requests (replace `localhost:3000` with your deployed origin as needed):
```bash
curl -sS 'http://localhost:3000/api/atlas/features?zoom=6' -o /tmp/features-z6.geojson
curl -sS 'http://localhost:3000/api/atlas/features?type=road&sector=REGIONAL&zoom=9' -o /tmp/features-roads-z9.geojson
curl -sS 'http://localhost:3000/api/atlas/features?type=transit_line&zoom=12' -o /tmp/features-transit-z12.geojson
```
- **`POST /api/admin/import-seed`**: Protected by `ADMIN_IMPORT_TOKEN` (constant-time SHA-256 `timingSafeEqual`), `dryRun: true` by default, idempotent upsert when `dryRun: false`.

## Quality Checks

```bash
npm run lint                # ESLint flat config
npm run typecheck           # tsc --noEmit (strict)
npm test                    # Vitest unit, schema, seed, adapter, admin-import & route tests
npm run db:migrate:dry-run  # Offline SQL migration verification (000–004)
npm run seed:check          # Offline canonical seed bundle validation
npm run build               # DB-free production Next.js build
```
