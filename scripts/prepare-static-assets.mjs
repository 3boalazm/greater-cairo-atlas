import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const fontDir = path.join(root, "src", "app", "fonts");

const assets = [
  ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs"],
  ["node_modules/@fontsource/ibm-plex-sans-arabic/LICENSE", "public/IBM-Plex-OFL.txt"],
  ...[400, 500, 600, 700].flatMap((weight) => [
    [`node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-${weight}-normal.woff2`, `src/app/fonts/ibm-plex-sans-arabic-${weight}.woff2`],
    [`node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-${weight}-normal.woff2`, `src/app/fonts/ibm-plex-sans-latin-${weight}.woff2`],
  ]),
  ...[400, 500].map((weight) => [
    `node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${weight}-normal.woff2`,
    `src/app/fonts/ibm-plex-mono-${weight}.woff2`,
  ]),
];

await mkdir(publicDir, { recursive: true });
await mkdir(fontDir, { recursive: true });

for (const [sourceRelative, destinationRelative] of assets) {
  const source = path.join(root, sourceRelative);
  const destination = path.join(root, destinationRelative);
  const sourceStat = await stat(source).catch(() => null);
  if (!sourceStat?.isFile() || sourceStat.size === 0) {
    throw new Error(`Required self-hosted asset is missing or empty: ${sourceRelative}`);
  }
  await copyFile(source, destination);
}

console.info(`Prepared ${assets.length} self-hosted map/font assets.`);
