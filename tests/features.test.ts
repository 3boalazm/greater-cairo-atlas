import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAtlasFeatures, parseAtlasFeatureQuery } from "@/lib/atlas/features-api";
import { loadAndValidateFeatureCollection } from "@/lib/atlas/features";
import { entitySeedSchema } from "@/lib/atlas/schema";
import { upsertValidatedSeedBundle, type SeedDbSession } from "@/lib/atlas/seed";

const roadEntity = entitySeedSchema.parse({
  code: "ROAD-RING-ROAD", name_ar: "الدائري", name_en: "Ring Road",
  entity_type: "road", sector: "REGIONAL", status: "operational", aliases: [],
});

function geojsonFeature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[31.1, 30.0], [31.2, 30.1]] },
    properties: {
      code: "OSM-WAY-100", entity_code: roadEntity.code, evidence_code: null,
      srid: 4326, osm_type: "way", osm_id: 100, osm_version: 3, license: "ODbL-1.0",
      properties: { source: "OpenStreetMap", attribution: "© OpenStreetMap contributors, ODbL 1.0", retrieval_date: "2026-11-13" },
      ...overrides,
    },
  };
}

describe("feature ingestion validation and GeoJSON API", () => {
  const tempDirs: string[] = [];
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });
  async function featureFile(features: unknown[]) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "gca-features-"));
    tempDirs.push(dir);
    const filename = path.join(dir, "features.geojson");
    await writeFile(filename, JSON.stringify({ type: "FeatureCollection", features }));
    return filename;
  }

  it("loads an attributed, WGS84 feature inside the Greater Cairo bbox and matches only existing entities", async () => {
    const features = await loadAndValidateFeatureCollection(await featureFile([geojsonFeature()]), [roadEntity]);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({ code: "OSM-WAY-100", entity_code: roadEntity.code, license: "ODbL-1.0", osm_type: "way", osm_id: 100, osm_version: 3 });
  });

  it("rejects geometry outside the Greater Cairo bbox and never creates unknown entities", async () => {
    const outside = JSON.parse(JSON.stringify(geojsonFeature())) as Record<string, unknown>;
    outside.geometry = { type: "Point", coordinates: [32.2, 30.0] };
    await expect(loadAndValidateFeatureCollection(await featureFile([outside]), [roadEntity])).rejects.toThrow(/Greater Cairo WGS84 bbox/);
    const unknown = geojsonFeature({ entity_code: "ROAD-NOT-IN-SEED" });
    await expect(loadAndValidateFeatureCollection(await featureFile([unknown]), [roadEntity])).rejects.toThrow(/never create entities/);
  });

  it("requires documented official alignment provenance for planned/unknown entities", async () => {
    const planned = entitySeedSchema.parse({ ...roadEntity, code: "TRANSIT-METRO-L4", entity_type: "transit_line", status: "planned" });
    const candidate = geojsonFeature({ entity_code: planned.code });
    await expect(loadAndValidateFeatureCollection(await featureFile([candidate]), [planned])).rejects.toThrow(/requires official_alignment metadata and linked official evidence/);
  });

  it("parses type, sector, status and bounded zoom query parameters", () => {
    expect(parseAtlasFeatureQuery(new URLSearchParams("type=road&sector=REGIONAL&status=operational&zoom=8"))).toEqual({ type: "road", sector: "REGIONAL", status: "operational", zoom: 8 });
    expect(() => parseAtlasFeatureQuery(new URLSearchParams("type=fiction"))).toThrow(/Invalid feature query/);
    expect(() => parseAtlasFeatureQuery(new URLSearchParams("zoom=99"))).toThrow(/Invalid feature query/);
  });

  it("upserts feature rows idempotently within the seed transaction", async () => {
    const featureRows = await loadAndValidateFeatureCollection(await featureFile([geojsonFeature()]), [roadEntity]);
    const statements: string[] = [];
    const session: SeedDbSession = {
      async connect() {},
      async query<Row = Record<string, unknown>>(text: string) {
        statements.push(text.trim());
        if (text.includes("INSERT INTO entities")) {
          return { rows: [{ id: "entity-uuid", code: roadEntity.code }] as unknown as Row[] };
        }
        return { rows: [] };
      },
      async end() {},
    };
    const result = await upsertValidatedSeedBundle({ entities: [roadEntity], evidence: [], facts: [] }, () => session, featureRows);
    expect(result.featuresCount).toBe(1);
    expect(statements.some((sql) => sql.includes("INSERT INTO features") && sql.includes("ON CONFLICT (code) DO UPDATE"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("full-syncs stale features and fact-evidence links atomically without deleting seed records", async () => {
    const featureRows = await loadAndValidateFeatureCollection(await featureFile([geojsonFeature()]), [roadEntity]);
    const statements: string[] = [];
    let inTransaction = false;
    const session: SeedDbSession = {
      async connect() {},
      async query<Row = Record<string, unknown>>(text: string) {
        const sql = text.trim();
        statements.push(sql);
        if (sql === "BEGIN") inTransaction = true;
        if (sql === "COMMIT") inTransaction = false;
        if (sql.startsWith("SELECT COUNT(*)::int AS count FROM features")) return { rows: [{ count: 2 }] as unknown as Row[] };
        if (sql.startsWith("SELECT COUNT(*)::int AS count FROM entities")) return { rows: [{ count: 1 }] as unknown as Row[] };
        if (sql.startsWith("SELECT COUNT(*)::int AS count FROM facts")) return { rows: [{ count: 3 }] as unknown as Row[] };
        if (sql.startsWith("SELECT COUNT(*)::int AS count FROM evidence")) return { rows: [{ count: 2 }] as unknown as Row[] };
        if (sql.startsWith("SELECT COUNT(*)::int AS count")) return { rows: [{ count: 1 }] as unknown as Row[] };
        if (sql.startsWith("INSERT INTO entities")) return { rows: [{ id: "entity-current", code: roadEntity.code }] as unknown as Row[] };
        if (sql.startsWith("DELETE FROM fact_evidence fe")) {
          expect(inTransaction).toBe(true);
          return { rows: [{ fact_id: "stale-fact", evidence_id: "stale-evidence" }, { fact_id: "other-fact", evidence_id: "other-evidence" }] as unknown as Row[] };
        }
        if (sql.startsWith("DELETE FROM features")) {
          expect(inTransaction).toBe(true);
          return { rows: [{ code: "OSM-WAY-OLD-1" }, { code: "OSM-WAY-OLD-2" }] as unknown as Row[] } as unknown as { rows: Row[] };
        }
        return { rows: [] };
      },
      async end() {},
    };
    const result = await upsertValidatedSeedBundle(
      { entities: [roadEntity], evidence: [], facts: [] },
      () => session,
      featureRows,
    );
    expect(result.importSync).toEqual({
      featuresDeletedCount: 2,
      factEvidenceLinksDeletedCount: 2,
      entitiesNotInSeedCount: 1,
      factsNotInSeedCount: 3,
      evidenceNotInSeedCount: 2,
      databasePreviewAvailable: true,
    });
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.some((sql) => sql.startsWith("DELETE FROM entities") || sql.startsWith("DELETE FROM facts") || sql.startsWith("DELETE FROM evidence"))).toBe(false);
    expect(statements.findIndex((sql) => sql.startsWith("DELETE FROM features"))).toBeGreaterThan(statements.indexOf("BEGIN"));
  });

  it("commits the automatic import checksum atomically and skips unchanged datasets", async () => {
    let currentChecksum: string | null = null;
    const checksum = "a".repeat(64);
    const statements: string[] = [];
    const createSession = (): SeedDbSession => ({
      async connect() {},
      async query<Row = Record<string, unknown>>(text: string, values?: unknown[]) {
        const sql = text.trim();
        statements.push(sql);
        if (sql.startsWith("SELECT checksum FROM import_runs")) {
          return { rows: (currentChecksum ? [{ checksum: currentChecksum }] : []) as unknown as Row[] };
        }
        if (sql.startsWith("INSERT INTO entities")) {
          return { rows: [{ id: "entity-uuid", code: roadEntity.code }] as unknown as Row[] };
        }
        if (sql.startsWith("INSERT INTO import_runs")) currentChecksum = String(values?.[1]);
        return { rows: [] };
      },
      async end() {},
    });
    const bundle = { entities: [roadEntity], evidence: [], facts: [] };
    const first = await upsertValidatedSeedBundle(bundle, createSession, [], { datasetKey: "atlas-seed-features", checksum });
    expect(first.importSkipped).toBe(false);
    expect(statements.indexOf("BEGIN")).toBeLessThan(statements.findIndex((sql) => sql.startsWith("INSERT INTO entities")));
    expect(statements.some((sql) => sql.startsWith("INSERT INTO import_runs"))).toBe(true);
    expect(statements.at(-1)).toBe("COMMIT");

    statements.length = 0;
    const second = await upsertValidatedSeedBundle(bundle, createSession, [], { datasetKey: "atlas-seed-features", checksum });
    expect(second.importSkipped).toBe(true);
    expect(statements.some((sql) => sql.startsWith("INSERT INTO entities"))).toBe(false);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("returns a small standard GeoJSON FeatureCollection with provenance and entity properties", async () => {
    const collection = await getAtlasFeatures({ zoom: 8, type: "road" }, async (filters) => {
      expect(filters).toMatchObject({ zoom: 8, type: "road" });
      return [{
        code: "OSM-WAY-100", entity_code: roadEntity.code, name_ar: roadEntity.name_ar,
        name_en: roadEntity.name_en, entity_type: "road", status: "operational",
        geometry: JSON.stringify({ type: "LineString", coordinates: [[31.1, 30], [31.2, 30.1]] }),
        license: "ODbL-1.0", attribution: "© OpenStreetMap contributors, ODbL 1.0",
        source: "OpenStreetMap", retrieval_date: "2026-11-13", source_ids: { osm_type: "way", osm_id: 100, osm_version: 3 },
      }];
    });
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.metadata).toEqual({
      data_license: "© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0",
      geometry_license: "© OpenStreetMap contributors, ODbL 1.0",
      contact: "01092500454 · 3boalazm@gmail.com",
    });
    expect(collection.features[0]).toMatchObject({
      type: "Feature", id: "OSM-WAY-100",
      properties: { entity_code: roadEntity.code, type: "road", status: "operational", license: "ODbL-1.0", attribution: "© OpenStreetMap contributors, ODbL 1.0" },
      geometry: { type: "LineString" },
    });
  });
});
