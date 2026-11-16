#!/usr/bin/env python3
"""Batch 20b: offline, conservative matching against versioned archived OSM extracts.

Reuses Batch 20's geometry constructor, importer, validation and CAPMAS proximity
policy. Run with --scan to inspect candidates without changing canonical files.
Only independently reviewed, uniquely admissible identities can be imported.
"""
from __future__ import annotations
import argparse
import csv
import gzip
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from shapely.geometry import MultiLineString, mapping, shape
from shapely.ops import unary_union
from geometry_batch20 import BBOX, NEAR_DEGREES, ingest, osm_geometry

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
FEATURES = ROOT / 'data/features/features.geojson'
DERIVED = ROOT / 'data/derived/entity-map-geometries.json'
MANIFEST = ROOT / 'data/features/manifest.json'
OUT = ROOT / 'data/research/geometry-batch20b'
PREFIX = 'BATCH20B-'
FILES = [
    'cairo-osm-boundaries-2026-11-14.json.gz',
    'cairo-osm-overpass-2026-11-14-extract2.json.gz',
    'cairo-osm-overpass-2026-11-14-roads-full.json.gz',
    'cairo-osm-rail-2026-11-14.json.gz',
    'osm-overpass-2026-11-14.json.gz',
    'cairo-osm-south-batch04-2026-11-16.json.gz',
    'cairo-osm-south-batch04-meta-2026-11-16.json.gz',
    'cairo-osm-geometry-batch20-2026-11-16.json.gz',
]
NAME_KEYS = ('name', 'name:ar', 'name:en', 'alt_name', 'old_name', 'official_name')
TYPE_WORDS = {'حي', 'قسم', 'محطه', 'كوبري', 'مدينه', 'مركز', 'منطقه', 'طريق', 'محور', 'شارع', 'ميدان', 'مسجد', 'جامع', 'متحف', 'حديقه'}
# Explicit review is an additional safety gate, not a replacement for the policy,
# kind, uniqueness, bbox, topology, and sector checks.
REVIEWED = {
    'CITY-AUSIM': ('way', 720891654),
    'DIST-ARD-EL-LEWA': ('way', 723190403),
    'DIST-HADAYEK-QOBBA': ('way', 703444827),
    'DIST-MANSHEYET-BAKARY': ('way', 727473214),
    'DIST-MANSHIYAT-NASSER': ('way', 309248507),
    'DIST-MERAJ': ('way', 703100081),
    'DIST-MIT-OKBA': ('way', 723998471),
    'DIST-MOUSKY': ('node', 394485447),
    'DIST-MUNIRA-GHARBIYA': ('way', 740139776),
    'DIST-NOZHA': ('way', 701289197),
    'DIST-TALBIYA': ('way', 725892870),
    'DIST-WAILY': ('node', 330684758),
    'LANDMARK-AMR-IBN-AL-AS': ('relation', 1399806),
    'LANDMARK-GREAT-SPHINX': ('way', 540058405),
    'LANDMARK-QOBBA-PALACE': ('way', 97567990),
    'LANDMARK-ROKN-FAROUK': ('node', 664382855),
}

REVIEWED_GROUPS = {'BRIDGE-UNIVERSITY': {('way', 24764172), ('way', 38427387)}}


def variants(value):
    text = unicodedata.normalize('NFKC', value or '').casefold()
    text = ''.join(c for c in text if unicodedata.category(c) not in {'Mn', 'Cf'})
    text = text.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه'}))
    words = re.findall(r'[^\W_]+', text, re.UNICODE)
    words = [w for w in words if w not in {'el', 'al', 'the', 'of'}]
    def key(ws):
        return ''.join(w[2:] if w.startswith('ال') and len(w) > 2 else w for w in ws)
    result = {key(words)}
    if words:
        first = words[0][2:] if words[0].startswith('ال') and len(words[0]) > 2 else words[0]
        if first in TYPE_WORDS:
            result.add(key(words[1:]))
    return {v for v in result if len(v) >= 3}


def labels(tags):
    return {v for k in NAME_KEYS for part in re.split(r'[;|]', str(tags.get(k, ''))) for v in variants(part.strip())}


