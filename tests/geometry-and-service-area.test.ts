import { describe, expect, it } from "vitest";
import { findGeometryAlternatives } from "@/lib/atlas/geometry-comparisons";
import { approximateRadiusPolygon } from "@/lib/atlas/service-area";
import type { AtlasFeature } from "@/components/atlas/atlas-client";
const feature = (id: string, osm_id: number, coords: number[][]): AtlasFeature => ({
  type: "Feature", id, geometry: { type: "LineString", coordinates: coords },
  properties: { code: id, entity_code: "TRANSIT-MONORAIL-EAST", name_ar: "مونوريل شرق النيل", name_en: "East Monorail", type: "transit_line", status: "planned", license: "ODbL-1.0", attribution: "OSM", source: "OpenStreetMap", retrieval_date: "2026-11-14", source_ids: { osm_type: "relation", osm_id } },
});
describe("researcher geometry tools", () => {
  it("compares only a distinct pair of complete OSM route relations", () => {
    const variants = [feature("A", 1, [[31, 30], [31.1, 30.1]]), feature("B", 2, [[31, 30], [31.2, 30.1]])];
    expect(findGeometryAlternatives(variants).get("TRANSIT-MONORAIL-EAST")).toHaveLength(2);
    expect(findGeometryAlternatives([variants[0]!]).size).toBe(0);
  });
  it("creates an approximate geodesic radius, closed polygon", () => {
    const polygon = approximateRadiusPolygon(31.2, 30.1, 500);
    expect(polygon.type).toBe("Polygon");
    expect(polygon.coordinates[0]).toHaveLength(65);
    const ring = polygon.coordinates[0]!;
    expect(ring[0]).toEqual(ring.at(-1));
    expect(ring[0]![1]).not.toBe(30.1);
  });
});
