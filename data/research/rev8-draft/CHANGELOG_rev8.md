# rev8 transit and ENR station draft — research only

This is an additive research draft based on rev7 and the OSM extract dated 2026-11-14. This is not a seed import and does not modify `data/seed/`.
New OSM facts remain `candidate`; none are marked verified because station-name text from the official Cairo Governorate pages was not stored for this work. Consequently, only relation-specific OSM dataset evidence is attached to the new station facts.

## OSM vs official reference counts

| Line | OSM unique stations | Official reference | Difference (OSM − official) | OSM shortfall | Official evidence |
|---|---:|---:|---:|---:|---|
| TRANSIT-LRT | 12 | 12 | +0 | 0 | EV-073 |
| TRANSIT-METRO-L1 | 35 | 35 | +0 | 0 | EV-140 |
| TRANSIT-METRO-L2 | 20 | 20 | +0 | 0 | EV-143 |
| TRANSIT-METRO-L3 | 34 | 34 | +0 | 0 | EV-312 |
| TRANSIT-MONORAIL-EAST | 22 | 22 | +0 | 0 | EV-050 |

No numeric station-count shortfall appears on these five lines. An exact name-by-name omission list cannot be established from the stored official references, which provide counts but not a complete official stop list; no missing station names are guessed.

## Draft additions and mapping

- New STOP entities: 77; existing station groups mapped to retained STOP codes: 41.
- Named ENR route=train station nodes: 2; new RAIL entities: 1; existing RAIL codes retained: 1.
- Added facts: 683 (line membership, relation-specific order, and OSM node ID); all are candidate.
- New dataset evidence: 18 records, EV-351–EV-368; one record per OSM relation. EV-350 is intentionally skipped to honor the requested EV-351 starting code.
- Existing STOP/RAIL codes are reused when OSM node or normalized name mapping is unambiguous; interchanges stay one entity with a line-membership fact for each matched line.
- No official Cairo Governorate station evidence was added: exact page text was not stored, so each new station is supported only by OSM. 6 new entities lack one localized OSM name tag; no translations were invented.

## Relation evidence and sequencing

Every new line-membership/order/node-ID fact cites one or more `dataset` evidence records whose URL is the specific OSM relation. Order facts retain relation-specific order, including direction variants and L3 branches; relation IDs are included in the unit to disambiguate direction-specific indices.

The existing rev7 files are included as the base snapshot in all three rev8 data files. New records are appended; they have not been adapted or imported into the production seed.
