# Batch 25 adaptation notes

All other files in this folder are copied byte-for-byte from `research/east-batch08`. The README explains curation and the intentional unknown statuses of the Central Business District and Iconic Tower.

`scripts/apply-east-batch08.ts` guards the baseline and maps entity columns by header. It appends eight EAST entities with their supplied statuses, rejecting code collisions and nonempty remaps. It uses `adaptResearchSeedSources` for 48 verified facts and 17 evidence records, retaining EV-E8 references and appending each `url_check=ok` to the evidence notes as in earlier batches. No exact entity/attribute/value overlaps with existing facts were found. No existing entities, facts, geometry, labels or units were changed. No normalized name or alias collisions with existing entities were found.

Counts: entities 556 → 564, facts 2,801 → 2,849, evidence 793 → 810, links 3,154 → 3,202, unknown statuses 4 → 6. No coordinates or map shapes were added.
