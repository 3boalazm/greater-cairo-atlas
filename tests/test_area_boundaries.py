import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from area_boundaries import normalize_area_name, process_osm_boundaries  # noqa: E402


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

    def test_arabic_normalization_strips_area_words_and_normalizes_letters(self):
        self.assertEqual(normalize_area_name("حي إِنْشَاء مدينة") , normalize_area_name("انشاء"))
        self.assertEqual(normalize_area_name("آية منطقة"), normalize_area_name("ايه"))
        self.assertEqual(normalize_area_name("Qesm New City District"), normalize_area_name("Qesm New"))
        self.assertEqual(normalize_area_name("قسم مدينة القاهرة الجديدة"), normalize_area_name("القاهرة الجديدة"))

    def test_incomplete_admin_tag_can_only_fall_back_to_named_place_source(self):
        way = {**self.fixture["elements"][0], "id": 123459,
               "tags": {"boundary": "administrative", "place": "neighbourhood",
                        "name": "Test District", "name:ar": "حي الاختبار"}}
        features, _ = process_osm_boundaries({"elements": [way]}, [self.entity], "2026-11-14",
                                              existing_features=self.point_features)
        self.assertEqual(len(features), 1)
        metadata = features[0]["properties"]["properties"]
        self.assertEqual(metadata["source_kind"], "place")
        self.assertIsNone(metadata["admin_level"])

    def test_allows_named_residential_landuse_and_sets_source_kind(self):
        way = {**self.fixture["elements"][0], "id": 123460,
               "tags": {"landuse": "residential", "name": "Test District", "name:ar": "حي الاختبار"}}
        features, _ = process_osm_boundaries({"elements": [way]}, [self.entity], "2026-11-14",
                                              existing_features=self.point_features)
        self.assertEqual(len(features), 1)
        metadata = features[0]["properties"]["properties"]
        self.assertEqual(metadata["source_kind"], "landuse")
        self.assertAlmostEqual(metadata["area_km2"], 4.262, places=3)

    def test_prefers_larger_plausible_same_name_polygon_over_neighbourhood_block(self):
        way = {**self.fixture["elements"][0], "id": 123461,
               "tags": {"place": "neighbourhood", "name": "Test District", "name:ar": "حي الاختبار"}}
        relation = {"type": "relation", "id": 123462, "version": 3,
                    "tags": {"boundary": "administrative", "admin_level": "8", "name": "Test District", "name:ar": "حي الاختبار"},
                    "members": [{"type": "way", "ref": 456, "role": "outer", "geometry": way["geometry"]}]}
        features, _ = process_osm_boundaries({"elements": [way, relation]}, [self.entity], "2026-11-14",
                                              existing_features=self.point_features)
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["properties"]["osm_id"], 123462)

    def test_uses_cairo_governorate_relation_with_explicit_arabic_display_label(self):
        way = self.fixture["elements"][0]
        city = {"code": "CITY-CAIRO", "name_ar": "القاهرة", "name_en": "Cairo",
                "entity_type": "city", "aliases": "محافظة القاهرة|Cairo Governorate"}
        relation = {"type": "relation", "id": 4103336, "version": 8,
                    "tags": {"boundary": "administrative", "admin_level": "4", "name": "القاهرة",
                             "name:ar": "القاهرة", "name:en": "Cairo"},
                    "members": [{"type": "way", "ref": 456, "role": "outer", "geometry": way["geometry"]}]}
        point_features = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [31.21, 30.05]},
                           "properties": {"entity_code": "CITY-CAIRO"}}]
        features, _ = process_osm_boundaries({"elements": [relation]}, [city], "2026-11-14",
                                              existing_features=point_features)
        self.assertEqual(len(features), 1)
        metadata = features[0]["properties"]["properties"]
        self.assertEqual(features[0]["properties"]["osm_id"], 4103336)
        self.assertEqual(metadata["display_label_ar"], "حدود محافظة القاهرة")
        self.assertEqual(metadata["source_kind"], "administrative")

    def test_rejects_bab_shaaria_neighbourhood_block_as_qism_boundary(self):
        element = self.fixture["elements"][0]
        small_geometry = [
            {"lat": 30.049, "lon": 31.209}, {"lat": 30.049, "lon": 31.212},
            {"lat": 30.052, "lon": 31.212}, {"lat": 30.052, "lon": 31.209},
            {"lat": 30.049, "lon": 31.209},
        ]
        candidate = {**element, "id": 709300098, "geometry": small_geometry,
                     "tags": {"place": "neighbourhood", "landuse": "residential", "name": "باب الشعريه"}}
        bab_entity = {**self.entity, "code": "DIST-BAB-SHAREYA", "name_ar": "باب الشعرية", "name_en": "Bab El Shaareya"}
        points = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [31.2105, 30.0505]},
                   "properties": {"entity_code": "DIST-BAB-SHAREYA"}}]
        features, audit = process_osm_boundaries({"elements": [candidate]}, [bab_entity], "2026-11-14",
                                                  existing_features=points)
        self.assertEqual(features, [])
        self.assertTrue(any("block_scale" in item.get("rejections", {}).get("DIST-BAB-SHAREYA", "")
                            for item in audit["audit"]))


if __name__ == "__main__":
    unittest.main()
