# East sector — research batch 08 (ChatGPT web search + manual verification, 2026-11-17)

Data only (no geometry, no code). Second set of New Administrative Capital (NAC) and Nasr City landmarks for the EAST sector:
the Green River, the Central Park, the Egypt International Olympic City, the Al-Mushir Tantawi Mosque, the International Garden (Nasr City),
and three items that batch 07 had to drop for lack of a verifiable fact: the Central Business District, the Iconic Tower and the October War Panorama.

## How the data was produced (read this before trusting it)
- ChatGPT (free account, *Web search* tool on) produced one chunk of five items (`chatgpt_raw_01.json`, kept untouched). Its output is a list of pointers, never proof.
- The other three entities (`PROJ-CENTRAL-BUSINESS-DISTRICT`, `LANDMARK-ICONIC-TOWER`, `LANDMARK-OCTOBER-WAR-PANORAMA`) were **researched directly by the curator**
  (`chatgpt_raw_00.json` is an empty file that only carries the CSV header; the entities and all their facts live in `curation/edits_00.json`).
- **Every evidence URL was opened in a real Chrome browser, twice**: once while researching, and once more with the final stored URL
  (HTTP 200 and the exact claim found on the page). Evidence titles are the real page titles. Where a sentence in a fact was stronger than its source,
  the fact was reworded to what the page says.
- Fourteen of the 17 evidence rows (`EV-E8-201…208`, `EV-E8-211…215`, `EV-E8-221`) are not from ChatGPT: they are official pages found and read by the curator.
  The other three (`EV-E8-101`, `EV-E8-102`, `EV-E8-105`) are ChatGPT's, opened and checked by the curator.

## Files
- `entities.csv` — **8 NEW** EAST entities (3 projects, 5 landmarks): 6 `operational`, **2 `unknown` on purpose** (see below).
- `facts.json` — 48 facts, all `verified` (every evidence row is `official` and `url_check = ok`); `evidence.json` — 17 rows `EV-E8-###`.
- `code_remap.json` — empty: no entity matched an existing one. `url_status.json` — link check. `curation_report.txt` — counts printed by the curator.
- `chatgpt_raw_00.json` / `chatgpt_raw_01.json` / `chatgpt_raw.json` — the empty header chunk, the untouched ChatGPT chunk, and the merged file after the curator's edits;
  `entities_raw.csv`, `facts_raw.json`, `evidence_raw.json` — the merged file split by the generic curator.
- `curation/` — `build_east.py` (now also understands `add_entities`) + `edits_00.json`, `edits_01.json`: every manual correction as data
  (rerun `python3 -I curation/build_east.py <dir> 00 01` to rebuild `chatgpt_raw.json`); `build_report.txt` in the folder root lists each edit.
- No new attribute key and no new unit: every `attribute_key` already has a bilingual label and every `unit` already has forms.

## Curation rules
- `verified` only when the evidence is `official` AND `url_check = ok`.
- Volatile facts (opening hours, ticket prices, the Cairo governorate garden listing's fees) were not accepted.
- A number that two official pages state differently is not published (see "Not published").

## Status decisions
- `PROJ-EGYPT-INTERNATIONAL-OLYMPIC-CITY`: ChatGPT proposed `unknown` (its only source was a 2022 progress report). The Presidency page of 6 Jan 2024 (the President inspects the city while the national team trains)
  and the SIS page of April 2026 (the city hosts the 2026 junior Shooting World Cup) show a working venue, so it is `operational`.
- `PROJ-CENTRAL-BUSINESS-DISTRICT` and `LANDMARK-ICONIC-TOWER` are **`unknown` deliberately**. Official pages say: the first three towers were handed over on 14 Jan 2024 (Cabinet);
  the Ministry of Housing reviewed the handover status and asked for early preparation of the operation and management phase on 8 Jul 2026; all construction work was announced complete and proposals for
  managing the district were still being reviewed on 23 Aug 2026. That is "built and being handed over, not yet running as a district": it is not `under_construction`, and nothing official says it is operating.
  The status enum has no value for it, so the atlas keeps `unknown` and explains it in `status_note` instead of guessing. **The unknown-status count therefore goes from 4 to 6.**
- The other five entities are `operational` on official statements: the Green River area and the Central Park were opened on 20 Mar 2026 (Presidency); the mosque was opened on 9 Mar 2015 and hosted the President's
  prayers on 31 Mar 2025 and 27 Feb 2026 (SIS); the October War Panorama was reopened in 2019 (Ministry of Defence); the International Garden is listed as a public garden of the Cairo governorate.

## What was corrected or dropped after reading the sources
- **Dropped evidence:** `EV-E8-103` (Presidency, 7 Jun 2022: a progress report, not a current status), `EV-E8-104` (a Ministry of Defence magazine PDF; replaced by pages that could be opened and read), `EV-E8-106` (unused).
  The four facts that cited them were replaced by facts from pages that were opened and read.
- **Green River:** ChatGPT's `width` («between 400 and 1000») became `width_range` = `400–1000` m; the area «25 million» became `25000000` m².
  The three figures come from the Presidency's description of the project at the NAC inauguration in October 2017 (`development_note` says so); the opening date (20 Mar 2026) comes from another Presidency page.
  The aliases «Green Axis» (a different thing) and «شريان العاصمة الإدارية» (not supported by any page that was read) were removed.
- **Central Park:** `water_features` and `facilities` have no label in the app; their content was folded into `development_components` with its provenance (the 2017 Presidency description).
  The aliases «Capital Park» / «كابيتال بارك» were not supported by any page that was read and were removed.
- **Al-Mushir Tantawi Mosque:** the main and sub halls of the mosque are *occasion* halls («قاعات للمناسبات»), not prayer halls; the two Presidency pages give different hall capacities, so none is published.
  Capacity (3,000 worshippers), area (33 feddan), inauguration day (9 Mar 2015) and address come from presidency.eg and the Armed Forces Moral Affairs site.
- **Iconic Tower / Central Business District:** the Ministry of Housing says Accor *operates* the district's hotels and manages the Fairmont and Raffles brands; it does not say the hotels *are* Fairmont and Raffles, so the fact says exactly that.
  The Iconic Tower height is «nearly 400 m» in the Ministry and Cabinet pages and is stored as `نحو 400` m. The Cabinet page spells the Egyptian partner «انكوم»; the fact keeps that spelling.
- **EV-E8-101** is dated `2017-10` (the page shows the month only).

## Not published (on purpose)
- The capacity of the Capital Stadium (the SIS pages say 90,000 and 92,000).
- The Olympic City area (468 feddan): the number is not in the text of the page that was supposed to carry it.
- Opening hours and fees of the International Garden.

Licence: facts © Mustafa Aboalazm, CC BY 4.0.
