import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from station_matching import match_osm_station_nodes, normalize_station_name  # noqa: E402


def entity(code, name_ar, name_en, entity_type="transit_stop", status="operational", aliases=""):
    return {"code": code, "name_ar": name_ar, "name_en": name_en, "entity_type": entity_type,
            "status": status, "aliases": aliases}


def line_feature(code, coordinates, osm_id=None):
    return {
        "type": "Feature", "id": f"line-{code}-{osm_id or 1}",
        "geometry": {"type": "LineString", "coordinates": coordinates},
        "properties": {"entity_code": code, "osm_type": "relation" if osm_id else "way", "osm_id": osm_id,
                       "properties": {"entity_type": "transit_line"}},
    }


class StationMatchingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.osm = json.loads((ROOT / "tests/fixtures/osm-stations/minimal.json").read_text())

    def test_normalizes_arabic_variants_and_removes_generic_station_descriptors(self):
        self.assertEqual(normalize_station_name("إِ محطة مترو الساداتِ"), normalize_station_name("ا السادات"))
        self.assertEqual(normalize_station_name("محطة LRT Maadi Station"), "maadi")
        self.assertEqual(normalize_station_name("المعادى"), normalize_station_name("المعادي"))

    def test_maps_sadat_to_subway_and_construction_sadat_to_west_monorail_only_on_alignment(self):
        entities = [
            entity("STOP-SADAT", "السادات", "Sadat Station", status="unknown"),
            entity("STOP-MRW-SADAT", "السادات (مونوريل غرب)", "El Sadat West Monorail", status="under_construction"),
        ]
        lines = [
            line_feature("TRANSIT-METRO-L1", [[31.22, 30.04], [31.24, 30.04]]),
            line_feature("TRANSIT-MONORAIL-WEST", [[31.39, 30.10], [31.41, 30.10]]),
        ]
        features, report = match_osm_station_nodes(self.osm, entities, lines, "2026-11-14")
        by_entity = {feature["properties"]["entity_code"]: feature for feature in features}
        self.assertEqual(set(by_entity), {"STOP-SADAT", "STOP-MRW-SADAT"})
        self.assertEqual(by_entity["STOP-SADAT"]["properties"]["osm_id"], 1001)
        self.assertEqual(by_entity["STOP-MRW-SADAT"]["properties"]["osm_id"], 1002)
        self.assertEqual(by_entity["STOP-MRW-SADAT"]["properties"]["osm_version"], 4)
        self.assertIn("construction", by_entity["STOP-MRW-SADAT"]["properties"]["properties"]["osm_tags"])
        self.assertEqual(report["station_entities"]["STOP-SADAT"]["matched_count"], 1)

    def test_refuses_distant_same_name_nodes_instead_of_guessing_rail_terminal(self):
        bashtil = entity("RAIL-BASHTIL", "محطة قطارات الصعيد في بشتيل", "Bashtil Upper Egypt Rail Station",
                         "rail_station", aliases="بشتيل")
        features, report = match_osm_station_nodes(self.osm, [bashtil], [], "2026-11-14")
        self.assertEqual(features, [])
        self.assertEqual(report["entity_level_ambiguous_entities"], 1)
        conflict = report["entity_level_conflicts"]["RAIL-BASHTIL"]
        self.assertEqual(conflict["candidate_osm_node_ids"], [1003, 1004])
        self.assertEqual(report["station_entities"]["RAIL-BASHTIL"]["outcome"], "unmatched")

    def test_generic_railway_station_is_resolved_to_lrt_only_by_nearby_matched_line(self):
        obour = entity("STOP-LRT-OBOUR", "العبور", "Obour LRT Station")
        node = {"type": "node", "id": 2003, "version": 5, "lat": 30.06, "lon": 31.41,
                "tags": {"name": "El-Obour", "name:en": "Obour", "public_transport": "station",
                         "railway": "station", "train": "yes"}}
        aligned = [line_feature("TRANSIT-LRT", [[31.40, 30.06], [31.42, 30.06]])]
        features, _ = match_osm_station_nodes({"elements": [node]}, [obour], aligned, "2026-11-14")
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["properties"]["properties"]["matched_line_modes"], ["light_rail"])
        outside_alignment = [line_feature("TRANSIT-LRT", [[31.50, 30.06], [31.52, 30.06]])]
        rejected, report = match_osm_station_nodes({"elements": [node]}, [obour], outside_alignment, "2026-11-14")
        self.assertEqual(rejected, [])
        self.assertEqual(report["station_entities"]["STOP-LRT-OBOUR"]["matched_count"], 0)

    def test_explicit_subway_tag_cannot_be_assigned_to_nearby_lrt_alignment(self):
        obour = entity("STOP-LRT-OBOUR", "العبور", "Obour LRT Station")
        subway_node = {"type": "node", "id": 2004, "version": 1, "lat": 30.06, "lon": 31.41,
                       "tags": {"name": "Obour", "station": "subway", "subway": "yes",
                                "railway": "station", "public_transport": "station"}}
        features, report = match_osm_station_nodes({"elements": [subway_node]}, [obour], [
            line_feature("TRANSIT-LRT", [[31.40, 30.06], [31.42, 30.06]])
        ], "2026-11-14")
        self.assertEqual(features, [])
        self.assertEqual(report["station_entities"]["STOP-LRT-OBOUR"]["matched_count"], 0)

    def test_route_relation_membership_supplies_mode_and_line_identity(self):
        cbd = entity("STOP-MRE-CBD", "حي المال والأعمال", "Financial & Business District (Monorail)")
        osm = {"elements": [
            {"type": "node", "id": 2001, "version": 8, "lat": 30.06, "lon": 31.41,
             "tags": {"name": "حي المال والأعمال", "public_transport": "station", "railway": "station"}},
            {"type": "relation", "id": 5001, "version": 1,
             "tags": {"type": "route", "route": "monorail", "name": "East Nile Monorail"},
             "members": [{"type": "node", "ref": 2001, "role": "stop"}]},
        ]}
        lines = [line_feature("TRANSIT-MONORAIL-EAST", [[31.40, 30.06], [31.42, 30.06]], osm_id=5001)]
        features, _ = match_osm_station_nodes(osm, [cbd], lines, "2026-11-14")
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["properties"]["entity_code"], "STOP-MRE-CBD")
        self.assertEqual(features[0]["properties"]["properties"]["route_relation_ids"], [5001])

    def test_rejects_wrong_line_and_under_construction_without_construction_tags(self):
        west_sadat = entity("STOP-MRW-SADAT", "السادات (مونوريل غرب)", "El Sadat West Monorail", status="under_construction")
        node = {"type": "node", "id": 2002, "version": 1, "lat": 30.04, "lon": 31.23,
                "tags": {"name": "السادات", "station": "subway", "subway": "yes", "railway": "station"}}
        features, report = match_osm_station_nodes({"elements": [node]}, [west_sadat], [
            line_feature("TRANSIT-MONORAIL-WEST", [[31.22, 30.04], [31.24, 30.04]])
        ], "2026-11-14")
        self.assertEqual(features, [])
        self.assertEqual(report["station_entities"]["STOP-MRW-SADAT"]["matched_count"], 0)


if __name__ == "__main__":
    unittest.main()
