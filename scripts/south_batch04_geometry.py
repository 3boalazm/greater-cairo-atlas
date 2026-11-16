#!/usr/bin/env python3
"""Conservative, reproducible additive South batch 04 OSM feature import.

Requires Shapely 2.1.2. Uses the regular feature constructor/geometry validator and
entity-page geometry conventions in ingest-features.py. No OSM coordinates are created.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import importlib.util
import json
from collections import defaultdict
from pathlib import Path

from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, mapping, shape
from shapely.ops import linemerge, unary_union
from road_gap_fill import normalize

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'data/research/south-batch04'
FEATURES = ROOT / 'data/features/features.geojson'
DERIVED = ROOT / 'data/derived/entity-map-geometries.json'
MANIFEST = ROOT / 'data/features/manifest.json'
REPORT = RESEARCH / 'geometry_match_report.json'
SOUTH_BBOX = box(31.15, 29.75, 31.45, 30.08)
# 2017 CAPMAS ADM2 areas in or adjoining the stated South scope; no artificial geometry.
ADM2 = {'EG0101', 'EG0102', 'EG0103', 'EG0104', 'EG0105', 'EG0106', 'EG0107', 'EG0108', 'EG0134', 'EG0135'}
# 0.01 degrees is a conservative near-boundary allowance (roughly 1 km).
NEAR_DEGREES = 0.01
NAME_KEYS = ('name', 'name:ar', 'name:en', 'alt_name')
ROAD_NAMES = {
    'ROAD-HASABALLAH-EL-KAFRAWY': {'محور حسب الله الكفراوى'},
    'ROAD-YASSER-RIZK': {'محور ياسر رزق'},
    # Spelling / title expansion of the seed's "محور د. سميرة موسى".
    'ROAD-SAMIRA-MOUSSA': {'محور الدكتوره سميره موسى'},
    'ROAD-HADARAT-AXIS': {'محور الحضارات', 'محور الحضارة'},
}
# Additional labels are tied to explicit OSM semantics below, not free-text substring matches.
EXTRA_NAMES = {
    'ROAD-SAMIRA-MOUSSA': {'محور الدكتوره سميره موسى'},
    # For audit only: these generic names must still pass project polygon rules.
    'PROJ-ASMARAT': {'الاسمرات', 'Asmarat'},
}
EXCLUSION_REASONS = {
    'ROAD-SALAH-SALEM-ALT': 'similar street name does not establish that it is the alternative axis',
    'LANDMARK-MAGRA-EL-OYOUN': 'aqueduct ways are open lines; no named polygon or OSM point',
    'LANDMARK-WADI-DEGLA': 'reserve polygon extends outside the targeted South bbox',
    'LANDMARK-RELIGIOUS-COMPLEX': 'Coptic Cairo historic district does not establish the full religious complex',
    'DIST-TEBBIN-INDUSTRIAL': 'Kafr El Elow neighbourhood is not the whole industrial zone',
    'PROJ-ASMARAT': 'generic Asmarat stops and place of worship are not the exact housing project polygon',
}
POLYGON_RULES = {
    'LANDMARK-NMEC': ('tourism', 'museum'),
    'LANDMARK-EIN-EL-SIRA': ('natural', 'water'),
    'LANDMARK-JAPANESE-GARDEN-HELWAN': ('leisure', 'park'),
    'PROJ-FUSTAT-HILLS': ('leisure', 'park'),
}

spec = importlib.util.spec_from_file_location('atlas_ingest_features', ROOT / 'scripts/ingest-features.py')
ingest = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(ingest)


def normalized(value: str) -> str:
    value = value.strip()
    if value.startswith('مشروع '):
        value = value[len('مشروع '):]
    return normalize(value)


def labels(element):
    tags = element.get('tags', {})
    return {normalized(part) for key in NAME_KEYS for part in str(tags.get(key, '')).split(';') if normalized(part)}


def relation_polygon(element):
    """Assemble only genuinely closed outer/inner member rings; reject incomplete topology."""
    groups = {'outer': [], 'inner': []}
    for member in element.get('members', []):
        role = member.get('role') or 'outer'
        if member.get('type') != 'way' or role not in groups or len(member.get('geometry', [])) < 2:
            raise ValueError('missing or unsupported relation member geometry')
        groups[role].append(LineString([(p['lon'], p['lat']) for p in member['geometry']]))
    if not groups['outer']:
        raise ValueError('no outer members')
    rings = {}
    for role, parts in groups.items():
        if not parts:
            rings[role] = []
            continue
        merged = linemerge(parts) if len(parts) > 1 else parts[0]
        lines = list(merged.geoms) if merged.geom_type == 'MultiLineString' else [merged]
        if any(not line.is_ring for line in lines):
            raise ValueError(f'{role} ring does not close')
        rings[role] = [Polygon(line) for line in lines]
        if any(not p.is_valid or p.is_empty for p in rings[role]):
            raise ValueError(f'{role} ring invalid')
    holes = {i: [] for i in range(len(rings['outer']))}
    for inner in rings['inner']:
        parents = [i for i, outer in enumerate(rings['outer']) if outer.contains(inner)]
        if len(parents) != 1:
            raise ValueError('inner ring does not belong to exactly one outer')
        holes[parents[0]].append(list(inner.exterior.coords))
    polygons = [Polygon(outer.exterior.coords, holes[i]) for i, outer in enumerate(rings['outer'])]
    result = polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)
    if not result.is_valid:
        raise ValueError('assembled multipolygon invalid')
    return result


def osm_geometry(element, *, polygon=False):
    if element['type'] == 'relation':
        if not polygon or element.get('tags', {}).get('type') != 'multipolygon':
            raise ValueError('relation is not a polygon multipolygon')
        return relation_polygon(element)
    if element['type'] == 'node':
        if polygon:
            raise ValueError('polygon required')
        return Point(element['lon'], element['lat'])
    points = [(p['lon'], p['lat']) for p in element.get('geometry', [])]
    if len(points) < 2:
        raise ValueError('missing way geometry')
    if polygon:
        if len(points) < 4 or points[0] != points[-1]:
            raise ValueError('way polygon ring does not close')
        result = Polygon(points)
        if not result.is_valid or result.is_empty:
            raise ValueError('way polygon invalid')
        return result
    return LineString(points)


def load_sources():
    # Meta is preferred for ties; do not combine geometry with unrelated versions.
    files = sorted((ROOT / 'data/raw').glob('*json.gz'))
    merged = {}
    for p in files:
        if p.name == 'cairo-osm-south-batch04-2026-11-16.json.gz':
            continue  # out tags lacks version, superseded by the meta response
        with gzip.open(p, 'rt', encoding='utf-8') as f:
            doc = json.load(f)
        for e in doc.get('elements', []):
            if not e.get('version') or not e.get('tags'):
                continue
            key = (e['type'], e['id'])
            prior = merged.get(key)
            score = (e['version'], int('south-batch04-meta' in p.name), len(e.get('geometry', [])), len(e.get('members', [])))
            if prior is None or score > prior[0]:
                merged[key] = (score, e, p.name)
    return {key: (value[1], value[2]) for key, value in merged.items()}


def road_is_one_corridor(accepted):
    """Reject disjoint same-name groups; this check adds no connector geometry."""
    groups = [{i} for i in range(len(accepted))]
    for i in range(len(accepted)):
        for j in range(i):
            # 0.001 degrees (~100 m) accommodates divided carriageways and mapped
            # interchange gaps without ever snapping or fabricating segments.
            if accepted[i][2].distance(accepted[j][2]) <= 0.001:
                left = next(g for g in groups if i in g)
                right = next(g for g in groups if j in g)
                if left is not right:
                    left.update(right)
                    groups.remove(right)
    return len(groups) == 1


def main():
    with (RESEARCH / 'entities.csv').open(encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 31
    admin = json.loads((ROOT / 'data/features/codab-admin-units.geojson').read_text())
    south = unary_union([shape(f['geometry']) for f in admin['features'] if f['properties']['pcode'] in ADM2])
    source = load_sources()
    name_index = defaultdict(set)
    for row in rows:
        names = [row['name_ar'], row['name_en'], *row['aliases'].split('|'), *EXTRA_NAMES.get(row['code'], set())]
        for name in names:
            if normalized(name):
                name_index[normalized(name)].add(row['code'])
    candidates = defaultdict(dict)
    for key, (e, filename) in source.items():
        for label in labels(e):
            for code in name_index.get(label, set()):
                candidates[code][key] = (e, filename)
    results, additions = [], []
    for row in rows:
        code = row['code']
        accepted, audit = [], []
        for key, (element, filename) in sorted(candidates[code].items()):
            tags = element['tags']
            record = {'osm_type': key[0], 'osm_id': key[1], 'osm_version': element['version'], 'tags': tags, 'source_file': filename}
            try:
                if code in ROAD_NAMES:
                    if element['type'] != 'way' or not tags.get('highway') or not any(normalized(tags.get(k, '')) in {normalized(x) for x in ROAD_NAMES[code]} for k in ('name', 'name:ar')):
                        raise ValueError('not an explicitly named axis way')
                    geom = osm_geometry(element)
                elif code in POLYGON_RULES:
                    k, value = POLYGON_RULES[code]
                    if tags.get(k) != value:
                        raise ValueError('OSM object type does not describe the entity')
                    geom = osm_geometry(element, polygon=True)
                else:
                    raise ValueError(EXCLUSION_REASONS.get(code, 'no reviewed compatible polygon, point or road match'))
                if row['status'] in {'planned', 'approved_planned', 'under_construction'}:
                    raise ValueError('official alignment evidence required by feature pipeline; official source does not establish this OSM polygon boundary')
                if not SOUTH_BBOX.covers(geom):
                    raise ValueError('geometry outside or crossing the targeted South bbox')
                if geom.distance(south) > NEAR_DEGREES:
                    raise ValueError('geometry is farther than 0.01 degrees from South CAPMAS ADM2')
                record['decision'] = 'eligible'
                accepted.append((element, filename, geom, record))
            except (ValueError, KeyError, TypeError) as exc:
                record['decision'] = 'excluded'
                record['reason'] = str(exc)
            audit.append(record)
        # A polygon/project must have exactly one suitable object. Road ways are
        # a reviewed same-name corridor, not any nearby street or unnamed link.
        if code in POLYGON_RULES and len(accepted) != 1:
            status = 'ambiguous' if audit else 'not_found'
            reason = 'multiple compatible OSM objects' if len(accepted) > 1 else 'no admissible unambiguous polygon; see candidate decisions'
            accepted = []
        elif code in ROAD_NAMES and accepted and not road_is_one_corridor(accepted):
            status, reason = 'ambiguous', 'same-name ways do not form one spatially coherent corridor'
            for _, _, _, record in accepted:
                record['decision'] = 'excluded'
                record['reason'] = reason
            accepted = []
        elif code in ROAD_NAMES and accepted:
            status, reason = 'matched', 'same named axis ways; source geometries kept individually and merged on entity map'
        elif accepted:
            status, reason = 'matched', 'one compatible named OSM polygon'
        else:
            status = 'ambiguous' if audit else 'not_found'
            reason = 'name candidates are incompatible or do not establish the requested geometry' if audit else 'no exact name or alias candidate in saved extracts'
        for element, filename, geom, record in accepted:
            record['decision'] = 'matched'
            # Separate feature code permits the same OSM way to remain attached to
            # a pre-existing entity without overwriting or deleting that feature.
            fid = f"SOUTH04-{element['type'].upper()}-{element['id']}"
            source_ids = {'osm_type': element['type'], 'osm_id': element['id'], 'osm_version': element['version']}
            date = '2026-11-16' if 'south-batch04-meta' in filename else '2026-11-14'
            additions.append(ingest.feature(fid, row, mapping(geom), 'ODbL-1.0', ingest.OSM_ATTRIBUTION,
                'OpenStreetMap', source_ids, date, {'entity_type': row['entity_type'], 'osm_tags': element['tags'],
                'match_method': 'reviewed exact normalized name, OSM type, South bbox and CAPMAS proximity', 'source_file': filename}))
        results.append({'entity_code': code, 'status': status, 'reason': reason, 'candidates': audit})
    validated, validation = ingest.validate_feature_geometries(additions, repair=False)
    if validation['dropped'] or len(validated) != len(additions):
        raise ValueError(f'pipeline rejected geometries: {validation}')
    collection = json.loads(FEATURES.read_text(encoding='utf-8'))
    existing = {f['id']: f for f in collection['features']}
    for f in additions:
        if f['id'] in existing and existing[f['id']] != json.loads(json.dumps(f)):
            raise ValueError(f"feature ID collision: {f['id']}")
    missing = [f for f in additions if f['id'] not in existing]
    if missing:
        # Append only; preserve every existing byte and row.
        text = FEATURES.read_text(encoding='utf-8')
        suffix = '\n  ]\n}\n'
        if not text.endswith(suffix):
            raise ValueError('unexpected feature collection formatting')
        chunks = [json.dumps(f, ensure_ascii=False, indent=2) for f in missing]
        rendered = ',\n'.join('\n'.join('    ' + line for line in chunk.splitlines()) for chunk in chunks)
        FEATURES.write_text(text[:-len(suffix)] + ',\n' + rendered + suffix, encoding='utf-8')
    # Same source-preserving unary union/simplification as build_entity_map_geometries,
    # applied only to the new entities to preserve all existing derived entries.
    derived = json.loads(DERIVED.read_text(encoding='utf-8'))
    grouped = defaultdict(list)
    for f in additions:
        grouped[f['properties']['entity_code']].append(f)
    for code, fs in grouped.items():
        merged = unary_union([shape(f['geometry']) for f in fs])
        if merged.geom_type == 'MultiLineString':
            merged = linemerge(merged)
        simplified = merged.simplify(0.0002, preserve_topology=True)
        derived['geometries'][code] = {'geometry': mapping(simplified if not simplified.is_empty else merged),
            'license': ['ODbL-1.0'], 'attribution': [ingest.OSM_ATTRIBUTION], 'sources': ['OpenStreetMap'],
            'retrieval_dates': sorted({f['properties']['properties']['retrieval_date'] for f in fs})}
    DERIVED.write_text(json.dumps(derived, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    manifest['feature_count'] = len(collection['features']) + len(missing)
    manifest['entity_page_map_geometries']['entities_with_geometry'] = len(derived['geometries'])
    meta_path = ROOT / 'data/raw/cairo-osm-south-batch04-meta-2026-11-16.json.gz'
    entry = {'source': 'OpenStreetMap', 'url': 'https://overpass-api.de/api/interpreter',
        'retrieval_date': '2026-11-16', 'input_file': meta_path.name,
        'input_sha256': hashlib.sha256(meta_path.read_bytes()).hexdigest(), 'license': 'ODbL-1.0',
        'elements_received': 288, 'timestamp_osm_base': '2026-11-16T01:03:02Z'}
    if not any(s.get('input_file') == meta_path.name for s in manifest['sources']):
        manifest['sources'].append(entry)
    manifest['south_batch04_geometry'] = {'report': 'data/research/south-batch04/geometry_match_report.json', 'feature_count': len(additions), 'entities_matched': len(grouped)}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {'method': 'exact normalized seed names and aliases; reviewed type, target bbox, and CAPMAS proximity; no synthetic coordinates',
        'bbox_wgs84': [31.15, 29.75, 31.45, 30.08], 'capmas_adm2_pcodes': sorted(ADM2),
        'near_boundary_degrees': NEAR_DEGREES, 'results': results}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('added', len(missing), 'features; matched entities', len(grouped))
    for r in results:
        print(r['entity_code'], r['status'], len([c for c in r['candidates'] if c['decision'] == 'matched']), r['reason'])


if __name__ == '__main__':
    main()
