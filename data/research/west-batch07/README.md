# West sector — research batch 07 (Gemini Deep Research, 2026-11-16)

Data only (no geometry, no code). Raw Gemini output is kept untouched in `gemini_raw.json`
(+ `entities_raw.csv`, `facts_raw.json`, `evidence_raw.json`); the curated files are produced
by the same generic curator used for the other sectors (rules below).

## Files
- `entities.csv` — **27 NEW** WEST entities (Giza side): cities (Manshaat El Qanater, Abu El Nomros, El Hawamdiya, El Badrashein),
  districts (Ard El Lewa, Mit Okba, Nazlet El Semman, 6th of October Industrial Zone), landmarks (Great Sphinx, Giza Zoo,
  Orman Garden, Agricultural Museum, Media Production City, Zewail City, Giza Square, El Hosary Mosque), roads (Saft El Laban Axis,
  King Faisal Street, Tersa Axis), BRT stops (Al-Haram, Faisal, Tersa), Giza railway station, projects (6th of October Dry Port,
  Warraq Island, Imbaba Airport land, Pyramids plateau & GEM area).
- `facts.json` — 138 facts; `evidence.json` — 68 rows `EV-W7-###`, each with `url_check`.
- `code_remap.json` — codes that were mapped onto entities that already exist (no duplicates are created; statuses of
  existing entities are **not** changed by this batch).
- `remap.json` — the manual part of that mapping (reviewed by hand against the seed).
- `url_status.json` — result of the link check (3-digit suffix of `EV-W7-###` → `ok` | `dead_404`; anything missing = `unchecked`).
- `curation_report.txt` — counts and decisions printed by the curator.

## Link check (opened in a real browser on 2026-11-16, absolute URLs, with a fake-path control that must return 404)
- `ok` (HTTP 200): 18 — sis.gov.eg (14), presidency.eg (2), egymonuments.gov.eg (1), moa.gov.eg (1).
- `dead_404`: 1 (EV-W7-051, sis.gov.eg) — dropped together with its single fact (ROAD-MIDDLE-RING endpoints).
- `unchecked`: 50 — giza.gov.eg, cabinet.gov.eg, nat.gov.eg, zewailcity.edu.eg, empc.com.eg and africa.sis.gov.eg block
  automated page checks, so their evidence is kept but never counted as `ok`.

## Curation rules
- `verified` only when the evidence is `official` AND `url_check = ok`; everything else is downgraded to `single_source`
  (result: 47 verified, 91 single_source).
- Entities already in the seed (same code, or same name/alias and type) are remapped, never duplicated:
  ROAD-MIDDLE-RING-ROAD→ROAD-MIDDLE-RING, ROAD-REGIONAL-RING-ROAD→ROAD-REGIONAL-RING, ROAD-ROD-EL-FARAG-AXIS→ROAD-ROD-ELFARAG-DABAA,
  BRIDGE-6OCTOBER→BRIDGE-6-OCTOBER, BRIDGE-15MAY→BRIDGE-15-MAY, BRIDGE-EL-MOUNIB→BRIDGE-MONIB, LINE-METRO-L2→TRANSIT-METRO-L2,
  LINE-METRO-L3→TRANSIT-METRO-L3, STOP-METRO-L3-ROD-EL-FARAG-AXIS→STOP-M3-ROD-ELFARAG-AXIS, LINE-RING-ROAD-BRT→TRANSIT-BRT,
  LINE-HSR-1→TRANSIT-HSR-L1 (+ ROAD-RING-ROAD and BRIDGE-TAHYA-MISR, which already existed under the same code).
- Looked similar but kept as separate entities: Manshaat El Qanater (Giza) ≠ CITY-QANATER (Qalyubia); El Badrashein ≠ CITY-BADR (Badr City);
  King Faisal Street (road) ≠ DIST-FAISAL (district); Faisal BRT station ≠ STOP-M2-FAISAL (metro).
- One CSV row (Zewail City) had an unquoted comma inside `name_en`, which shifted its columns; it was repaired mechanically
  (the overflow was merged back into `name_en`). Nothing was invented.
- Every output row comes from `gemini_raw.json`.

Licence: facts © Mustafa Aboalazm, CC BY 4.0.
