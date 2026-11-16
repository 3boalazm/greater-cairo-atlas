# Central batch 05 adaptation

- Research files were copied unchanged from `research/central-batch05`; the Gemini raw files were not altered.
- The 35 new CENTRAL entity rows were mapped by CSV header name, checked for collisions, and added to the seed. No geometry or coordinates were created.
- 116 facts and 65 evidence records were adapted with `adaptResearchSeedSources`, preserving `EV-C5-###` references and each supplied verification state. Existing entity codes used by `code_remap.json` are references only; their status and sector are unchanged.
- `url_check` has no canonical column, so it is retained in evidence `notes`. Fact codes were sequenced beyond existing codes; old facts and evidence remain, including conflicting values.
- The research includes `TRANSIT-MASPERO-RIVER-PIER` as `unknown`; its source explicitly does not establish reopening. It remains unknown, not inferred operational.
- Batch 19 introduces attribute keys without the existing curated Arabic label coverage; the exact 150 currently untranslated keys across both batches are tracked in `tests/fixtures/batch19/untranslated-attributes.json`. No UI or label translation change was made in this data-only batch.
