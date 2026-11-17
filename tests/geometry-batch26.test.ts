import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { loadAndValidateSeedDir, summarizeValidatedSeedBundle } from "@/lib/atlas/seed";

type Accept = {
  entity_code: string;
  osm_type: string;
  osm_id: number;
  osm_version: number;
  geometry_kind: string;
  source_kind: "archived_overpass" | "nominatim_lookup";
  source_file: string;
};
type Feature = {
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties: {
    entity_code: string;
    osm_type: string;
    osm_id: number;
    osm_version: number;
    license: string;
    properties: {
      source_file: string;
      attribution: string;
      osm_tags: Record<string, string>;
      source_ids: { osm_type: string; osm_id: number; osm_version: number };
      match_method: string;
    };
  };
};
type DerivedEntry = {
  geometry: { type: string; coordinates: unknown };
  license: string[];
  attribution: string[];
  retrieval_dates: string[];
};

const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha256File = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");

const ACCEPTS_PATH = "data/research/geometry-batch26/accepts.json";
const ARCHIVE_PATH = "data/raw/cairo-osm-east-batch26-2026-11-17.json";
const FEATURES_PATH = "data/features/features.geojson";
const DERIVED_PATH = "data/derived/entity-map-geometries.json";
const MANIFEST_PATH = "data/features/manifest.json";
const REPORT_PATH = "data/research/geometry-batch26/geometry_import_report.json";

// Pinned from main (commit 598e9f1): hash of compact JSON.stringify of
// `git show main:data/features/features.geojson | ... .features.slice(0, 3031)`,
// i.e. every feature that existed before Batch 26. Produced with:
//   node -e "import('node:crypto').then(({createHash}) => process.stdout.write(createHash('sha256').update(JSON.stringify(features.slice(0, 3031))).digest('hex')))"
const FEATURES_FIRST_3031_HASH = "96e84f2fc17e0d5584d4149cbed48951fa215fea5fd62b87164f78991f4eb222";
// Pinned from main (commit 598e9f1): hash of compact JSON.stringify of all 280
// pre-existing entity-map geometry entries (main holds no Batch 26 entries).
// Verified identical to the current tree once the 30 Batch 26 codes are removed.
const DERIVED_PREEXISTING_280_HASH = "28c4ed153058b24053442628102cc0e5266af5f05288933b5876ec66a421e790";

function retrievalDate(sourceFile: string): string {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(sourceFile);
  if (!match) throw new Error(`no retrieval date in ${sourceFile}`);
  return match[1]!;
}

function sourcePath(file: string): string {
  return file.startsWith("data/") ? file : `data/raw/${file}`;
}

