import path from "node:path";
import {
  runAdaptResearchSeed,
  type RunAdaptResearchSeedOptions,
} from "../src/lib/atlas/research-seed";
import { SeedValidationError } from "../src/lib/errors";

function parseArgs(argv: string[]): RunAdaptResearchSeedOptions {
  const options: RunAdaptResearchSeedOptions = {
    outDir: path.resolve(process.cwd(), "data/seed"),
    dryRun: false,
  };

  const readFlagValue = (flag: string, next: string | undefined): string => {
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value after ${flag} flag.`);
    }
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }

    if (arg === "--dry-run" || arg === "--check") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--rev2") {
      options.revision = 2;
      continue;
    }
    if (arg === "--rev1") {
      options.revision = 1;
      continue;
    }
    if (arg === "--rev") {
      const val = Number(readFlagValue("--rev", argv[i + 1]));
      if (!Number.isInteger(val) || val < 1) {
        throw new Error(`Invalid revision number after --rev: "${argv[i + 1]}".`);
      }
      options.revision = val;
      i++;
      continue;
    }
    if (arg.startsWith("--rev=")) {
      const val = Number(arg.slice("--rev=".length).trim());
      if (!Number.isInteger(val) || val < 1) {
        throw new Error(`Invalid revision number in ${arg}.`);
      }
      options.revision = val;
      continue;
    }
    if (arg === "--in") {
      options.inputDir = path.resolve(process.cwd(), readFlagValue("--in", argv[i + 1]));
      i++;
      continue;
    }
    if (arg.startsWith("--in=")) {
      options.inputDir = path.resolve(process.cwd(), arg.slice("--in=".length).trim());
      continue;
    }
    if (arg === "--out") {
      options.outDir = path.resolve(process.cwd(), readFlagValue("--out", argv[i + 1]));
      i++;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outDir = path.resolve(process.cwd(), arg.slice("--out=".length).trim());
      continue;
    }
    if (arg === "--report") {
      options.reportPath = path.resolve(
        process.cwd(),
        readFlagValue("--report", argv[i + 1]),
      );
      i++;
      continue;
    }
    if (arg.startsWith("--report=")) {
      options.reportPath = path.resolve(
        process.cwd(),
        arg.slice("--report=".length).trim(),
      );
      continue;
    }
    if (arg === "--entities") {
      options.entitiesPath = path.resolve(
        process.cwd(),
        readFlagValue("--entities", argv[i + 1]),
      );
      i++;
      continue;
    }
    if (arg.startsWith("--entities=")) {
      options.entitiesPath = path.resolve(
        process.cwd(),
        arg.slice("--entities=".length).trim(),
      );
      continue;
    }
    if (arg === "--evidence") {
      options.evidencePath = path.resolve(
        process.cwd(),
        readFlagValue("--evidence", argv[i + 1]),
      );
      i++;
      continue;
    }
    if (arg.startsWith("--evidence=")) {
      options.evidencePath = path.resolve(
        process.cwd(),
        arg.slice("--evidence=".length).trim(),
      );
      continue;
    }
    if (arg === "--facts") {
      options.factsPath = path.resolve(
        process.cwd(),
        readFlagValue("--facts", argv[i + 1]),
      );
      i++;
      continue;
    }
    if (arg.startsWith("--facts=")) {
      options.factsPath = path.resolve(
        process.cwd(),
        arg.slice("--facts=".length).trim(),
      );
      continue;
    }

    throw new Error(
      `Unknown CLI argument "${arg}". Supported flags: --in <dir> [--rev <n> | --rev1 | --rev2] [--entities <path> --evidence <path> --facts <path>] [--out <dir>] [--report <path>] [--dry-run].`,
    );
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outcome = await runAdaptResearchSeed(options);
  const { report } = outcome;

  if (!outcome.ok) {
    console.error(
      `Research seed adaptation FAILED (${report.selectedRevision}) with ${report.issues.length} validation error(s). Nothing was written to ${outcome.outDir}.`,
    );

    if (report.missingSourceTypeEvidenceRefs.length > 0) {
      console.error(
        `\n[BLOCKER — rev2 required before import] ${report.missingSourceTypeEvidenceRefs.length} evidence record(s) are missing "source_type":\n  ${report.missingSourceTypeEvidenceRefs.join(", ")}`,
      );
    }

    if (report.secondaryOnlyVerifiedFacts.length > 0) {
      console.error(
        `\n[BLOCKER — secondary-only verified facts] ${report.secondaryOnlyVerifiedFacts.length} fact(s) marked "verified" lack a non-secondary source:`,
      );
      for (const item of report.secondaryOnlyVerifiedFacts) {
        console.error(
          `  - ${item.factCode} (${item.entityCode} · ${item.attribute}) -> [${item.evidenceCodes.join(", ")}]`,
        );
      }
    }

    console.error("\nValidation issues:");
    for (const issue of report.issues) {
      console.error(`  - [${issue.path}] ${issue.message}`);
    }
    process.exit(1);
  }

  const modeLabel = outcome.wroteFiles
    ? `Wrote canonical seed files to ${outcome.outDir}`
    : `Dry-run validation passed (no files written)`;

  console.info(
    [
      `${modeLabel} [revision=${report.selectedRevision}, aliasSeparator=${report.detectedAliasSeparator}]:`,
      `  entities: ${report.counts.entities} (${report.counts.entitiesWithAliases} with aliases; ${report.counts.missingStatusDefaultedToUnknown} missing status -> 'unknown')`,
      `  evidence: ${report.counts.evidence} (${report.counts.evidenceMissingUrl} with url=null)`,
      `  facts:    ${report.counts.facts} (${report.counts.factEvidenceLinks} fact_evidence links; precisions: day=${report.counts.factDatePrecisions.day}, month=${report.counts.factDatePrecisions.month}, year=${report.counts.factDatePrecisions.year}, null=${report.counts.factDatePrecisions.null})`,
      `  warnings: ${report.bundleReport?.warnings.length ?? 0}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  if (error instanceof SeedValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(
    `Research seed adapter error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
