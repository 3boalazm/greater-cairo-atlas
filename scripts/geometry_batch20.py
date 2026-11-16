#!/usr/bin/env python3
"""Conservative, reproducible Batch 20 OSM import; Shapely 2.1.2 required.

Each admitted object is explicitly reviewed. The general matcher records every exact
normalized name/alias candidate, including incompatible kinds and unresolved homonyms.
Only IDs in REVIEWED can pass the independent geometry, status and sector checks.
"""
from __future__ import annotations
import csv
import gzip
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union
from road_gap_fill import normalize
from south_batch04_geometry import ingest, osm_geometry

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'data/research/geometry-batch20'
RAW = ROOT / 'data/raw/cairo-osm-geometry-batch20-2026-11-16.json.gz'
FEATURES = ROOT / 'data/features/features.geojson'
DERIVED = ROOT / 'data/derived/entity-map-geometries.json'
MANIFEST = ROOT / 'data/features/manifest.json'
BBOX = box(30.70, 29.70, 31.90, 30.50)
NEAR_DEGREES = 0.01
NAME_KEYS = ('name', 'name:ar', 'name:en', 'alt_name')
PREFIX = 'BATCH20-'
# Explicit identity review: one named object per entity, never a similarly named
# transit stop, unrelated business, project footprint, or street fragment.
REVIEWED = {
    'CITY-KERDASA': ('node', 768553290),
    'CITY-REHAB': ('node', 2587220708),
    'DIST-BASATIN': ('way', 716699354),
    'DIST-DAR-ELSALAM': ('way', 708231172),
    'DIST-FUSTAT': ('way', 990530550),
    'DIST-GARDEN-CITY': ('way', 707036948),
    'DIST-KHOSOUS': ('way', 729875378),
    'DIST-MOKATTAM': ('way', 714742689),
    'DIST-NEW-MAADI': ('way', 777522265),
    'DIST-SAFT-ELLABAN': ('way', 98343218),
    'DIST-SAHEL': ('way', 704920022),
    'LANDMARK-GEM': ('relation', 16783121),
    'LANDMARK-MALL-OF-ARABIA': ('relation', 13478008),
    'LANDMARK-WADI-DEGLA': ('way', 773773382),
    'LANDMARK-EGYPTIAN-MUSEUM': ('way', 10873198),
    'LANDMARK-MUHAMMAD-ALI-MOSQUE': ('relation', 446128),
    'LANDMARK-AL-RIFAI-MOSQUE': ('way', 24908256),
    'LANDMARK-SALAH-EL-DIN-SQ': ('way', 108122067),
    'LANDMARK-AL-AZHAR-PARK': ('way', 24745061),
    'LANDMARK-KHAN-EL-KHALILI': ('way', 34204980),
    'LANDMARK-BAB-ZUWEILA': ('way', 775853319),
    'LANDMARK-ISLAMIC-ART-MUSEUM': ('way', 46579853),
    'LANDMARK-COPTIC-MUSEUM': ('way', 215304755),
    'LANDMARK-HANGING-CHURCH': ('way', 1240729445),
    'LANDMARK-MANIAL-PALACE': ('way', 25011349),
    'LANDMARK-CAIRO-TOWER': ('way', 767933342),
    'LANDMARK-CAIRO-OPERA': ('relation', 2844528),
    'LANDMARK-FISH-GARDEN': ('way', 24986650),
    'LANDMARK-HORREYA-PARK': ('way', 28801283),
    'TRANSIT-ABDEL-MONEIM-RIAD': ('relation', 16822065),
    'TRANSIT-TORGOMAN-TERMINAL': ('node', 3232969796),
}
EXCEPTIONS = {
    'CITY-NEW-HELIOPOLIS': 'English name also labels a different Arabic-named village; identity unproven.',
    'DIST-NARGES': 'same-named residential polygon is in West rather than East.',
    'DIST-REMAYA': 'candidate is a square, not a district.',
    'DIST-TAHRIR': 'candidates are a square, not a district.',
    'DIST-HUSSEIN-AZHAR': 'Al Azhar neighbourhood alone does not establish the combined district.',
    'LANDMARK-AMR-IBN-AL-AS': 'same-named building is in West rather than Central.',
    'LANDMARK-RELIGIOUS-COMPLEX': 'Coptic Cairo alone does not establish the entire religious complex.',
    'LANDMARK-MAGRA-EL-OYOUN': 'the named aqueduct ways are open lines, not a point or polygon.',
    'LANDMARK-AL-MUIZZ': 'the named street ways are open lines, not a landmark point or polygon.',
    'LANDMARK-ABDEEN-PALACE': 'multiple potentially compatible named polygons; identity and scope ambiguous.',
    'RAIL-BASHTIL': 'multiple compatible railway objects; identity and scope of the upper Egypt station unresolved.',
    'PROJ-AHL-MISR-WALKWAY': 'multiple named walkway polygons; no evidence that either represents the whole project.',
    'PROJ-MOGAMMA-REUSE': 'a named building is not an exact named reuse-project polygon.',
}