describe("Batch 26 reviewed OSM map shapes", () => {
  it("the new archive is committed byte-for-byte and its sha256 matches accepts.json", async () => {
    const accepts = (await read(ACCEPTS_PATH)) as {
      new_archive: { file: string; sha256: string };
      accepts: Accept[];
    };
    expect(accepts.accepts).toHaveLength(30);
    expect(await sha256File(ARCHIVE_PATH)).toBe(accepts.new_archive.sha256);
  });

  it("adds exactly 30 BATCH26- features, one per accept code, appended after the pre-existing features", async () => {
    const [accepts, collection] = await Promise.all([read(ACCEPTS_PATH), read(FEATURES_PATH)]);
    const entries = accepts.accepts as Accept[];
    const features = collection.features as Feature[];
    const codes = new Set(entries.map((entry) => entry.entity_code));
    expect(codes.size).toBe(30);

    const batch26 = features.filter((feature) => feature.id.startsWith("BATCH26-"));
    expect(batch26).toHaveLength(30);
    expect(new Set(batch26.map((feature) => feature.properties.entity_code)).size).toBe(30);
    expect(new Set(batch26.map((feature) => feature.properties.entity_code))).toEqual(codes);
    // no entity code has more than one feature
    expect(features.filter((feature) => codes.has(feature.properties.entity_code))).toHaveLength(30);
    // none of the 30 codes had a feature before Batch 26
    expect(features.filter((feature) => codes.has(feature.properties.entity_code) && !feature.id.startsWith("BATCH26-"))).toHaveLength(0);

    expect(features).toHaveLength(3061);
    expect(features.slice(0, 3031).every((feature) => !feature.id.startsWith("BATCH26-"))).toBe(true);
    expect(hash(features.slice(0, 3031))).toBe(FEATURES_FIRST_3031_HASH);
    expect(features.slice(-30).every((feature) => feature.id.startsWith("BATCH26-"))).toBe(true);
    expect(batch26.map((feature) => feature.id).sort()).toEqual(
      entries.map((entry) => `BATCH26-${entry.osm_type.toUpperCase()}-${entry.osm_id}-${entry.entity_code}`).sort(),
    );
  });

  it("pins every BATCH26- feature to its versioned source, licensing, attribution, geometry kind and source file", async () => {
    const [accepts, collection] = await Promise.all([read(ACCEPTS_PATH), read(FEATURES_PATH)]);
    const entries = accepts.accepts as Accept[];
    const features = collection.features as Feature[];
    const byCode = new Map(features.filter((feature) => feature.id.startsWith("BATCH26-")).map((feature) => [feature.properties.entity_code, feature]));

    for (const entry of entries) {
      const feature = byCode.get(entry.entity_code);
      expect(feature).toBeDefined();
      const p = feature!.properties;
      expect(p.osm_type).toBe(entry.osm_type);
      expect(p.osm_id).toBe(entry.osm_id);
      expect(p.osm_version).toBe(entry.osm_version);
      expect(p.license).toBe("ODbL-1.0");
      expect(p.properties.attribution).toContain("OpenStreetMap");
      expect(p.properties.match_method).toBe("reviewed identity (Batch 26 accepts.json)");
      expect(feature!.geometry.type).toBe(entry.geometry_kind);
      expect(p.properties.source_file).toBe(entry.source_file);
      expect(p.properties.source_ids).toEqual({ osm_type: entry.osm_type, osm_id: entry.osm_id, osm_version: entry.osm_version });
    }
  });

  it("nominatim_lookup features deep-equal the archive lookup geometry and meta tags", async () => {
    const [accepts, archive, collection] = await Promise.all([
      read(ACCEPTS_PATH),
      read(ARCHIVE_PATH),
      read(FEATURES_PATH),
    ]);
    const entries = accepts.accepts as Accept[];
    const lookupArchive = archive as { lookup: Array<{ osm_type: string; osm_id: number; geojson: unknown }>; meta: Record<string, { version: number; tags: Record<string, string> }> };
    const lookup = new Map(lookupArchive.lookup.map((item) => [`${item.osm_type}/${item.osm_id}`, item]));
    const features = collection.features as Feature[];
    const byCode = new Map(features.filter((feature) => feature.id.startsWith("BATCH26-")).map((feature) => [feature.properties.entity_code, feature]));

    const nominatim = entries.filter((entry) => entry.source_kind === "nominatim_lookup");
    expect(nominatim).toHaveLength(22);
    for (const entry of nominatim) {
      const feature = byCode.get(entry.entity_code)!;
      const item = lookup.get(`${entry.osm_type}/${entry.osm_id}`);
      expect(item).toBeDefined();
      expect(feature.geometry).toEqual(item!.geojson);
      const meta = lookupArchive.meta[`${entry.osm_type}${entry.osm_id}`];
      expect(meta).toBeDefined();
      expect(meta!.version).toBe(entry.osm_version);
      expect(byCode.get(entry.entity_code)!.properties.properties.osm_tags).toEqual(meta!.tags);
    }
  });

  it("archived_overpass features deep-equal the archived element tags and version", async () => {
    const [accepts, collection] = await Promise.all([read(ACCEPTS_PATH), read(FEATURES_PATH)]);
    const entries = accepts.accepts as Accept[];
    const features = collection.features as Feature[];
    const byCode = new Map(features.filter((feature) => feature.id.startsWith("BATCH26-")).map((feature) => [feature.properties.entity_code, feature]));

    const archived = entries.filter((entry) => entry.source_kind === "archived_overpass");
    expect(archived).toHaveLength(8);
    for (const entry of archived) {
      const elements = JSON.parse(gunzipSync(await readFile(`data/raw/${entry.source_file}`)).toString("utf8")).elements as Array<{ type: string; id: number; version: number; tags: Record<string, string> }>;
      const element = elements.find((item) => item.type === entry.osm_type && item.id === entry.osm_id);
      expect(element).toBeDefined();
      expect(element!.version).toBe(entry.osm_version);
      expect(byCode.get(entry.entity_code)!.properties.properties.osm_tags).toEqual(element!.tags);
    }
  });

  it("entity-map-geometries.json holds 310 entries, every accept code, and preserves the 280 pre-existing entries", async () => {
    const [accepts, derived] = await Promise.all([read(ACCEPTS_PATH), read(DERIVED_PATH)]);
    const entries = accepts.accepts as Accept[];
    const geometries = (derived as { geometries: Record<string, DerivedEntry> }).geometries;
    expect(Object.keys(geometries)).toHaveLength(310);
    const codes = new Set(entries.map((entry) => entry.entity_code));
    for (const code of codes) {
      const entry = geometries[code]!;
      expect(entry).toBeDefined();
      expect(entry.license).toEqual(["ODbL-1.0"]);
      expect(entry.attribution.some((text) => text.includes("OpenStreetMap"))).toBe(true);
      expect(entry.retrieval_dates).toEqual([retrievalDate(entries.find((e) => e.entity_code === code)!.source_file)]);
    }
    const preexisting = Object.fromEntries(Object.entries(geometries).filter(([code]) => !codes.has(code)));
    expect(Object.keys(preexisting)).toHaveLength(280);
    expect(hash(preexisting)).toBe(DERIVED_PREEXISTING_280_HASH);
  });

  it("manifest counts and source file checksums are updated additively", async () => {
    const manifest = await read(MANIFEST_PATH) as {
      feature_count: number;
      entity_page_map_geometries: { entities_with_geometry: number };
      geometry_batch26: { feature_count: number; source_files: Array<{ file: string; sha256: string }> };
    };
    expect(manifest.feature_count).toBe(3061);
    expect(manifest.entity_page_map_geometries.entities_with_geometry).toBe(310);
    expect(manifest.geometry_batch26.feature_count).toBe(30);
    for (const source of manifest.geometry_batch26.source_files) {
      expect(source.sha256).toBe(await sha256File(sourcePath(source.file)));
    }
  });

  it("import report: 30 matched results, none rejected, two sector distances above 0.01", async () => {
    const [accepts, report] = await Promise.all([read(ACCEPTS_PATH), read(REPORT_PATH)]);
    const entries = accepts.accepts as Accept[];
    const results = report.results as Array<{ entity_code: string; decision: string; geometry_type: string; sector_distance: number | null; source_file: string }>;
    expect(results).toHaveLength(30);
    expect(results.every((result) => result.decision === "matched")).toBe(true);
    expect(results.some((result) => result.decision === "rejected")).toBe(false);
    const byCode = new Map(entries.map((entry) => [entry.entity_code, entry]));
    for (const result of results) {
      expect(byCode.get(result.entity_code)!.geometry_kind).toBe(result.geometry_type);
    }
    const far = results.filter((result) => (result.sector_distance ?? 0) > 0.01);
    expect(far.map((result) => result.entity_code).sort()).toEqual(["LANDMARK-NATIVITY-CATHEDRAL", "LANDMARK-NEW-PARLIAMENT"].sort());
  });

  it("seed and export counts are unchanged and 254 entities remain without a map shape", async () => {
    const [collection, derived, seed] = await Promise.all([read(FEATURES_PATH), read(DERIVED_PATH), loadAndValidateSeedDir()]);
    const report = summarizeValidatedSeedBundle(seed);
    expect(seed.entities).toHaveLength(564);
    expect(report.entitiesCount).toBe(564);
    expect(report.factsCount).toBe(2849);
    expect(report.evidenceCount).toBe(810);
    expect(report.factEvidenceLinksCount).toBe(3202);
    const features = collection.features as Feature[];
    const geometries = derived as { geometries: Record<string, unknown> };
    const allFeatureCodes = new Set(features.map((feature) => feature.properties.entity_code));
    const withoutGeometry = seed.entities.filter((entity) => !allFeatureCodes.has(entity.code) && !(entity.code in geometries.geometries));
    expect(withoutGeometry).toHaveLength(254);
    expect(features).toHaveLength(3061);
  });
});
