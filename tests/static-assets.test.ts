import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

async function nonEmptyAsset(relativePath: string) {
  const fullPath = path.join(root, relativePath);
  const info = await stat(fullPath);
  expect(info.isFile()).toBe(true);
  expect(info.size).toBeGreaterThan(0);
  return readFile(fullPath);
}

describe("self-hosted production assets", () => {
  it("publishes the installed MapLibre worker byte-for-byte after install/build preparation", async () => {
    const [publishedWorker, installedWorker] = await Promise.all([
      nonEmptyAsset("public/maplibre-gl-worker.mjs"),
      nonEmptyAsset("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"),
    ]);
    expect(publishedWorker.equals(installedWorker)).toBe(true);
    expect(publishedWorker.toString("utf8", 0, 256)).not.toContain("<html");
  });

  it("includes local Arabic, Latin, and mono fonts plus an ICO favicon", async () => {
    const paths = [
      "src/app/fonts/ibm-plex-sans-arabic-400.woff2",
      "src/app/fonts/ibm-plex-sans-arabic-500.woff2",
      "src/app/fonts/ibm-plex-sans-arabic-600.woff2",
      "src/app/fonts/ibm-plex-sans-arabic-700.woff2",
      "src/app/fonts/ibm-plex-sans-latin-400.woff2",
      "src/app/fonts/ibm-plex-sans-latin-500.woff2",
      "src/app/fonts/ibm-plex-sans-latin-600.woff2",
      "src/app/fonts/ibm-plex-sans-latin-700.woff2",
      "src/app/fonts/ibm-plex-mono-400.woff2",
      "src/app/fonts/ibm-plex-mono-500.woff2",
    ];
    await Promise.all(paths.map(nonEmptyAsset));
    const favicon = await nonEmptyAsset("public/favicon.ico");
    expect(favicon.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    expect(await nonEmptyAsset("public/icon.svg")).toBeTruthy();
    expect((await nonEmptyAsset("public/IBM-Plex-OFL.txt")).toString()).toContain("SIL Open Font License");
  });
});
