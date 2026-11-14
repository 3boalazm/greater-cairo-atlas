# Greater Cairo Atlas — Project State

Last updated: `2026-11-13`

## Current delivery status

PR #28 was merged. The active PHASE 07.10 + 08.0 work is on the session branch; this change set is not merged. The implementation regenerates station geometry from exact `osm_node_id` facts, preserves the lifecycle guards, completes license/verification/URL and atlas UX updates, and requires the full PostGIS seed+feature import integration test before PR #29 is opened. Do not merge PR #29.

| Phase | Scope | Status |
|---|---|---|
| 01–06 | Application, schema, source-backed seed, geometry ingestion, map, exports/import hardening | Complete |
| 07.1–07.9 | Reconciliation, OSM review, station/boundary matching, reports, license and QA iterations | Complete; see checked-in feature reports and research revision notes |
| 07.10 | Exact fact-driven OSM station point regeneration with lifecycle checks and ODbL provenance | Incomplete: two explicit lifecycle conflicts remain excluded; geometry totals miss targets and five station modes remain undetermined |
| 08.0 | Trust/consistency, Arabic labels, map UX, full QA and one review PR | In progress; one unmerged PR #29 required |

## Current canonical dataset counts

Offline seed validation: **415 entities, 2,075 facts, 368 evidence records, 2,427 fact–evidence links**. Current `data/features/features.geojson`: **2,926 features**; `data/features/boundaries.geojson`: **19 boundaries**. These are checked-in source counts, not a claim about the live production database. The production import remains transactional and checksum-gated.

PHASE 07.10 station-group geometry counts (stored OSM station groups with exact seed node facts):

| Line | Target groups / points | Exact-node geometries | Note |
|---|---:|---:|---|
| Metro L1 | 35 | 35 | Target met |
| Metro L2 | 20 | 19 | `STOP-AHMED-OMAR-HASHEM` rejected: approved-planned entity, but its exact nodes 9076939018/9076939019 are operational Mohamed Naguib subway stop positions without construction tags |
| Metro L3 | 34 | 32 | `STOP-KIT-KAT` rejected: operational entity’s exact referenced node 9077189602 carries `construction=station`; 10099279486 is retained as an alternate node fact |
| LRT | 12 | 12 groups (13 point features, including a multi-position entity) | Target station-group count met |
| East Monorail | 22 | 22 groups (23 point features, including a multi-position entity) | Target station-group count met |

Across the fact-backed station set, 117 station entities reference 248 OSM node IDs; 115 entities have accepted geometry. No geometry is substituted by name. The two mismatches above remain excluded under lifecycle rules, rather than being forced to meet numeric targets. Five seed station entities have no determinate transit mode from line membership or code prefix and are explicitly reported; the UI does not label them with a generic mode.

## Data and import pipeline

Canonical research inputs are in `data/research/`; adaptation produces `data/seed/{entities.csv,evidence.json,facts.json}`. OSM outputs and exact-match audits are in `data/features/`. Validate with `npm run seed:check`; regenerate licensed geometry from stored source extracts using `scripts/ingest-features.py`; then run the full checks, including `tests/features-postgis.integration.test.ts`, which imports the current full seed and all features into PGlite/PostGIS and validates the production geometry rules. Live database reconciliation must not be claimed until a production import succeeds.

GitHub Actions workflows must remain `workflow_dispatch` only. The owner has no Actions minutes available; do not enable automatic push or pull-request workflows.

## Revision and phase history

- **rev7:** 342 entities, 1,391 facts, 350 evidence records, 1,505 links; preserved the prior rev6.2 claims and added documented evidence/facts. See `data/research/rev7/CHANGELOG_rev7.md`.
- **rev8:** 415 entities, 2,075 facts, 368 evidence records, 2,427 links. Added and consolidated OSM transit station identities while retaining node IDs as candidate facts; five transit-line count baselines were L1 35, L2 20, L3 34, LRT 12, East Monorail 22. See `data/research/rev8-draft/CHANGELOG_rev8.md`.
- **PHASE 07.3–07.5:** conservative station matching, boundary matching, and candidate review; retained ambiguity and unmatched records in `data/features/phase-07-3-station-matching-report.ar.md`, `phase-07-4-boundary-station-report.ar.md`, `phase-07-5-boundary-candidates.ar.md`, and `match-report.json`.
- **PHASE 07.10 current:** 2,926 feature geometries and 19 boundaries; exact station-entity geometry results are L1 35/35, L2 19/20, L3 32/33, LRT 12/12, East Monorail 22/22. Five modes remain undetermined. Rejections and undetermined modes are included in generated reports; PHASE 07.10 remains incomplete.

## Licensing and verification rules

Research facts, evidence, and all non-OSM-derived data: `© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0`. OpenStreetMap-derived geometry: `© OpenStreetMap contributors, ODbL 1.0`. Code has no owner-designated license; the data licenses do not grant code permissions. See [`DATA_LICENSE.md`](./DATA_LICENSE.md).

A fact marked `verified` must link to evidence whose `source_type` is `official` and whose URL is non-empty. This is enforced consistently by the seed validator/importer and migration 008’s deferred database trigger. At present, all **331 verified facts** satisfy that requirement. Evidence records lacking URLs are retained as-is and are not promoted to verified.

## Current QA and release constraints

Checks to run before PR #29: `npm run lint`, `npm run typecheck`, `npm test`, `npm run seed:check`, `npm run db:migrate:dry-run`, `npm run build`, and the full PostGIS import integration test. Provide screenshots of the home map, Layers panel, and a selected entity after fly-to. Open one PR #29 from the active branch and leave it open for review.
