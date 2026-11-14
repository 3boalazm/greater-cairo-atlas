import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contextPath = new URL("../public/road-network.geojson", import.meta.url);
const detailPath = new URL("../public/road-network-detail.geojson", import.meta.url);
const entityMapPath = new URL("../data/derived/entity-map-geometries.json", import.meta.url);
const featurePath = new URL("../data/features/features.geojson", import.meta.url);
const reportPath = new URL("../data/features/match-report.json", import.meta.url);

describe("separate OSM road context and entity map geometries", () => {
  it("keeps the context layer non-entity and attributed in both zoom generalizations", async () => {
    for (const path of [contextPath, detailPath]) {
      const collection = JSON.parse(await readFile(path, "utf8")) as {
        type: string;
        features: Array<{ properties: Record<string, unknown> }>;
      };
      expect(collection.type).toBe("FeatureCollection");
      expect(collection.features.length).toBeGreaterThan(0);
      for (const feature of collection.features) {
        expect(feature.properties.context_only).toBe(true);
        expect(feature.properties.license).toBe("ODbL-1.0");
        expect(feature.properties.attribution).toContain("OpenStreetMap contributors");
        expect(feature.properties).not.toHaveProperty("entity_code");
        expect(feature.properties).not.toHaveProperty("code");
      }
    }
  });

  it("uses merged display geometry instead of adding context roads to entity features", async () => {
    const [mapJson, collection] = await Promise.all([
      readFile(entityMapPath, "utf8").then((text) => JSON.parse(text) as { geometries: Record<string, { geometry: unknown; attribution: string[] }> }),
      readFile(featurePath, "utf8").then((text) => JSON.parse(text) as { features: Array<{ properties: { properties: Record<string, unknown> } }> }),
    ]);
    expect(mapJson.geometries["ROAD-RING-ROAD"]?.geometry).toBeDefined();
    expect(JSON.stringify(mapJson.geometries["ROAD-RING-ROAD"]?.geometry).length).toBeLessThan(100_000);
    expect(mapJson.geometries["ROAD-RING-ROAD"]?.attribution.join(" · ")).toContain("OpenStreetMap contributors");
    expect(collection.features.some((feature) => feature.properties.properties.context_only === true)).toBe(false);
    expect(collection.features.some((feature) => feature.properties.properties.match_method === "gap_fill_graph")).toBe(true);
  });

  it("reports route-relation alignments and every unresolved gap with endpoints", async () => {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      road_route_relations: Array<{ entity_code: string; member_way_ids: number[] }>;
      road_route_entities: string[];
      road_gap_fill_totals: { gaps_after: number; gaps_closed: number; source_clipped_edges: number };
      regional_ring_west_patch: { status: string; old_endpoint_wgs84: number[]; accepted_patch_ways: Array<{ osm_id: number }> };
      source_clipped_road_edges: unknown[];
      road_gaps: Array<{ gap_type: string; coordinate_wgs84?: number[]; endpoint_a?: { coordinates: number[] }; endpoint_b?: { coordinates: number[] } }>;
    };
    expect(report.road_route_relations.length).toBeGreaterThan(0);
    expect(report.road_route_relations.every((relation) => relation.member_way_ids.length > 0)).toBe(true);
    expect(report.road_route_entities).toEqual(expect.arrayContaining(report.road_route_relations.map((relation) => relation.entity_code)));
    expect(report.road_gaps.filter((gap) => gap.gap_type !== "source_clipped_edge")).toHaveLength(report.road_gap_fill_totals.gaps_after);
    expect(report.road_gaps.filter((gap) => gap.gap_type !== "source_clipped_edge")
      .every((gap) => gap.endpoint_a?.coordinates.length === 2 && gap.endpoint_b?.coordinates.length === 2)).toBe(true);
    expect(report.road_gaps.filter((gap) => gap.gap_type === "source_clipped_edge")).toHaveLength(report.road_gap_fill_totals.source_clipped_edges);
    expect(report.road_gap_fill_totals.source_clipped_edges).toBe(0);
    expect(report.source_clipped_road_edges).toHaveLength(0);
    expect(report.regional_ring_west_patch.status).toBe("closed_by_new_osm_extract");
    expect(report.regional_ring_west_patch.old_endpoint_wgs84).toEqual([30.5148, 29.7646]);
    expect(report.regional_ring_west_patch.accepted_patch_ways.map((way) => way.osm_id)).toEqual(expect.arrayContaining([502507459, 640834678]));
    expect(report.road_gap_fill_totals.gaps_closed).toBeGreaterThan(0);
  });
});
