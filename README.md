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

**Phase 07 — Final polish, data licensing, full-sync imports & QA** (see [`PROJECT_STATE.md`](./PROJECT_STATE.md) for completed phases and known limitations).

## Core Database Schema (`000` + `001` + `002` + `003` + `004` + `005`)

| Table | Purpose | Key Constraints |
| :--- | :--- | :--- |
| `entities` | Canonical urban/geospatial subjects (`ROAD-MIDDLE-RING`, bridges, lines, stops, airports, rail stations, authorities) | Unique `code`, `name_ar` + `name_en`, `aliases text[]` (non-blank elements), `entity_type` `CHECK` (17 researcher types including `airport` & `rail_station` + 4 legacy compatibility types), `sector` (`NORTH`/`EAST`/`SOUTH`/`WEST`/`CENTRAL`/`REGIONAL`), `status` (`operational`/`partial`/`under_construction`/`planned`/`approved_planned`/`unknown`, default `'unknown'`) |
| `facts` | Multi-valued claims per entity (`attribute`, `value`, `unit`, `valid_as_of`, `valid_as_of_precision`, `verification_state`) | Unique `code`, `entity_id` FK (`ON DELETE RESTRICT`), `valid_as_of_precision` (`day`/`month`/`year`, default `'day'`), `verification_state` (`candidate`/`single_source`/`corroborated`/`verified`/`disputed`/`rejected`/`superseded`), **no unique constraint on `(entity_id, attribute)`**, deferred constraint trigger requiring `>= 1` non-`'secondary'` source when `'verified'` |
| `evidence` | Verifiable provenance records (`url`, `title`, `publisher`, `source_type`, `published_date`, `published_date_precision`, `accessed_date`) | Unique `code`, nullable `url` (`http(s)://` when present; requires non-empty `title` when `url IS NULL`), `published_date_precision` (`day`/`month`/`year`), `source_type` (`official`/`news`/`dataset`/`map`/`pdf`/`secondary`) |
| `fact_evidence` | Many-to-many link between `facts` and `evidence` | Composite PK `(fact_id, evidence_id)`, both FKs `ON DELETE RESTRICT` |
| `import_runs` | Last committed automatic data import checksum | Dataset key PK, 64-character SHA-256, timestamp; written atomically with seed/features upserts |
| `features` | Spatial features (`geometry(Geometry, 4326)`) | Unique `code`, `ST_SRID = 4326` + `ST_IsValid`, GiST index, all-or-nothing `(osm_type, osm_id, osm_version)`, `license` (`ODbL`) |

## How SQL Migrations Run (Vercel & Local)

### Automatic Migrations on Vercel (`vercel-build`)

`vercel.json` configures Vercel deployments (Production and Preview) to run `npm run vercel-build` (`scripts/vercel-build.ts`), while keeping plain `npm run build` (`next build`) completely DB-free for local/offline builds:

1. **Environment Gate**: Migrations execute **only** when `VERCEL=1` and a database URL (`DATABASE_URL` or `DATABASE_URL_UNPOOLED`) is present.
2. **Unpooled Connection Preference (`DATABASE_URL_UNPOOLED`)**: Prefers `DATABASE_URL_UNPOOLED` (injected by the Neon Vercel Integration) for session-scoped `pg_advisory_lock` and DDL transactions, falling back to `DATABASE_URL`.
3. **Fail-Closed Guarantee**: Checksum immutability (`schema_migrations`), `pg_advisory_lock`, and per-file `BEGIN`/`COMMIT`/`ROLLBACK` remain enforced. If any migration fails, `vercel-build` exits non-zero **before** `next build`.
4. **Automatic Production Data Import**: Only when `VERCEL=1` and `VERCEL_ENV=production`, after migrations and before `next build`, the build validates `data/seed/` and `data/features/features.geojson`, then performs the same idempotent entity/evidence/fact/link/feature upsert as the protected manual endpoint. Preview deployments do not import data. A production build without database configuration fails closed.
5. **All-or-Nothing Checksum Gate**: A SHA-256 over every file under `data/seed/` and `data/features/` is compared with `import_runs`. The upserts and checksum row are written in one PostgreSQL transaction under an advisory transaction lock; an unchanged checksum skips all writes. Any validation or SQL failure rolls back and fails the production build, preventing deployment of half-imported data. Logs contain counts and status only, never connection URLs or tokens.

