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

    def test_matches_real_versioned_osm_polygon_and_preserves_odbl_provenance(self):
        features, audit = process_osm_boundaries(self.fixture, [self.entity], "2026-11-14")
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
            features, _ = process_osm_boundaries({"elements": [candidate]}, [self.entity], "2026-11-14", rules)
            self.assertEqual(features, [])


if __name__ == "__main__":
    unittest.main()
