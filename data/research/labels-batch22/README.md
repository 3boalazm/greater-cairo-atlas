# labels-batch22

Labels and unit display forms for the attribute debt that still shows raw English keys in researcher view.

## attribute_labels_missing.json (339 keys)
`{ "<attribute_key>": { "ar": "...", "en": "..." } }` for exactly the keys listed in
`tests/fixtures/batch19/untranslated-attributes.json` (150, BATCH 19) and `tests/fixtures/batch22/untranslated-attributes.json` (189, BATCH 22).
No key is missing or extra, every Arabic label contains Arabic letters and no underscore, and no entity in the seed shows two different keys under one label
(the only existing duplicate, RAIL-BASHTIL inauguration_date/opening_date, is older and untouched).
Prepared by the reviewer, not by Arena.

How to apply: add each `ar` to `data/research/labels/attribute_labels_ar.json`, add the `{ar,en}` pair to the generated label module the same way the existing 351 are produced,
then delete both untranslated-attributes fixtures and make the label test require a human Arabic label and a bilingual pair for every seeded attribute.

## unit_labels.json
Display forms for every non-provenance `unit` value in data/seed/facts.json (72 distinct, 68 mapped; the 4 Arabic units `عمارة`, `مصنع`, `أسرة`, `حي` are already fine and stay as stored).
Arabic form: integer 1 → `one`; integer 2–10 → `few`; anything else (11+, decimals, ranges, text) → `many`. English: integer 1 → `one`, else `other`.
`{"hide": true}` (year, date, year_range, سنة, lottery_batch): print the value without a unit.
Units that are not listed, and the OSM provenance units (`OSM node ID`, `stop position in OSM relation N`, `OSM route=train relation N`), are shown exactly as stored. Machine exports and the API keep the raw unit.
