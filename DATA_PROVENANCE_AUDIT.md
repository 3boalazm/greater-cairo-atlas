# Greater Cairo Atlas — provenance and licence audit

**Audit branch:** `licensing/provenance-audit-phase-2`  
**Policy date:** 2026-11-18  
**Status:** Partial inventory; not a legal opinion and not yet sufficient to enable mixed-licence exports.

## Findings

1. The canonical research snapshot and exports published through 2026-11-17 remain declared CC BY 4.0 under the repository's legacy policy. This is not a retroactive relicensing.
2. Seven research batch READMEs explicitly state CC BY 4.0: Central 05, East 07, East 08, North 07, South 04, Unknowns 06, and Unknowns 08.
3. Revision folders rev5 through rev9-status and the Batch 22 label/alias support files are covered by the legacy policy, but the inspected folders do not all carry individual licence notices. They are marked as inherited, not individually verified.
4. OpenStreetMap geometry batches retain ODbL 1.0. CAPMAS COD-AB boundaries via OCHA/HDX retain CC BY-IGO. Neither is relicensed by the Atlas research policy.
5. The current evidence schema records URL, publisher, source type, and dates, but does not carry the source material's licence or permission status. The canonical seed also lacks complete batch lineage for each fact/evidence record.
6. South batch 04 states that its Gemini Deep Research output was curated by Claude. The audit records that provenance accurately; it does not assume AI-generated portions are copyrightable or exclusively owned by the project maintainer.
7. No GitHub Releases were returned by the Releases endpoint. A complete tag inventory and a full-history review were not established in this pass. The most recent 100 commits sampled included project-account commits and bot commits attributed to Claude and Vercel; this sample is not proof of sole authorship across the repository's full history.
8. Transport for Cairo GTFS is mentioned in the policy documentation, but a dedicated source file or confirmed inclusion in current exports was not located in the current tree during this pass. Treat its inclusion as unverified until identified.

## Register

The machine-readable inventory is [`data/research/LICENSE_REGISTER.json`](data/research/LICENSE_REGISTER.json). Its statuses deliberately distinguish:
- `legacy-explicit`: the batch README itself states the licence;
- `legacy-policy-inherited`: covered by the repository's legacy policy, but not independently labelled in that batch;
- `third-party-explicit`: source licence and attribution are stated by source documentation;
- `future-only-not-yet-enabled`: policy for future original research, not an assertion that any such material is currently included;
- `software-explicit`: software code only.

## What remains blocked

The register is an audit aid, **not** the mixed-licence implementation. Do not add CC BY-NC 4.0 material to the canonical seed or public exports until all of the following exist:

- Stable source/batch identifiers on entities, facts, evidence, relations, and features where applicable.
- Explicit source licence and rights/permission fields, including third-party content and evidence-source restrictions.
- An import validator that rejects unknown or contradictory licence declarations.
- Export builders that calculate the included licence set and emit component-specific attribution for CSV, JSON, GeoJSON, and GeoPackage.
- Tests that prove legacy CC BY 4.0, future CC BY-NC 4.0, ODbL, and CC BY-IGO components are not conflated.
- A human/legal review of authorship, AI-assisted material, contributor rights, and any copied third-party text or data.

Until then, the current export pipeline must remain a legacy-snapshot-only pipeline. The future NC policy is a publication rule, not a technical feature that is already enforced by the application.

## Contributor and ownership review

The recent-commit sample contains a Claude-attributed commit for the South batch 04 research archive and Vercel bot commits. The repository's software and data rights should not be treated as automatically belonging to one person solely because that person maintains the repository. Review commit authorship, source material, any human edits, and applicable platform terms before making exclusivity claims.

## Verification record

- PR #59 was merged at GitHub on 2026-11-17 23:55:46 UTC. The merge actor recorded by GitHub is the repository account `3boalazm`; the assistant did not invoke a merge operation.
- The PR head's GitHub Actions run `44202906598` completed successfully, including lint, strict TypeScript, Vitest, offline SQL/seed validation, geometry validation, and Next.js production build.
- The repository Releases endpoint returned an empty list.
- This audit is on a new branch created from merge commit `63022a36d05fe370a3cf2497347588dc5da6cbca`; it does not modify `main`.

