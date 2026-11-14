import unittest

from scripts.road_gap_fill import (
    build_road_graph,
    connect_seed_components,
    filter_graph_for_entity,
    normalize,
)


def way(way_id, nodes, longitudes, tags=None, version=1):
    return {
        "type": "way",
        "id": way_id,
        "version": version,
        "nodes": nodes,
        "geometry": [{"lon": lon, "lat": 30.0} for lon in longitudes],
        "tags": {"highway": "primary", **(tags or {})},
    }


class RoadGapFillTests(unittest.TestCase):
    def setUp(self):
        self.elements = [
            way(101, [1, 2], [31.000, 31.001], {"name": "Ring Road", "ref": "R1"}),
            way(102, [4, 5], [31.019, 31.020], {"name:en": "Ring Road", "ref": "R1"}),
            way(103, [2, 3, 4], [31.001, 31.010, 31.019]),
        ]
        self.ways, self.adjacency = build_road_graph(self.elements)

    def test_gap_fill_uses_only_real_osm_ways_and_records_provenance(self):
        graph = filter_graph_for_entity(
            self.ways, self.adjacency, {normalize("Ring Road")}, {normalize("R1")}
        )
        result = connect_seed_components(
            entity_code="ROAD-RING-ROAD", seed_way_ids={101, 102}, ways=self.ways,
            adjacency=graph, max_km=3.0,
        )
        self.assertEqual(result["gaps_before"], 1)
        self.assertEqual(result["gaps_after"], 0)
        self.assertEqual(result["filled_way_ids"], [103])
        self.assertEqual(result["paths"][0]["way_ids"], [103])
        self.assertEqual(result["paths"][0]["method"], "gap_fill_graph")
        self.assertEqual(len(result["paths"][0]["from_coordinate"]), 2)
        self.assertGreater(result["km_closed"], 1.0)
        self.assertLessEqual(result["km_closed"], 3.0)

    def test_maximum_path_length_is_enforced(self):
        graph = filter_graph_for_entity(
            self.ways, self.adjacency, {normalize("Ring Road")}, {normalize("R1")}
        )
        result = connect_seed_components(
            entity_code="ROAD-RING-ROAD", seed_way_ids={101, 102}, ways=self.ways,
            adjacency=graph, max_km=1.0,
        )
        self.assertEqual(result["gaps_after"], 1)
        self.assertEqual(result["filled_way_ids"], [])
        self.assertEqual(result["km_closed"], 0.0)
        self.assertEqual(len(result["unresolved_gaps"]), result["gaps_after"])
        self.assertIn("coordinates", result["unresolved_gaps"][0]["endpoint_a"])

    def test_named_other_road_is_never_used_as_a_connector(self):
        self.elements[2]["tags"]["name"] = "Different Expressway"
        self.ways, self.adjacency = build_road_graph(self.elements)
        graph = filter_graph_for_entity(
            self.ways, self.adjacency, {normalize("Ring Road")}, {normalize("R1")}
        )
        result = connect_seed_components(
            entity_code="ROAD-RING-ROAD", seed_way_ids={101, 102}, ways=self.ways,
            adjacency=graph, max_km=3.0,
        )
        self.assertEqual(result["gaps_after"], 1)
        self.assertEqual(result["filled_way_ids"], [])

    def test_matching_ref_permits_the_real_intermediate_way(self):
        self.elements[2]["tags"]["ref"] = "R1"
        self.elements[2]["tags"]["name"] = "Different Local Label"
        self.ways, self.adjacency = build_road_graph(self.elements)
        graph = filter_graph_for_entity(
            self.ways, self.adjacency, {normalize("Ring Road")}, {normalize("R1")}
        )
        result = connect_seed_components(
            entity_code="ROAD-RING-ROAD", seed_way_ids={101, 102}, ways=self.ways,
            adjacency=graph, max_km=3.0,
        )
        self.assertEqual(result["filled_way_ids"], [103])


if __name__ == "__main__":
    unittest.main()
