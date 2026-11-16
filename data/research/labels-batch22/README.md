# labels-batch22

Bilingual labels for the 189 attribute keys that BATCH 22 (PR #51) added without translations
(`tests/fixtures/batch22/untranslated-attributes.json`). Until they are merged, the entity page in researcher mode
shows these keys as raw English snake_case.

`attribute_labels_batch22.json` = `{ "<attribute_key>": { "ar": "...", "en": "..." } }`, exactly the 189 keys of the fixture
(no extra, no missing, no duplicate Arabic label). Prepared by the reviewer, not by Arena.

How to apply: add each `ar` to `data/research/labels/attribute_labels_ar.json`, add the `en` + `ar` pair to the generated
label module the same way the existing 351 labels are produced, then empty the untranslated-attributes fixture and keep the
test that fails whenever a seeded attribute has no bilingual label.

## unit_labels.json
Display forms for every non-provenance `unit` value in data/seed/facts.json (72 distinct, 68 mapped; the 4 Arabic units `عمارة`, `مصنع`, `أسرة`, `حي` are already fine and stay as stored).
Arabic form: integer 1 → `one`; integer 2–10 → `few`; anything else (11+, decimals, ranges, text) → `many`. English: integer 1 → `one`, else `other`.
`{"hide": true}` (year, date, year_range, سنة, lottery_batch): print the value without a unit.
Units that are not listed, and the OSM provenance units (`OSM node ID`, `stop position in OSM relation N`, `OSM route=train relation N`), are shown exactly as stored. Machine exports and the API keep the raw unit.
