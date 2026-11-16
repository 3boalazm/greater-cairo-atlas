# Batch 24 adaptation notes

All other files in this directory are copied byte-for-byte from `research/east-batch07`. The research README describes the sources and curation decisions.

The guarded `scripts/apply-east-batch07.ts` maps the research CSV by header name and appends 21 new EAST entities with their supplied statuses, rejecting existing codes or a nonempty remap. It adapts 66 facts and 29 evidence records with `adaptResearchSeedSources`. Evidence identifiers, verification states and conflicting values are retained; `url_check=ok` is appended to evidence notes as in previous batches. No exact existing entity/attribute/value overlaps were found; no facts or evidence links required merging. No coordinates or geometry were added.

The import changes the seed from 535 to 556 entities, 2,735 to 2,801 facts, 764 to 793 evidence rows and 3,088 to 3,154 fact-evidence links; four entities remain unknown. The label registry gains the 11 requested bilingual attributes and seven unit forms.
