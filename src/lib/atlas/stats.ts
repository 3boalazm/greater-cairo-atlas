import { readFile } from "node:fs/promises";
import path from "node:path";
import { ATLAS_PHASE } from "@/lib/atlas/constants";
import { getSql } from "@/lib/db/client";
import {
  DatabaseNotConfiguredError,
  EnvValidationError,
  redactSecrets,
  type ValidationIssueDetail,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

export const ATLAS_TABLE_COUNTS_SQL = `
SELECT
  (SELECT COUNT(*)::int FROM entities) AS entities,
  (SELECT COUNT(*)::int FROM facts) AS facts,
  (SELECT COUNT(*)::int FROM evidence) AS evidence,
  (SELECT COUNT(*)::int FROM features) AS features,
  (SELECT COUNT(*)::int FROM fact_evidence) AS fact_evidence
` as const;

export interface AtlasTableCountsRow {
  entities: number | string;
  facts: number | string;
  evidence: number | string;
  features: number | string;
  fact_evidence: number | string;
}

export interface AtlasTableCounts {
  entities: number;
  facts: number;
  evidence: number;
  features: number;
  fact_evidence: number;
}

export type StatsQueryExecutor = () => Promise<readonly AtlasTableCountsRow[]>;

export type AtlasStatsResponseBody =
  | {
      ok: true;
      status: "ok";
      service: "greater-cairo-atlas";
      phase: typeof ATLAS_PHASE;
      timestamp: string;
      counts: AtlasTableCounts;
      boundary_counts: { source: string; license: string; total: number; adm2: number; adm3: number };
    }
  | {
      ok: false;
      status:
        | "not_configured"
        | "misconfigured"
        | "schema_not_migrated"
        | "unhealthy";
      service: "greater-cairo-atlas";
      phase: typeof ATLAS_PHASE;
      timestamp: string;
      error: {
        code: string;
        message: string;
        issues?: ValidationIssueDetail[];
      };
    };

export interface AtlasStatsOutcome {
  httpStatus: number;
  body: AtlasStatsResponseBody;
}

const defaultStatsExecutor: StatsQueryExecutor = async () => {
  const sql = getSql();
  const rows = await sql.query(ATLAS_TABLE_COUNTS_SQL);
  return rows as AtlasTableCountsRow[];
};

function isMissingCoreTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const pgCode =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return pgCode === "42P01";
}

function toNonNegativeInt(val: number | string | undefined): number | null {
  const num = Number(val);
  if (!Number.isInteger(num) || num < 0) {
    return null;
  }
  return num;
}

async function getCodabBoundaryCounts(): Promise<{ source: string; license: string; total: number; adm2: number; adm3: number }> {
  const file = path.join(process.cwd(), "data/features/codab-admin-units.geojson");
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as { features?: Array<{ properties?: { level?: number } }> };
    const levels = (data.features ?? []).map((feature) => feature.properties?.level);
    return { source: "CAPMAS COD-AB 2017 (reviewed 2024)", license: "CC BY-IGO", total: levels.length,
      adm2: levels.filter((level) => level === 2).length, adm3: levels.filter((level) => level === 3).length };
  } catch {
    return { source: "CAPMAS COD-AB 2017 (reviewed 2024)", license: "CC BY-IGO", total: 0, adm2: 0, adm3: 0 };
  }
}

export async function getAtlasTableStats(
  executeQuery: StatsQueryExecutor = defaultStatsExecutor,
): Promise<AtlasStatsOutcome> {
  const timestamp = new Date().toISOString();

  try {
    const rows = await executeQuery();
    const row = rows[0];

    const entities = toNonNegativeInt(row?.entities);
    const facts = toNonNegativeInt(row?.facts);
    const evidence = toNonNegativeInt(row?.evidence);
    const features = toNonNegativeInt(row?.features);
    const factEvidence = toNonNegativeInt(row?.fact_evidence);

    if (
      entities === null ||
      facts === null ||
      evidence === null ||
      features === null ||
      factEvidence === null
    ) {
      logger.error("Atlas stats query returned unexpected counts row", {
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
          error: {
            code: "INVALID_STATS_RESULT",
            message:
              "Database query succeeded, but table count payload was invalid.",
          },
        },
      };
    }

    return {
      httpStatus: 200,
      body: {
        ok: true,
        status: "ok",
        service: "greater-cairo-atlas",
        phase: ATLAS_PHASE,
        timestamp,
        counts: {
          entities,
          facts,
          evidence,
          features,
          fact_evidence: factEvidence,
        },
        boundary_counts: await getCodabBoundaryCounts(),
      },
    };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      logger.warn("Atlas stats requested while DATABASE_URL is not configured", {
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
          error: {
            code: error.code,
            message: error.message,
            ...(error.issues ? { issues: error.issues } : {}),
          },
        },
      };
    }

    if (error instanceof EnvValidationError) {
      logger.error("Atlas stats failed due to invalid DATABASE_URL format", {
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
          error: {
            code: error.code,
            message: error.message,
            ...(error.issues ? { issues: error.issues } : {}),
          },
        },
      };
    }

    if (isMissingCoreTableError(error)) {
      logger.warn("Atlas stats requested before 001_core_schema.sql migration", {
        error,
      });
      return {
        httpStatus: 503,
        body: {
          ok: false,
          status: "schema_not_migrated",
          service: "greater-cairo-atlas",
          phase: ATLAS_PHASE,
          timestamp,
          error: {
            code: "SCHEMA_NOT_MIGRATED",
            message:
              "Core Atlas tables are not migrated yet. Redeploy on Vercel (vercel-build) or run 'npm run db:migrate' to apply SQL migrations.",
          },
        },
      };
    }

    logger.error("Atlas stats query failed", { error });
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
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: `Failed to query Atlas table counts: ${safeCause}`,
        },
      },
    };
  }
}
