# East sector — research batch 07 (ChatGPT web search + manual verification, 2026-11-16)

Data only (no geometry, no code). The EAST sector had exactly one landmark in the seed (the British University in Egypt),
so this batch adds landmarks: historic buildings of Heliopolis and Nasr City, big malls and venues, eight universities,
and the landmarks of the New Administrative Capital (NAC).

## How the data was produced (read this before trusting it)
- The first plan was Gemini Deep Research. Both EAST runs never finished (they stayed in the «writing the report» stage for hours),
  so they were abandoned.
- ChatGPT (free account) was used instead, in **three small chunks of eight items each**, with the *Web search* tool switched on.
  ChatGPT's *Deep research* mode was tried first and discarded: it performed **zero** searches, so its output was not research.
- ChatGPT output is treated as a list of pointers, never as proof. Its raw answers are kept untouched in
  `chatgpt_raw_01.json`, `chatgpt_raw_02.json`, `chatgpt_raw_03.json`.
- **Every evidence URL was opened in a real Chrome browser and the exact claim was found on the page** (HTTP 200 + the sentence
  or number present). A fact whose page did not state it was corrected or dropped. A source that could not be opened was dropped
  (`services.asu.edu.eg` has a certificate error; it was not bypassed).
- Two evidence rows are not from ChatGPT: `EV-E7C-205` and `EV-E7C-206` (presidency.eg pages found and read by the curator,
  used to settle the status of the parliament building and of the Government District).

## Files
- `entities.csv` — **21 NEW** EAST entities (20 landmarks, 1 project):
  Baron Empain Palace, Basilica of Heliopolis, Cairo International Stadium, Cairo International Convention Centre,
  Cairo Festival City, Citystars Heliopolis, Ain Shams University, Al-Ittihadiya Palace;
  AUC New Cairo campus, German University in Cairo, Future University in Egypt, Badr University in Cairo,
  Heliopolis University, Misr International University, Al-Azhar University, Egyptian Russian University;
  Al-Fattah Al-Alim Mosque, Cathedral of the Nativity of Christ, the new parliament building, the Government District (project),
  the Unknown Soldier memorial in Nasr City. All 21 have status `operational`.
- `facts.json` — 66 facts (57 `verified`, 9 `single_source`); `evidence.json` — 29 rows `EV-E7C-###`, every one `url_check = ok`.
- `code_remap.json` — empty: no entity of this batch matched an existing entity of the same type.
- `url_status.json` — link check (`EV-E7C-###` → `ok`; `EV-E7C-009` stays `unchecked` and was dropped).
- `chatgpt_raw_0N.json` / `chatgpt_raw.json` — raw ChatGPT chunks / the merged file after the curator's edits;
  `entities_raw.csv`, `facts_raw.json`, `evidence_raw.json` — the same merged file split by the generic curator.
- `curation/` — `build_east.py` + `edits_01..03.json`: every manual correction as data (rerun
  `python3 -I curation/build_east.py <dir> 01 02 03` to rebuild `chatgpt_raw.json`); `build_report.txt` lists each edit.
- `curation_report.txt` — counts and decisions printed by the curator.

## Curation rules
- `verified` only when the evidence is `official` AND `url_check = ok`; everything else is `single_source`
  (nine facts: the Basilica rows, the four Convention Centre rows from a Cairo urban-initiatives directory, and the Al-Azhar postal
  address from the IAU WHED database).
- Same-name entities of **other** types are not duplicates: monorail stops `STOP-MRE-LOTUS`, `STOP-MRE-AZHAR-UNIV`, `STOP-MRE-FATTAH-ALIM`,
  `STOP-MRE-GOV-DISTRICT` serve the AUC campus, Al-Azhar University, the mosque and the Government District; the new landmarks sit next to them.
- Volatile facts (opening hours, student numbers, prices) were not accepted.

## What was corrected or dropped after reading the sources
- **Acres, not feddans.** AUC («260-acre campus») and ERU («37 Acres») state acres; ChatGPT had written feddans. The unit is now `acres`.
- **AUC** is the *New Cairo campus* (it moved there in 2008), not the whole university: renamed, `establishment_year` = 2008 cites the university's 10-year release.
- **Al-Azhar:** «establishment year 1961» was wrong. The page says the Development Law No. 103 of 5 July 1961 reorganised Al-Azhar and created its scientific university section,
  so the fact is now `legal_status`.
- **Heliopolis University:** founded 2009, opened 2012 (both on the page); the two evidence rows pointed at the same URL and were merged into one.
- **Cairo Stadium:** `establishment_year` 1958 is not in the source; dropped. The Basilica address «ميدان الأهرام» is not in the source; replaced by «شارع الأهرام».
  «Friends of the Basilica» is not an Egyptian official site: reclassified `secondary`.
- **Ain Shams University:** the evidence page could not be opened; the «July 1950 / Ibrahim Pasha University» claims were dropped, only the year 1950 (from the university's own page) stays.
- **Al-Ittihadiya Palace:** «inaugurated 1 December 1910» is the first opening of the *Heliopolis Palace*; the fact now says so.
- **Statuses:** ChatGPT proposed `unknown` for the parliament building and `partial` for the Government District. The presidency pages show the building hosting the oath of office
  (`EV-E7C-205`) and more than 100 government agencies, 30 of them ministries, working from the capital by July 2023 (`EV-E7C-206`), so both are `operational`.
- **Entities dropped for lack of a verifiable fact:** Iconic Tower, Central Business District, October War Panorama (to be retried).

Licence: facts © Mustafa Aboalazm, CC BY 4.0.
