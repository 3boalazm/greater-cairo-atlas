import path from "node:path";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import {
  GREATER_CAIRO_BBOX,
  ROAD_GEOMETRY_BBOX,
  REGIONAL_RING_ROAD_GEOMETRY_BBOX,
} from "@/lib/atlas/features";
import { runSeedImport } from "@/lib/atlas/seed";
import { ATLAS_FEATURES_SQL, featureSimplificationTolerance } from "@/lib/atlas/features-api";

const featurePath = path.resolve(process.cwd(), "data/features/features.geojson");
let db: PGlite;
let featureCount = 0;
let boundaryCount = 0;

async function insertRows<T>(rows: readonly T[], valuesFor: (row: T) => unknown[], insertSql: (start: number) => string, batchSize = 75) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = batch.flatMap(valuesFor);
    await db.query(insertSql(batch.length), values);
  }
}

describe("real PostGIS features SQL regression", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { postgis } });
    await db.exec(`
      CREATE EXTENSION postgis;
      CREATE TABLE entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        name_ar text NOT NULL,
        name_en text NOT NULL,
        entity_type text NOT NULL,
        sector text NOT NULL,
        status text NOT NULL,
        description text,
        aliases text[] NOT NULL DEFAULT '{}'
      );
      CREATE TABLE evidence (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        title text,
        url text,
        publisher text NOT NULL,
        source_type text NOT NULL,
        published_date date,
        accessed_date date NOT NULL,
        notes text,
        published_date_precision text NOT NULL DEFAULT 'day'
      );
      CREATE TABLE facts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE,
        entity_id uuid NOT NULL REFERENCES entities(id),
        attribute text NOT NULL,
        value text NOT NULL,
        unit text,
        valid_as_of date,
        verification_state text NOT NULL,
        notes text,
        valid_as_of_precision text NOT NULL DEFAULT 'day'
      );
      CREATE TABLE fact_evidence (
        fact_id uuid NOT NULL REFERENCES facts(id),
        evidence_id uuid NOT NULL REFERENCES evidence(id),
        PRIMARY KEY (fact_id, evidence_id)
      );
      CREATE TABLE features (
        code text PRIMARY KEY,
        entity_id uuid NOT NULL REFERENCES entities(id),
        evidence_id uuid REFERENCES evidence(id),
        geometry geometry(Geometry, 4326) NOT NULL,
        osm_type text,
        osm_id bigint,
        osm_version integer,
        license text NOT NULL,
        properties jsonb NOT NULL,
        CONSTRAINT features_geometry_valid_wgs84_chk CHECK (
          ST_SRID(geometry) = 4326 AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
        ),
        CONSTRAINT features_greater_cairo_bbox_chk CHECK (TRUE)
      );
      CREATE TABLE boundaries (
        code text PRIMARY KEY,
        entity_code text NOT NULL,
        geometry geometry(Geometry, 4326) NOT NULL
      );
    `);
    // Install the original trigger and its actual hotfix replacement as production does.
    await db.exec(await readFile(path.resolve(process.cwd(), "db/migrations/006_road_only_bbox_extension.sql"), "utf8"));
    await db.exec(await readFile(path.resolve(process.cwd(), "db/migrations/007_regional_ring_west_bbox.sql"), "utf8"));
    await db.exec(await readFile(path.resolve(process.cwd(), "db/migrations/008_verified_facts_require_official_url.sql"), "utf8"));
    await db.exec(await readFile(path.resolve(process.cwd(), "db/migrations/009_entity_relations.sql"), "utf8"));

    const importSummary = await runSeedImport({
      seedDir: path.resolve(process.cwd(), "data/seed"),
      featuresPath: featurePath,
      sessionFactory: () => ({
        async connect() {},
        async query<Row = Record<string, unknown>>(text: string, values?: unknown[]) {
          const result = await db.query<Row>(text, values);
          return { rows: result.rows };
        },
        async end() {},
      }),
    });
    expect(importSummary.dryRun).toBe(false);
    expect(importSummary.entitiesCount).toBe(417);
    expect(importSummary.evidenceCount).toBe(371);
    expect(importSummary.factsCount).toBe(2083);
    expect(importSummary.relationsCount).toBeGreaterThan(0);
    expect(importSummary.importSync.entityRelationsDeletedCount).toBe(0);
    expect(importSummary.factEvidenceLinksCount).toBe(2436);
    const relations = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM entity_relations");
    expect(relations.rows[0]?.count).toBe(importSummary.relationsCount);
    const relationEvidence = await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM entity_relations WHERE evidence_ref IS NOT NULL");
    expect(relationEvidence.rows[0]?.count).toBe(importSummary.relationsCount);
    featureCount = importSummary.featuresCount;
    const boundaryCollection = JSON.parse(await readFile(path.resolve(process.cwd(), "data/features/boundaries.geojson"), "utf8")) as {
      features: Array<{ geometry: unknown; properties: { code: string; entity_code: string } }>;
    };
    boundaryCount = boundaryCollection.features.length;
    await insertRows(
      boundaryCollection.features,
      (boundary) => [boundary.properties.code, boundary.properties.entity_code, JSON.stringify(boundary.geometry)],
      (count) => {
        const values = Array.from({ length: count }, (_, index) => {
          const offset = index * 3;
          return `($${offset + 1}, $${offset + 2}, ST_SetSRID(ST_GeomFromGeoJSON($${offset + 3}), 4326))`;
        });
        return `INSERT INTO boundaries (code, entity_code, geometry) VALUES ${values.join(",")}`;
      },
    );

  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("inserts every real GeoJSON feature under the production geometry validity constraint", async () => {
    const result = await db.query<{ valid_count: string }>(`
      SELECT COUNT(*)::text AS valid_count
      FROM features
      WHERE ST_SRID(geometry) = 4326 AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
    `);
    expect(Number(result.rows[0]?.valid_count)).toBe(featureCount);
    expect(featureCount).toBe(2928);
    const constraint = await db.query<{ constraint_name: string }>(`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE conrelid = 'features'::regclass AND conname = 'features_geometry_valid_wgs84_chk'
    `);
    expect(constraint.rows).toHaveLength(1);
  }, 120_000);

  it("imports the full rev8 seed and every current boundary geometry into PostGIS", async () => {
    const counts = await db.query<{ entities: string; evidence: string; facts: string; links: string; features: string; boundaries: string }>(`
      SELECT
        (SELECT COUNT(*) FROM entities)::text AS entities,
        (SELECT COUNT(*) FROM evidence)::text AS evidence,
        (SELECT COUNT(*) FROM facts)::text AS facts,
        (SELECT COUNT(*) FROM fact_evidence)::text AS links,
        (SELECT COUNT(*) FROM features)::text AS features,
        (SELECT COUNT(*) FROM boundaries)::text AS boundaries
    `);
    expect(counts.rows[0]).toEqual({ entities: "417", evidence: "371", facts: "2083", links: "2436", features: "2928", boundaries: "19" });
    const validBoundaries = await db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM boundaries WHERE ST_SRID(geometry) = 4326 AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)");
    expect(Number(validBoundaries.rows[0]?.count)).toBe(boundaryCount);
  }, 120_000);

  it("keeps database envelopes identical to shared TypeScript geometry constants", async () => {
    const migration = await readFile(path.resolve(process.cwd(), "db/migrations/007_regional_ring_west_bbox.sql"), "utf8");
    const bounds = (bbox: { west: number; south: number; east: number; north: number }) => [bbox.west, bbox.south, bbox.east, bbox.north];
    expect(bounds(GREATER_CAIRO_BBOX)).toEqual([30.5, 29.2, 32.1, 30.8]);
    expect(bounds(ROAD_GEOMETRY_BBOX)).toEqual([30.5, 29.2, 32.35, 30.9]);
    expect(bounds(REGIONAL_RING_ROAD_GEOMETRY_BBOX)).toEqual([30.25, 29.2, 32.35, 30.9]);
    expect(migration).toMatch(/west := 30\.25/);
    expect(migration).toContain("south DOUBLE PRECISION := 29.2");
    expect(migration).toMatch(/east := 32\.35/);
    expect(migration).toMatch(/north := 30\.9/);
    expect(migration).toContain("west DOUBLE PRECISION := 30.5");
    expect(migration).toContain("east DOUBLE PRECISION := 32.1");
    expect(migration).toContain("north DOUBLE PRECISION := 30.8");
  });

  it("accepts Regional Ring geometry at longitude 30.3 and rejects 30.1 in the production PostGIS trigger", async () => {
    const regionalId = (await db.query<{ id: number }>("SELECT id FROM entities WHERE code = 'ROAD-REGIONAL-RING'")).rows[0]?.id;
    expect(regionalId).toBeDefined();
    const insert = (code: string, west: number) => db.query(
      "INSERT INTO features (code, entity_id, geometry, license, properties) VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 'ODbL-1.0', '{}'::jsonb)",
      [code, regionalId, JSON.stringify({ type: "LineString", coordinates: [[west, 29.8], [west + 0.01, 29.8]] })],
    );
    await expect(insert("TEST-RING-30-3", 30.3)).resolves.toBeDefined();
    await db.query("DELETE FROM features WHERE code = 'TEST-RING-30-3'");
    await expect(insert("TEST-RING-30-1", 30.1)).rejects.toMatchObject({ code: "23514" });
  }, 120_000);

  it("reproduces PostgreSQL 42803 from the former CASE-dependent GROUP BY on the real fixture", async () => {
    const formerQuery = `
      SELECT ST_AsGeoJSON(
        CASE WHEN $1::integer <= 7 THEN ST_Collect(ST_SimplifyPreserveTopology(f.geometry, $2::double precision))
             WHEN $2::double precision > 0 THEN ST_SimplifyPreserveTopology(f.geometry, $2::double precision)
             ELSE f.geometry END, 6
      ) AS geometry
      FROM features f
      GROUP BY CASE WHEN $1::integer <= 7 THEN NULL ELSE f.geometry END,
               CASE WHEN $1::integer <= 7 THEN NULL ELSE f.code END
    `;
    await expect(db.query(formerQuery, [10, 0.0002])).rejects.toMatchObject({ code: "42803" });
  }, 120_000);

  it.each([6, 10, 12])("executes the real features query on all %i-zoom fixture geometries", async (zoom) => {
    const rows = await db.query<{
      code: string;
      entity_code: string;
      geometry: { type: string; coordinates?: unknown };
      license: string;
      attribution: string;
      source_ids: unknown[];
    }>(ATLAS_FEATURES_SQL, [null, null, null, featureSimplificationTolerance(zoom)]);

    expect(rows.rows).toHaveLength(featureCount);
    expect(rows.rows.every((row) => row.code && row.entity_code && row.geometry.type)).toBe(true);
    expect(rows.rows.every((row) => row.attribution && row.source_ids.length > 0)).toBe(true);
    expect(rows.rows.filter((row) => row.geometry.type === "Point")).toHaveLength(175);
    expect(rows.rows.some((row) => row.geometry.type === "GeometryCollection")).toBe(false);
  }, 120_000);

  it("executes type, sector, and status filters in PostGIS rather than the mock executor", async () => {
    const rows = await db.query<{ entity_type: string; sector: string; status: string }>(
      `${ATLAS_FEATURES_SQL.replace("SELECT f.code,", "SELECT e.entity_type,").replace("e.status,", "e.status, e.sector,")}`,
      ["road", null, "operational", 0],
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.every((row) => row.entity_type === "road" && row.status === "operational")).toBe(true);
  }, 120_000);
});
