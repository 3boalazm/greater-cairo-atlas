import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { SELECTED_AREA_GEOMETRY_FILTER } from "@/lib/atlas/map-selection-filters";

type Candidate = { osm_type: string; osm_id: number; osm_version: number; tags: Record<string, string>; decision: string };
type Result = { entity_code: string; entity_type: string; status: string; candidates: Candidate[] };
type Feature = { id: string; geometry: { type: string; coordinates: unknown }; properties: { entity_code: string; osm_type: string; osm_id: number; osm_version: number; license: string; properties: { source: string; source_file: string; attribution: string; osm_tags: Record<string, string> } } };
type Osm = { type: string; id: number; version: number; lat?: number; lon?: number; tags: Record<string, string>; geometry?: Array<{lat: number; lon: number}>; members?: Array<{geometry?: Array<{lat: number; lon: number}>}> };
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
function positions(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  if (typeof v[0] === "number" && typeof v[1] === "number") return [v as number[]];
  return v.flatMap(positions);
}

describe("Batch 20 OSM geometry", () => {
  it("preserves the baseline and adds exactly one feature per matched entity", async () => {
    const [baseline, report, collection, derived, manifest] = await Promise.all([
      json("tests/fixtures/batch20/baseline.json"), json("data/research/geometry-batch20/geometry_match_report.json"),
      json("data/features/features.geojson"), json("data/derived/entity-map-geometries.json"), json("data/features/manifest.json"),
    ]);
    const all = collection.features as Feature[];
    const old = all.filter((f) => !f.id.startsWith("BATCH20-"));
    const added = all.filter((f) => f.id.startsWith("BATCH20-"));
    const results = report.results as Result[];
    const matched = results.filter((r) => r.status === "matched").map((r) => r.entity_code).sort();
    expect(results).toHaveLength(251);
    expect(new Set(results.map((r) => r.entity_code)).size).toBe(251);
    expect(results.every((r) => ["matched", "ambiguous", "not_found"].includes(r.status))).toBe(true);
    expect(matched).toHaveLength(31);
    expect(added.map((f) => f.properties.entity_code).sort()).toEqual(matched);
    expect(new Set(added.map((f) => f.properties.entity_code)).size).toBe(matched.length);
    expect(old).toHaveLength(baseline.feature_count);
    expect(hash(old)).toBe(baseline.feature_hash);
    const before = new Set(old.map((f) => f.properties.entity_code));
    const after = new Set(all.map((f) => f.properties.entity_code));
    expect(before.size).toBe(baseline.feature_entities);
    expect(matched.every((code) => !before.has(code))).toBe(true);
    expect(after.size - before.size).toBe(matched.length);
    const oldDerived = Object.fromEntries(Object.entries(derived.geometries).filter(([code]) => !matched.includes(code)));
    expect(Object.keys(oldDerived)).toHaveLength(baseline.derived_count);
    expect(hash(oldDerived)).toBe(baseline.derived_hash);
    expect(Object.keys(derived.geometries).length - baseline.derived_count).toBe(matched.length);
    expect(manifest.feature_count).toBe(all.length);
    expect(manifest.entity_page_map_geometries.entities_with_geometry).toBe(Object.keys(derived.geometries).length);
    for (const result of results.filter((r) => r.status !== "matched")) expect(after.has(result.entity_code)).toBe(false);
  });

  it("pins every new geometry to versioned ODbL OSM and the requested bbox", async () => {
    const [report, collection, compressed] = await Promise.all([json("data/research/geometry-batch20/geometry_match_report.json"), json("data/features/features.geojson"), readFile("data/raw/cairo-osm-geometry-batch20-2026-11-16.json.gz")]);
    const raw = JSON.parse(gunzipSync(compressed).toString("utf8")) as { elements: Osm[] };
    expect(raw.elements).toHaveLength(330);
    const source = new Map(raw.elements.map((e) => [`${e.type}/${e.id}`, e]));
    for (const f of (collection.features as Feature[]).filter((x) => x.id.startsWith("BATCH20-"))) {
      const p = f.properties;
      const original = source.get(`${p.osm_type}/${p.osm_id}`)!;
      expect(original).toBeDefined(); expect(p.osm_id).toBeGreaterThan(0); expect(p.osm_version).toBeGreaterThan(0);
      expect(original.version).toBe(p.osm_version);
      expect(original.tags).toEqual(p.properties.osm_tags);
      expect(p.license).toBe("ODbL-1.0");
      expect(p.properties.source).toBe("OpenStreetMap");
      expect(p.properties.source_file).toBe("cairo-osm-geometry-batch20-2026-11-16.json.gz");
      expect(p.properties.attribution).toContain("OpenStreetMap contributors, ODbL");
      const result = (report.results as Result[]).find((r) => r.entity_code === p.entity_code)!;
      expect(result.status).toBe("matched");
      expect(result.candidates.find((c) => c.osm_type === p.osm_type && c.osm_id === p.osm_id && c.osm_version === p.osm_version)?.decision).toBe("matched");
      const coords = positions(f.geometry.coordinates);
      expect(coords.length).toBeGreaterThan(0);
      expect(coords.every(([lon, lat]) => lon! >= 30.7 && lon! <= 31.9 && lat! >= 29.7 && lat! <= 30.5)).toBe(true);
      const originalCoords = original.type === "node" ? [[original.lon, original.lat]] : original.type === "way" ? original.geometry!.map((x) => [x.lon, x.lat]) : original.members!.flatMap((m) => (m.geometry ?? []).map((x) => [x.lon, x.lat]));
      const sourceSet = new Set(originalCoords.map((p) => p.join(",")));
      expect(coords.every((p) => sourceSet.has(p.join(",")))).toBe(true);
      if (result.entity_type === "district" || result.entity_type === "city") expect(original.tags.place || original.tags.boundary).toBeTruthy();
      if (result.entity_type === "transit_stop") expect(original.tags.railway === "station" || original.tags.public_transport === "station" || original.tags.amenity === "bus_station").toBe(true);
    }
    expect(SELECTED_AREA_GEOMETRY_FILTER).toEqual(["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]]);
  });
});
