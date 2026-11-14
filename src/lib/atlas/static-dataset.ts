import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadAndValidateFeatureCollection } from "@/lib/atlas/features";
import { loadAndValidateSeedDir } from "@/lib/atlas/seed";
import type { EntitySeed, EvidenceSeed, FactSeed, FeatureSeed } from "@/lib/atlas/schema";

export interface StaticAtlasDataset {
  entities: EntitySeed[];
  evidence: EvidenceSeed[];
  facts: FactSeed[];
  factEvidence: Array<{ fact_code: string; evidence_code: string }>;
  features: FeatureSeed[];
}

let datasetPromise: Promise<StaticAtlasDataset> | null = null;

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute);
    return entry.isFile() ? [absolute] : [];
  }));
  return nested.flat();
}

async function computeStaticDatasetChecksum(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const relativeDir of ["data/seed", "data/features"] as const) {
    const directory = path.join(/*turbopackIgnore: true*/ root, relativeDir);
    const files = (await collectFiles(directory)).sort();
    if (!files.length) throw new Error(`Atlas export source is empty: ${relativeDir}`);
    for (const file of files) {
      hash.update(path.relative(root, file).split(path.sep).join("/"), "utf8").update("\0");
      hash.update(await readFile(file)).update("\0");
    }
  }
  return hash.digest("hex");
}

export async function getStaticAtlasDataset(root = process.cwd()): Promise<StaticAtlasDataset> {
  if (!datasetPromise || root !== process.cwd()) {
    datasetPromise = loadStaticAtlasDataset(root);
  }
  return datasetPromise;
}

async function loadStaticAtlasDataset(root: string): Promise<StaticAtlasDataset> {
  const seedDir = path.join(root, "data/seed");
  const featurePath = path.join(root, "data/features/features.geojson");
  const bundle = await loadAndValidateSeedDir(seedDir);
  const features = await loadAndValidateFeatureCollection(featurePath, bundle.entities, bundle.evidence);
  return {
    ...bundle,
    factEvidence: bundle.facts.flatMap((fact) => fact.evidence_codes.map((evidence_code) => ({
      fact_code: fact.code,
      evidence_code,
    }))),
    features,
  };
}

interface EntityMapGeometryRecord {
  geometry: FeatureSeed["geometry"];
  license: string[];
  attribution: string[];
  sources: string[];
  retrieval_dates: string[];
}

export interface StaticEntityPageData extends EntitySeed {
  facts: Array<FactSeed & { evidence: EvidenceSeed[] }>;
  mapGeometry: FeatureSeed["geometry"] | null;
  mapLicense: string;
  mapAttribution: string;
}

const entityMapGeometryPromises = new Map<string, Promise<Record<string, EntityMapGeometryRecord>>>();

async function loadEntityMapGeometries(root: string): Promise<Record<string, EntityMapGeometryRecord>> {
  let pending = entityMapGeometryPromises.get(root);
  if (!pending) {
    pending = readFile(path.join(root, "data/derived/entity-map-geometries.json"), "utf8")
      .then((text) => (JSON.parse(text) as { geometries: Record<string, EntityMapGeometryRecord> }).geometries)
      .catch(() => ({}));
    entityMapGeometryPromises.set(root, pending);
  }
  return pending;
}

export async function getStaticEntityPageData(code: string, root = process.cwd()): Promise<StaticEntityPageData | null> {
  const dataset = await getStaticAtlasDataset(root);
  const entity = dataset.entities.find((item) => item.code === code);
  if (!entity) return null;
  const evidenceByCode = new Map(dataset.evidence.map((item) => [item.code, item]));
  const mapGeometries = await loadEntityMapGeometries(root);
  return {
    ...entity,
    facts: dataset.facts.filter((fact) => fact.entity_code === code).map((fact) => ({
      ...fact,
      evidence: fact.evidence_codes.flatMap((evidenceCode) => {
        const source = evidenceByCode.get(evidenceCode);
        return source ? [source] : [];
      }),
    })),
    mapGeometry: mapGeometries[code]?.geometry ?? null,
    mapLicense: (mapGeometries[code]?.license ?? []).join(" + "),
    mapAttribution: (mapGeometries[code]?.attribution ?? []).join(" · "),
  };
}

export async function getExportMetadata(root = process.cwd()): Promise<{
  dataset_version: string;
  git_short_sha: string;
  import_checksum: string;
  generated_at: string;
  counts: { entities: number; facts: number; evidence: number; fact_evidence: number; features: number };
  licenses: {
    geometry: string;
    research_data: string;
    basemap: string;
  };
}> {
  const dataset = await getStaticAtlasDataset(root);
  const { execFileSync } = await import("node:child_process");
  let sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.NEXT_PUBLIC_GIT_COMMIT_SHA?.slice(0, 7);
  if (!sha) {
    try {
      sha = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      sha = "unknown";
    }
  }
  const checksum = await computeStaticDatasetChecksum(root);
  return {
    dataset_version: `${sha}+${checksum.slice(0, 12)}`,
    git_short_sha: sha,
    import_checksum: checksum,
    generated_at: new Date().toISOString(),
    counts: {
      entities: dataset.entities.length,
      facts: dataset.facts.length,
      evidence: dataset.evidence.length,
      fact_evidence: dataset.factEvidence.length,
      features: dataset.features.length,
    },
    licenses: {
      geometry: "© OpenStreetMap contributors, ODbL 1.0. Derived geometry exports must retain this ODbL attribution notice.",
      research_data: "No blanket dataset license for facts/evidence is specified in the repository; owner decision required before redistribution under a license.",
      basemap: "OpenFreeMap basemap; see https://openfreemap.org/ for its terms and attribution.",
    },
  };
}

export function serializeCsv(headers: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const cell = (value: unknown): string => {
    let text: string;
    if (value === null || value === undefined) text = "";
    else if (Array.isArray(value)) text = value.join("|");
    else if (typeof value === "object") text = JSON.stringify(value);
    else text = String(value);
    return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${headers.join(",")}\r\n${rows.map((row) => headers.map((header) => cell(row[header])).join(",")).join("\r\n")}\r\n`;
}

export function joinedFeatureCollection(dataset: StaticAtlasDataset, metadata: Awaited<ReturnType<typeof getExportMetadata>>) {
  const entities = new Map(dataset.entities.map((entity) => [entity.code, entity]));
  return {
    type: "FeatureCollection" as const,
    name: "Greater Cairo Atlas geometry export",
    metadata,
    features: dataset.features.map((feature) => {
      const entity = entities.get(feature.entity_code)!;
      const props = (feature.properties.properties && typeof feature.properties.properties === "object"
        ? feature.properties.properties
        : {}) as Record<string, unknown>;
      return {
        type: "Feature" as const,
        id: feature.code,
        geometry: feature.geometry,
        properties: {
          code: feature.code,
          entity_code: entity.code,
          name_ar: entity.name_ar,
          name_en: entity.name_en,
          entity_type: entity.entity_type,
          status: entity.status,
          sector: entity.sector,
          aliases: entity.aliases,
          license: feature.license,
          attribution: feature.license.startsWith("ODbL")
            ? "© OpenStreetMap contributors, ODbL 1.0"
            : props.attribution,
          source: props.source,
          retrieval_date: props.retrieval_date,
          source_ids: props.source_ids,
          osm_type: feature.osm_type,
          osm_id: feature.osm_id,
          osm_version: feature.osm_version,
        },
      };
    }),
  };
}

