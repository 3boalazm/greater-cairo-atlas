import { readFile } from "node:fs/promises";
import {
  featureSeedSchema,
  type EntitySeed,
  type EvidenceSeed,
  type FeatureSeed,
} from "@/lib/atlas/schema";
import { SeedValidationError, type ValidationIssueDetail } from "@/lib/errors";

/** Inclusive Greater Cairo WGS84 envelope: west, south, east, north. */
export const GREATER_CAIRO_BBOX = {
  west: 30.5,
  south: 29.2,
  east: 32.1,
  north: 30.8,
} as const;

function positions(geometry: unknown): number[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const record = geometry as Record<string, unknown>;
  if (record.type === "GeometryCollection") {
    return Array.isArray(record.geometries)
      ? record.geometries.flatMap(positions)
      : [];
  }
  const output: number[][] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      output.push(value as number[]);
      return;
    }
    value.forEach(visit);
  };
  visit(record.coordinates);
  return output;
}

function ringIsValid(ring: number[][]): boolean {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return false;
  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]; const b = ring[i + 1];
    if (!a || !b) return false;
    twiceArea += a[0]! * b[1]! - b[0]! * a[1]!;
  }
  if (Math.abs(twiceArea) < 1e-12) return false;
  const orient = (a: number[], b: number[], c: number[]) =>
    (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
  const intersects = (a: number[], b: number[], c: number[], d: number[]) => {
    const abC = orient(a, b, c); const abD = orient(a, b, d);
    const cdA = orient(c, d, a); const cdB = orient(c, d, b);
    return abC * abD <= 0 && cdA * cdB <= 0;
  };
  const edgeCount = ring.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    for (let j = i + 1; j < edgeCount; j++) {
      if (j === i + 1 || (i === 0 && j === edgeCount - 1)) continue;
      const a = ring[i]; const b = ring[i + 1]; const c = ring[j]; const d = ring[j + 1];
      if (a && b && c && d && intersects(a, b, c, d)) return false;
    }
  }
  return true;
}

function hasValidPolygonRings(geometry: unknown): boolean {
  if (!geometry || typeof geometry !== "object") return false;
  const record = geometry as Record<string, unknown>;
  if (record.type === "GeometryCollection") {
    return Array.isArray(record.geometries) && record.geometries.every(hasValidPolygonRings);
  }
  if (record.type === "Polygon") {
    const rings = record.coordinates;
    return Array.isArray(rings) && rings.every((ring) => Array.isArray(ring) && ringIsValid(ring as number[][]));
  }
  if (record.type === "MultiPolygon") {
    const polygons = record.coordinates;
    return Array.isArray(polygons) && polygons.every((polygon) =>
      Array.isArray(polygon) && polygon.every((ring) => Array.isArray(ring) && ringIsValid(ring as number[][])),
    );
  }
  return true;
}

export function isGeometryInsideGreaterCairoBbox(geometry: unknown): boolean {
  const points = positions(geometry);
  return points.length > 0 && points.every(([longitude, latitude]) =>
    longitude !== undefined && latitude !== undefined &&
    longitude >= GREATER_CAIRO_BBOX.west && longitude <= GREATER_CAIRO_BBOX.east &&
    latitude >= GREATER_CAIRO_BBOX.south && latitude <= GREATER_CAIRO_BBOX.north,
  );
}

