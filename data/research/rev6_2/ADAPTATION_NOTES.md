# rev6.2 adaptation notes

- Upstream entity, fact, and evidence snapshots are preserved unchanged. The adapter-ready evidence copy is `evidence_rev6_2_adapted.json`.
- The upstream EV-231 record had a blank publisher despite its direct SIS page URL. The canonical adaptation copy completes the publisher as `State Information Service (SIS)`, following the rev6.1 precedent and the page host; no URL, claim, or fact value changed.
- Adaptation uses the repository's existing revision-6 adapter with explicit rev6.2 inputs. Validation must preserve verified-fact official-URL requirements and lifecycle invariants.
