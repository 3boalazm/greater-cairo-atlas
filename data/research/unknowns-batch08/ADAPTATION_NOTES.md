# Batch 08 adaptation

The supplied research files are preserved unchanged. All 50 facts and 34 `EV-V8-###` evidence rows were adapted with `adaptResearchSeedSources`. The existing entity, fact and evidence identifiers were collision checked. Each evidence note retains `url_check=ok` or `url_check=unchecked` as in prior batches. Each fact keeps its supplied verification state, value, unit, date and evidence reference; conflicting values remain separate. Twenty facts are verified and thirty single-source. The adapter received no additional source or invented evidence.

Four accepted status changes were applied only after checking each current `from=unknown` and an official URL-checked basis: the old Helwan rail line to `partial` and the three BRT stops to `approved_planned`. Caveats remain in the unmodified research input; no caveat was appended to entity rows. The rejected Cairo–Assiut road change was not applied. No entity was added; no geometry was changed.

The import found **zero** exact existing entity/attribute/value overlaps, so all 50 facts and all 50 evidence links were appended independently. The 33 newly introduced attributes received the supplied bilingual labels in the existing human and generated registries. The two m/km facts use the existing unit display mapping.
