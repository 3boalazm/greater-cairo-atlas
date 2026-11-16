# North sector — research batch 07 (Gemini Deep Research, 2026-11-16)

Data only (no geometry, no code). Raw Gemini output is kept untouched in `gemini_raw.json`
(+ `entities_raw.csv`, `facts_raw.json`, `evidence_raw.json`); the curated files come from the same generic curator
used for the other sectors (rules below).

## Files
- `entities.csv` — **25 NEW** NORTH entities: districts/industrial zones (Warraq Island, Shubra El Kheima industrial zone,
  Al-Safa/Khanka, Al-Akrasha, Qalyub industrial zone), Warraq Island bridge (Tahya Misr axis), roads (Gesr El Suez road,
  Regional Ring Road northern arc), rail stations (Shubra El Kheima, Qalyub), landmarks (Delta Barrage, Mohamed Ali Palace in Shubra,
  Senusret obelisk and Virgin Mary Tree in Matariya, Qobba Palace, Shoubra Faculty of Engineering, Nasser Institute, four teaching/specialised
  hospitals), an authority (National Water Research Center — Qanater) and projects (Ring Road development, Khosous development,
  Gabal El Asfar wastewater plant).
- `facts.json` — 121 facts; `evidence.json` — 82 rows `EV-N7-###`, each with `url_check`.
- `code_remap.json` — codes mapped onto entities that already exist (no duplicates are created; statuses of existing entities
  are **not** changed by this batch).
- `remap.json` — the manual part of that mapping (reviewed by hand against the seed and the WEST batch).
- `url_status.json` — result of the link check (3-digit suffix of `EV-N7-###` → `ok` | `dead_404`; anything missing = `unchecked`).
- `curation_report.txt` — counts and decisions printed by the curator.

## Link check (opened in a real browser on 2026-11-16, absolute URLs, with a fake-path control that must return 404)
- `ok` (HTTP 200): 50 — sis.gov.eg (19), presidency.eg (12), cairometro.gov.eg (8), cairo.gov.eg (5), bu.edu.eg (2), gothi.gov.eg (2),
  egymonuments.gov.eg (1), ar.wikipedia.org (1).
- `dead_404`: 1 (`EV-N7-074`, presidency.eg, Qalyub central hospital) — dropped together with its single fact
  (`LANDMARK-QALYUB-SPEC-HOSP` inpatient_beds).
- `unchecked`: 32 — qaliobia.gov.eg (unreachable from the browser), gopp.gov.eg, lands.nuca.gov.eg, mota.gov.eg (block automated checks),
  sis.gov.eg sub-domains (africa./hrightsstudies.), the bu.edu.eg apex, and the news/data/secondary sites (youm7, masrawy, shorouknews,
  elbalad, egypttrains, egydir, buffalo-tw, rovanatrade). They are kept but never counted as `ok`.

## Curation rules
- `verified` only when the evidence is `official` AND `url_check = ok`; everything else is downgraded to `single_source`
  (result: 76 verified, 2 corroborated, 43 single_source).
- Entities already in the seed (same code, or same name/alias and type) are remapped, never duplicated:
  DIST-SALAM-FIRST→DIST-SALAM-1, DIST-SALAM-SECOND→DIST-SALAM-2, ROAD-CAIRO-BELBEIS→ROAD-BILBEIS-DESERT, TRANSIT-LINE-METRO-L2→TRANSIT-METRO-L2,
  TRANSIT-LINE-BRT-PHASE1→TRANSIT-BRT, six metro stops (Khalafawy, Rod El Farag, Massara, Manshiet El Sadr, Kobri El Qobba, El Mezallat) →
  the existing `STOP-M1-*`/`STOP-M2-*` codes, and PROJ-WARRAQ-REDEV→PROJ-WARRAQ-ISLAND-DEV (that project is defined in the WEST batch,
  so merge WEST first or together). CITY-OBOUR, CITY-NEW-OBOUR and PROJ-AHALINA-1 already existed under the same code.
- Looked similar but kept as separate entities: Warraq Island (district, an island) ≠ DIST-WARRAQ (the mainland district);
  Shubra El Kheima industrial zone ≠ DIST-SHUBRA; Regional Ring Road northern arc (both NE and NW arcs, 92 km) ≠ ROAD-REGIONAL-NW-ARC (NW arc only).
  Possible overlap worth a later look: BRIDGE-WARRAQ-TAHYA-MISR (1,900 m bridge on the Tahya Misr axis over Warraq Island) vs the seed's
  BRIDGE-RING-NORTH-WARRAQ.
- Every output row comes from `gemini_raw.json`.

Licence: facts © Mustafa Aboalazm, CC BY 4.0.