export async function loadAndValidateFeatureCollection(
  featurePath: string,
  entities: readonly EntitySeed[],
  evidence: readonly EvidenceSeed[] = [],
): Promise<FeatureSeed[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(/*turbopackIgnore: true*/ featurePath, "utf8"));
  } catch (error) {
    throw new SeedValidationError(
      `Cannot read feature GeoJSON "${featurePath}": ${error instanceof Error ? error.message : String(error)}`,
      [{ path: featurePath, message: "Feature GeoJSON is missing, unreadable, or invalid JSON." }],
    );
  }

  const issues: ValidationIssueDetail[] = [];
  if (!parsed || typeof parsed !== "object" || (parsed as Record<string, unknown>).type !== "FeatureCollection" || !Array.isArray((parsed as Record<string, unknown>).features)) {
    throw new SeedValidationError("Feature input must be a GeoJSON FeatureCollection.", [
      { path: featurePath, message: "Expected GeoJSON FeatureCollection with a features array." },
    ]);
  }

  const entityByCode = new Map(entities.map((entity) => [entity.code, entity]));
  const evidenceByCode = new Map(evidence.map((item) => [item.code, item]));
  const features: FeatureSeed[] = [];
  const seenCodes = new Set<string>();
  const rawFeatures = (parsed as { features: unknown[] }).features;
  for (let index = 0; index < rawFeatures.length; index++) {
    const raw = rawFeatures[index];
    const label = `features[${index}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ path: label, message: "Expected GeoJSON Feature object." });
      continue;
    }
    const record = raw as Record<string, unknown>;
    const props = record.properties;
    if (!props || typeof props !== "object" || Array.isArray(props)) {
      issues.push({ path: `${label}.properties`, message: "Expected feature metadata properties object." });
      continue;
    }
    const propsRecord = props as Record<string, unknown>;
    const candidate = {
      code: propsRecord.code,
      entity_code: propsRecord.entity_code,
      evidence_code: propsRecord.evidence_code ?? null,
      geometry: record.geometry,
      srid: propsRecord.srid,
      osm_type: propsRecord.osm_type ?? null,
      osm_id: propsRecord.osm_id ?? null,
      osm_version: propsRecord.osm_version ?? null,
      license: propsRecord.license,
      properties: propsRecord.properties,
    };
    const result = featureSeedSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ path: `${label}.${issue.path.join(".")}`, message: issue.message });
      }
      continue;
    }
    const item = result.data;
    if (seenCodes.has(item.code)) {
      issues.push({ path: `${label}.code`, message: `Duplicate feature code "${item.code}".` });
      continue;
    }
    seenCodes.add(item.code);
    const entity = entityByCode.get(item.entity_code);
    if (!entity) {
      issues.push({ path: `${label}.entity_code`, message: `Unknown entity code "${item.entity_code}"; feature imports never create entities.` });
      continue;
    }
    if (item.evidence_code !== null && !evidenceByCode.has(item.evidence_code)) {
      issues.push({ path: `${label}.evidence_code`, message: `Unknown evidence code "${item.evidence_code}".` });
      continue;
    }
    if (!hasValidPolygonRings(item.geometry)) {
      issues.push({ path: `${label}.geometry`, message: "Polygon rings must be closed, non-degenerate, and non-self-intersecting." });
      continue;
    }
    if (!isGeometryInsideGreaterCairoBbox(item.geometry)) {
      issues.push({ path: `${label}.geometry`, message: `Geometry must lie wholly within Greater Cairo WGS84 bbox ${JSON.stringify(GREATER_CAIRO_BBOX)}.` });
      continue;
    }
    const metadata = item.properties;
    if (typeof metadata.source !== "string" || metadata.source.trim() === "" ||
        typeof metadata.attribution !== "string" || metadata.attribution.trim() === "" ||
        typeof metadata.retrieval_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.retrieval_date)) {
      issues.push({ path: `${label}.properties.properties`, message: "Every feature must include source, attribution, and ISO retrieval_date metadata." });
      continue;
    }
    const alignmentEvidence = item.evidence_code ? evidenceByCode.get(item.evidence_code) : undefined;
    if (["planned", "approved_planned", "under_construction"].includes(entity.status) &&
        (metadata.official_alignment !== true || alignmentEvidence?.source_type !== "official" || alignmentEvidence.url === null)) {
      issues.push({ path: `${label}.entity_code`, message: `Entity status "${entity.status}" requires official_alignment metadata and linked official evidence with a URL before geometry can be imported.` });
      continue;
    }
    features.push(item);
  }

  if (issues.length > 0) {
    throw new SeedValidationError(
      `Feature validation failed with ${issues.length} issue(s):\n${issues.map((i) => `  - [${i.path}] ${i.message}`).join("\n")}`,
      issues,
    );
  }
  return features;
}
