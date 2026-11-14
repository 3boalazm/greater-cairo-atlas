import { spawnSync } from "node:child_process";
import path from "node:path";
import { executeVercelBuild } from "../src/lib/db/vercel-build";
import { runAutomaticAtlasImport } from "../src/lib/db/automatic-import";
import { redactSecrets } from "../src/lib/errors";

function runNextBuild(): void {
  const nextBin = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next",
  );

  const result = spawnSync(nextBin, ["build"], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  await executeVercelBuild({
    env: process.env,
    runNextBuildFn: runNextBuild,
    runProductionImportFn: () => runAutomaticAtlasImport(),
  });
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? redactSecrets(error.message) : redactSecrets(String(error));
  console.error(`Build failed: ${message}`);
  process.exit(1);
});
