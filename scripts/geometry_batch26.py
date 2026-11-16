#!/usr/bin/env python3
"""Batch 26: import exactly the 30 reviewed OSM accepts, no discovery, no name matching.

Reuses the Batch 20/20b feature constructor (`ingest.feature`), the OSM geometry
builder (`osm_geometry`), the feature validator (`ingest.validate_feature_geometries`)
and the ODbL attribution from `scripts/ingest-features.py`. Nothing outside
`data/research/geometry-batch26/accepts.json` may be imported. Idempotent: a second
run changes nothing and refuses to overwrite any existing feature or entity-map
geometry whose content differs.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import importlib.util
import json
import re
from collections import Counter
from pathlib import Path

from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
FEATURES = ROOT / 'data/features/features.geojson'
DERIVED = ROOT / 'data/derived/entity-map-geometries.json'
MANIFEST = ROOT / 'data/features/manifest.json'
RESEARCH = ROOT / 'data/research/geometry-batch26'
ACCEPTS = RESEARCH / 'accepts.json'
REPORT = RESEARCH / 'geometry_import_report.json'
NOTES = RESEARCH / 'ADAPTATION_NOTES.md'
PREFIX = 'BATCH26-'
# The Batch 20 Greater Cairo envelope, reused verbatim.
BBOX_WGS84 = [30.70, 29.70, 31.90, 30.50]
NEAR_DEGREES = 0.01

# Reuse the Batch 20/20b constructor, validator, attribution and geometry builder.
spec = importlib.util.spec_from_file_location('atlas_ingest_features', ROOT / 'scripts' / 'ingest-features.py')
ingest = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(ingest)
from geometry_batch20 import BBOX, osm_geometry  # noqa: E402
from geometry_batch20b import sector_areas  # noqa: E402


def retrieval_date_from_name(name: str) -> str:
    match = re.search(r'(\d{4}-\d{2}-\d{2})', name)
    if not match:
        raise ValueError(f'no retrieval date in source file name: {name}')
    return match.group(1)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_path(name: str) -> Path:
    return (ROOT / name) if name.startswith('data/') else (RAW / name)


def vertex_count(geom) -> int:
    if geom.is_empty:
        return 0
    if geom.geom_type == 'Point':
        return 1
    if geom.geom_type == 'Polygon':
        return len(list(geom.exterior.coords))
    if geom.geom_type == 'MultiPolygon':
        return sum(len(list(p.exterior.coords)) for p in geom.geoms)
    return 0


def derived_value(geom, retrieval_date: str) -> dict:
    simplified = geom.simplify(0.0002, preserve_topology=True)
    geometry = mapping(simplified if not simplified.is_empty else geom)
    return {'geometry': geometry, 'license': ['ODbL-1.0'],
            'attribution': [ingest.OSM_ATTRIBUTION], 'sources': ['OpenStreetMap'],
            'retrieval_dates': [retrieval_date]}


def build_feature(row: dict, geom, retrieval_date: str, tags: dict, source_file: str, code: str, osm_type, osm_id, version):
    fid = f'{PREFIX}{osm_type.upper()}-{osm_id}-{code}'
    source_ids = {'osm_type': osm_type, 'osm_id': osm_id, 'osm_version': version}
    return fid, ingest.feature(
        fid, row, mapping(geom), 'ODbL-1.0', ingest.OSM_ATTRIBUTION, 'OpenStreetMap',
        source_ids, retrieval_date,
        {'entity_type': row['entity_type'], 'osm_tags': tags,
         'match_method': 'reviewed identity (Batch 26 accepts.json)',
         'source_file': source_file},
    )


def write_report(results, accepts, target: Path) -> None:
    RESEARCH.mkdir(parents=True, exist_ok=True)
    report = {
        'method': 'explicitly reviewed accepts.json scope only; no name matching, no discovery; reviewed identity bypasses kind and label gates; version check, validity, bbox and stated kind are gates; CAPMAS sector distance is recorded, not a gate',
        'bbox_wgs84': BBOX_WGS84,
        'near_sector_degrees': NEAR_DEGREES,
        'accepts_count': len(accepts['accepts']),
        'retrieved': accepts.get('retrieved'),
        'license': accepts.get('license'),
        'attribution': accepts.get('attribution'),
        'results': [
            {k: v for k, v in {
                'entity_code': r['entity_code'],
                'osm_type': r['osm_type'],
                'osm_id': r['osm_id'],
                'osm_version': r['osm_version'],
                'geometry_kind': r['geometry_kind'],
                'source_kind': r['source_kind'],
                'source_file': r['source_file'],
                'decision': r['decision'],
                'geometry_type': r.get('geometry_type'),
                'vertex_count': r.get('vertex_count'),
                'sector_distance': r.get('sector_distance'),
                'retrieval_date': r.get('retrieval_date'),
                'feature_id': r.get('feature_id'),
                'reason': r.get('reason'),
            }.items() if v is not None}
            for r in results
        ],
    }
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main(scan: bool = False) -> None:
    accepts = json.loads(ACCEPTS.read_text(encoding='utf-8'))
    entries = accepts['accepts']
    expected_archive = accepts['new_archive']
    archive_path = source_path(expected_archive['file'])
    if sha256_file(archive_path) != expected_archive['sha256']:
        raise ValueError(f'checksum mismatch for {expected_archive["file"]}')
    archive_doc = json.loads(archive_path.read_text(encoding='utf-8'))
    lookup_index = {(item['osm_type'], item['osm_id']): item for item in archive_doc['lookup']}
    meta = archive_doc['meta']
    with (ROOT / 'data/seed/entities.csv').open(encoding='utf-8-sig', newline='') as handle:
        seed = {row['code']: row for row in csv.DictReader(handle)}
    collection = json.loads(FEATURES.read_text(encoding='utf-8'))
    derived = json.loads(DERIVED.read_text(encoding='utf-8'))
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    features = collection['features']
    by_id = {feature['id']: feature for feature in features}
    feature_codes = {feature['properties']['entity_code'] for feature in features}
    derived_codes = set(derived.get('geometries', {}))
    areas = sector_areas(seed)
    archived_cache: dict[str, list[dict]] = {}
    results, planned, derived_values = [], [], {}
    for entry in entries:
        code = entry['entity_code']
        osm_type, osm_id, version = entry['osm_type'], entry['osm_id'], entry['osm_version']
        kind = entry['geometry_kind']
        source_kind, source_file = entry['source_kind'], entry['source_file']
        record = {
            'entity_code': code,
            'osm_type': osm_type,
            'osm_id': osm_id,
            'osm_version': version,
            'geometry_kind': kind,
            'source_kind': source_kind,
            'source_file': source_file,
            'decision': 'rejected',
        }
        geom = tags = retrieval_date = None
        try:
            row = seed.get(code)
            if not row:
                raise ValueError('entity not present in data/seed/entities.csv')
            if row['status'] in {'planned', 'approved_planned', 'under_construction'}:
                raise ValueError('lifecycle policy excludes planned or under-construction entities')
            if row['entity_type'] in {'project', 'authority'}:
                raise ValueError('project and authority shapes excluded by scope policy')
            if source_kind == 'archived_overpass':
                if source_file not in archived_cache:
                    with gzip.open(source_path(source_file), 'rt', encoding='utf-8') as stream:
                        archived_cache[source_file] = json.load(stream).get('elements', [])
                element = next((e for e in archived_cache[source_file]
                                if e.get('type') == osm_type and e.get('id') == osm_id), None)
                if element is None:
                    raise ValueError('reviewed OSM object not found in archived extract')
                if element.get('version') != version:
                    raise ValueError(f"source version {element.get('version')} does not match accepted {version}")
                tags = element.get('tags') or {}
                geom = osm_geometry(element, polygon=osm_type != 'node')
                retrieval_date = retrieval_date_from_name(source_file)
            elif source_kind == 'nominatim_lookup':
                item = lookup_index.get((osm_type, osm_id))
                if item is None:
                    raise ValueError('reviewed OSM object not found in the new Nominatim archive')
                key = f'{osm_type}{osm_id}'
                m = meta.get(key)
                if not m:
                    raise ValueError('missing OSM API meta for reviewed object')
                if m.get('version') != version:
                    raise ValueError(f"meta version {m.get('version')} does not match accepted {version}")
                tags = m.get('tags') or {}
                geom = shape(item.get('geojson'))
                retrieval_date = retrieval_date_from_name(expected_archive['file'])
            else:
                raise ValueError(f'unknown source_kind {source_kind}')
            if geom.is_empty or not geom.is_valid:
                raise ValueError('invalid or empty OSM geometry')
            if not BBOX.covers(geom):
                raise ValueError('geometry outside requested bbox')
            if geom.geom_type != kind:
                raise ValueError(f'geometry kind {geom.geom_type} does not match accepted {kind}')
            area = areas.get(row['sector'])
            distance = None if area is None else round(float(geom.distance(area)), 8)
            fid, feature = build_feature(row, geom, retrieval_date, tags, source_file, code, osm_type, osm_id, version)
            valid, validation = ingest.validate_feature_geometries([feature], repair=False)
            if validation['dropped'] or len(valid) != 1:
                raise ValueError(f'pipeline rejected geometry: {validation}')
            record.update({
                'decision': 'matched',
                'geometry_type': geom.geom_type,
                'vertex_count': vertex_count(geom),
                'sector_distance': distance,
                'retrieval_date': retrieval_date,
                'feature_id': fid,
            })
            planned.append((code, fid, feature, geom, retrieval_date))
            derived_values[code] = derived_value(geom, retrieval_date)
        except (ValueError, KeyError, TypeError) as exc:
            record['reason'] = str(exc)
        results.append(record)

    # Idempotent commit: nothing is rewritten when everything is already present.
    missing = []
    for code, fid, feature, geom, retrieval_date in planned:
        already_feature = by_id.get(fid)
        already_derived = derived['geometries'].get(code)
        if already_feature is not None or already_derived is not None:
            if already_feature is None or already_derived is None:
                raise ValueError(f'partial existing geometry for {code}; refusing to complete it')
            if already_feature != json.loads(json.dumps(feature)):
                raise ValueError(f'feature collision: {fid} already exists with different content')
            if already_derived != json.loads(json.dumps(derived_values[code])):
                raise ValueError(f'derived geometry collision: {code} already exists with different content')
            continue
        missing.append((code, fid, feature, geom, retrieval_date))

    if not missing:
        if scan:
            print('scan: 30 accepted, already imported; nothing changed')
        else:
            print('already up to date: 30 accepted features already present, nothing changed')
        write_report(results, accepts, REPORT)
        return
    if scan:
        write_report(results, accepts, Path('/tmp/geometry26-scan.json'))
        print('scan:', len(missing), 'would be imported')
        return
    suffix = '\n  ]\n}\n'
    text = FEATURES.read_text(encoding='utf-8')
    if not text.endswith(suffix):
        raise ValueError('unexpected feature collection formatting')
    chunks = [json.dumps(feature, ensure_ascii=False, indent=2) for _, _, feature, _, _ in missing]
    rendered = ',\n'.join('\n'.join('    ' + line for line in chunk.splitlines()) for chunk in chunks)
    FEATURES.write_text(text[:-len(suffix)] + ',\n' + rendered + suffix, encoding='utf-8')
    for code, _fid, _feature, geom, retrieval_date in missing:
        derived['geometries'][code] = derived_values[code]
    DERIVED.write_text(json.dumps(derived, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    manifest['feature_count'] = len(features) + len(missing)
    manifest['entity_page_map_geometries']['entities_with_geometry'] = len(derived['geometries'])
    used_files = {entry['source_file'] for entry in entries if entry['source_kind'] == 'archived_overpass'}
    used_files.add(expected_archive['file'])
    manifest['geometry_batch26'] = {
        'report': 'data/research/geometry-batch26/geometry_import_report.json',
        'feature_count': len(missing),
        'entities_matched': len(missing),
        'source_files': [{'file': name, 'sha256': sha256_file(source_path(name))} for name in sorted(used_files)],
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_report(results, accepts, REPORT)
    print('matched', len(missing), 'new features', 'statuses', dict(Counter(r['decision'] for r in results)))


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--scan', action='store_true')
    main(parser.parse_args().scan)
