import { loadEnvConfig } from "@next/env";
import { runMigrations } from "../src/lib/db/migrate";
import { AppError } from "../src/lib/errors";
import { logger } from "../src/lib/logger";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run") || args.has("--check");

  const summary = await runMigrations({ dryRun });

  if (summary.dryRun) {
    console.info(
      `Dry-run complete: verified ${summary.discovered.length} migration file(s).`,
    );
    for (const migration of summary.discovered) {
      console.info(
        `  - ${migration.filename} (sha256:${migration.checksum.slice(0, 12)})`,
      );
    }
    return;
  }

  console.info(
    `Migrations complete: ${summary.appliedNow.length} applied, ${summary.alreadyApplied.length} already up to date.`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof AppError) {
    logger.error(error.message, {
      code: error.code,
      ...(error.issues ? { issues: error.issues } : {}),
    });
  } else {
    logger.error("Unhandled migration runner failure", { error });
  }
  process.exit(1);
});
