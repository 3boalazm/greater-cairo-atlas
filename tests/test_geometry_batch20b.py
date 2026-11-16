"""Offline matcher policy, topology, provenance and idempotence regression."""
import copy
import csv
import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

from shapely.geometry import LineString, shape

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import geometry_batch20b as batch


class GeometryBatch20bTest(unittest.TestCase):
    def test_normalization_and_kind_safeguards(self):
        self.assertTrue(batch.variants('حَيّ الأزبكية') & batch.variants('الازبكيه'))
        self.assertTrue(batch.variants('The Al Zamalek') & batch.variants('Zamalek'))
        self.assertTrue(batch.labels({'old_name': 'foo|bar', 'official_name': 'baz;qux'}) >= {'foo', 'bar', 'baz', 'qux'})
        self.assertFalse(batch.kind_ok('bridge', {'type': 'node', 'tags': {'railway': 'station', 'name': 'المنيب'}}))
        self.assertFalse(batch.kind_ok('city', {'type': 'node', 'tags': {'amenity': 'cafe', 'name': 'العلمين'}}))
        self.assertFalse(batch.kind_ok('city', {'type': 'node', 'tags': {'amenity': 'bus_station', 'name': 'أوسيم'}}))
        self.assertFalse(batch.kind_ok('bridge', {'type': 'way', 'tags': {'highway': 'primary'}}))
        self.assertTrue(batch.kind_ok('bridge', {'type': 'way', 'tags': {'highway': 'primary', 'bridge': 'yes'}}))
        self.assertFalse(batch.line_identity('STOP-M2-MONIB', {'railway': 'station', 'network': 'Cairo Metro'}))
        self.assertTrue(batch.line_identity('STOP-M2-MONIB', {'railway': 'station', 'network': 'Cairo Metro Line 2'}))
        self.assertFalse(batch.line_identity('STOP-BRT-MAADI', {'railway': 'station', 'network': 'Cairo Metro Line 1'}))

    def test_connected_groups_require_near_endpoints(self):
        a = (('way', 1), {}, '', LineString([(31, 30), (31.001, 30)]), {})
        b = (('way', 2), {}, '', LineString([(31.0011, 30), (31.002, 30)]), {})
        c = (('way', 3), {}, '', LineString([(31.1, 30), (31.2, 30)]), {})
        self.assertEqual(sorted(map(len, batch.connected_groups([a, b, c]))), [1, 2])

    def test_accepted_topology_sector_and_policy(self):
        with (ROOT / 'data/seed/entities.csv').open(encoding='utf-8-sig') as f:
            seed = {r['code']: r for r in csv.DictReader(f)}
        areas = batch.sector_areas(seed)
        features = json.loads(batch.FEATURES.read_text())['features']
        additions = [f for f in features if f['id'].startswith(batch.PREFIX)]
        valid, report = batch.ingest.validate_feature_geometries(additions, repair=False)
        self.assertEqual(report['dropped'], [])
        self.assertEqual(len(valid), len(additions))
        for f in additions:
            row = seed[f['properties']['entity_code']]
            geom = shape(f['geometry'])
            self.assertTrue(geom.is_valid and not geom.is_empty and batch.BBOX.covers(geom))
            self.assertLessEqual(geom.distance(areas[row['sector']]), batch.NEAR_DEGREES)
            self.assertNotIn(row['status'], {'planned', 'approved_planned', 'under_construction'})
            self.assertNotIn(row['entity_type'], {'authority', 'project'})
        bridge = next(f for f in additions if f['properties']['entity_code'] == 'BRIDGE-UNIVERSITY')
        self.assertEqual(bridge['geometry']['type'], 'MultiLineString')
        self.assertEqual(len(bridge['properties']['properties']['source_ids']['members']), 2)

    def test_rerun_is_byte_idempotent_and_collisions_refused(self):
        paths = [batch.FEATURES, batch.DERIVED, batch.MANIFEST, batch.OUT / 'geometry_match_report.json']
        digest = lambda: [hashlib.sha256(p.read_bytes()).hexdigest() for p in paths]
        before = digest()
        subprocess.run([sys.executable, str(ROOT / 'scripts/geometry_batch20b.py')], check=True, cwd=ROOT, capture_output=True)
        self.assertEqual(digest(), before)
        collection = json.loads(batch.FEATURES.read_text())
        derived = json.loads(batch.DERIVED.read_text())
        additions = [copy.deepcopy(f) for f in collection['features'] if f['id'].startswith(batch.PREFIX)]
        codes = {f['properties']['entity_code'] for f in additions}
        additions[0]['properties']['osm_version'] += 1
        with self.assertRaisesRegex(ValueError, 'feature collision'):
            batch.commit({}, additions, collection, derived, codes)
        self.assertEqual(digest(), before)


if __name__ == '__main__':
    unittest.main()
