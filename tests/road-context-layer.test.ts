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
      road_gap_fill_totals: { gaps_after: number; gaps_closed: number };
      road_gaps: Array<{ endpoint_a: { coordinates: number[] }; endpoint_b: { coordinates: number[] } }>;
    };
    expect(report.road_route_relations.length).toBeGreaterThan(0);
    expect(report.road_route_relations.every((relation) => relation.member_way_ids.length > 0)).toBe(true);
    expect(report.road_route_entities).toEqual(expect.arrayContaining(report.road_route_relations.map((relation) => relation.entity_code)));
    expect(report.road_gaps).toHaveLength(report.road_gap_fill_totals.gaps_after);
    expect(report.road_gaps.every((gap) => gap.endpoint_a.coordinates.length === 2 && gap.endpoint_b.coordinates.length === 2)).toBe(true);
    expect(report.road_gap_fill_totals.gaps_closed).toBeGreaterThan(0);
  });
});
