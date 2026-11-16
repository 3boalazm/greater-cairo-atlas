import { createHash } from "node:crypto";
import { getSql } from "@/lib/db/client";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadAndValidateFeatureCollection } from "@/lib/atlas/features";
import { loadAndValidateSeedDir } from "@/lib/atlas/seed";
import type { EntityRelationSeed, EntitySeed, EvidenceSeed, FactSeed, FeatureSeed } from "@/lib/atlas/schema";
import { getAreaBoundaryCodes } from "@/lib/atlas/area-boundaries";

export interface StaticAtlasDataset {
  entities: EntitySeed[];
  evidence: EvidenceSeed[];
  facts: FactSeed[];
  relations: EntityRelationSeed[];
  factEvidence: Array<{ fact_code: string; evidence_code: string }>;
  features: FeatureSeed[];
  adminUnits: Array<{ id: string; geometry: FeatureSeed["geometry"]; properties: Record<string, unknown> }>;
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

/** Public exports are a canonical seed snapshot, minus any database retirements.
 * With no database configured the checked-in snapshot is the only available source.
 * When a database is configured, fail closed if retirement status cannot be read.
 */
export async function getPublicAtlasDataset(root = process.cwd()): Promise<StaticAtlasDataset> {
  const dataset = await getStaticAtlasDataset(root);
  if (!process.env.DATABASE_URL?.trim()) return dataset;
  const rows = await getSql().query("SELECT code FROM facts WHERE retired_at IS NOT NULL") as Array<{ code: string }>;
  return excludeRetiredFacts(dataset, new Set(rows.map((row) => row.code)));
}

export function excludeRetiredFacts(dataset: StaticAtlasDataset, retired: ReadonlySet<string>): StaticAtlasDataset {
  return { ...dataset, facts: dataset.facts.filter((fact) => !retired.has(fact.code)),
    factEvidence: dataset.factEvidence.filter((link) => !retired.has(link.fact_code)) };
}

async function loadStaticAtlasDataset(root: string): Promise<StaticAtlasDataset> {
  const seedDir = path.join(root, "data/seed");
  const featurePath = path.join(root, "data/features/features.geojson");
  const bundle = await loadAndValidateSeedDir(seedDir);
  const features = await loadAndValidateFeatureCollection(featurePath, bundle.entities, bundle.evidence);
  let adminUnits: StaticAtlasDataset["adminUnits"] = [];
  try {
    const source = JSON.parse(await readFile(path.join(root, "data/features/codab-admin-units.geojson"), "utf8")) as { features?: Array<{ id?: unknown; geometry?: unknown; properties?: unknown }> };
    adminUnits = (source.features ?? []).flatMap((feature) => feature.geometry && feature.properties && typeof feature.properties === "object"
      ? [{ id: String(feature.id ?? ""), geometry: feature.geometry as FeatureSeed["geometry"], properties: feature.properties as Record<string, unknown> }] : []);
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  return {
    ...bundle,
    factEvidence: bundle.facts.flatMap((fact) => fact.evidence_codes.map((evidence_code) => ({
      fact_code: fact.code,
      evidence_code,
    }))),
    features,
    adminUnits,
  };
}

interface EntityMapGeometryRecord {
  geometry: FeatureSeed["geometry"];
  license: string[];
  attribution: string[];
  sources: string[];
  retrieval_dates: string[];
}

export interface StaticEvidenceCatalogItem extends EvidenceSeed {
  linked_facts_count: number;
  linked_entities_count: number;
}

export interface StaticEvidenceFact extends FactSeed {
  entity_name_ar: string;
  entity_name_en: string;
  is_contradicted: boolean;
}

export interface StaticEvidenceDetail {
  evidence: StaticEvidenceCatalogItem;
  facts: StaticEvidenceFact[];
}

export interface StaticEntityRelation {
  subject_code: string;
  predicate: EntityRelationSeed["predicate"];
  object_code: string;
  ordinal: number | null;
  valid_as_of: string | null;
  evidence_ref: string | null;
  subject: Pick<EntitySeed, "code" | "name_ar" | "name_en" | "entity_type" | "status">;
  object: Pick<EntitySeed, "code" | "name_ar" | "name_en" | "entity_type" | "status">;
  evidence: EvidenceSeed | null;
}

export interface StaticEntityNeighbor extends StaticEntityRelation {
  direction: "previous" | "next";
}

export interface StaticEntityPageData extends EntitySeed {
  has_boundary: boolean;
  facts: Array<FactSeed & { evidence: EvidenceSeed[] }>;
  relations: StaticEntityRelation[];
  neighbors: StaticEntityNeighbor[];
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

function staticRelationRows(dataset: StaticAtlasDataset, code?: string): StaticEntityRelation[] {
  const entities = new Map(dataset.entities.map((entity) => [entity.code, entity]));
  const evidence = new Map(dataset.evidence.map((item) => [item.code, item]));
  return dataset.relations.flatMap((relation) => {
    if (code && relation.subject_code !== code && relation.object_code !== code) return [];
    const subject = entities.get(relation.subject_code);
    const object = entities.get(relation.object_code);
    if (!subject || !object) return [];
    const source = relation.evidence_ref ? evidence.get(relation.evidence_ref) ?? null : null;
    return [{
      ...relation,
      subject: { code: subject.code, name_ar: subject.name_ar, name_en: subject.name_en, entity_type: subject.entity_type, status: subject.status },
      object: { code: object.code, name_ar: object.name_ar, name_en: object.name_en, entity_type: object.entity_type, status: object.status },
      evidence: source,
    }];
  });
}

export async function getStaticEntityRelations(code?: string, root = process.cwd()): Promise<StaticEntityRelation[]> {
  return staticRelationRows(await getStaticAtlasDataset(root), code);
}

export async function getCodabLocatedWithin(code: string, root = process.cwd()): Promise<{ relation: "located_within"; pcodes: string[]; names_ar: string[]; evidence_code: string; source: string; license: string } | null> {
  try {
    const file = path.join(root, "data/features/codab-relations.json");
    const relations = JSON.parse(await readFile(file, "utf8")) as Array<{ entity_code: string; relation: "located_within"; pcodes: string[]; names_ar: string[]; evidence_code: string; source: string; license: string }>;
    return relations.find((item) => item.entity_code === code) ?? null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export function staticEntityNeighbors(dataset: StaticAtlasDataset, code: string): StaticEntityNeighbor[] {
  const relations = staticRelationRows(dataset);
  const stationRelations = relations.filter((relation) => relation.predicate === "has_station" && relation.object_code === code && relation.ordinal !== null);
  const neighbors = new Map<string, StaticEntityNeighbor>();
  for (const stationRelation of stationRelations) {
    for (const direction of ["previous", "next"] as const) {
      const ordinal = stationRelation.ordinal! + (direction === "previous" ? -1 : 1);
      const neighbor = relations.find((relation) => relation.predicate === "has_station" &&
        relation.subject_code === stationRelation.subject_code && relation.ordinal === ordinal);
      if (!neighbor || neighbor.object_code === code) continue;
      neighbors.set(`${neighbor.subject_code}:${neighbor.object_code}`, { ...neighbor, direction });
    }
  }
  return [...neighbors.values()].sort((a, b) => a.subject_code.localeCompare(b.subject_code) || a.ordinal! - b.ordinal!);
}

export async function getStaticEntityNeighbors(code: string, root = process.cwd()): Promise<StaticEntityNeighbor[]> {
  return staticEntityNeighbors(await getStaticAtlasDataset(root), code);
}

export async function getStaticEvidenceCatalog(root = process.cwd()): Promise<StaticEvidenceCatalogItem[]> {
  const dataset = await getPublicAtlasDataset(root);
  const factsByEvidence = new Map<string, FactSeed[]>();
  for (const fact of dataset.facts) for (const evidenceCode of fact.evidence_codes) {
    factsByEvidence.set(evidenceCode, [...(factsByEvidence.get(evidenceCode) ?? []), fact]);
  }
  return dataset.evidence.map((evidence) => {
    const facts = factsByEvidence.get(evidence.code) ?? [];
    return { ...evidence, linked_facts_count: facts.length, linked_entities_count: new Set(facts.map((fact) => fact.entity_code)).size };
  });
}

export async function getStaticEvidenceDetail(code: string, root = process.cwd()): Promise<StaticEvidenceDetail | null> {
  const dataset = await getPublicAtlasDataset(root);
  const evidence = await getStaticEvidenceCatalog(root).then((items) => items.find((item) => item.code === code));
  if (!evidence) return null;
  const entities = new Map(dataset.entities.map((entity) => [entity.code, entity]));
  const facts = dataset.facts.filter((fact) => fact.evidence_codes.includes(code));
  return {
    evidence,
    facts: facts.map((fact) => {
      const entity = entities.get(fact.entity_code)!;
      const contradictingClaim = fact.verification_state === "disputed" || dataset.facts.some((other) =>
        other.entity_code === fact.entity_code && other.attribute === fact.attribute && other.value !== fact.value &&
        !["superseded", "rejected"].includes(other.verification_state) && !["superseded", "rejected"].includes(fact.verification_state));
      return { ...fact, entity_name_ar: entity.name_ar, entity_name_en: entity.name_en, is_contradicted: contradictingClaim };
    }),
  };
}

export async function getStaticEntityPageData(code: string, root = process.cwd()): Promise<StaticEntityPageData | null> {
  const dataset = await getPublicAtlasDataset(root);
  const entity = dataset.entities.find((item) => item.code === code);
  if (!entity) return null;
  const evidenceByCode = new Map(dataset.evidence.map((item) => [item.code, item]));
  const mapGeometries = await loadEntityMapGeometries(root);
  const boundaryCodes = await getAreaBoundaryCodes(root);
  return {
    ...entity,
    has_boundary: boundaryCodes.has(code),
    facts: dataset.facts.filter((fact) => fact.entity_code === code).map((fact) => ({
      ...fact,
      evidence: fact.evidence_codes.flatMap((evidenceCode) => {
        const source = evidenceByCode.get(evidenceCode);
        return source ? [source] : [];
      }),
    })),
    relations: staticRelationRows(dataset, code),
    neighbors: staticEntityNeighbors(dataset, code),
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
    administrative_boundaries: string;
    research_data: string;
    code: string;
    contact: string;
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
      features: dataset.features.length + dataset.adminUnits.length,
    },
    licenses: {
      geometry: "© OpenStreetMap contributors, ODbL 1.0. Derived geometry exports must retain this ODbL attribution notice.",
      administrative_boundaries: "© CAPMAS (الجهاز المركزي للتعبئة العامة والإحصاء) via OCHA/HDX, CC BY-IGO. Source: https://data.humdata.org/dataset/cod-ab-egy",
      research_data: "© Mustafa Aboalazm (مصطفى أبوالعزم), licensed under CC BY 4.0",
      code: "No code license has been specified by the owner; code licensing remains for the owner to decide.",
      contact: "01092500454 · 3boalazm@gmail.com",
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
    features: [...dataset.features.map((feature) => {
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
    }), ...dataset.adminUnits.map((feature) => ({
      type: "Feature" as const, id: feature.id, geometry: feature.geometry,
      properties: {
        ...feature.properties, code: feature.properties.code, entity_code: feature.properties.pcode,
        level: feature.properties.level, name_ar: feature.properties.name_ar, name_en: feature.properties.name_en ?? "",
        entity_type: "admin_unit", status: "unknown", sector: null, aliases: [],
        license: "CC-BY-IGO", attribution: feature.properties.attribution,
        source: feature.properties.source, retrieval_date: "2026-11-15",
        source_ids: { pcode: feature.properties.pcode, level: feature.properties.level,
          parent_pcodes: feature.properties.parent_pcodes, area_sqkm: feature.properties.area_sqkm },
      },
    }))],
  };
}

