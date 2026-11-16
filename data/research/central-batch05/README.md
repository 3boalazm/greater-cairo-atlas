# Central sector — research batch 05 (Gemini Deep Research, 2026-11-16)

Data only. Raw Gemini output in `gemini_raw.json` (+ `entities_raw.csv`, `facts_raw.json`, `evidence_raw.json`); curated by `build.py`.

- `entities.csv` — 35 NEW CENTRAL entities (landmarks: Egyptian Museum, Citadel, Muhammad Ali, Sultan Hasan, Al-Rifai, Al-Azhar Park, Khan El Khalili, Al-Muizz, Bab Zuweila, Ibn Tulun, Islamic Art Museum, Coptic Museum, Hanging Church, Amr Ibn Al-As mosque, Manial Palace, Cairo Tower, Opera, Fish Garden, Horreya Park, Abdeen Palace, Ataba Square, Al-Hussein, Azbakeya Garden; projects: Maspero Triangle, Ahl Misr Walkway, Historic Cairo, Khedivial Cairo, Ataba Market, Ministries relocation, Mogamma reuse; transport: Abdel Moneim Riad, Torgoman, Maspero river pier, Al-Azhar tunnel). No geometry.
- `facts.json` — 116 facts; `evidence.json` — 65 rows `EV-C5-###` with `url_check`:
  ok 53 (opened 2026-11-16, HTTP 200) · unchecked 12 · two dead links (EV-C5-050/051, HTTP 404) were dropped with their facts.
- `code_remap.json` — mapped onto existing entities (no duplicates): PROJ-FUSTAT-HILLS-PARK→PROJ-FUSTAT-HILLS, PROJ-AIN-EL-SIRA-LAKE→LANDMARK-EIN-EL-SIRA, PROJ-MAGRA-EL-OYOUN (exists), TRANSIT-METRO-LINE-4→TRANSIT-METRO-L4, LANDMARK-TAHRIR-SQUARE→DIST-TAHRIR. Statuses of existing entities are not changed.
- `verified` only for official sources with url_check=ok; otherwise downgraded to single_source.
- Licence: facts © Mustafa Aboalazm, CC BY 4.0.
