import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeAtlasDatasetChecksum, runAutomaticAtlasImport } from "@/lib/db/automatic-import";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("checksummed production dataset gate", () => {
  it("runs full checked-in seed + GeoJSON validation in dry-run mode without database writes", async () => {
    const summary = await runAutomaticAtlasImport(process.cwd(), { dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.entitiesCount).toBe(342);
    expect(summary.evidenceCount).toBe(307);
    expect(summary.factsCount).toBe(1301);
    expect(summary.factEvidenceLinksCount).toBe(1411);
    expect(summary.featuresCount).toBe(2305);
  });

  it("hashes all seed and feature files deterministically and changes when source data changes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "atlas-checksum-"));
    tempDirs.push(root);
    await mkdir(path.join(root, "data/seed"), { recursive: true });
    await mkdir(path.join(root, "data/features"), { recursive: true });
    await writeFile(path.join(root, "data/seed/entities.csv"), "code\nA\n");
    await writeFile(path.join(root, "data/features/features.geojson"), "{}\n");
    const first = await computeAtlasDatasetChecksum(root);
    expect(await computeAtlasDatasetChecksum(root)).toBe(first);
    await writeFile(path.join(root, "data/seed/entities.csv"), "code\nB\n");
    expect(await computeAtlasDatasetChecksum(root)).not.toBe(first);
  });
});