### GitHub Workflows

**`ci.yml` runs automatically on every pull request into `main` and every push to `main`** (BATCH 12.1), and can still be started by hand with `workflow_dispatch`. It runs ESLint, the strict TypeScript typecheck, the full Vitest suite, the production build, the offline migration dry-run, the offline seed check, and the committed-GeoJSON geometry validation. No secrets are used and no database is required, so it is safe on forks.

The PostGIS integration tests (`tests/features-postgis.integration.test.ts`, and the other `*.integration.test.ts` files) are **already part of `npm test`** and therefore run in CI: they use in-process PGlite with the PostGIS WASM extension rather than an external service, so no `services:` container or database secret is needed. They are not skipped and not left manual. The only workflow still limited to manual dispatch is `migrate.yml`, because it applies migrations to a real database and requires credentials.

## Research-Seed Adapter & Protected Import

### 1. Adapt Research Seed (`scripts/adapt-research-seed.ts`)

Deterministically converts mixed-revision research inputs into canonical `data/seed/` files (`entities.csv`, `evidence.json`, `facts.json`) while enforcing strict epistemic validation. Revision 5 sources remain in `data/research/rev5/`; the current canonical seed is adapted from the rev6.1 source bundle preserved in `data/research/rev6_1/`. The rev6.1 “Capital University” aliases are source-provided; matching remains exact and does not infer operational status.

- Missing/blank `status` -> `'unknown'` (never guessed as `'operational'`).
- Missing `source_type` -> fails with an explicit list of offending `evidence_ref`s (`rev2` required before import).
- `'verified'` fact without linked `OFFICIAL` evidence with a non-empty URL -> fails in seed validation and the deferred database trigger.
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

### Historical revision 3 expectations (before rev5)

Current canonical seed validation (`npm run seed:check`) reports 448 entities, 2,252 facts, 448 evidence records, and 2,605 fact-evidence links. The current feature collection contains 2,983 geometries, including 14 partially mapped OSM `highway=busway` ways that carry the visible share of the BRT (الأتوبيس الترددي) line. There are 71 evidence records without URLs, all retained as documented records (the current schema and database guard require verified facts to cite official evidence with a URL); all 379 currently verified facts satisfy that rule. No rev4 entity code was removed, renamed, or retyped; all rev4 facts are retained. Six of the 31 south batch 04 entities now have OSM geometry (three road corridors and three landmark polygons); the other 25 remain searchable and resolve in the entity panel without geometry. See `data/research/south-batch04/geometry_match_report.json` for the conservative matching decisions.

To reproduce the revision 5 outputs after placing the Drive bundle in `data/research/rev5/`:

```bash
npm run seed:adapt -- --rev 5 --in data/research/rev5 --report /tmp/rev5-report.json
python3 scripts/apply-osm-aliases.py
gzip -dc data/raw/osm-overpass-2026-11-14.json.gz > /tmp/cairo-osm-overpass-2026-11-14.json
python3 scripts/ingest-features.py --osm-json /tmp/cairo-osm-overpass-2026-11-14.json \
  --osm-source-url https://overpass-api.de/api/interpreter --osm-retrieval-date 2026-11-14
```

That historical revision 5 OSM re-match produced 1,970 ODbL features across 25 entities. A later rev6.1 matching snapshot produced 3,615 candidates; the current checked-in PHASE 07.10 collection contains **2,983 features** after exact fact-driven station regeneration, the partial BRT busway extraction, and the South batch 04 geometry addition. Historical per-entity counts and unmatched candidates remain in `data/features/match-report.json`.

To reproduce the rev6.1 seed adaptation and OSM rematch using the preserved source extracts:

```bash
npm run seed:adapt -- --rev 6 \
  --entities data/research/rev6_1/entities_rev6_1.csv \
  --facts data/research/rev6_1/facts_rev6_1.json \
  --evidence data/research/rev6_1/evidence_rev6_1.json \
  --report /tmp/rev6_1-report.json
gzip -dc data/raw/cairo-osm-overpass-2026-11-14-extract2.json.gz > /tmp/cairo-osm-overpass-2026-11-14-extract2.json
gzip -dc data/raw/cairo-osm-overpass-2026-11-14-roads-full.json.gz > /tmp/cairo-osm-overpass-2026-11-14-roads-full.json
python3 scripts/ingest-features.py \
  --osm-json /tmp/cairo-osm-overpass-2026-11-14-extract2.json \
  --osm-json /tmp/cairo-osm-overpass-2026-11-14-roads-full.json \
  --osm-source-url https://overpass-api.de/api/interpreter --osm-retrieval-date 2026-11-14
npm run seed:check
```

