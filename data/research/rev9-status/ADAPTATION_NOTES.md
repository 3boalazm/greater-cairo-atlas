# rev9 status delta adaptation

- Raw `README.md`, `evidence_rev9.json`, `facts_rev9.json`, and `status_changes_rev9.json` were copied unchanged from `research/rev9-status`.
- The research-format evidence and facts were converted with `adaptResearchSeedSources`; canonical evidence refs remain in the `EV-R9-###` namespace.
- The three status changes were applied additively to `data/seed/entities.csv`; no other entity status changed.
- Nine adapted facts and six adapted news evidence rows were appended to the canonical seed. Existing facts and evidence were retained unchanged.
- Adapter-generated fact codes were sequenced after existing facts for the same entity/attribute to prevent identifier collisions.
- All rev9 facts retain their supplied `corroborated`/`single_source` verification state; no claim is marked `verified`.
- `maintenance_closure` is displayed only in the existing researcher-only claim/source sections.
