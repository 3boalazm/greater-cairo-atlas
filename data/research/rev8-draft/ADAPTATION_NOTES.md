# rev8 seed adaptation notes

- The polished rev8 source was adapted into `data/seed/` with `scripts/adapt-research-seed.ts --rev 8`.
- The adapted entity and evidence copies preserve rev7's alias-union behavior and repair the inherited blank EV-231 publisher to `State Information Service (SIS)`. The upstream rev8 snapshot is retained alongside adapter-ready copies.
- Matching STOPs were checked against the existing seed by station name and line. Ring Road, Al Marj, Shobra Al-Kheima, and Kit Kat were attached to their existing STOP entities; the two same-station El Nozha positions were consolidated into `STOP-M3-EL-NOZHA`. All source positions retain their `osm_node_id` facts.
- Wadi El Nil remains two mode/status-specific entities; the under-construction West Monorail STOP is linked from the operational Metro L3 STOP with a candidate `interchange_with` fact.
- Adapter and preview dry-run validation: 415 entities, 251 with aliases, 368 evidence, 2,075 facts, and 2,427 fact-evidence links. The 71 inherited URL-less evidence records remain warnings; there are no unresolved official evidence records.
- Per-line matched OSM station entities / with node-coordinate geometry / currently imported GeoJSON point features: Metro L1 35/35/5, L2 20/20/4, L3 33/33/5, LRT 12/12/10, and East Monorail 22/22/18. L3 is one below the raw relation count after merging two same-coordinate El Nozha positions into one STOP; point-feature totals refer to the existing canonical GeoJSON, not all OSM nodes recorded as facts.
- Four station names had no Arabic value in any corresponding or opposite-direction OSM stop-position node (Sudan, Al-Bohy, Imbaba, and Al-Kawmeiah); both canonical fields retain the available English value. No Arabic translations were invented.