Install `requirements-ingest.txt` before running the Python matcher. `data/research/rev6_1/ADAPTATION_NOTES.md` records the minimal publisher-metadata repair made for EV-231, necessary for adapter validation; no fact values or source URLs were changed.

### 2. Protected Server-Side Seed Import (`POST /api/admin/import-seed`)

Remains available as a **manual fallback** for owner-directed imports and dry-run validation. It imports `data/seed/` and `data/features/features.geojson` into Neon directly inside Vercel **without ever copying or exposing `DATABASE_URL`**. Automatic production deploy imports are documented above and do not require an admin token:

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

The owner-supplied Overpass extracts from 2026-11-14 are preserved in `data/raw/` and their hashes are recorded in `data/features/manifest.json`. The historical rev6.1 matching run contained 3,615 candidates; the current checked-in, validated collection contains 2,983 features. `ROAD-NASR` remains excluded via `data/features/match-rules.json` and its candidates are reported as ambiguous. `data/features/alias-suggestions.json` is research-only: none of its proposed aliases are applied; only source-provided entity aliases and the separately documented Metro source-label aliases are used. The earlier transport-focused extracts cover route relations (subway/light_rail/monorail/train), selected railway ways, station/platform/stop nodes, named motorway/trunk roads, and named `highway=busway` ways for the BRT corridor. The later South geometry review also uses named primary road ways and selected landmark polygons; it does not add other bus routes. No TfC GTFS or NC data is included. Production deployments run the configured automatic import; preview builds run a dry-run validator only.

The protected import validates `data/features/features.geojson` and idempotently upserts features by code in the existing transaction. To validate locally without writing to the database, run `npm run db:migrate:dry-run` and `npm run seed:check`. Production deployments automatically import changed, validated seed/features; previews and local builds do not.

## API Endpoints

- **`GET /api/health`**: PostGIS smoke probe + `schema_migrations` count (`appliedMigrationsCount: 6` once `000`–`005` are applied).
- **`GET /api/atlas/stats`**: Returns row counts across `{ entities, facts, evidence, features, fact_evidence }`.
- **`GET /api/atlas/features?type=&sector=&status=&zoom=`**: Cached GeoJSON FeatureCollection with entity names/status, license, attribution, and source IDs; the SQL applies zoom-dependent geometry simplification; results are capped at 5,000 features. OSM responses carry explicit `© OpenStreetMap contributors, ODbL 1.0` attribution.

Example read-only requests (replace `localhost:3000` with your deployed origin as needed):
```bash
curl -sS 'http://localhost:3000/api/atlas/features?zoom=6' -o /tmp/features-z6.geojson
curl -sS 'http://localhost:3000/api/atlas/features?type=road&sector=REGIONAL&zoom=9' -o /tmp/features-roads-z9.geojson
curl -sS 'http://localhost:3000/api/atlas/features?type=transit_line&zoom=12' -o /tmp/features-transit-z12.geojson
```
- **`POST /api/admin/import-seed`**: Protected by `ADMIN_IMPORT_TOKEN` (constant-time SHA-256 `timingSafeEqual`), `dryRun: true` by default, idempotent upsert when `dryRun: false`.

## The map: time, opacity and saved settings

### «الزمن» — the map at a chosen year

One small pill in the map toolbar, for everyone (not only researchers): "what existed in 2019" is a plain
question. Open it for a year slider, the year itself, and play/pause. Closing it returns to today, because a
hidden control must not leave the map in a past state you cannot see.

The only admissible input is a **dated status assertion**: an `operational_status` fact whose `valid_as_of`
says when that status was true. Status at year Y = the latest such claim with year ≤ Y, honouring a
`valid_to` when one exists. Nothing is inferred from opening dates, phase schedules, or the existence of a
later status.

Three things worth knowing if you maintain the seed:

