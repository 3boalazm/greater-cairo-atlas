import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { runSeedImport } from "../src/lib/atlas/seed";
import { AppError, SeedValidationError } from "../src/lib/errors";
import { logger } from "../src/lib/logger";

interface ParsedCliArgs {
  seedDir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): ParsedCliArgs {
  let seedDir = path.resolve(process.cwd(), "data/seed");
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--check") {
      dryRun = true;
      continue;
    }
    if (arg === "--dir") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("Missing directory path after --dir flag.");
      }
      seedDir = path.resolve(process.cwd(), next);
      i++;
      continue;
    }
    if (arg?.startsWith("--dir=")) {
      const dirVal = arg.slice("--dir=".length).trim();
      if (!dirVal) {
        throw new Error("Empty directory path in --dir=<path>.");
      }
      seedDir = path.resolve(process.cwd(), dirVal);
      continue;
    }
    throw new Error(
      `Unknown CLI argument "${arg}". Supported flags: [--dir <path>] [--dry-run].`,
    );
  }

  return { seedDir, dryRun };
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const { seedDir, dryRun } = parseArgs(process.argv.slice(2));
  const summary = await runSeedImport({ seedDir, dryRun });

  if (summary.dryRun) {
    console.info(
      `Seed validation passed (${summary.seedDir}): ${summary.entitiesCount} entities, ${summary.evidenceCount} evidence items, ${summary.factsCount} facts (${summary.factEvidenceLinksCount} fact-evidence links).`,
    );
    return;
  }

  console.info(
    `Seed import complete (${summary.seedDir}): upserted ${summary.entitiesCount} entities, ${summary.evidenceCount} evidence items, ${summary.factsCount} facts (${summary.factEvidenceLinksCount} fact-evidence links).`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof SeedValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  if (error instanceof AppError) {
    logger.error(error.message, {
      code: error.code,
      ...(error.issues ? { issues: error.issues } : {}),
    });
    process.exit(1);
  }
  logger.error("Unhandled seed import failure", { error });
  process.exit(1);
});
