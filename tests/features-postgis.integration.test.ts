import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { postgis } from "@electric-sql/pglite-postgis";
import { loadAndValidateFeatureCollection } from "@/lib/atlas/features";
import { loadAndValidateSeedDir } from "@/lib/atlas/seed";
import { ATLAS_FEATURES_SQL, featureSimplificationTolerance } from "@/lib/atlas/features-api";
import type { FeatureSeed } from "@/lib/atlas/schema";

const featurePath = path.resolve(process.cwd(), "data/features/features.geojson");
let db: PGlite;
let featureCount = 0;

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
        id integer PRIMARY KEY,
        code text NOT NULL UNIQUE,
        name_ar text NOT NULL,
        name_en text NOT NULL,
        entity_type text NOT NULL,
        sector text NOT NULL,
        status text NOT NULL
      );
      CREATE TABLE features (
        code text PRIMARY KEY,
        entity_id integer NOT NULL REFERENCES entities(id),
        geometry geometry(Geometry, 4326) NOT NULL,
        license text NOT NULL,
        properties jsonb NOT NULL,
        CONSTRAINT features_geometry_valid_wgs84_chk CHECK (
          ST_SRID(geometry) = 4326 AND NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
        )
      );
    `);

    const bundle = await loadAndValidateSeedDir();
    const entityIds = new Map(bundle.entities.map((entity, index) => [entity.code, index + 1]));
    await insertRows(
      bundle.entities,
      (entity) => [entityIds.get(entity.code), entity.code, entity.name_ar, entity.name_en, entity.entity_type, entity.sector, entity.status],
      (count) => {
        const values = Array.from({ length: count }, (_, index) => {
          const offset = index * 7;
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
        });
        return `INSERT INTO entities (id, code, name_ar, name_en, entity_type, sector, status) VALUES ${values.join(",")}`;
      },
    );

    const features = await loadAndValidateFeatureCollection(featurePath, bundle.entities, bundle.evidence);
    featureCount = features.length;
    await insertRows(
      features,
      (feature: FeatureSeed) => [
        feature.code,
        entityIds.get(feature.entity_code),
        JSON.stringify(feature.geometry),
        feature.license,
        JSON.stringify(feature.properties),
      ],
      (count) => {
        const values = Array.from({ length: count }, (_, index) => {
          const offset = index * 5;
          return `($${offset + 1}, $${offset + 2}, ST_SetSRID(ST_GeomFromGeoJSON($${offset + 3}), 4326), $${offset + 4}, $${offset + 5}::jsonb)`;
        });
        return `INSERT INTO features (code, entity_id, geometry, license, properties) VALUES ${values.join(",")}`;
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
    const constraint = await db.query<{ constraint_name: string }>(`
      SELECT conname AS constraint_name
      FROM pg_constraint
      WHERE conrelid = 'features'::regclass AND conname = 'features_geometry_valid_wgs84_chk'
    `);
    expect(constraint.rows).toHaveLength(1);
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
    expect(rows.rows.filter((row) => row.geometry.type === "Point")).toHaveLength(111);
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