1. **`opening` facts are not a status source.** Their `valid_as_of` is when the claim was recorded (mostly
   2026-11-14); the opening date itself sits in the free-text `value`, sometimes as prose
   («المترو أغسطس 2020؛ LRT ومجمع النقل يوليو 2022»). Parsing that would be guessing, so the resolver
   ignores those facts entirely and the panel shows them as research notes only.
2. **An unreviewed claim may not colour the map.** Of 343 entities with a dated status claim, 191 of the
   latest ones are still `candidate`. Drawing from them made the slider disagree with the published map for
   18 entities, 16 of them on unreviewed rows. So only `verified` or `corroborated` claims are drawn —
   the same strength bar the export API already applies. An unreviewed claim is still reported in the
   researcher panel; it just does not repaint anything.
3. **The default changes nothing.** At today, 115 entities are drawn and every one agrees with the curated
   status; 228 are withheld (210 of which agree but lack review); 74 have no dated claim. Zero drawn
   disagreements. Opening the atlas and touching nothing shows exactly the map that shipped.

An entity with no dated claim by the chosen year is shown as «غير معروف في هذا التاريخ» — drawn in the
existing `unknown` style, never assumed operational. Two contradicting claims on the same date resolve to
`unknown`/`conflicted` rather than electing a winner, and a dispute is never erased by a better-supported
twin that happens to agree. The researcher panel names the fact that decided the colour, or says plainly
that nothing did.

`?year=2019` in a URL opens the control at that year; `?year=2025` (this year) is treated as closed so a
normal URL stays clean. An out-of-range or malformed year is ignored rather than clamped — silently showing
2015 for `?year=1800` would misrepresent what the sender asked for.

### Layer opacity and saved display settings

Per-group opacity (infrastructure, transport, areas/boundaries, projects, reference network) lives inside its
own «تفاصيل أكتر: شفافية الطبقات» disclosure, so the simple panel stays simple.

Opacity **multiplies** each layer's authored value rather than replacing it: the layers carry a deliberate
hierarchy (a road casing behind the road, a fainter reference network), and 100% must reproduce the map as it
shipped. The authored value is captured once per style build — reading it back on each slider tick would
square the factor and land at 25% after two drags to 50%. A dedicated effect applies changes so dragging the
slider does not rebuild the map and throw away the camera.

Display settings (layer groups, opacity, reference networks, interchanges, theme) are stored under
`gca-display-settings-v2` and are:

- **Versioned** — a blob from another shape is discarded, not migrated blindly.
- **Strict** — unknown keys are dropped and a wrong-typed field falls back to its own default instead of
  poisoning the whole object. Opacity is clamped to 0.1–1 so a corrupt value cannot hide a layer.
- **Corrupt-safe** — every read is wrapped; private mode, disabled storage and quota failures all mean
  "nothing saved" rather than an error.
- **URL-first** — a shared link beats saved settings *per key*: `?layers=transport` shows transport only,
  not your saved groups merged with it, while keys the link is silent about keep your saved value.

«إعادة الضبط» clears the stored key and restores every display default in one step (and is disabled when
you are already on the defaults). The restore is guarded so it cannot write defaults over your saved
settings on the first render.

## Data review workspace (`/admin`)

The atlas is edited through `/admin`, behind the same `ADMIN_IMPORT_TOKEN`. Configure it once
(≥ 16 characters, e.g. `openssl rand -hex 32`) in Vercel → Environment Variables for Production and
Preview, then open `/admin?lang=ar` and paste the token. Nothing else is needed.

The token is typed into the page and held in memory. It is never written to `localStorage`, never put
in a cookie, and never placed in a URL (a token in a query string ends up in access logs, referrers and
history). Every request sends it as `Authorization: Bearer …`, and the server compares it in constant
time. A wrong token is `401`; an unconfigured deployment is `503` — it fails closed rather than open.
Write endpoints are limited to 30 writes per minute per admin.