def kind_ok(kind, e):
    t = e.get('tags', {})
    typ = e['type']
    if kind == 'district':
        return t.get('place') in {'suburb','neighbourhood','quarter','village','hamlet','town','locality'} or t.get('boundary') == 'administrative' or t.get('landuse') in {'residential','industrial','retail','commercial'}
    if kind == 'city':
        return t.get('place') in {'city','town','village'} or t.get('boundary') == 'administrative'
    if kind == 'landmark':
        return (any(t.get(k) not in (None, '', 'no') for k in ('tourism','historic','leisure')) or t.get('amenity') in {'place_of_worship','theatre','university','college','hospital','marketplace'} or t.get('building') in {'mosque','church','museum','palace'}) and not any(t.get(k) for k in ('highway','railway','public_transport'))
    if kind == 'bridge':
        return typ in {'way','relation'} and (t.get('bridge') in {'yes','viaduct'} or t.get('man_made') == 'bridge') and bool(t.get('highway') or t.get('railway'))
    if kind == 'road':
        return typ == 'way' and t.get('highway') in {'motorway','trunk','primary','secondary','tertiary'}
    if kind in {'transit_stop','rail_station'}:
        return t.get('railway') in {'station','halt','stop'} or t.get('public_transport') in {'station','stop_position','platform'} or t.get('amenity') == 'bus_station'
    if kind == 'transit_line':
        return (typ == 'relation' and t.get('route') in {'subway','light_rail','train','monorail'}) or (typ == 'way' and bool(t.get('railway')))
    return False


def line_identity(code, tags):
    """Require explicit mode and line identity for line-specific stop entities."""
    text = ' '.join(str(tags.get(k, '')) for k in ('network', 'line', 'operator', 'ref', 'route_ref')).casefold()
    metro = re.match(r'^STOP-M([123])(?:-|$)', code)
    if metro:
        number = metro.group(1)
        return bool(re.search(r'(?:line|خط|m)\s*[-:]?\s*' + number + r'(?:\D|$)', text)) and not (tags.get('bus') == 'yes' and tags.get('railway') not in {'station', 'halt', 'stop'})
    expected = [('STOP-BRT-', ('brt', 'bus rapid', 'الترددي')), ('STOP-LRT-', ('lrt', 'light rail', 'القطار الكهربائي')), ('STOP-MRW-', ('west cairo monorail', 'غرب القاهرة', 'غرب النيل')), ('STOP-MRE-', ('east cairo monorail', 'شرق القاهرة', 'شرق النيل'))]
    for prefix, alternatives in expected:
        if code.startswith(prefix):
            return any(term in text for term in alternatives)
    # Named mainline railway stations are not metro/bus substitutes.
    return code.startswith('RAIL-') and tags.get('railway') in {'station', 'halt'} and tags.get('station') not in {'subway', 'light_rail'}


def connected_groups(candidates):
    """Group nearby line endpoints; no synthetic connector geometry is produced."""
    from math import cos, hypot, radians
    def endpoints(geom):
        if geom.geom_type == 'LineString':
            return [geom.coords[0], geom.coords[-1]]
        if geom.geom_type == 'MultiLineString':
            return [p for line in geom.geoms for p in (line.coords[0], line.coords[-1])]
        return []
    def near(a, b):
        return any(hypot((x[0]-y[0])*111320*cos(radians((x[1]+y[1])/2)), (x[1]-y[1])*110574) <= 15 for x in endpoints(a) for y in endpoints(b))
    remaining = list(candidates)
    groups = []
    while remaining:
        group = [remaining.pop(0)]
        while True:
            found = next((c for c in remaining if any(near(c[3], g[3]) for g in group)), None)
            if not found:
                break
            group.append(found)
            remaining.remove(found)
        groups.append(group)
    return groups

def load_sources():
    # Never splice coordinates or tags across object versions. An unversioned
    # record is audit-only unless a versioned copy of the same object exists.
    objects, name_index, raw_count = {}, defaultdict(set), 0
    for name in FILES:
        with gzip.open(RAW / name, 'rt', encoding='utf-8') as stream:
            elements = json.load(stream).get('elements', [])
        raw_count += len(elements)
        for e in elements:
            if not e.get('id') or not e.get('type') or not e.get('tags'):
                continue
            key = (e['type'], e['id'])
            for label in labels(e['tags']):
                name_index[label].add(key)
            score = (e.get('version', 0), len(e.get('geometry', [])), sum(len(m.get('geometry', [])) for m in e.get('members', [])))
            if key not in objects or score > objects[key][0]:
                objects[key] = (score, e, name)
    return {k: (x[1], x[2]) for k, x in objects.items()}, name_index, raw_count


