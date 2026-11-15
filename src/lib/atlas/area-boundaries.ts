import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EntitySeed } from "@/lib/atlas/schema";

export interface AreaBoundaryFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
  properties: {
    code: string;
    entity_code: string;
    osm_type?: "way" | "relation";
    osm_id?: number;
    osm_version?: number;
    license: "ODbL-1.0" | "CC BY-IGO";
    properties: {
      role: "boundary";
      entity_type: string;
      boundary_kind: "administrative" | "place" | "landuse";
      source_kind: "administrative" | "place" | "landuse";
      area_km2: number;
      display_label_ar: string | null;
      display_label_en: string | null;
      admin_level: string | null;
      name: string | null;
      name_ar: string | null;
      name_en: string | null;
      osm_tags?: Record<string, unknown>;
      source_ids?: { osm_type: string; osm_id: number; osm_version: number };
      source: string;
      attribution: string;
      license: "ODbL-1.0" | "CC BY-IGO";
      retrieval_date: string;
    };
  };
}

const boundaryFile = (root: string) => path.join(root, "data/features/boundaries.geojson");
const officialBoundaryFile = (root: string) => path.join(root, "data/features/codab-entity-boundaries.geojson");
const cache = new Map<string, Promise<AreaBoundaryFeature[]>>();
const officialCache = new Map<string, Promise<AreaBoundaryFeature[]>>();

function isFinitePosition(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && Number.isFinite(value[0]) &&
    typeof value[1] === "number" && Number.isFinite(value[1]);
}

function validRing(ring: unknown): boolean {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isFinitePosition)) return false;
  const first = ring[0] as number[];
  const last = ring.at(-1) as number[];
  return first[0] === last[0] && first[1] === last[1] &&
    new Set(ring.map((point) => `${(point as number[])[0]},${(point as number[])[1]}`)).size >= 3;
}

function validPolygonGeometry(geometry: unknown): geometry is AreaBoundaryFeature["geometry"] {
  if (!geometry || typeof geometry !== "object") return false;
  const value = geometry as Record<string, unknown>;
  if (value.type === "Polygon") return Array.isArray(value.coordinates) && value.coordinates.length > 0 && value.coordinates.every(validRing);
  if (value.type === "MultiPolygon") return Array.isArray(value.coordinates) && value.coordinates.length > 0 &&
    value.coordinates.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing));
  return false;
}

export function isAreaBoundaryFeature(value: unknown): value is AreaBoundaryFeature {
  if (!value || typeof value !== "object") return false;
  const feature = value as Record<string, unknown>;
  const props = feature.properties;
  if (feature.type !== "Feature" || typeof feature.id !== "string" || !validPolygonGeometry(feature.geometry) ||
      !props || typeof props !== "object") return false;
  const metadata = (props as Record<string, unknown>).properties;
  if (!metadata || typeof metadata !== "object") return false;
  const p = props as Record<string, unknown>;
  const m = metadata as Record<string, unknown>;
  const ids = m.source_ids as Record<string, unknown> | undefined;
  return typeof p.code === "string" && typeof p.entity_code === "string" &&
    (p.osm_type === "way" || p.osm_type === "relation") && Number.isInteger(p.osm_id) && Number(p.osm_id) > 0 &&
    Number.isInteger(p.osm_version) && Number(p.osm_version) > 0 && p.license === "ODbL-1.0" &&
    m.role === "boundary" && ["administrative", "place", "landuse"].includes(String(m.boundary_kind)) &&
    ["administrative", "place", "landuse"].includes(String(m.source_kind)) &&
    m.source === "OpenStreetMap" && m.attribution === "© OpenStreetMap contributors, ODbL 1.0" &&
    m.license === "ODbL-1.0" && typeof m.retrieval_date === "string" &&
    Boolean(ids && ids.osm_type === p.osm_type && ids.osm_id === p.osm_id && ids.osm_version === p.osm_version);
}

