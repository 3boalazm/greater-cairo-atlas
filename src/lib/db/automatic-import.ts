import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runSeedImport, type SeedImportSummary } from "@/lib/atlas/seed";

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute);
    if (entry.isFile()) return [absolute];
    return [];
  }));
  return nested.flat();
}

/** Hash every committed artifact under data/seed and data/features deterministically. */
export async function computeAtlasDatasetChecksum(
  root = process.cwd(),
): Promise<string> {
  const hash = createHash("sha256");
  for (const relativeDir of ["data/seed", "data/features"]) {
    const absoluteDir = path.join(root, relativeDir);
    const files = (await collectFiles(absoluteDir)).sort();
    if (files.length === 0) throw new Error(`Automatic import source is empty: ${relativeDir}`);
    for (const file of files) {
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      hash.update(relativePath, "utf8").update("\0");
      hash.update(await readFile(file)).update("\0");
    }
  }
  return hash.digest("hex");
}

/** Validate all source data before opening the atomic import transaction. */
export async function runAutomaticAtlasImport(
  root = process.cwd(),
  options: { dryRun?: boolean } = {},
): Promise<SeedImportSummary> {
  const checksum = await computeAtlasDatasetChecksum(root);
  return runSeedImport({
    seedDir: path.join(root, "data/seed"),
    featuresPath: path.join(root, "data/features/features.geojson"),
    importRun: options.dryRun ? undefined : { datasetKey: "atlas-seed-features", checksum },
    dryRun: options.dryRun ?? false,
  });
}