def sector_areas(seed):
    admin = json.loads((ROOT / 'data/features/codab-admin-units.geojson').read_text(encoding='utf-8'))
    parents, areas = defaultdict(set), defaultdict(list)
    for f in admin['features']:
        p = f['properties']
        if p['level'] == 3:
            for parent in p.get('parent_pcodes', []):
                parents[parent].update(seed[c]['sector'] for c in p.get('entity_codes', []) if c in seed)
    for f in admin['features']:
        p = f['properties']
        if p['level'] != 2:
            continue
        sectors = {seed[c]['sector'] for c in p.get('entity_codes', []) if c in seed}
        if not sectors and len(parents[p['pcode']]) == 1:
            sectors = parents[p['pcode']]
        for sector in sectors:
            areas[sector].append(shape(f['geometry']))
    return {k: unary_union(v) for k, v in areas.items()}


def scope(seed, features, derived):
    own = [f for f in features if f['id'].startswith(PREFIX)]
    own_codes = {f['properties']['entity_code'] for f in own}
    if len(own) != len(own_codes):
        raise ValueError('duplicate Batch 20b entity features')
    existing = {f['properties']['entity_code'] for f in features if not f['id'].startswith(PREFIX)}
    if own_codes & existing:
        raise ValueError('Batch 20b feature collides with another feature')
    previous_derived = set(derived) - own_codes
    return sorted((set(seed) - (existing | previous_derived)) | own_codes), own_codes


