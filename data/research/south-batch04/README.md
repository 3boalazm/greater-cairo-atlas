# South sector — research batch 04 (Gemini Deep Research, 2026-11-16)

Data only. Source: Gemini Deep Research run "Greater Cairo South Sector Atlas" (prompt in Arena handoff), curated by Claude.

## Files
- `entities.csv` — 31 NEW South entities (seed header/enums). No geometry: match to OSM later; never invent coordinates.
- `facts.json` — 95 facts (research format like rev9). `entity_code` already remapped to existing seed codes where the entity exists.
- `evidence.json` — 70 evidence rows `EV-S4-###` (only those referenced by facts). Each has `url_check`:
  - `ok` — opened in a browser 2026-11-16, HTTP 200, title/heading matches (41)
  - `unchecked` — not opened (26)
  - `unreachable` — nat.gov.eg returned an error page (3); not proven dead
- `status_changes.json` — 3 additive status changes for existing entities (unknown → operational): BRIDGE-MONIB, ROAD-EASTERN-DESERT, ROAD-MOKATTAM-AXIS.
- `code_remap.json` — Gemini codes mapped onto existing entities (no duplicates):
  DIST-MISR-EL-QADIMA→DIST-OLD-CAIRO, DIST-SAYEDA-ZEINAB (exists, CENTRAL), ROAD-KATAMEYA-AIN-SOKHNA→ROAD-AIN-SOKHNA,
  LINE-BRT-RING-ROAD→TRANSIT-BRT, LINE-HSR-LINE-1→TRANSIT-HSR-L1, LINE-METRO-6→TRANSIT-METRO-L6, DIST-15-MAY→CITY-15-MAY.
- `evidence_raw.tsv`, `build.py` — raw Gemini evidence list and the reproducible build script.

## Rules applied
- `verified` kept only when the source is official AND `url_check=ok`; everything else downgraded to `single_source`.
- Conflicting values kept side by side (Yasser Rizk 7 km vs 9 km; Kafrawy 4-7 vs 4-8 lanes; South Helwan bridge 2.520 vs 9.100 km).
- Existing entity statuses for remapped entities are NOT changed (TRANSIT-BRT, TRANSIT-HSR-L1, TRANSIT-METRO-L6 etc.).
- Dropped from Gemini output: low-value facts (ticket prices, commercial-registry addresses, fares from secondary sites), and a candidate-only proposal (EV-S4-104).

## Open gaps (not resolved)
- BRIDGE-MONIB: no recent official statement naming the bridge (latest official is 2021 construction era).
- Old Helwan railway remnants: no official current status.
- Helwan Iron & Steel: legal status from one news report only.
- Fustat Hills: no official opening date yet.
- Exact official name/route of a single "Mokattam Axis" does not exist; treated as umbrella name.
- Licence: facts © Mustafa Aboalazm, CC BY 4.0.
