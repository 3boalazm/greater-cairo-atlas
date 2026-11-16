"""Validator and SQL trigger must share the same accepted road envelope."""
import importlib.util
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('ingest_features', ROOT / 'scripts/ingest-features.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def feature(code, x, entity_type='road'):
    return {'geometry': {'type': 'Point', 'coordinates': [x, 29.8]}, 'properties': {
        'code': 'TEST', 'entity_code': code, 'srid': 4326, 'properties': {'entity_type': entity_type}}}


class IngestBboxTests(unittest.TestCase):
    def test_trigger_values_match_validator_constants(self):
        sql = (ROOT / 'db/migrations/007_regional_ring_west_bbox.sql').read_text()
        for expected in ('west DOUBLE PRECISION := 30.5', 'south DOUBLE PRECISION := 29.2',
                         'east DOUBLE PRECISION := 32.1', 'north DOUBLE PRECISION := 30.8',
                         'east := 32.35', 'north := 30.9', "feature_entity_code = 'ROAD-REGIONAL-RING'",
                         'west := 30.25'):
            self.assertIn(expected, sql)
        self.assertEqual(module.BBOX, (30.5, 29.2, 32.1, 30.8))
        self.assertEqual(module.ROAD_BBOX, (30.5, 29.2, 32.35, 30.9))
        self.assertEqual(module.REGIONAL_RING_ROAD_BBOX, (30.25, 29.2, 32.35, 30.9))

    def test_extra_search_rule_cannot_widen_db_trigger_envelope(self):
        rules = {'entity_rules': {'ROAD-OTHER': {'road_bbox_wgs84': [30, 29, 33, 31]}}}
        accepted, info = module.validate_feature_geometries([feature('ROAD-OTHER', 30.3)], repair=False, rules=rules)
        self.assertFalse(accepted)
        self.assertEqual(info['dropped'][0]['reason'], 'geometry_outside_road_bbox')
        accepted, _ = module.validate_feature_geometries([feature('ROAD-REGIONAL-RING', 30.3)], repair=False, rules=rules)
        self.assertEqual(len(accepted), 1)
        accepted, _ = module.validate_feature_geometries([feature('LANDMARK-OTHER', 30.3, 'landmark')], repair=False, rules=rules)
        self.assertFalse(accepted)

    def test_feature_count_reset_uses_the_written_counter(self):
        text = (ROOT / 'scripts/ingest-features.py').read_text()
        self.assertRegex(text, re.compile(r'except \(OSError, json.JSONDecodeError.*?feature_count = 0', re.S))
        self.assertNotIn('features_written = 0', text)


if __name__ == '__main__':
    unittest.main()
