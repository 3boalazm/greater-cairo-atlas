import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from station_fact_geometry import match_station_fact_nodes  # noqa: E402


class StationFactGeometryTests(unittest.TestCase):
    def setUp(self):
        self.entities = [
            {"code": "STOP-EXACT", "entity_type": "transit_stop", "status": "operational"},
            {"code": "STOP-PLANNED", "entity_type": "transit_stop", "status": "approved_planned"},
        ]
        self.node_facts = {"STOP-EXACT": {101, 102}, "STOP-PLANNED": {201}}
        self.lines = {"STOP-EXACT": {"TRANSIT-METRO-L1"}, "STOP-PLANNED": {"TRANSIT-METRO-L2"}}

    def test_exact_fact_id_is_used_and_each_distinct_group_primary_is_preserved(self):
        osm = {"elements": [
            {"type": "node", "id": 101, "version": 7, "lat": 30.0, "lon": 31.0,
             "tags": {"railway": "stop", "subway": "yes", "name": "Other name"}},
            {"type": "node", "id": 102, "version": 3, "lat": 30.02, "lon": 31.01,
             "tags": {"public_transport": "stop_position", "railway": "stop", "subway": "yes"}},
            {"type": "node", "id": 999, "version": 1, "lat": 30.0, "lon": 31.0,
             "tags": {"railway": "station", "name": "STOP-EXACT"}},
        ]}
        groups = [
            {"osm_node_id": 101, "feature_id": "g1", "line_codes": ["TRANSIT-METRO-L1"]},
            {"osm_node_id": 102, "feature_id": "g2", "line_codes": ["TRANSIT-METRO-L1"]},
        ]
        features, audit = match_station_fact_nodes(osm, self.entities, self.node_facts, self.lines,
                                                   "2026-11-14", groups)
        self.assertEqual({item["properties"]["osm_id"] for item in features}, {101, 102})
        self.assertEqual([item["properties"]["osm_version"] for item in features], [7, 3])
        self.assertTrue(all(item["properties"]["license"] == "ODbL-1.0" for item in features))
        self.assertTrue(all(item["properties"]["properties"]["attribution"] ==
                            "© OpenStreetMap contributors, ODbL 1.0" for item in features))
        self.assertEqual(audit["station_groups_matched"], 2)

    def test_planned_mismatch_is_reported_without_lifecycle_bypass(self):
        osm = {"elements": [
            {"type": "node", "id": 201, "version": 4, "lat": 30.04, "lon": 31.24,
             "tags": {"railway": "stop", "subway": "yes", "name": "Different station"}},
        ]}
        groups = [{"osm_node_id": 201, "feature_id": "planned-g", "line_codes": ["TRANSIT-METRO-L2"]}]
        features, audit = match_station_fact_nodes(osm, self.entities, self.node_facts, self.lines,
                                                   "2026-11-14", groups)
        self.assertEqual(features, [])
        self.assertIn("STOP-PLANNED", audit["lifecycle_or_geometry_rejections"])
        self.assertIn("no construction tag",
                      audit["lifecycle_or_geometry_rejections"]["STOP-PLANNED"][0]["reason"])

    def test_node_reference_shared_between_entities_is_not_guessed(self):
        facts = {"STOP-EXACT": {101}, "STOP-PLANNED": {101}}
        features, audit = match_station_fact_nodes({"elements": []}, self.entities, facts, self.lines,
                                                   "2026-11-14", [{"osm_node_id": 101}])
        self.assertEqual(features, [])
        self.assertEqual(audit["ambiguous_node_ids"][0]["entity_codes"], ["STOP-EXACT", "STOP-PLANNED"])


if __name__ == "__main__":
    unittest.main()
