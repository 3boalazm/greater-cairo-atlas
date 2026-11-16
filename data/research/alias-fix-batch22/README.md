# alias-fix-batch22

BATCH 22 (PR #51) appended 52 research entities. 23 of the NORTH entities arrived with their `aliases` cell separated by `;`
instead of the canonical `|`, so the loader stores each cell as ONE combined alias (e.g. "A; B") instead of separate aliases.

`aliases_fix.json` maps each affected entity code to `aliases_before` (what is in data/seed/entities.csv now) and `aliases_after`
(same words split on `;`/`؛`, trimmed, de-duplicated, joined with `|`). Nothing else about these entities changes.
Count: 23 entities, 49 aliases in total after the split.

Prepared by the reviewer (not by Arena). Apply by replacing exactly the `aliases` cell of those rows; verify `aliases_before` matches the current cell first.
