# rev7 adaptation notes

- Upstream `entities_rev7.csv`, `facts_rev7.json`, `evidence_rev7.json`, `CHANGELOG_rev7.md`, and `REV7_HANDOFF.md` were merged from `research/rev7` and remain unchanged.
- Canonical adaptation uses the repository's revision-6 seed adapter, the same adapter used for rev6.2, with explicit rev7 input files.
- Adapter-ready copies are `entities_rev7_adapted.csv` and `evidence_rev7_adapted.json`; the upstream snapshots remain untouched. The rev7 entity snapshot omits 70 aliases present in the rev6.2 canonical seed across 24 entities, with no removals documented in its changelog. To honor the no-deletions requirement and avoid unintended OSM rematching regressions, the adapted entity copy unions those existing aliases with rev7 aliases (without changing names, types, statuses, or codes).
- As in rev6.2, the upstream EV-231 record has a direct SIS URL but a blank publisher; the evidence copy fills `publisher` as `State Information Service (SIS)` without changing the claim, URL, or fact references.
- Full adapter dry-run passed: 342 entities, 250 with aliases, 350 evidence records, 1,391 facts, and 1,505 fact-evidence links. The seed validator remains authoritative; verified facts must cite official evidence with a URL.
- Lifecycle review: no entity/fact/evidence deletions, no entity retyping, and no planned-to-operational transitions. Exactly 28 entity statuses changed from `unknown` to operational (26), partial (1), or under_construction (1); 17 entities remain `unknown`.
