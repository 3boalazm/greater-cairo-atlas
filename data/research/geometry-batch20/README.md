# Batch 20: OSM geometry matching

The supplied, unmodified Overpass response and exact query are archived in `data/raw/`; the supplied 251-row request is retained here. `geometry_match_report.json` lists every requested entity and every exact normalized-name/alias candidate in that response, with OSM type, ID, version, tags and decisions. The matcher intentionally uses only this response, not unversioned or later live OSM data.

## Decisions and limits

31 entities received 31 features (28 polygons/multipolygons, two city points and one terminal point: see the report for the precise geometry for each). The feature and entity-page geometry counts rise from 2,983 to 3,014 and from 232 to 263 respectively; no previously existing feature or derived geometry is replaced. The remaining 220 entities comprise 66 with unresolved name candidates (`ambiguous`, including incompatible kinds or lifecycle-policy exclusions) and 154 with no exact normalized name candidate (`not_found`). These statuses describe this extract, not proof that geometry does not exist elsewhere.

Matching requires a normalized exact seed name or alias, independently reviewed identity, compatible OSM tags and geometry, valid topology, the entire geometry inside the requested 29.70,30.70,30.50,31.90 bbox, and intersection with or within 0.01 degrees of CAPMAS 2017 ADM2 geometries associated with the seed sector. Direct ADM2 entity-sector mappings are used; where none exists, a parent inherits a sector only when mapped ADM3 children unanimously identify it. This is a conservative proximity screen, not a claim of a precise sector boundary. Relations are assembled from closed OSM member rings with holes; no connector or coordinate is invented. No inferred partial landmark lines, project footprints, route corridors, or station/district substitutions are imported.

Additional safeguards retain the feature pipeline's policy that planned, approved-planned and under-construction entities need independently evidenced official alignment; OSM alone cannot satisfy that rule. The name-only candidates for these entities therefore remain in the report. Examples of deliberately unresolved cases include the square named Tahrir versus the district; the New Heliopolis village label versus the city; an East Narges homonym found in the West; Coptic Cairo versus the whole Religious Complex; and multiple Abdeen Palace polygons. The named Al Khusus node lies inside the selected neighbourhood polygon, so the polygon is preferred. The Mall of Arabia bus terminal is excluded in favour of the named mall polygon. Project and street fragments are not interpreted as entire project or landmark footprints. CAPMAS geometries are used only as a screening reference, not copied into these OSM features.

Each accepted feature uses the standard feature constructor and validator, records OSM type/ID/version and `ODbL-1.0` attribution, and is appended to the existing feature collection. The entity-page derivative follows the existing topology-preserving simplification convention. The OSM response is a snapshot: exact-name lookup may omit other objects, so it does not guarantee complete roads, boundaries or entity coverage. The report's `ambiguous` label is intentionally conservative and does not mean every rejected same-name candidate has a matching kind.

## Reproduce

```sh
python3 -m venv .venv
.venv/bin/pip install shapely==2.1.2
PYTHONPATH=scripts .venv/bin/python scripts/geometry_batch20.py
```

The importer is idempotent and refuses collisions with existing feature or entity-page geometries. The tests pin the pre-batch feature and derived geometry baselines, verify source versions/coordinates and bbox, and verify the exact entity-count increase. Seed data and UI are unchanged.
