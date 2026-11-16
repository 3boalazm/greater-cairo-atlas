import { normalizeEntityName } from "./entity-presentation";
import { isTransitInterchangeEntityCode } from "./transit-modes";
import type { AtlasEntitySummary } from "@/components/atlas/atlas-client";

const RECENT_KEY = "gca-recent-entities";
const RECENT_LIMIT = 8;
// Search-only synonyms; canonical names and research data are not changed.
const SEARCH_ALIASES: Record<string, string[]> = {
  "TRANSIT-MONORAIL-EAST": ["مونوريل العاصمة", "Capital Monorail"],
};
export type SearchGroup = "places" | "lines" | "stations" | "roads" | "landmarks";
export const SEARCH_GROUPS: Array<{ key: SearchGroup; ar: string; en: string }> = [
  { key: "places", ar: "مدن وأحياء", en: "Cities & districts" },
  { key: "lines", ar: "خطوط نقل", en: "Transit lines" },
  { key: "stations", ar: "محطات", en: "Stations" },
  { key: "roads", ar: "طرق وكباري", en: "Roads & bridges" },
  { key: "landmarks", ar: "معالم ومشروعات", en: "Landmarks & projects" },
];
export function searchGroup(type: string): SearchGroup {
  if (["city", "district", "neighborhood"].includes(type)) return "places";
  if (type === "transit_line") return "lines";
  if (["transit_stop", "transit_station", "rail_station"].includes(type)) return "stations";
  if (["road", "bridge", "bridge_interchange", "interchange", "tunnel"].includes(type)) return "roads";
  return "landmarks";
}
export function matchesEntity(entity: AtlasEntitySummary, query: string): boolean {
  const needle = normalizeEntityName(query);
  if (!needle) return false;
  return [entity.code, entity.name_ar, entity.name_en, ...entity.aliases, ...(SEARCH_ALIASES[entity.code] ?? [])]
    .some((name) => normalizeEntityName(name).includes(needle));
}
export function searchEntities(entities: readonly AtlasEntitySummary[], query: string): AtlasEntitySummary[] {
  return entities.filter((entity) => matchesEntity(entity, query));
}
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export function readRecent(storage: StorageLike): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(item)))].slice(0, RECENT_LIMIT) : [];
  } catch { return []; }
}
export function rememberEntity(storage: StorageLike, code: string): void {
  try { storage.setItem(RECENT_KEY, JSON.stringify([code, ...readRecent(storage).filter((item) => item !== code)].slice(0, RECENT_LIMIT))); } catch { /* Optional storage. */ }
}
export function suggestedEntities(entities: readonly AtlasEntitySummary[], recent: readonly string[]): AtlasEntitySummary[] {
  const byCode = new Map(entities.map((entity) => [entity.code, entity]));
  const codes = [...recent, "TRANSIT-METRO-L1", "TRANSIT-METRO-L2", "TRANSIT-METRO-L3", "TRANSIT-LRT", "TRANSIT-MONORAIL-EAST", "TRANSIT-BRT", ...entities.filter((entity) => isTransitInterchangeEntityCode(entity.code)).map((entity) => entity.code)];
  return [...new Set(codes)].flatMap((code) => byCode.get(code) ? [byCode.get(code)!] : []);
}
