import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import {
  HEALTH_CHECK_SQL,
  runDatabaseHealthCheck,
} from "@/lib/db/health";

describe("/api/health route, PostGIS probe, and applied migration count", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("queries PostGIS_Version(), Cairo SRID 4326 point, and schema_migrations count", () => {
    expect(HEALTH_CHECK_SQL).toContain("PostGIS_Version()");
    expect(HEALTH_CHECK_SQL).toContain(
      "ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(31.2357,30.0444),4326))",
    );
    expect(HEALTH_CHECK_SQL).toContain("FROM schema_migrations");
  });

  it("returns HTTP 503 with clear not_configured error when DATABASE_URL is absent", async () => {
    delete process.env.DATABASE_URL;

    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe("not_configured");
    expect(body.database).toEqual({
      configured: false,
      connected: false,
      appliedMigrationsCount: null,
    });
    expect(body.error.code).toBe("DATABASE_NOT_CONFIGURED");
  });

  it("returns HTTP 500 misconfigured when DATABASE_URL is malformed", async () => {
    process.env.DATABASE_URL = "invalid-url";

    const response = await GET();
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe("misconfigured");
    expect(body.error.code).toBe("ENV_VALIDATION_ERROR");
  });

  it("returns HTTP 200 with PostGIS version, appliedMigrationsCount, and SRID 4326 GeoJSON when healthy", async () => {
    const outcome = await runDatabaseHealthCheck(async () => [
      {
        postgis_version: "3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1",
        point_geojson: '{"type":"Point","coordinates":[31.2357,30.0444]}',
        applied_migrations: 2,
      },
    ]);

    expect(outcome.httpStatus).toBe(200);
    expect(outcome.body.ok).toBe(true);
    if (outcome.body.ok) {
      expect(outcome.body.status).toBe("healthy");
      expect(outcome.body.database.appliedMigrationsCount).toBe(2);
      expect(outcome.body.database.postgisVersion).toBe(
        "3.5 USE_GEOS=1 USE_PROJ=1 USE_STATS=1",
      );
      expect(outcome.body.database.spatialProbe).toEqual({
        srid: 4326,
        geoJsonRaw: '{"type":"Point","coordinates":[31.2357,30.0444]}',
        geometry: {
          type: "Point",
          coordinates: [31.2357, 30.0444],
        },
      });
    }
  });

  it("reports POSTGIS_NOT_ENABLED and appliedMigrationsCount=0 when PostGIS_Version() is missing (PG code 42883)", async () => {
    const missingExtensionError = Object.assign(
      new Error("function postgis_version() does not exist"),
      { code: "42883" },
    );

    const outcome = await runDatabaseHealthCheck(async () => {
      throw missingExtensionError;
    });

    expect(outcome.httpStatus).toBe(503);
    expect(outcome.body.ok).toBe(false);
    if (!outcome.body.ok) {
      expect(outcome.body.database.appliedMigrationsCount).toBe(0);
      expect(outcome.body.error.code).toBe("POSTGIS_NOT_ENABLED");
      expect(outcome.body.error.message).toContain("Migrate Database");
    }
  });
});
