# Geometry batch 26: reviewed accepts

Thirty entities receive a map shape from OpenStreetMap objects whose identity was reviewed by hand.

- 8 older entities that Batch 20b left as `ambiguous` or kind-mismatched: the identity review is finished and the objects already sit in the archived Overpass extracts under `data/raw/`.
- 22 new EAST landmarks added by Batches 24 and 25: their objects are in a new archive, `data/raw/cairo-osm-east-batch26-2026-11-17.json`.

`accepts.json` is the machine-readable list (entity, OSM type and id, version, geometry kind, source file, review note). Nothing outside that list may be imported.

## The new archive

The Overpass servers could not be queried from the research browser, so the objects were found and fetched another way, both from OpenStreetMap services, on 2026-11-17:

1. Candidates: the Nominatim search service, restricted to the study bbox, by English and Arabic names.
2. Geometry: the Nominatim lookup API with `polygon_geojson=1` and `polygon_threshold=0`, so no simplification. Every item is stored verbatim under `lookup`.
3. Version, timestamp, changeset and full tag set: the OSM API 0.6 multi-fetch, stored under `meta` and keyed like `way24886453`.

The archive is not in Overpass element format. Geometry is the GeoJSON in each `lookup` item (Polygon, MultiPolygon or Point); `shapely.geometry.shape` reads it directly. The sha256 of the file is in `accepts.json`.

## Review rules applied

- One named object per entity. Alternatives that were seen and not used are named in the review note (for example the Abdeen Palace building relation, the AUC Tahrir campus, the Heliopolis Palace building way).
- Identity comes from a unique name match, either the exact name or a seed alias, plus the place (district, street, city) and, where the seed has one, the description (area, address, opening year). The Al-Fattah Al-Alim Mosque was also checked against its published location and site area: both agree with the 44 ha polygon.
- Lifecycle policy: no project or authority, no planned or under-construction entity. Every accepted entity is operational except the Iconic Tower, whose seed status is `unknown` because it is completed but not yet operating; the shape is the existing building.
- Points are used only for six entities where no polygon qualifies (Abbassia, Katameya, Tora, Lebanon Square, Sphinx Square, Heliopolis University), the same treatment as Mousky and Waily.

## Checks already run on the 30 accepts

- every `osm_version` equals the version in the archive or the archived extract;
- every geometry is valid, inside the bbox (lon 30.70 to 31.90, lat 29.70 to 30.50) and of the stated kind;
- distance to the CAPMAS sector polygons, computed as in `geometry_batch20b.py`: 28 are within the 0.01 degree limit; two are not, the Cathedral of the Nativity (0.0234 degrees, about 2.6 km) and the New Egyptian Parliament building (0.0614 degrees, about 6.8 km). Both stand in the New Administrative Capital, which the 2017 CAPMAS units do not cover, so for reviewed accepts the distance is recorded and is not a gate.

## Not imported

| Entity | Reason |
| --- | --- |
| LANDMARK-GERMAN-UNIVERSITY-CAIRO | no object under this name; the nearby hit is a different institution |
| LANDMARK-BADR-UNIVERSITY-CAIRO | no object under this name; the only hit is a hospital |
| LANDMARK-CENTRAL-PARK-NEW-CAPITAL | the objects named Central Park are in New Cairo and Shorouk; none is shown to be the capital's park |
| PROJ-GOVERNMENT-DISTRICT, PROJ-CENTRAL-BUSINESS-DISTRICT, PROJ-GREEN-RIVER, PROJ-EGYPT-INTERNATIONAL-OLYMPIC-CITY | project shapes are excluded by the scope policy |

## Expected effect

Features 3,031 to 3,061 and entities with a map shape 280 to 310, one feature per entity. Entities without a shape fall from 284 to 254. No fact, entity or evidence record changes.

## Licence

OpenStreetMap data, ODbL-1.0, (c) OpenStreetMap contributors, retrieved 2026-11-17.
