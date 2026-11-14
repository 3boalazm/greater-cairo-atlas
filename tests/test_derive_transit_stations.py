import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("derive_transit_stations", ROOT / "scripts/derive-transit-stations.py")
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(module)


class DeriveTransitStationsTests(unittest.TestCase):
    def test_route_station_canonicalization_keeps_relation_order_and_merges_reverse_copy(self):
        eastbound = {"osm_node_id": 11, "osm_node_version": 2, "name": "Sadat", "name_en": "Sadat", "name_ar": None,
                     "longitude": 31.2, "latitude": 30.0, "member_role": "stop", "source_relation_ids": [1],
                     "line_codes": ["TRANSIT-METRO-L1"], "modes": ["metro"], "existing_entities": [], "status": "operational", "primary_mode": "metro"}
        reverse_copy = {**eastbound, "osm_node_id": 12, "osm_node_version": 3, "source_relation_ids": [2]}
        groups = module.canonical_station_groups([eastbound, reverse_copy])
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["osm_node_ids"], [11, 12])
        self.assertEqual(groups[0]["source_relation_ids"], [1, 2])

    def test_rail_extract_refreshes_eight_ordered_subway_relations_and_official_counts(self):
        report = __import__("json").loads((ROOT / "data/research/osm-stations/stations_from_osm.json").read_text(encoding="utf-8"))
        lines = {line["line_code"]: line for line in report["lines"]}
        self.assertEqual([lines[code]["relation_count"] for code in ("TRANSIT-METRO-L1", "TRANSIT-METRO-L2", "TRANSIT-METRO-L3")], [2, 2, 4])
        self.assertEqual([lines[code]["osm_station_count"] for code in ("TRANSIT-METRO-L1", "TRANSIT-METRO-L2", "TRANSIT-METRO-L3")], [35, 20, 34])
        self.assertEqual(report["enr_named_station_node_count"], 2)
        self.assertEqual(len(report["enr_route_relations"]), 4)

    def test_rail_pipeline_selects_only_seed_matched_lines_and_in_bbox_station_nodes(self):
        payload = {"elements": [
            {"type": "way", "id": 10, "version": 2, "nodes": [1, 2], "geometry": [{"lat": 30.0, "lon": 31.0}, {"lat": 30.1, "lon": 31.1}], "tags": {"railway": "rail"}},
            {"type": "way", "id": 11, "version": 1, "nodes": [1, 2], "geometry": [{"lat": 30.0, "lon": 31.0}, {"lat": 30.1, "lon": 31.1}], "tags": {"railway": "construction", "construction": "rail"}},
            {"type": "way", "id": 12, "version": 1, "nodes": [1, 2], "geometry": [{"lat": 30.0, "lon": 31.0}, {"lat": 30.1, "lon": 31.1}], "tags": {"railway": "narrow_gauge"}},
            {"type": "way", "id": 13, "version": 1, "nodes": [1, 2], "geometry": [{"lat": 30.0, "lon": 31.0}, {"lat": 30.1, "lon": 31.1}], "tags": {"railway": "disused"}},
            {"type": "relation", "id": 20, "version": 1, "members": [{"type": "way", "ref": 10}], "tags": {"route": "train", "name:en": "Suez Train"}},
            {"type": "relation", "id": 21, "version": 1, "members": [{"type": "way", "ref": 11}], "tags": {"route": "train", "name:en": "Unseeded new railway"}},
            {"type": "node", "id": 31, "version": 4, "lat": 30.05, "lon": 31.04, "tags": {"railway": "station", "train": "yes", "name:en": "Cairo"}},
            {"type": "node", "id": 32, "version": 1, "lat": 31.2, "lon": 31.2, "tags": {"railway": "halt", "train": "yes"}},
        ]}
        collection = module.derive_rail_context(payload)
        ways = [feature for feature in collection["features"] if feature["geometry"]["type"] != "Point"]
        stations = [feature for feature in collection["features"] if feature["geometry"]["type"] == "Point"]
        self.assertEqual(len(ways), 4)
        self.assertEqual(next(feature for feature in ways if feature["properties"]["osm_id"] == 10)["properties"]["entity_code"], "TRANSIT-SUEZ-TRAIN")
        self.assertIsNone(next(feature for feature in ways if feature["properties"]["osm_id"] == 11)["properties"]["entity_code"])
        self.assertEqual(next(feature for feature in ways if feature["properties"]["osm_id"] == 13)["properties"]["rail_status"], "disused")
        self.assertEqual([feature["properties"]["osm_id"] for feature in stations], [31])
        self.assertTrue(all(feature["properties"]["license"] == "ODbL-1.0" for feature in collection["features"]))


if __name__ == "__main__":
    unittest.main()
