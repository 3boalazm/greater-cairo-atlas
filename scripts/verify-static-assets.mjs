import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredAssets = [
  ".next/BUILD_ID",
  "public/maplibre-gl-worker.mjs",
  "public/favicon.ico",
  "public/icon.svg",
];

for (const relativePath of requiredAssets) {
  const filePath = path.join(root, relativePath);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile() || info.size === 0) {
    throw new Error(`Post-build asset verification failed: ${relativePath} is missing or empty.`);
  }
}

console.info("Verified production build and required worker/favicon assets.");
