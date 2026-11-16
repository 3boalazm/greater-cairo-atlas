# Unknown statuses — research batch 06 (Gemini Deep Research, 2026-11-16)

Raw output: `gemini_raw.json` (+ `status_changes_raw.json`, `facts_raw.json`, `evidence_raw.json`). Curated by `build.py`.

- `status_changes.json` — 9 accepted (each backed by ≥1 official source whose URL was opened 2026-11-16):
  BRIDGE-RING-NORTH-WARRAQ→operational, CITY-MOSTAKBAL→partial, DIST-HADAEK-ASHGAR→operational, DIST-MANSOURIYA→operational,
  PROJ-ADDED-LANDS-REGULARIZATION→partial, ROAD-DAHSHUR-LINK→operational, ROAD-MARYUTEYA→partial, ROAD-MBZ-NORTH→operational, ROAD-WESTERN-DESERT→operational.
- `status_changes_rejected.json` — 3 kept unknown: ROAD-CAIRO-ASSIUT-AGRI and LINE-HELWAN-OLD-RAIL (no verified official URL in basis), LANDMARK-HELWAN-IRON-STEEL ("cancelled" is not in the schema enum; liquidation facts are kept).
- DIST-GREEN-SARAYA — not resolved by the research; stays unknown.
- `facts.json` — 58 facts (verified only official + url_check=ok); `evidence.json` — 67 rows `EV-U6-###` with `url_check` (ok 21, others unchecked: giza.gov.eg and cabinet.gov.eg block scripted checks; mhuc.gov.eg and blogs.realestate.gov.eg return soft-200 shells).
- Unknown statuses after merge: 13 → 4.
- Licence: facts © Mustafa Aboalazm, CC BY 4.0.