def labels(tags):
    return {normalize(part.strip()) for key in NAME_KEYS for part in str(tags.get(key, '')).split(';') if part.strip()}


def kind_ok(kind, e):
    t = e.get('tags', {})
    if kind in ('district', 'city'):
        return (t.get('place') not in (None, '', 'square') or t.get('boundary') == 'administrative')
    if kind in ('transit_stop', 'rail_station'):
        return t.get('railway') == 'station' or t.get('public_transport') == 'station' or t.get('amenity') == 'bus_station' or t.get('highway') == 'bus_station'
    if kind == 'landmark':
        return any(t.get(k) not in (None, '', 'no') for k in ('tourism', 'historic', 'amenity', 'leisure', 'building')) and not (t.get('highway') or t.get('railway') or t.get('public_transport'))
    if kind == 'road':
        return e['type'] == 'way' and bool(t.get('highway'))
    if kind == 'bridge':
        return e['type'] == 'way' and t.get('bridge') == 'yes'
    if kind == 'project':
        return e['type'] in ('way', 'relation')
    return False


def main():
    requested = json.loads((RESEARCH / 'missing-geometry-entities.json').read_text(encoding='utf-8'))
    with (ROOT / 'data/seed/entities.csv').open(encoding='utf-8-sig', newline='') as f:
        seed = {r['code']: r for r in csv.DictReader(f)}
    with gzip.open(RAW, 'rt', encoding='utf-8') as f:
        doc = json.load(f)
    elements = doc['elements']
    if len(requested) != 251 or len(elements) != 330:
        raise ValueError('unexpected source size')
    index = defaultdict(list)
    for e in elements:
        if not e.get('id') or not e.get('version') or not e.get('type'):
            raise ValueError('OSM identity/version missing')
        for name in labels(e.get('tags', {})):
            index[name].append(e)
    # Sector proximity is measured against actual CAPMAS ADM2 geometries whose
    # entity associations already have that sector in the canonical seed.
    admin = json.loads((ROOT / 'data/features/codab-admin-units.geojson').read_text(encoding='utf-8'))
    areas = defaultdict(list)
    parent_sectors = defaultdict(set)
    for f in admin['features']:
        p = f['properties']
        if p['level'] == 3:
            for parent in p.get('parent_pcodes', []):
                parent_sectors[parent].update(seed[c]['sector'] for c in p.get('entity_codes', []) if c in seed)
    for f in admin['features']:
        p = f['properties']
        if p['level'] != 2:
            continue
        sectors = {seed[c]['sector'] for c in p.get('entity_codes', []) if c in seed}
        # If the ADM2 itself has no mapping, unanimous mapped ADM3 children
        # establish its sector; never override a direct ADM2 association.
        if not sectors and len(parent_sectors[p['pcode']]) == 1:
            sectors = parent_sectors[p['pcode']]
        for sector in sectors:
            areas[sector].append(shape(f['geometry']))
    sector_geom = {sector: unary_union(geoms) for sector, geoms in areas.items()}
    collection = json.loads(FEATURES.read_text(encoding='utf-8'))
    derived = json.loads(DERIVED.read_text(encoding='utf-8'))
    old_features = [f for f in collection['features'] if not f['id'].startswith(PREFIX)]
    baseline_codes = sorted({f['properties']['entity_code'] for f in old_features})
    batch_codes = {f['properties']['entity_code'] for f in collection['features'] if f['id'].startswith(PREFIX)}
    baseline_derived = set(derived['geometries']) - batch_codes
    results, additions = [], []
    for code, ar, en, aliases, kind, sector in requested:
        row = seed[code]
        if row['entity_type'] != kind or row['sector'] != sector:
            raise ValueError(f'seed kind/sector changed for {code}')
        if code in baseline_codes or code in baseline_derived:
            raise ValueError(f'{code} already has geometry; refusing to overwrite')
        names = {normalize(n.strip()) for n in (ar, en, *aliases.split('|')) if n.strip()}
        candidates = {(e['type'], e['id']): e for name in names for e in index[name]}
        audit, found = [], False
        for key, e in sorted(candidates.items()):
            rec = {'osm_type': key[0], 'osm_id': key[1], 'osm_version': e['version'], 'tags': e.get('tags', {}), 'decision': 'excluded'}
            try:
                if not kind_ok(kind, e):
                    raise ValueError('OSM tags do not establish the requested entity kind')
                if row['status'] in {'planned', 'approved_planned', 'under_construction'}:
                    raise ValueError('existing pipeline requires independently evidenced official alignment for this status')
                if key != REVIEWED.get(code):
                    raise ValueError(EXCEPTIONS.get(code, 'identity, extent or uniqueness not independently established'))
                if kind in ('district', 'city', 'landmark') and e['type'] != 'node':
                    geom = osm_geometry(e, polygon=True)
                elif kind in ('transit_stop', 'rail_station') and e['type'] != 'node':
                    geom = osm_geometry(e, polygon=True)
                else:
                    geom = osm_geometry(e, polygon=False)
                if not BBOX.covers(geom):
                    raise ValueError('geometry crosses or lies outside requested Greater Cairo bbox')
                if sector not in sector_geom or geom.distance(sector_geom[sector]) > NEAR_DEGREES:
                    raise ValueError('outside 0.01-degree proximity to CAPMAS ADM2 areas associated with this sector')
                fid = f'{PREFIX}{key[0].upper()}-{key[1]}-{code}'
                source_ids = {'osm_type': key[0], 'osm_id': key[1], 'osm_version': e['version']}
                additions.append(ingest.feature(fid, row, mapping(geom), 'ODbL-1.0', ingest.OSM_ATTRIBUTION, 'OpenStreetMap', source_ids, '2026-11-16', {'entity_type': kind, 'osm_tags': e['tags'], 'match_method': 'reviewed exact normalized name and kind; bbox and CAPMAS sector proximity', 'source_file': RAW.name}))
                rec['decision'] = 'matched'
                found = True
            except (ValueError, KeyError, TypeError) as ex:
                rec['reason'] = str(ex)
            audit.append(rec)
        status = 'matched' if found else ('ambiguous' if candidates else 'not_found')
        reason = 'reviewed name, kind, geometry and sector checks passed' if found else EXCEPTIONS.get(code, 'name candidates not safely identifiable or admissible' if candidates else 'no exact normalized name or alias in the supplied OSM extract')
        results.append({'entity_code': code, 'entity_type': kind, 'sector': sector, 'status': status, 'reason': reason, 'candidates': audit})
    valid, validation = ingest.validate_feature_geometries(additions, repair=False)
    if validation['dropped'] or len(valid) != len(additions):
        raise ValueError(f'pipeline rejected geometry: {validation}')
    if len({f['properties']['entity_code'] for f in additions}) != len(additions):
        raise ValueError('multiple features per entity not reviewed')
    byid = {f['id']: f for f in collection['features']}
    for f in additions:
        if f['id'] in byid and byid[f['id']] != json.loads(json.dumps(f)):
            raise ValueError(f"feature conflict: {f['id']}")
    missing = [f for f in additions if f['id'] not in byid]
    if missing:
        text = FEATURES.read_text(encoding='utf-8')
        suffix = '\n  ]\n}\n'
        if not text.endswith(suffix):
            raise ValueError('unexpected feature collection formatting')
        chunks = [json.dumps(f, ensure_ascii=False, indent=2) for f in missing]
        rendered = ',\n'.join('\n'.join('    ' + line for line in chunk.splitlines()) for chunk in chunks)
        FEATURES.write_text(text[:-len(suffix)] + ',\n' + rendered + suffix, encoding='utf-8')
    for f in additions:
        code = f['properties']['entity_code']
        geom = shape(f['geometry'])
        simplified = geom.simplify(0.0002, preserve_topology=True)
        value = {'geometry': mapping(simplified if not simplified.is_empty else geom), 'license': ['ODbL-1.0'], 'attribution': [ingest.OSM_ATTRIBUTION], 'sources': ['OpenStreetMap'], 'retrieval_dates': ['2026-11-16']}
        # An existing Batch 20 derived entry must be byte-for-byte equivalent.
        if code in derived['geometries'] and derived['geometries'][code] != json.loads(json.dumps(value)):
            raise ValueError(f'existing derived geometry conflicts for {code}')
        derived['geometries'][code] = value
    DERIVED.write_text(json.dumps(derived, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    manifest['feature_count'] = len(collection['features']) + len(missing)
    manifest['entity_page_map_geometries']['entities_with_geometry'] = len(derived['geometries'])
    if not any(s.get('input_file') == RAW.name for s in manifest['sources']):
        manifest['sources'].append({'source': 'OpenStreetMap', 'url': 'https://overpass-api.de/api/interpreter', 'retrieval_date': '2026-11-16', 'input_file': RAW.name, 'input_sha256': hashlib.sha256(RAW.read_bytes()).hexdigest(), 'license': 'ODbL-1.0', 'elements_received': len(elements), 'timestamp_osm_base': doc.get('osm3s', {}).get('timestamp_osm_base')})
    manifest['geometry_batch20'] = {'report': 'data/research/geometry-batch20/geometry_match_report.json', 'feature_count': len(additions), 'entities_matched': len(additions)}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {'method': 'exact normalized names/aliases plus explicit identity review, compatible kind, source geometry validation, requested bbox, and CAPMAS sector proximity; lifecycle policy preserved', 'bbox_wgs84': [30.70, 29.70, 31.90, 30.50], 'near_sector_degrees': NEAR_DEGREES, 'baseline_geometry_entity_codes': baseline_codes, 'baseline_feature_count': len(old_features), 'results': results}
    (RESEARCH / 'geometry_match_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('matched', len(additions), 'new features', len(missing), 'status counts', {s: sum(r['status'] == s for r in results) for s in ('matched', 'ambiguous', 'not_found')})
    print('reviewed but rejected:', sorted(set(REVIEWED) - {f['properties']['entity_code'] for f in additions}))

if __name__ == '__main__':
    main()
