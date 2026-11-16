# Batch 20b: offline OSM geometry, second pass

The matcher reads only the seven specified archived extract families in `data/raw/` (including the existing South batch's metadata companion for versioned records). No OSM query or other geographic download was made. The report lists every name candidate, its full tags, source file, version, and decision/reason; repeated OSM IDs are deduplicated without mixing geometry or tags across versions. Name indices include name, name:ar, name:en, alt_name, old_name, official_name and their `;`/`|` alternatives. Arabic and English normalization and the requested Arabic type-prefix alternatives are used for seed names and aliases. A name occurring only in a different archived version is retained for audit but cannot establish the current object's identity.

Scope is computed from the seed minus the union of existing feature and entity-page geometry codes, with this batch's own accepted entries included on re-runs. On the input baseline this is **272** entities: **220** previously unmatched Batch 20 entities plus **52** new North/West entities. 17 accepted: 13 from the former and 4 from the latter. Features rise **3,014 → 3,031**; geometry-bearing entities rise **263 → 280**. Each accepted entity adds exactly one feature and one page geometry, with no replacement of prior geometry.

## Decisions by entity type

| Entity type | Matched | Ambiguous | Not found | Policy excluded | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| authority | 0 | 0 | 0 | 21 | 21 |
| bridge | 1 | 4 | 7 | 1 | 13 |
| city | 1 | 12 | 5 | 3 | 21 |
| district | 11 | 28 | 20 | 2 | 61 |
| landmark | 4 | 13 | 18 | 3 | 38 |
| project | 0 | 0 | 0 | 25 | 25 |
| rail_station | 0 | 1 | 3 | 1 | 5 |
| road | 0 | 7 | 5 | 3 | 15 |
| transit_line | 0 | 0 | 3 | 8 | 11 |
| transit_stop | 0 | 15 | 17 | 30 | 62 |
| **Total** | **17** | **80** | **78** | **97** | **272** |

Ambiguous includes candidates excluded for wrong kind, identity or extent as well as multiple plausible matches; not_found means no normalized-name match in the named archived objects, not proof of absence from OSM. Authority/project and planned/approved-planned/under-construction rows are policy-excluded. Batch 20's source constructor, relation/way geometry builder and geometry validator are reused; its bbox, CAPMAS sector union and 0.01° proximity, and official-alignment lifecycle policy remain in force. Candidates must have versioned source objects, compatible kinds, valid geometry entirely inside the bbox, sector proximity and unique preference after polygon-over-point and inside-over-nearby screening. An additional explicit identity-review gate avoids equating a homonym, short alias, nearby object or partial feature with the intended entity. New entities are discovered automatically on re-run, but future identities must be reviewed before import.

District points for Mousky and Waily are accepted only because no admissible polygon exists; they are representative OSM place points, not invented boundaries. University Bridge uses two same-named ways with matching bridge/highway tags, whose endpoints are within 15 m and whose geometry is in the same sector. It is a single MultiLineString with original lines unaltered, no invented connector, and full per-way type/id/version/tags/source recorded in `source_ids.members`. All other road/bridge fragments remain unimported unless a single connected group and reviewed complete extent are established. No route relation or railway alignment was independently shown to cover a full line, so none is imported. Stop names alone cannot establish line identity: network/line/operator/ref compatibility is required and none passed independent review. City New Heliopolis's differently named Arabic village, the western Narges homonym, Kafr El Elow, Ataba artwork, Abdeen's ambiguous grounds and Coptic Cairo are not substituted for the requested entities.

Full feature records are appended to `data/features/features.geojson` and page geometries to `data/derived/entity-map-geometries.json`, following Batch 20's topology-preserving simplification, source metadata and ODbL attribution. Archived source SHA-256s are recorded in the manifest. The importer validates every feature, refuses source or existing-geometry collisions before writes, and a second run is byte-identical. Existing feature and derived geometry hashes are tested.

## Reproduce and verify

```sh
python3 -m venv .venv
.venv/bin/pip install shapely==2.1.2
.venv/bin/python scripts/geometry_batch20b.py --scan  # /tmp/geometry20b-scan.json, no canonical writes
.venv/bin/python scripts/geometry_batch20b.py
.venv/bin/python -m unittest discover -s tests -p test_geometry_batch20b.py -v
```

No seed data, entity names, statuses or facts were changed. CAPMAS is a screening reference; it is not copied into these OSM geometries. `scripts/geometry_batch20.py` remains unchanged.
