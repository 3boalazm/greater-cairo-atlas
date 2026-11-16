# Unknown statuses — research batch 08 (Gemini Deep Research, 2026-11-16)

Second pass over the entities still marked `unknown` after batch 06 (8 left in the seed: 5 original + 3 West BRT stops).
Raw output: `gemini_raw.json` (+ `status_changes_raw.json`, `facts_raw.json`, `evidence_raw.json`). Curated by `curate.py` (rules below).
Every evidence URL was opened in a real browser on 2026-11-16 where the host allowed it: `url_status.json` (per `EV-V8-###`) and `url_check_notes.json` (reason for each non-`ok`).

## Status changes

- `status_changes.json` — 4 accepted (each backed by at least one official source whose URL opened and matched on 2026-11-16):
  - `STOP-BRT-AL-HARAM`, `STOP-BRT-FAISAL`, `STOP-BRT-TERSA` → `approved_planned`. The official SIS release of 2026-09-26 describes Phase 2 as 16 stations (13 in service; Zahraa Maadi, Autostrad and Mansoureya «to follow»)
    and does not mention these three at all, while the official 2025 government list (IDSC) names them on the Maryouteya/Giza axis. No opening date has been announced as of 2026-11-16.
    The official name of the second one is «الملك فيصل» (the short form «فيصل» appears only in media).
  - `LINE-HELWAN-OLD-RAIL` → `partial` (**judgment call**): the old Helwan–Ramses passenger route was replaced by Metro Line 1 (official: cairometro.gov.eg), but a parallel surface line
    «خط سكة حديد طرة - التبين» still exists (official: cairo.gov.eg) and freight trains are reported on it (news, single source).
- `status_changes_rejected.json` — 1 kept `unknown`: `ROAD-CAIRO-ASSIUT-AGRI` (→ `operational` proposed). All six official sources are giza.gov.eg pages that could not be opened by the checking browser
  (the URLs are plain HTTP; the browser upgrades them to HTTPS and the connection fails). Two news pages that did open (youm7, elbalad) confirm ongoing upgrade works on the road, so it is almost certainly in use, but the rule below needs an official URL that was actually opened.
  Its 10 facts are kept as `single_source`. Re-check when giza.gov.eg is reachable.
- Not resolved by the research (stay `unknown`):
  - `LANDMARK-HELWAN-IRON-STEEL` — company under liquidation, plant not producing (official IDSC/Cairo facts kept as `verified`); the schema has no closed/historic status, so `unknown` + facts.
  - `TRANSIT-MASPERO-RIVER-PIER` — the latest dated official evidence of operation is from 2019; later items are only a 2020 relocation and 2023 handover preparation (news).
  - `DIST-GREEN-SARAYA` — no data found.

## Facts and evidence

- `facts.json` — 50 facts: 20 `verified` (official AND url ok) and 30 `single_source`. One fact was dropped with its evidence (below).
- `evidence.json` — 34 rows `EV-V8-###`: `ok` 21, `unchecked` 13 (giza.gov.eg ×6, nat.gov.eg, mpbs.gov.eg and qaliobia.gov.eg closed the connection; darelhilal.com answered a Cloudflare 403;
  almasryalyoum.com and elaosboa.com are blocked by the browser tool's site policy; sis.gov.eg `EV-V8-027` opens but the claimed BRT text is not on the page and is not relied on).
- `EV-V8-014` (elbalad.news/7179521) was treated as dead: the URL serves a different article (smoke from a Russian train carriage at Shubra El Kheima), not the cited Tebbin/Maraziq one.

## Rules (same as batches 05–07, one added)

1. `verified` only when the evidence is official AND its URL opened and matched; otherwise `single_source`.
2. Dead/mismatched evidence is dropped together with its facts.
3. A status change is accepted only with an official, url-ok source in `basis`; otherwise it stays `unknown` (rejected file keeps the reason).
4. **New in this batch:** a fact Gemini labelled `corroborated` is downgraded to `single_source` when its cited URL could not be opened (3 operator facts of the BRT stops).
5. Nothing is invented: every row comes from `gemini_raw.json`.

## Open points for the maintainer

- Consistency: the other not-yet-open BRT stops (`STOP-BRT-AUTOSTRAD`, `STOP-BRT-MANSOURIYA`, `STOP-BRT-ZAHRAA-MAADI`) are `planned` in the seed while these three become `approved_planned`.
- A `closed/historic` status would describe the Iron & Steel plant (and the Maspero pier if it is confirmed closed) better than `unknown`.
- Unknown statuses after merge: 8 → 4 (`ROAD-CAIRO-ASSIUT-AGRI`, `LANDMARK-HELWAN-IRON-STEEL`, `TRANSIT-MASPERO-RIVER-PIER`, `DIST-GREEN-SARAYA`).
- Licence: facts © Mustafa Aboalazm, CC BY 4.0.
