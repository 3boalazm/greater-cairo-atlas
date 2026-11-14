import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from area_boundaries import process_osm_boundaries  # noqa: E402


class AreaBoundaryIngestionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / "tests/fixtures/osm-boundaries/minimal.json").read_text())
        cls.entity = {
            "code": "DIST-TEST", "name_ar": "حي الاختبار", "name_en": "Test District",
            "entity_type": "district", "aliases": "",
        }

    def setUp(self):
        self.point_features = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [31.21, 30.05]},
                               "properties": {"entity_code": "DIST-TEST", "properties": {"entity_type": "district"}}}]

    def test_matches_real_versioned_osm_polygon_and_preserves_odbl_provenance(self):
        features, audit = process_osm_boundaries(self.fixture, [self.entity], "2026-11-14",
                                                 existing_features=self.point_features)
        self.assertEqual(len(features), 1)
        feature = features[0]
        self.assertEqual(feature["geometry"]["type"], "Polygon")
        self.assertEqual(feature["properties"]["osm_id"], 987654321)
        self.assertEqual(feature["properties"]["osm_version"], 7)
        metadata = feature["properties"]["properties"]
        self.assertEqual(metadata["source_ids"]["osm_version"], 7)
        self.assertEqual(metadata["license"], "ODbL-1.0")
        self.assertEqual(metadata["attribution"], "© OpenStreetMap contributors, ODbL 1.0")
        self.assertEqual(audit["matched_count"], 1)

    def test_rejects_wrong_names_missing_versions_and_out_of_bbox_polygons(self):
        element = self.fixture["elements"][0]
        for candidate, rules in [
            ({**element, "tags": {"boundary": "administrative", "admin_level": "8", "name": "Other District"}}, None),
            ({**element, "version": 0}, None),
            (element, {"area_entity_rules": {"DIST-TEST": {"bbox_wgs84": [31.3, 29.9, 31.5, 30.2]}}}),
        ]:
            features, _ = process_osm_boundaries({"elements": [candidate]}, [self.entity], "2026-11-14", rules,
                                                  self.point_features)
            self.assertEqual(features, [])

    def test_prefers_admin_relation_over_place_way_and_reports_source_priority(self):
        way = self.fixture["elements"][0]
        relation = {"type": "relation", "id": 123456, "version": 4,
                    "tags": {"boundary": "administrative", "admin_level": "8", "name": "Test District"},
                    "members": [{"type": "way", "ref": 456, "role": "outer", "geometry": way["geometry"]}]}
        place_way = {**way, "id": 123457, "tags": {"place": "suburb", "name": "Test District"}}
        features, audit = process_osm_boundaries({"elements": [place_way, relation]}, [self.entity], "2026-11-14",
                                                 existing_features=self.point_features)
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["properties"]["osm_id"], 123456)
        self.assertEqual(audit["entity_counts_by_type"]["district"]["matched"], 1)
        self.assertTrue(any(item.get("outcome") == "superseded" for item in audit["audit"]))

    def test_equally_prioritized_boundaries_are_reported_ambiguous_not_selected(self):
        way = self.fixture["elements"][0]
        relation_a = {"type": "relation", "id": 123456, "version": 4,
                      "tags": {"boundary": "administrative", "admin_level": "8", "name": "Test District"},
                      "members": [{"type": "way", "ref": 456, "role": "outer", "geometry": way["geometry"]}]}
        relation_b = {**relation_a, "id": 123458}
        features, audit = process_osm_boundaries({"elements": [relation_a, relation_b]}, [self.entity], "2026-11-14",
                                                 existing_features=self.point_features)
        self.assertEqual(features, [])
        self.assertIn("DIST-TEST", audit["ambiguous_entities"])
        self.assertEqual(audit["entity_counts_by_type"]["district"]["ambiguous"], 1)

    def test_rejects_polygon_more_than_one_kilometre_from_existing_entity_point(self):
        element = self.fixture["elements"][0]
        far_point = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [31.4, 30.2]},
                      "properties": {"entity_code": "DIST-TEST"}}]
        features, audit = process_osm_boundaries({"elements": [element]}, [self.entity], "2026-11-14",
                                                 existing_features=far_point)
        self.assertEqual(features, [])
        self.assertEqual(audit["entity_counts_by_type"]["district"]["unmatched"], 1)


if __name__ == "__main__":
    unittest.main()
