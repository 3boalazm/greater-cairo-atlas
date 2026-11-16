"""Topology checks for OSM relation polygons and grouped road matching."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from south_batch04_geometry import normalized, relation_polygon, road_is_one_corridor  # noqa: E402
from shapely.geometry import LineString


def way(points, role='outer'):
    return {'type': 'way', 'role': role, 'geometry': [{'lon': x, 'lat': y} for x, y in points]}


class SouthGeometryTest(unittest.TestCase):
    def test_normalization(self):
        self.assertEqual(normalized('مشروع حدائق تلال الفسطاط'), normalized('حدائق تلال الفسطاط'))
        self.assertEqual(normalized('محور سميرة موسى'), normalized('محور سميره موسي'))

    def test_closed_relation_with_hole(self):
        element = {'members': [way([(0, 0), (4, 0), (4, 4)]), way([(4, 4), (0, 4), (0, 0)]),
                               way([(1, 1), (1, 2), (2, 2), (2, 1), (1, 1)], 'inner')]}
        result = relation_polygon(element)
        self.assertTrue(result.is_valid)
        self.assertEqual(len(result.interiors), 1)
        self.assertEqual(result.area, 15)

    def test_open_ring_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'does not close'):
            relation_polygon({'members': [way([(0, 0), (1, 0), (1, 1)])]})

    def test_disconnected_same_name_roads_are_rejected(self):
        a = ({}, '', LineString([(31, 30), (31.001, 30)]), {})
        b = ({}, '', LineString([(31.1, 30), (31.101, 30)]), {})
        self.assertFalse(road_is_one_corridor([a, b]))


if __name__ == '__main__':
    unittest.main()
