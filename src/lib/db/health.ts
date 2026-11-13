import { ATLAS_PHASE } from "@/lib/atlas/constants";
import { getSql } from "@/lib/db/client";
import {
  DatabaseNotConfiguredError,
  EnvValidationError,
  redactSecrets,
  type ValidationIssueDetail,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

export const HEALTH_CHECK_SQL =
  "SELECT PostGIS_Version() AS postgis_version, ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(31.2357,30.0444),4326)) AS point_geojson" as const;

export interface HealthSpatialPointGeoJson {
  type: "Point";
  coordinates: [number, number];
}

export interface HealthProbeRow {
  postgis_version: string;
  point_geojson: string;
}

export type HealthQueryExecutor = () => Promise<readonly HealthProbeRow[]>;

export type HealthCheckResponseBody =
  | {
      ok: true;
      status: "healthy";
      service: "greater-cairo-atlas";
      phase: typeof ATLAS_PHASE;
      timestamp: string;
      latencyMs: number;
      database: {
        configured: true;
        connected: true;
        postgisVersion: string;
        spatialProbe: {
          srid: 4326;
          geoJsonRaw: string;
          geometry: HealthSpatialPointGeoJson | Record<string, unknown>;
        };
      };
    }
  | {
      ok: false;
      status: "not_configured" | "misconfigured" | "unhealthy";
      service: "greater-cairo-atlas";
      phase: typeof ATLAS_PHASE;
      timestamp: string;
      database: {
        configured: boolean;
        connected: false;
      };
      error: {
        code: string;
        message: string;
        issues?: ValidationIssueDetail[];
      };
    };

export interface HealthCheckOutcome {
  httpStatus: number;
  body: HealthCheckResponseBody;
}

const defaultExecutor: HealthQueryExecutor = async () => {
  const sql = getSql();
  const rows = await sql.query(HEALTH_CHECK_SQL);
  return rows as HealthProbeRow[];
};

function isMissingPostgisError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const pgCode =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return (
    pgCode === "42883" &&
    error.message.toLowerCase().includes("postgis_version")
  );
}

export async function runDatabaseHealthCheck(
  executeProbe: HealthQueryExecutor = defaultExecutor,
): Promise<HealthCheckOutcome> {
  const startedAt = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const rows = await executeProbe();
    const firstRow = rows[0];

    if (
      !firstRow ||
      typeof firstRow.postgis_version !== "string" ||
      typeof firstRow.point_geojson !== "string"
    ) {
      logger.error("Health check returned unexpected row shape", {
        rowCount: rows.length,
      });
      return {
        httpStatus: 503,
        body: {
          ok: false,
          status: "unhealthy",
          service: "greater-cairo-atlas",
          phase: ATLAS_PHASE,
          timestamp,
          database: {
            configured: true,
            connected: false,
          },
          error: {
            code: "INVALID_HEALTH_PROBE_RESULT",
            message:
              "Database query succeeded, but PostGIS health probe returned an unexpected payload.",
          },
        },
      };
    }

    let parsedGeometry: HealthSpatialPointGeoJson | Record<string, unknown>;
    try {
      parsedGeometry = JSON.parse(firstRow.point_geojson) as
        | HealthSpatialPointGeoJson
        | Record<string, unknown>;
    } catch {
      parsedGeometry = { raw: firstRow.point_geojson };
    }

    const latencyMs = Math.round(performance.now() - startedAt);

    return {
      httpStatus: 200,
      body: {
        ok: true,
        status: "healthy",
        service: "greater-cairo-atlas",
        phase: ATLAS_PHASE,
        timestamp,
        latencyMs,
        database: {
          configured: true,
          connected: true,
          postgisVersion: firstRow.postgis_version,
          spatialProbe: {
            srid: 4326,
            geoJsonRaw: firstRow.point_geojson,
            geometry: parsedGeometry,
          },
        },
      },
    };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      logger.warn("Health check requested while DATABASE_URL is not configured", {
        code: error.code,
      });
      return {
        httpStatus: 503,
        body: {
          ok: false,
          status: "not_configured",
          service: "greater-cairo-atlas",
          phase: ATLAS_PHASE,
          timestamp,
          database: {
            configured: false,
            connected: false,
          },
          error: {
            code: error.code,
            message: error.message,
            ...(error.issues ? { issues: error.issues } : {}),
          },
        },
      };
    }

    if (error instanceof EnvValidationError) {
      logger.error("Health check failed due to invalid DATABASE_URL format", {
        code: error.code,
        issues: error.issues,
      });
      return {
        httpStatus: 500,
        body: {
          ok: false,
          status: "misconfigured",
          service: "greater-cairo-atlas",
          phase: ATLAS_PHASE,
          timestamp,
          database: {
            configured: false,
            connected: false,
          },
          error: {
            code: error.code,
            message: error.message,
            ...(error.issues ? { issues: error.issues } : {}),
          },
        },
      };
    }

    if (isMissingPostgisError(error)) {
      logger.error("Connected to PostgreSQL, but PostGIS extension is missing", {
        error,
      });
      return {
        httpStatus: 503,
        body: {
          ok: false,
          status: "unhealthy",
          service: "greater-cairo-atlas",
          phase: ATLAS_PHASE,
          timestamp,
          database: {
            configured: true,
            connected: false,
          },
          error: {
            code: "POSTGIS_NOT_ENABLED",
            message:
              "Connected to Neon PostgreSQL, but PostGIS is not enabled. Run 'npm run db:migrate' to apply 000_enable_postgis.sql.",
          },
        },
      };
    }

    logger.error("Database health check failed", { error });
    const safeCause =
      error instanceof Error ? redactSecrets(error.message) : "Unknown error";

    return {
      httpStatus: 503,
      body: {
        ok: false,
        status: "unhealthy",
        service: "greater-cairo-atlas",
        phase: ATLAS_PHASE,
        timestamp,
        database: {
          configured: true,
          connected: false,
        },
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: `Failed to query Neon PostgreSQL + PostGIS: ${safeCause}`,
        },
      },
    };
  }
}
