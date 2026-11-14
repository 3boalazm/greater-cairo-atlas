# rev8 transit and ENR station revision

Rev8 builds on rev7 and the stored OSM extract dated 2026-11-14. It has been polished and adapted into `data/seed/` for the rev8 seed import.

## OSM vs official reference counts

| Line | OSM unique stations | Official reference | Difference (OSM − official) | OSM shortfall | Official evidence |
|---|---:|---:|---:|---:|---|
| TRANSIT-LRT | 12 | 12 | +0 | 0 | EV-073 |
| TRANSIT-METRO-L1 | 35 | 35 | +0 | 0 | EV-140 |
| TRANSIT-METRO-L2 | 20 | 20 | +0 | 0 | EV-143 |
| TRANSIT-METRO-L3 | 34 | 34 | +0 | 0 | EV-312 |
| TRANSIT-MONORAIL-EAST | 22 | 22 | +0 | 0 | EV-050 |

No numeric station-count shortfall appears on these five lines. The stored official references provide counts but not a complete official stop list, so an exact name-by-name omission list cannot be established and no missing station names are guessed.

## Entity and identifier cleanup

- Final seed snapshot: 415 entities, 2,075 facts, and 368 evidence records. Compared with rev7, this adds 72 station entities and one ENR rail-station entity; five duplicate OSM station records were folded into their existing or consolidated canonical STOP entities.
- New metro/LRT/monorail STOP codes use stable line-prefixed slugs (`STOP-M1-*`, `STOP-M2-*`, `STOP-M3-*`, `STOP-LRT-*`, `STOP-MRE-*`). The ENR station uses `RAIL-GIZA-SUBURBS`. OSM node IDs remain represented by `osm_node_id` facts, and all fact references use the final stable entity codes.
- OSM Ring Road is folded into existing `STOP-M3-RING-ROAD`; Al Marj, Shobra Al-Kheima, and Kit Kat are folded into existing `STOP-M1-EL-MARG`, `STOP-M2-SHUBRA-ELKHEIMA`, and `STOP-KIT-KAT`. Two OSM positions at the same El Nozha L3 station are represented once as `STOP-M3-EL-NOZHA`. All source node IDs remain attached as facts.
- `STOP-MRW-WADI-EL-NIL` remains a separate WEST / under-construction West Monorail station from operational Metro L3 `STOP-M3-WADI-EL-NILE`; an `interchange_with` fact links the two without merging their identities.
- Sectors follow the atlas coordinate conventions rather than defaulting new stops to CENTRAL: Helwan is SOUTH, Adly Mansour is EAST, and Kit Kat / Imbaba are WEST.

## Names, evidence, and sequencing

- Arabic names were read from matching OSM station/platform nodes and opposite-direction stop positions where present. No Arabic translations were invented.
- The stored OSM nodes have no Arabic name for four stops: Sudan, Al-Bohy, Imbaba, and Al-Kawmeiah. Their canonical Arabic and English fields both retain the available English name.
- Added OSM route evidence: EV-351–EV-368 (18 relation-specific dataset records). Added route membership/order/node-ID facts remain `candidate`; each cites the corresponding OSM relation evidence. The explicit Wadi El Nil interchange fact also remains candidate.
- OSM STOP matching was checked against existing STOP entities by station name and line before adaptation; duplicate groups were consolidated, not emitted as duplicate entities.