def run(scan=False):
    with (ROOT / 'data/seed/entities.csv').open(encoding='utf-8-sig', newline='') as f:
        seed = {r['code']: r for r in csv.DictReader(f)}
    collection = json.loads(FEATURES.read_text(encoding='utf-8'))
    derived = json.loads(DERIVED.read_text(encoding='utf-8'))
    scope_codes, own_codes = scope(seed, collection['features'], derived['geometries'])
    objects, index, raw_count = load_sources()
    areas = sector_areas(seed)
    old = json.loads((ROOT / 'data/research/geometry-batch20/geometry_match_report.json').read_text(encoding='utf-8'))
    old_unmatched = {r['entity_code'] for r in old['results'] if r['status'] != 'matched'}
    results, additions = [], []
    for code in scope_codes:
        row = seed[code]
        kind, sector = row['entity_type'], row['sector']
        names = set().union(*(variants(n) for n in [row['name_ar'], row['name_en'], *row['aliases'].split('|')]))
        keys = sorted(set().union(*(index[n] for n in names)))
        candidates, admissible = [], []
        for key in keys:
            e, source_file = objects[key]
            rec = {'osm_type': key[0], 'osm_id': key[1], 'osm_version': e.get('version'), 'source_file': source_file, 'tags': e['tags'], 'decision': 'excluded'}
            try:
                if not e.get('version'):
                    raise ValueError('version unavailable in archived extracts')
                if not (names & labels(e['tags'])):
                    raise ValueError('name only present in another archived version of this object')
                if not kind_ok(kind, e):
                    raise ValueError('OSM tags do not establish the requested entity kind')
                if row['status'] in {'planned', 'approved_planned', 'under_construction'}:
                    raise ValueError('existing pipeline requires independently evidenced official alignment for this status')
                if kind in {'transit_stop', 'rail_station'} and not line_identity(code, e['tags']):
                    raise ValueError('line identity is not independently established from network, line, operator or ref tags')
                if kind in {'road', 'bridge', 'transit_line'} and e['type'] == 'relation':
                    raise ValueError('route or bridge relation extent and connectivity not established')
                geom = osm_geometry(e, polygon=e['type'] != 'node' and kind not in {'road', 'bridge', 'transit_line'})
                if geom.is_empty or not geom.is_valid:
                    raise ValueError('invalid or empty OSM geometry')
                if not BBOX.covers(geom):
                    raise ValueError('geometry outside requested bbox')
                if sector not in areas or geom.distance(areas[sector]) > NEAR_DEGREES:
                    raise ValueError('outside CAPMAS sector proximity')
                rec['geometry_kind'] = geom.geom_type
                rec['sector_distance'] = round(geom.distance(areas[sector]), 8)
                rec['decision'] = 'admissible'
                admissible.append((key, e, source_file, geom, rec))
            except (ValueError, KeyError, TypeError) as exc:
                rec['reason'] = str(exc)
            candidates.append(rec)
        # A corridor is one connected group, not a set of unrelated fragments.
        # Keep the groups for human review; extent cannot be established by name
        # alone, so no road/bridge/line is imported without separate evidence.
        groups = connected_groups(admissible) if kind in {'road', 'bridge', 'transit_line'} else []
        # Polygon is preferred to a point; then prefer inside over merely nearby.
        preferred = [c for c in admissible if c[3].geom_type in {'Polygon', 'MultiPolygon'}] or admissible
        inside = [c for c in preferred if c[4]['sector_distance'] == 0]
        preferred = inside or preferred
        choice = preferred[0] if len(preferred) == 1 else None
        reviewed = REVIEWED.get(code)
        reviewed_group = REVIEWED_GROUPS.get(code)
        if kind in {'road', 'bridge', 'transit_line'} and len(groups) == 1 and reviewed_group == {c[0] for c in groups[0]}:
            group = sorted(groups[0], key=lambda c: c[0])
            # Connected endpoints are not snapped: retain each exact source line.
            geom = MultiLineString([list(c[3].coords) for c in group])
            key, e, source_file, _, _ = group[0]
            fid = f'{PREFIX}{key[0].upper()}-{key[1]}-{code}'
            parts = [{'osm_type': c[0][0], 'osm_id': c[0][1], 'osm_version': c[1]['version'], 'source_file': c[2], 'tags': c[1]['tags']} for c in group]
            ids = {'osm_type': key[0], 'osm_id': key[1], 'osm_version': e['version'], 'members': parts}
            additions.append(ingest.feature(fid, row, mapping(geom), 'ODbL-1.0', ingest.OSM_ATTRIBUTION, 'OpenStreetMap', ids, '2026-11-16', {'entity_type': kind, 'osm_tags': e['tags'], 'match_method': 'reviewed connected OSM ways; bbox and CAPMAS sector proximity', 'source_file': source_file}))
            for c in group:
                c[4]['decision'] = 'matched'
            status, reason = 'matched', 'reviewed unique connected same-named OSM way group; no invented connectors'
        elif choice and kind not in {'road', 'bridge', 'transit_line'} and reviewed == choice[0]:
            key, e, source_file, geom, rec = choice
            fid = f'{PREFIX}{key[0].upper()}-{key[1]}-{code}'
            ids = {'osm_type': key[0], 'osm_id': key[1], 'osm_version': e['version']}
            additions.append(ingest.feature(fid, row, mapping(geom), 'ODbL-1.0', ingest.OSM_ATTRIBUTION, 'OpenStreetMap', ids, '2026-11-16', {'entity_type': kind, 'osm_tags': e['tags'], 'match_method': 'reviewed normalized name and kind; bbox and CAPMAS sector proximity', 'source_file': source_file}))
            rec['decision'] = 'matched'
            status, reason = 'matched', 'reviewed unique admissible object; point used only where no polygon qualifies' if geom.geom_type == 'Point' and kind in {'district','city'} else 'reviewed unique admissible object'
        elif row['status'] in {'planned','approved_planned','under_construction'}:
            status, reason = 'policy_excluded', 'OSM alone cannot establish official alignment for lifecycle status'
        elif kind in {'project', 'authority'}:
            status, reason = 'policy_excluded', 'project and authority shapes excluded by scope policy'
        elif not keys:
            status, reason = 'not_found', 'no matching indexed name or alias in archived extracts'
        else:
            status, reason = 'ambiguous', ('unreviewed identity or extent' if choice else 'no unique admissible object after kind, geometry and sector checks')
        results.append({'entity_code': code, 'entity_type': kind, 'sector': sector, 'entity_status': row['status'], 'status': status, 'reason': reason, 'candidates': candidates, **({'connected_groups': [[{'osm_type': c[0][0], 'osm_id': c[0][1]} for c in group] for group in groups]} if groups else {})})
    valid, validation = ingest.validate_feature_geometries(additions, repair=False)
    if validation['dropped'] or len(valid) != len(additions):
        raise ValueError(f'pipeline rejected geometry: {validation}')
    report = {'method': 'offline named archived OSM elements, exact normalized names and aliases, strict kind, independently reviewed identity, lifecycle policy, bbox and CAPMAS sector proximity', 'bbox_wgs84': [30.7,29.7,31.9,30.5], 'near_sector_degrees': NEAR_DEGREES, 'raw_element_count': raw_count, 'unique_objects': len(objects), 'unique_versioned_objects': sum(bool(e.get('version')) for e, _ in objects.values()), 'scope_count': len(scope_codes), 'batch20_unmatched_in_scope': len(old_unmatched & set(scope_codes)), 'other_missing_in_scope': len(set(scope_codes)-old_unmatched), 'baseline_feature_count': len(collection['features'])-len(own_codes), 'baseline_geometry_entity_count': len(set(derived['geometries'])-own_codes), 'results': results}
    if scan:
        Path('/tmp/geometry20b-scan.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        print('scan', Counter(r['status'] for r in results), 'at /tmp/geometry20b-scan.json')
        return
    commit(report, additions, collection, derived, own_codes)


def commit(report, additions, collection, derived, own_codes):
    byid = {f['id']: f for f in collection['features']}
    added_codes = {f['properties']['entity_code'] for f in additions}
    if len(added_codes) != len(additions) or not own_codes <= added_codes:
        raise ValueError('duplicate or formerly imported reviewed entities disappeared; refusing write')
    for f in additions:
        code = f['properties']['entity_code']
        if code in own_codes and f['id'] not in byid:
            raise ValueError(f'existing batch feature has a different source identity: {code}')
        if f['id'] in byid and byid[f['id']] != json.loads(json.dumps(f)):
            raise ValueError(f"feature collision: {f['id']}")
        if code not in own_codes and code in derived['geometries']:
            raise ValueError(f'entity geometry collision: {code}')
        geom = shape(f['geometry'])
        simplified = geom.simplify(0.0002, preserve_topology=True)
        value = {'geometry': mapping(simplified if not simplified.is_empty else geom), 'license': ['ODbL-1.0'], 'attribution': [ingest.OSM_ATTRIBUTION], 'sources': ['OpenStreetMap'], 'retrieval_dates': ['2026-11-16']}
        value = json.loads(json.dumps(value))
        if code in own_codes and derived['geometries'].get(code) != value:
            raise ValueError(f'derived geometry collision: {code}')
        derived['geometries'][code] = value
    missing = [f for f in additions if f['id'] not in byid]
    if missing:
        text = FEATURES.read_text(encoding='utf-8')
        suffix = '\n  ]\n}\n'
        if not text.endswith(suffix):
            raise ValueError('unexpected feature collection formatting')
        chunks = [json.dumps(f, ensure_ascii=False, indent=2) for f in missing]
        rendered = ',\n'.join('\n'.join('    ' + line for line in chunk.splitlines()) for chunk in chunks)
        FEATURES.write_text(text[:-len(suffix)] + ',\n' + rendered + suffix, encoding='utf-8')
    DERIVED.write_text(json.dumps(derived, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    manifest['feature_count'] = len(collection['features']) + len(missing)
    manifest['entity_page_map_geometries']['entities_with_geometry'] = len(derived['geometries'])
    manifest['geometry_batch20b'] = {'report': 'data/research/geometry-batch20b/geometry_match_report.json', 'feature_count': len(additions), 'entities_matched': len(additions), 'source_files': [{'file': name, 'sha256': hashlib.sha256((RAW/name).read_bytes()).hexdigest()} for name in FILES]}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'geometry_match_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('matched', len(additions), 'new features', len(missing), 'statuses', dict(Counter(r['status'] for r in report['results'])))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--scan', action='store_true')
    run(parser.parse_args().scan)
