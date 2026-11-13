import { loadEnvConfig } from "@next/env";
import { getRuntimeEnv, requireDatabaseEnv } from "../src/lib/env";
import { AppError } from "../src/lib/errors";
import { logger } from "../src/lib/logger";

function main(): void {
  loadEnvConfig(process.cwd());

  const runtimeEnv = getRuntimeEnv();
  requireDatabaseEnv();

  logger.info("Environment validation passed", {
    nodeEnv: runtimeEnv.NODE_ENV,
    databaseConfigured: true,
  });
}

try {
  main();
} catch (error: unknown) {
  if (error instanceof AppError) {
    logger.error(error.message, {
      code: error.code,
      ...(error.issues ? { issues: error.issues } : {}),
    });
  } else {
    logger.error("Unexpected environment validation failure", { error });
  }
  process.exit(1);
}
