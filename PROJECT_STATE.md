# Greater Cairo Atlas — Project State

Last updated: `2026-11-13`

## Delivery status

All planned project phases 01–07 are implemented on the current delivery branch. Phase 07 is the final polish, licensing, and QA pass; its pull request is intentionally to remain open for review (not merged by this task).

| Phase | Scope | Status |
|---|---|---|
| 01–03 | Application foundation, schema, source-backed seed adapter, protected importer | Complete |
| 04 | OSM geometry ingestion and GeoJSON API | Complete |
| 05 | Interactive, filterable Greater Cairo map | Complete |
| 06 | Data exports, metadata, deployment/import hardening | Complete |
| 07 | Full synchronization, attribution/license, documentation and QA | Complete pending review/deployment |

## Data and import pipeline

Canonical research inputs are in `data/research/`; deterministic adaptation produces `data/seed/{entities.csv,evidence.json,facts.json}`. OSM matcher outputs are in `data/features/features.geojson`, with source extracts, matching rules, and reports retained alongside. Run `npm run seed:adapt` with the desired revision/source paths, then `npm run seed:check` to validate offline. The Vercel production build runs migrations and performs a checksummed, transactional import; preview deployments validate without writes. The protected manual endpoint also defaults to dry-run.

Imports synchronize the seeded features and the complete `fact_evidence` relation in the same transaction. Stale features and links are removed; entities, facts, and evidence absent from the seed are counted and reported, never automatically deleted. The full-sync import key forces a one-time reconciliation of pre-existing installations. Dry-run count previews require a configured database or injected test session; without one, the report explicitly marks database counts unavailable.

Current source feature collection: **2,305 features**. Following the next successful production import, the live feature total is expected to be **2,305** (previous live database count: 3,760, including stale rows). This is a deployment expectation, not a claim that the live database has already been reconciled.

## Licenses

Facts, evidence, and all non-OSM-derived data: `© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0`; contact `01092500454 · 3boalazm@gmail.com`. OSM-derived geometry: `© OpenStreetMap contributors, ODbL 1.0`. No code license has been designated by the owner; code reuse is not granted by the data license. See [`DATA_LICENSE.md`](./DATA_LICENSE.md).

## Known research and coverage limits

- **47 entities have unknown status**; status is not inferred from geometry or weak evidence.
- **21 road-network gaps remain**; the supplied extract is not exhaustive and missing map geometry is not evidence that a road or project does not exist.
- **EV-045 and EV-046 remain unresolved** (official records lack resolved source URLs); no URLs are fabricated.
- OSM-derived geometry is limited to the extracted/matched source coverage; ambiguous candidates remain excluded rather than guessed.

## Quality and release notes

Available checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run db:migrate:dry-run`, `npm run seed:check`, and `npm run build`. Preview import validation is read-only. Do not claim live-database reconciliation until the production import has completed.

### Lighthouse before/after

Audited the base-commit production build and Phase 07 production build with Lighthouse mobile emulation and desktop preset. Each tuple is **Performance / Accessibility / Best Practices / SEO** (0–100); `before` is the branch base, `after` is this Phase 07 build.

| Route | Device | Before | After |
|---|---|---:|---:|
| `/` | Mobile | 45 / 100 / 96 / 100 | 85 / 100 / 96 / 100 |
| `/` | Desktop | 96 / 100 / 96 / 100 | 99 / 100 / 96 / 100 |
| `/entity/ROAD-RING-ROAD` | Mobile | 92 / 100 / 96 / 100 | 95 / 100 / 96 / 100 |
| `/entity/ROAD-RING-ROAD` | Desktop | 100 / 100 / 96 / 100 | 100 / 100 / 96 / 100 |
| `/data` | Mobile | 96 / 100 / 100 / 100 | 99 / 100 / 100 / 100 |
| `/data` | Desktop | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/methodology` | Mobile | 98 / 96 / 100 / 100 | 100 / 96 / 100 / 100 |
| `/methodology` | Desktop | 100 / 96 / 100 / 100 | 100 / 96 / 100 / 100 |

The production build was audited locally without `DATABASE_URL`; requests to the live atlas API therefore returned expected configuration errors, and the external OpenFreeMap style was not reliably reachable from the restricted audit browser. The homepage mobile score (85) is the remaining sub-90 case; its measured LCP varied with these unavailable API/map requests (roughly 3.5 seconds on the recorded run). MapLibre is dynamically split, fonts are self-hosted and non-blocking, the mobile viewport uses stable sizing, and the other seven route/device performance scores are at least 95. Accessibility is at least 96 and best-practices/SEO at least 96 across this run. Re-audit against the deployed preview with its database and map service available before release sign-off.