async function loadBoundaries(root: string): Promise<AreaBoundaryFeature[]> {
  try {
    const parsed = JSON.parse(await readFile(boundaryFile(root), "utf8")) as { features?: unknown } | null;
    return parsed && Array.isArray(parsed.features) ? parsed.features.filter(isAreaBoundaryFeature) : [];
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

function getCachedBoundaries(root: string): Promise<AreaBoundaryFeature[]> {
  let pending = cache.get(root);
  if (!pending) {
    pending = loadBoundaries(root);
    cache.set(root, pending);
  }
  return pending;
}

async function loadOfficialBoundaries(root: string): Promise<AreaBoundaryFeature[]> {
  try {
    const parsed = JSON.parse(await readFile(officialBoundaryFile(root), "utf8")) as { features?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.features)) return [];
    return parsed.features.flatMap((raw) => {
      const props = raw.properties as Record<string, unknown> | undefined;
      const geometry = raw.geometry as AreaBoundaryFeature["geometry"] | undefined;
      if (!props || !geometry || typeof props.entity_code !== "string" || typeof props.code !== "string") return [];
      const feature = {
        type: "Feature" as const, id: String(raw.id ?? props.code), geometry,
        properties: {
          code: props.code, entity_code: props.entity_code, license: "CC BY-IGO" as const,
          properties: {
            role: "boundary" as const, entity_type: "administrative_unit", boundary_kind: "administrative" as const,
            source_kind: "administrative" as const, area_km2: Number(props.area_sqkm) || 0,
            display_label_ar: typeof props.name_ar === "string" ? props.name_ar : null,
            display_label_en: typeof props.name_en === "string" ? props.name_en : null,
            admin_level: String(props.level ?? "2"), name: null,
            name_ar: typeof props.name_ar === "string" ? props.name_ar : null,
            name_en: typeof props.name_en === "string" ? props.name_en : null,
            source: String(props.source ?? "CAPMAS COD-AB 2017 (reviewed 2024)"),
            attribution: String(props.attribution ?? "حدود إدارية © الجهاز المركزي للتعبئة العامة والإحصاء عبر OCHA/HDX (CC BY-IGO)"),
            license: "CC BY-IGO" as const, retrieval_date: "2026-11-15",
          },
        },
      };
      return [feature as AreaBoundaryFeature];
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

function getCachedOfficialBoundaries(root: string): Promise<AreaBoundaryFeature[]> {
  let pending = officialCache.get(root);
  if (!pending) { pending = loadOfficialBoundaries(root); officialCache.set(root, pending); }
  return pending;
}

export async function getAreaBoundaryCodes(root = process.cwd()): Promise<Set<string>> {
  const [official, osm] = await Promise.all([getCachedOfficialBoundaries(root), getCachedBoundaries(root)]);
  return new Set([...official, ...osm].map((feature) => feature.properties.entity_code));
}

export async function getAreaBoundary(entityCode: string, root = process.cwd()): Promise<AreaBoundaryFeature | null> {
  const official = await getCachedOfficialBoundaries(root);
  return official.find((feature) => feature.properties.entity_code === entityCode) ??
    (await getCachedBoundaries(root)).find((feature) => feature.properties.entity_code === entityCode) ?? null;
}

export async function getOsmAreaBoundary(entityCode: string, root = process.cwd()): Promise<AreaBoundaryFeature | null> {
  return (await getCachedBoundaries(root)).find((feature) => feature.properties.entity_code === entityCode) ?? null;
}

export function isBoundaryEligibleEntity(entity: Pick<EntitySeed, "entity_type">): boolean {
  return ["city", "district", "neighborhood", "authority"].includes(entity.entity_type);
}

const normalize = (value: string) => {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("und")
    .replace(/[أإآٱ]/gu, "ا").replace(/ة/gu, "ه").replace(/ى/gu, "ي");
  const generic = new Set(["حي", "الحي", "قسم", "القسم", "مدينه", "المدينه", "منطقه", "المنطقه", "district", "city"]);
  return normalized.match(/[\p{L}\p{N}]+/gu)?.filter((token) => !generic.has(token)).join("") ?? "";
};
const adminLevels: Record<string, Set<string>> = {
  city: new Set(["4", "6", "8"]), district: new Set(["6", "8", "9", "10"]),
  neighborhood: new Set(["8", "9", "10"]), authority: new Set(["4", "6", "8", "9", "10"]),
  development_zone: new Set(["6", "8", "9", "10"]),
};

export function matchOsmBoundaryElement(
  element: Record<string, unknown>, entity: EntitySeed,
  bbox: readonly [number, number, number, number] = [30.2, 28.8, 32.5, 31.0],
): AreaBoundaryFeature | null {
  if (!isBoundaryEligibleEntity(entity) || !["way", "relation"].includes(String(element.type))) return null;
  const tags = element.tags;
  if (!tags || typeof tags !== "object") return null;
  const tagMap = tags as Record<string, unknown>;
  const kind: "administrative" | "place" | "landuse" | null = tagMap.boundary === "administrative" ? "administrative" :
    ["city", "town", "village", "suburb", "neighbourhood", "neighborhood", "quarter", "district", "borough"].includes(String(tagMap.place)) ? "place" :
      tagMap.landuse === "residential" && ["name", "name:ar", "name:en"].some((key) => typeof tagMap[key] === "string") ? "landuse" : null;
  if (!kind) return null;
  const adminLevel = typeof tagMap.admin_level === "string" ? tagMap.admin_level : null;
  if (kind === "administrative" && (!adminLevel || !adminLevels[entity.entity_type]?.has(adminLevel))) return null;
  const labels = ["name", "name:ar", "name:en", "official_name", "alt_name", "old_name", "short_name"]
    .flatMap((key) => typeof tagMap[key] === "string" ? String(tagMap[key]).split(";") : []);
  const entityNames = [entity.name_ar, entity.name_en, ...entity.aliases].map(normalize).filter(Boolean);
  if (!labels.some((label) => entityNames.includes(normalize(label)))) return null;
  const coordinates = element.geometry;
  if (!Array.isArray(coordinates) || coordinates.length < 4 || !coordinates.every((position) =>
    position && typeof position === "object" && typeof (position as Record<string, unknown>).lon === "number" && typeof (position as Record<string, unknown>).lat === "number")) return null;
  const ring = (coordinates as Array<{ lon: number; lat: number }>).map((position) => [position.lon, position.lat]);
  if (ring[0]?.[0] !== ring.at(-1)?.[0] || ring[0]?.[1] !== ring.at(-1)?.[1]) return null;
  const [west, south, east, north] = bbox;
  if (ring.some(([lon, lat]) => lon! < west || lon! > east || lat! < south || lat! > north)) return null;
  const id = Number(element.id); const version = Number(element.version);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(version) || version <= 0) return null;
  const osmType = element.type as "way" | "relation";
  const code = `OSM-BOUNDARY-${osmType.toUpperCase()}-${id}-${entity.code}`;
  const centerLat = ring.reduce((sum, position) => sum + (position[1] ?? 0), 0) / ring.length;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const left = ring[index]!;
    const right = ring[index + 1]!;
    twiceArea += (left[0]! * right[1]!) - (right[0]! * left[1]!);
  }
  const areaKm2 = Math.abs(twiceArea / 2) * 111.32 * 110.574 * Math.max(0.1, Math.abs(Math.cos(centerLat * Math.PI / 180)));
  const props = {
    role: "boundary" as const, entity_type: entity.entity_type, boundary_kind: kind, source_kind: kind,
    area_km2: areaKm2, display_label_ar: null, display_label_en: null, admin_level: adminLevel,
    name: typeof tagMap.name === "string" ? tagMap.name : null,
    name_ar: typeof tagMap["name:ar"] === "string" ? tagMap["name:ar"] : null,
    name_en: typeof tagMap["name:en"] === "string" ? tagMap["name:en"] : null,
    osm_tags: tagMap, source_ids: { osm_type: osmType, osm_id: id, osm_version: version }, source: "OpenStreetMap" as const,
    attribution: "© OpenStreetMap contributors, ODbL 1.0" as const, license: "ODbL-1.0" as const,
    retrieval_date: "2026-11-14",
  };
  const feature: AreaBoundaryFeature = {
    type: "Feature", id: code,
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: { code, entity_code: entity.code, osm_type: osmType, osm_id: id, osm_version: version,
      license: "ODbL-1.0", properties: props },
  };
  return isAreaBoundaryFeature(feature) ? feature : null;
}