| Screen | What it answers |
| --- | --- |
| Dashboard | Real counts: entities, facts, evidence, features, official boundaries, plus what needs attention — unknown statuses, entities without geometry, single-source facts, facts without evidence, open conflicts, pending submissions, unreviewed facts. A count that cannot be measured renders «—», never `0`. |
| Entities | Server-paginated table with Arabic/English search and filters for type, sector, status, geometry and boundary. |
| Facts & evidence | Value, as-of date, verification state and every linked source with publisher, URL and dates. Approve / reject / mark disputed / attach supporting or contradicting evidence. |
| Geometry | Entities with no geometry, entities drawn differently by two sources, and points outside their official boundary — with the source and licence of each shape. |
| Conflicts & gaps | The questions the atlas cannot answer yet, each linking to where it can be fixed. |
| Import | JSON or CSV upload: validation → duplicate detection → diff preview → commit. |
| Submissions | Public suggestions, with their review queue. |

Three rules the implementation enforces rather than merely documents:

1. **Nothing is deleted or overwritten.** Rejections and disputes keep the fact and its evidence; they
   change the review state. Replacing a geometry keeps the old one in `geometry_history`.
2. **Every change is audited.** Each write and its `admin_audit_log` row are committed in one
   transaction, recording actor, time, action, before, after and reason. The log is append-only: a
   direct `UPDATE` is rejected by a trigger.
3. **`verified` still means an official source with a URL** (migration 008). Approving an unsourced fact
   succeeds as an approval but leaves the claim `candidate`, and the API returns the reason. An imported
   fact is always a `candidate`; accepting a submission creates a `candidate` fact plus `secondary`
   evidence, which the existing trigger already forbids from backing a verified claim.

Import is a dry run until you commit, and a commit must present the SHA-256 checksum of the exact
preview you saw — so what you approve is what you looked at, not a re-computation. Rows claiming to be
`verified` without an official, reachable source are rejected with a reason, never quietly downgraded.
Existing entity codes are never overwritten, and a same-attribute/different-value import row is
reported as a conflict rather than inserted as a competing fact.

Reversibility: `db/migrations/011_admin_review.sql` ends with the reverse SQL for all four new tables
(`fact_reviews`, `admin_audit_log`, `geometry_history`, `admin_import_previews`). There is no
down-migration runner; the reverse statements are documented in the file.

## Quality Checks

```bash
npm run lint                # ESLint flat config
npm run typecheck           # tsc --noEmit (strict)
npm test                    # Vitest unit, schema, seed, adapter, admin-import, admin-workspace & route tests
npm run db:migrate:dry-run  # Offline SQL migration verification (000–005)
npm run seed:check          # Offline canonical seed bundle validation
npm run build               # DB-free production Next.js build
```

## Phase 07 — Final reconciliation, attribution & release QA

### Data import reconciliation

Production import reconciles `features` and the full `fact_evidence` relationship set inside the same transaction as the seed upserts and checksum record. Stale feature geometry and stale fact/evidence links are deleted; legacy entities, facts, and evidence not present in the current source seed are counted and reported, not automatically deleted. The dataset key was bumped for a one-time reconciliation even when the source checksum has not changed. `npm run seed:check` prints read-only deletion/retention counts when a database preview connection is configured; without one it clearly reports the counts as unavailable. The current checked-in feature source contains **2,983** features; this is a source count, not a claim that the live database has already reconciled.

### Data and code licenses

Facts, evidence, and all data not derived from OSM carry `© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0`; contact `01092500454 · 3boalazm@gmail.com`. OSM-derived geometry carries `© OpenStreetMap contributors, ODbL 1.0`. CSV downloads include a license/contact comment header; JSON and GeoJSON include license metadata and per-feature source attribution. `/data`, the site footer, and [`DATA_LICENSE.md`](./DATA_LICENSE.md) reproduce these notices. The code has no owner-designated license and is not relicensed by the data license; ask the owner before reusing code.

### Revisioned data pipeline

Research revision inputs and adaptation notes remain under `data/research/`. To update data, preserve a new revision and source changelog there, run `npm run seed:adapt` against the chosen revision/source files, regenerate OSM features only from licensed source extracts with `scripts/ingest-features.py`, inspect the adapter and feature reports, then run `npm run seed:check` and the full checks below. Do not edit generated canonical seed/features without recording how to reproduce them. Vercel previews validate without writes; production performs the transactional checksum-gated reconciliation after migrations.

Known data limitations are documented in [`PROJECT_STATE.md`](./PROJECT_STATE.md): **47 unknown statuses**, **21 remaining road-network gaps**, and unresolved official evidence records **EV-045/EV-046**.
