# Greater Cairo Atlas — project state

## Delivery

Batches 15 and 16 integrated the South sector research and the reviewed OSM geometry, retaining source provenance and unresolved cases. Batch 17 (PR #44) refined search, map and entity panel behaviour. Batch 18 (PR #45) is merged. Batch 19 is pending review and adds the Central and unknown-status research, without UI or geometry changes.

## Counts and limitations

Offline `npm run seed:check`: 483 entities, 2,426 facts, 580 evidence records, 2,779 fact–evidence links, 194 relations and 2,983 geometry features; 71 evidence warnings. CAPMAS COD-AB has 838 units (75 ADM2, 763 ADM3). These are checked-in data counts, not observed live database counts. The user reports the live Batch 18 stats and export matched at 2,252 facts; Batch 19 has not been imported to production here. The nine accepted status changes reduce the 13 pre-existing unknowns to 4; Central batch 05 adds one unknown Maspero river pier, making 5 in the combined seed.

Public exports are the canonical static seed snapshot, not a full dump of DB-only drift. With a configured database they filter retired facts and their links; public stats report counts from that same snapshot after checking DB health. The dashboard and import summary disclose DB-only entity, fact and evidence codes. Database-only facts retain their evidence links. Migration 008 prevents a verified fact from losing all official URL evidence; failed reconciliation rolls back instead of silently weakening it.

## Database and provenance

Migrations 000–014 include the PostGIS bbox rules (007), verified-source guard (008), review and append-only audit log (011), append-only fact retirement (012), consistent geometry licence constraints (013), and updated-at triggers (014). The two stale Ahmed Omar Hashem candidate OSM node facts are retired by 012 if present; their records and links are not deleted. Migration and production seed imports use advisory locks; admin token verification uses fixed-length SHA-256 digests and constant-time comparison.

OSM geometry is ODbL; research data is CC BY 4.0; CAPMAS COD-AB is CC BY-IGO (`CC-BY-IGO` in machine-readable licence fields). Attribution remains in the files. See [DATA_LICENSE.md](DATA_LICENSE.md). Source disagreements and unknown statuses remain explicit.

## Verification and deployment

CI validates GeoJSON with the same road envelopes as migration 007, runs Python regression tests, lint, strict typecheck, Vitest including PGlite/PostGIS, migration and seed checks, and a production build. Production Vercel builds migrate and checksum-import transactionally before building. A successful local validation does not establish the live migration or import result. See [performance notes](docs/perf-2026-11.md) and [change history](docs/CHANGELOG.md).

Batch 19 introduces 150 attribute keys without curated Arabic labels. They are tracked in `tests/fixtures/batch19/untranslated-attributes.json`; no UI or translation changes were made as part of this data-only batch.
