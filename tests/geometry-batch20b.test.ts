import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { loadAndValidateSeedDir } from "@/lib/atlas/seed";
import { getStaticAtlasDataset } from "@/lib/atlas/static-dataset";

type Candidate = { osm_type: string; osm_id: number; osm_version: number; source_file: string; tags: Record<string, string>; decision: string };
type Result = { entity_code: string; entity_type: string; entity_status: string; status: string; candidates: Candidate[] };
type Feature = { id: string; geometry: { type: string; coordinates: unknown }; properties: { entity_code: string; osm_type: string; osm_id: number; osm_version: number; license: string; properties: { source_file: string; attribution: string; osm_tags: Record<string, string>; source_ids: { members?: Array<{ osm_type: string; osm_id: number; osm_version: number; source_file: string; tags: Record<string, string> }> } } } };
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function positions(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number" && typeof value[1] === "number") return [value as number[]];
  return value.flatMap(positions);
}

describe("Batch 20b offline OSM", () => {
  it("preserves the complete baseline and adds one feature and page geometry per match", async () => {
    const [before, report, collection, derived, manifest, seed] = await Promise.all([
      read("tests/fixtures/batch20b/baseline.json"), read("data/research/geometry-batch20b/geometry_match_report.json"),
      read("data/features/features.geojson"), read("data/derived/entity-map-geometries.json"), read("data/features/manifest.json"), loadAndValidateSeedDir(),
    ]);
    const results = report.results as Result[];
    const matched = results.filter((r) => r.status === "matched").map((r) => r.entity_code);
    const features = collection.features as Feature[];
    const old = features.filter((f) => !f.id.startsWith("BATCH20B-"));
    const added = features.filter((f) => f.id.startsWith("BATCH20B-"));
    const prior = new Set(old.map((f) => f.properties.entity_code));
    const baselineDerived = Object.fromEntries(Object.entries(derived.geometries).filter(([code]) => !matched.includes(code)));
    expect(before.feature_count).toBe(3014); expect(before.feature_entities).toBe(263); expect(before.derived_count).toBe(263);
    expect(hash(old)).toBe(before.feature_hash); expect(hash(baselineDerived)).toBe(before.derived_hash);
    expect(old).toHaveLength(before.feature_count); expect(prior.size).toBe(before.feature_entities);
    expect(results).toHaveLength(272); expect(report.batch20_unmatched_in_scope).toBe(220); expect(report.other_missing_in_scope).toBe(52);
    expect(new Set(results.map((r) => r.entity_code)).size).toBe(272);
    const east = new Set((await readFile("data/research/east-batch07/entities.csv", "utf8")).split(/\r?\n/).slice(1).filter(Boolean).map((row) => row.split(",")[0]));
    const east08 = new Set((await readFile("data/research/east-batch08/entities.csv", "utf8")).split(/\r?\n/).slice(1).filter(Boolean).map((row) => row.split(",")[0]));
    const missing = seed.entities.filter((e) => !prior.has(e.code) && !(e.code in baselineDerived)).map((e) => e.code);
    expect(new Set(results.map((r) => r.entity_code))).toEqual(new Set(missing.filter((code) => !east.has(code) && !east08.has(code))));
    expect(new Set(missing.filter((code) => east.has(code)))).toEqual(east);
    expect(new Set(missing.filter((code) => east08.has(code)))).toEqual(east08);
    expect(added).toHaveLength(matched.length); expect(new Set(matched).size).toBe(matched.length);
    expect(added.map((f) => f.properties.entity_code).sort()).toEqual([...matched].sort());
    expect(matched.every((code) => !prior.has(code) && !(code in baselineDerived))).toBe(true);
    expect(new Set(features.map((f) => f.properties.entity_code)).size).toBe(before.feature_entities + matched.length);
    expect(Object.keys(derived.geometries)).toHaveLength(before.derived_count + matched.length);
    expect(manifest.feature_count).toBe(before.feature_count + matched.length);
    expect(manifest.entity_page_map_geometries.entities_with_geometry).toBe(before.derived_count + matched.length);
    expect(results.filter((r) => ["planned", "approved_planned", "under_construction"].includes(r.entity_status)).every((r) => r.status === "policy_excluded" && !matched.includes(r.entity_code))).toBe(true);
    const data = await getStaticAtlasDataset();
    expect(data.features).toHaveLength(features.length);
  });

  it("pins additions to versioned archived objects, tags, source coordinates, licensing and bbox", async () => {
    const [report, collection] = await Promise.all([read("data/research/geometry-batch20b/geometry_match_report.json"), read("data/features/features.geojson")]);
    const cache = new Map<string, Array<{ type: string; id: number; version?: number; lat?: number; lon?: number; geometry?: Array<{lat: number; lon: number}>; members?: Array<{geometry?: Array<{lat: number; lon: number}>}>; tags: Record<string, string> }>>();
    for (const f of (collection.features as Feature[]).filter((item) => item.id.startsWith("BATCH20B-"))) {
      const p = f.properties, file = p.properties.source_file;
      if (!cache.has(file)) cache.set(file, JSON.parse(gunzipSync(await readFile(`data/raw/${file}`)).toString("utf8")).elements);
      const source = cache.get(file)!.find((e) => e.type === p.osm_type && e.id === p.osm_id && e.version === p.osm_version)!;
      expect(source).toBeDefined(); expect(p.osm_version).toBeGreaterThan(0); expect(p.license).toBe("ODbL-1.0");
      expect(p.properties.attribution).toContain("OpenStreetMap contributors"); expect(p.properties.osm_tags).toEqual(source.tags);
      const audit = (report.results as Result[]).find((r) => r.entity_code === p.entity_code)!;
      expect(audit.candidates.some((c) => c.osm_id === p.osm_id && c.osm_type === p.osm_type && c.decision === "matched")).toBe(true);
      const coords = positions(f.geometry.coordinates);
      expect(coords.length).toBeGreaterThan(0);
      expect(coords.every(([x, y]) => x! >= 30.7 && x! <= 31.9 && y! >= 29.7 && y! <= 30.5)).toBe(true);
      const members = p.properties.source_ids.members;
      const sourceObjects = members ? await Promise.all(members.map(async (member) => {
        if (!cache.has(member.source_file)) cache.set(member.source_file, JSON.parse(gunzipSync(await readFile(`data/raw/${member.source_file}`)).toString("utf8")).elements);
        const item = cache.get(member.source_file)!.find((e) => e.type === member.osm_type && e.id === member.osm_id && e.version === member.osm_version)!;
        expect(item.tags).toEqual(member.tags);
        expect(audit.candidates.some((c) => c.osm_id === member.osm_id && c.osm_type === member.osm_type && c.decision === "matched")).toBe(true);
        return item;
      })) : [source];
      const original = sourceObjects.flatMap((item) => item.type === "node" ? [[item.lon, item.lat]] : item.type === "way" ? item.geometry!.map((point) => [point.lon, point.lat]) : item.members!.flatMap((m) => (m.geometry ?? []).map((point) => [point.lon, point.lat])));
      const originals = new Set(original.map((point) => point.join(",")));
      expect(coords.every((p) => originals.has(p.join(",")))).toBe(true);
    }
  });
});
