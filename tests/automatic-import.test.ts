import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeAtlasDatasetChecksum } from "@/lib/db/automatic-import";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("checksummed production dataset gate", () => {
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
