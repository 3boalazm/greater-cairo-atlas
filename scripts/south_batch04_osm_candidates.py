#!/usr/bin/env python3
"""Audit local OSM name candidates and prepare a targeted Overpass query.

Candidates are NOT accepted matches: their semantics, geometry and location need review.
The query intentionally covers all entities until that review has been completed.
"""
import csv
import gzip
import json
import re
from pathlib import Path

from road_gap_fill import normalize, way_labels

ROOT = Path(__file__).resolve().parents[1]
BBOX = (31.15, 29.75, 31.45, 30.08)  # west, south, east, north
PREFIXES = ('مشروع', 'كوبري', 'محور', 'طريق')


def normalized(value):
    # Reuse road normalization, extending it to the project prefix.
    value = value.strip()
    if value.startswith('مشروع '):
        value = value[len('مشروع '):]
    return normalize(value)


def bbox_status(element):
    points = []
    if 'lon' in element and 'lat' in element:
        points.append((element['lon'], element['lat']))
    for p in element.get('geometry', []):
        if isinstance(p, dict) and 'lon' in p and 'lat' in p:
            points.append((p['lon'], p['lat']))
    for member in element.get('members', []):
        for p in member.get('geometry', []):
            if isinstance(p, dict) and 'lon' in p and 'lat' in p:
                points.append((p['lon'], p['lat']))
    if not points:
        return 'unknown'
    w, s, e, n = BBOX
    return 'inside' if all(w <= x <= e and s <= y <= n for x, y in points) else 'outside_or_crosses'


def main():
    with (ROOT / 'data/research/south-batch04/entities.csv').open(encoding='utf-8-sig', newline='') as f:
        entities = list(csv.DictReader(f))
    paths = sorted((ROOT / 'data/raw').glob('*json.gz'))
    candidates = {row['code']: {} for row in entities}
    for path in paths:
        with gzip.open(path, 'rt', encoding='utf-8') as f:
            document = json.load(f)
        for element in document.get('elements', []):
            tags = element.get('tags', {})
            labels, _ = way_labels(tags)
            # way_labels uses the same road normalization; also handle project prefix.
            for key in ('name', 'name:ar', 'name:en', 'alt_name', 'official_name', 'old_name'):
                for part in str(tags.get(key, '')).split(';'):
                    if normalized(part):
                        labels.add(normalized(part))
            if not labels:
                continue
            for row in entities:
                names = [row['name_ar'], row['name_en'], *row['aliases'].split('|')]
                overlap = sorted(labels & {normalized(name) for name in names if normalized(name)})
                if not overlap:
                    continue
                ident = f"{element['type']}/{element['id']}"
                entry = candidates[row['code']].setdefault(ident, {'osm_id': ident, 'tags': tags, 'bbox': bbox_status(element), 'sources': [], 'matched_names': overlap})
                if path.name not in entry['sources']:
                    entry['sources'].append(path.name)
                if entry['bbox'] == 'unknown':
                    entry['bbox'] = bbox_status(element)
    report = {'scope': 'local extracts only; preliminary candidates, not accepted geometry', 'bbox_wgs84': list(BBOX), 'entities': [
        {'code': row['code'], 'candidates': list(candidates[row['code']].values())} for row in entities
    ]}
    out = ROOT / 'data/research/south-batch04/local_geometry_candidates.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Quote each literal for both POSIX regular expressions and Overpass string syntax.
    terms = set()
    for row in entities:
        for name in [row['name_ar'], row['name_en'], *row['aliases'].split('|')]:
            name = name.strip()
            if name:
                terms.add(name)
                for prefix in PREFIXES:
                    if name.startswith(prefix + ' '):
                        terms.add(name[len(prefix) + 1:])
    pattern = '|'.join(re.sub(r'([.\^$*+?{}\[\]\\|()])', r'\\\1', term) for term in sorted(terms))
    pattern = pattern.replace('\\', '\\\\').replace('"', '\\"')
    clauses = '\n'.join(f'  nwr["{key}"~"{pattern}",i](29.75,31.15,30.08,31.45);' for key in ('name', 'name:ar', 'name:en', 'alt_name'))
    query = f'// Preliminary: all 31 entities until local candidates have been reviewed.\n[out:json][timeout:180];\n(\n{clauses}\n);\nout meta geom;\n'
    (ROOT / 'data/research/south-batch04/targeted-south-batch04.overpassql').write_text(query, encoding='utf-8')
    print(f"Audited {len(paths)} files, {len(entities)} entities; {sum(bool(x) for x in candidates.values())} have name candidates. No geometry accepted.")


if __name__ == '__main__':
    main()
