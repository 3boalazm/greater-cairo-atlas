import {
  requireMigrationDatabaseEnv,
  type MigrationDatabaseEnv,
} from "@/lib/env";
import {
  runMigrations,
  type RunMigrationsOptions,
  type RunMigrationsSummary,
} from "@/lib/db/migrate";
import { redactSecrets } from "@/lib/errors";
import { logger, type Logger } from "@/lib/logger";

export interface VercelBuildOptions {
  env?: NodeJS.ProcessEnv;
  log?: Logger;
  runMigrationsFn?: (
    options: RunMigrationsOptions,
  ) => Promise<RunMigrationsSummary>;
  runNextBuildFn?: () => Promise<void> | void;
  runProductionImportFn?: () => Promise<{
    importSkipped?: boolean;
    entitiesCount: number;
    evidenceCount: number;
    factsCount: number;
    factEvidenceLinksCount: number;
    featuresCount: number;
  }>;
  runPreviewValidationFn?: () => Promise<{
    entitiesCount: number;
    evidenceCount: number;
    factsCount: number;
    factEvidenceLinksCount: number;
    featuresCount: number;
  }>;
}

export interface VercelBuildResult {
  migrated: boolean;
  skipReason?: "not_vercel" | "missing_database_url";
  connectionSource?: MigrationDatabaseEnv["source"];
  migrationSummary?: RunMigrationsSummary;
  autoImported?: boolean;
  previewValidated?: boolean;
}

/**
 * Runs SQL migrations before `next build` on Vercel. Production builds run the validated,
 * checksummed seed + feature import; preview builds run the same validation in dry-run mode
 * before compiling, without writing seed data. Database URLs are never included in logs.
 *
 * Outside Vercel build-time database work is skipped. Missing database configuration is fatal
 * in production and a warning-only migration skip in preview (preview data validation still runs).
 */
export async function executeVercelBuild(
  options: VercelBuildOptions & { runNextBuildFn: () => Promise<void> | void },
): Promise<VercelBuildResult> {
  const env = options.env ?? process.env;
  const log = options.log ?? logger;
  const migrate = options.runMigrationsFn ?? runMigrations;

  if (env.VERCEL !== "1") {
    log.info(
      "VERCEL is not set to '1'; skipping build-time SQL migrations and running next build.",
    );
    await options.runNextBuildFn();
    return {
      migrated: false,
      skipReason: "not_vercel",
    };
  }

  let previewValidated = false;
  if (env.VERCEL_ENV === "preview") {
    if (!options.runPreviewValidationFn) {
      throw new Error("Preview build is missing its atlas seed + features dry-run validator.");
    }
    try {
      const summary = await options.runPreviewValidationFn();
      previewValidated = true;
      log.info("Preview atlas seed + features passed full dry-run validation (no data writes)", {
        entitiesCount: summary.entitiesCount,
        evidenceCount: summary.evidenceCount,
        factsCount: summary.factsCount,
        factEvidenceLinksCount: summary.factEvidenceLinksCount,
        featuresCount: summary.featuresCount,
      });
    } catch (error) {
      const safeMessage = error instanceof Error ? redactSecrets(error.message) : "Unknown validation error";
      log.error(`Vercel preview build aborted due to atlas seed + features validation failure: ${safeMessage}`);
      throw error;
    }
  }

  const hasDatabaseUrl = Boolean(env.DATABASE_URL?.trim());
  const hasUnpooledUrl = Boolean(env.DATABASE_URL_UNPOOLED?.trim());

  if (!hasDatabaseUrl && !hasUnpooledUrl) {
    if (env.VERCEL_ENV === "production") {
      log.error("Vercel production build aborted: database configuration is required for migrations and automatic data import.");
      throw new Error("Production build requires database configuration for migrations and automatic data import.");
    }
    log.warn(
      "VERCEL=1 detected without a database URL; skipping preview migrations and running next build.",
      { vercelEnv: env.VERCEL_ENV ?? "unknown" },
    );
    await options.runNextBuildFn();
    return { migrated: false, skipReason: "missing_database_url", ...(previewValidated ? { previewValidated: true } : {}) };
  }

  let resolvedDbEnv: MigrationDatabaseEnv;
  try {
    resolvedDbEnv = requireMigrationDatabaseEnv(env);
  } catch (error) {
    const safeMessage =
      error instanceof Error ? redactSecrets(error.message) : "Invalid database URL";
    log.error(
      `Vercel build aborted: invalid database configuration (${safeMessage})`,
      { error },
    );
    throw error;
  }

  log.info("Running SQL migrations during Vercel build", {
    connectionSource: resolvedDbEnv.source,
    vercelEnv: env.VERCEL_ENV ?? "unknown",
  });

  let migrationSummary: RunMigrationsSummary;
  try {
    migrationSummary = await migrate({
      dryRun: false,
      env,
    });
  } catch (error) {
    const safeMessage =
      error instanceof Error ? redactSecrets(error.message) : String(error);
    log.error(
      `Vercel build aborted due to SQL migration failure: ${safeMessage}`,
      {
        connectionSource: resolvedDbEnv.source,
        error,
      },
    );
    throw error;
  }

  log.info("Vercel build-time SQL migrations succeeded", {
    connectionSource: resolvedDbEnv.source,
    appliedCount: migrationSummary.appliedNow.length,
    alreadyAppliedCount: migrationSummary.alreadyApplied.length,
  });

  let autoImported = false;
  if (env.VERCEL_ENV === "production") {
    if (!options.runProductionImportFn) {
      throw new Error("Production build is missing its automatic atlas data import handler.");
    }
    log.info("Validating and importing production atlas seed + features");
    try {
      const summary = await options.runProductionImportFn();
      autoImported = true;
      log.info(summary.importSkipped
        ? "Production atlas import skipped; data checksum is unchanged"
        : "Production atlas seed + features imported transactionally", {
        entitiesCount: summary.entitiesCount,
        evidenceCount: summary.evidenceCount,
        factsCount: summary.factsCount,
        factEvidenceLinksCount: summary.factEvidenceLinksCount,
        featuresCount: summary.featuresCount,
      });
    } catch (error) {
      const safeMessage = error instanceof Error ? redactSecrets(error.message) : "Unknown import error";
      log.error(`Vercel production build aborted due to atlas data import failure: ${safeMessage}`);
      throw error;
    }
  }

  await options.runNextBuildFn();

  return {
    migrated: true,
    connectionSource: resolvedDbEnv.source,
    migrationSummary,
    ...(autoImported ? { autoImported: true } : {}),
    ...(previewValidated ? { previewValidated: true } : {}),
  };
}
