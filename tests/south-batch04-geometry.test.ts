import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { selectedAreaFilter, SELECTED_AREA_GEOMETRY_FILTER } from "@/lib/atlas/map-selection-filters";

type Candidate = { osm_type: string; osm_id: number; osm_version: number; source_file: string; decision: string; tags: Record<string, string> };
type Feature = { id: string; geometry: { type: string; coordinates: unknown }; properties: { entity_code: string; osm_type: string; osm_id: number; osm_version: number; license: string; properties: { source: string; source_file: string; attribution: string } } };
type Point = { lon: number; lat: number };
type OsmElement = { type: string; id: number; version: number; tags: Record<string, string>; geometry?: Point[]; members?: Array<{ role: string; geometry: Point[] }> };

function positions(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") return [value as number[]];
  return value.flatMap(positions);
}

describe("South batch 04 geometry provenance", () => {
  it("pins the complete report, every OSM version, attribution, source and South bbox", async () => {
    const report = JSON.parse(await readFile("data/research/south-batch04/geometry_match_report.json", "utf8")) as {
      results: Array<{ entity_code: string; status: string; candidates: Candidate[] }>;
    };
    const data = JSON.parse(await readFile("data/features/features.geojson", "utf8")) as { features: Feature[] };
    const features = data.features.filter((f) => f.id.startsWith("SOUTH04-"));
    expect(report.results).toHaveLength(31);
    expect(new Set(report.results.map((r) => r.entity_code)).size).toBe(31);
    expect(report.results.filter((r) => r.status === "matched")).toHaveLength(6);
    expect(features).toHaveLength(41);
    const files = new Map<string, Map<string, OsmElement>>();
    for (const f of features) {
      const p = f.properties;
      expect(p.license).toBe("ODbL-1.0");
      expect(p.properties.source).toBe("OpenStreetMap");
      expect(p.properties.attribution).toContain("OpenStreetMap contributors, ODbL");
      expect(p.osm_version).toBeGreaterThan(0);
      const result = report.results.find((r) => r.entity_code === p.entity_code);
      expect(result?.status).toBe("matched");
      const candidate = result?.candidates.find((c) => c.decision === "matched" && c.osm_type === p.osm_type && c.osm_id === p.osm_id);
      expect(candidate?.osm_version).toBe(p.osm_version);
      expect(candidate?.source_file).toBe(p.properties.source_file);
      if (!files.has(p.properties.source_file)) {
        const raw = JSON.parse(gunzipSync(await readFile(`data/raw/${p.properties.source_file}`)).toString("utf8")) as { elements: OsmElement[] };
        files.set(p.properties.source_file, new Map(raw.elements.map((e) => [`${e.type}/${e.id}`, e])));
      }
      const original = files.get(p.properties.source_file)!.get(`${p.osm_type}/${p.osm_id}`);
      expect(original?.version).toBe(p.osm_version);
      expect(original?.tags).toEqual(candidate?.tags);
      const coords = positions(f.geometry.coordinates);
      expect(coords.length).toBeGreaterThan(0);
      expect(coords.every(([lon, lat]) => lon! >= 31.15 && lon! <= 31.45 && lat! >= 29.75 && lat! <= 30.08)).toBe(true);
      if (original?.type === "way") {
        const sourceCoordinates = original.geometry!.map(({ lon, lat }) => [lon, lat]);
        expect(f.geometry.coordinates).toEqual(f.geometry.type === "Polygon" ? [sourceCoordinates] : sourceCoordinates);
      } else if (original?.type === "relation") {
        const sourceCoordinates = original.members!.flatMap((m) => m.geometry.map(({ lon, lat }) => `${lon},${lat}`)).sort();
        expect(coords.map(([lon, lat]) => `${lon},${lat}`).sort()).toEqual(sourceCoordinates);
      }
      if (p.entity_code.startsWith("ROAD-")) {
        expect(f.geometry.type).toBe("LineString");
        expect(original?.tags.name).toMatch(/^محور /);
      } else expect(f.geometry.type).toMatch(/^(Multi)?Polygon$/);
    }
    const lake = features.find((f) => f.properties.entity_code === "LANDMARK-EIN-EL-SIRA")!;
    expect(lake.properties.osm_type).toBe("relation");
    expect(lake.properties.osm_id).toBe(16855202);
    expect((lake.geometry.coordinates as unknown[]).length).toBe(2); // outer ring and OSM inner ring
    for (const result of report.results.filter((r) => r.status !== "matched")) {
      expect(features.some((f) => f.properties.entity_code === result.entity_code)).toBe(false);
    }
  });

  it("keeps selection fill restricted to polygonal geometry", () => {
    expect(SELECTED_AREA_GEOMETRY_FILTER).toEqual(["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]]);
    expect(selectedAreaFilter("ROAD-YASSER-RIZK")).toContainEqual(SELECTED_AREA_GEOMETRY_FILTER);
  });
});
