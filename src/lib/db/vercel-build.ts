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
}

export interface VercelBuildResult {
  migrated: boolean;
  skipReason?: "not_vercel" | "missing_database_url";
  connectionSource?: MigrationDatabaseEnv["source"];
  migrationSummary?: RunMigrationsSummary;
}

/**
 * Runs SQL migrations before `next build` strictly when `VERCEL=1` and
 * a database connection URL (`DATABASE_URL` or `DATABASE_URL_UNPOOLED`) is configured.
 *
 * - Outside Vercel (`VERCEL !== "1"`): skips migrations and runs `next build`.
 * - On Vercel without `DATABASE_URL`: logs a clear warning and still runs `next build`.
 * - On Vercel with `DATABASE_URL`: prefers `DATABASE_URL_UNPOOLED` (for session-safe
 *   `pg_advisory_lock` and transactions), runs `runMigrations`, and aborts the build
 *   immediately if any migration or checksum verification fails.
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

  const hasDatabaseUrl = Boolean(env.DATABASE_URL?.trim());
  const hasUnpooledUrl = Boolean(env.DATABASE_URL_UNPOOLED?.trim());

  if (!hasDatabaseUrl && !hasUnpooledUrl) {
    log.warn(
      "VERCEL=1 detected, but DATABASE_URL is missing. Skipping database migrations and proceeding with next build.",
      {
        vercelEnv: env.VERCEL_ENV ?? "unknown",
      },
    );
    await options.runNextBuildFn();
    return {
      migrated: false,
      skipReason: "missing_database_url",
    };
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

  await options.runNextBuildFn();

  return {
    migrated: true,
    connectionSource: resolvedDbEnv.source,
    migrationSummary,
  };
}
