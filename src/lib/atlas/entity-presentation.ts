import { ENTITY_TYPE_LABELS, SECTOR_LABELS, translateLabel } from "./labels";
import { transitModeLabel } from "./transit-modes";

export type PresentationLanguage = "ar" | "en";

/** The minimum an entity must expose to be presented in a list or search row. */
export interface PresentableEntity {
  code: string;
  name_ar: string;
  name_en: string;
  entity_type: string;
  sector?: string | null;
  /** The seed stores aliases as a `|`-joined string; the static dataset normalises them to an array. */
  aliases?: string | readonly string[] | null;
}

/** Normalises the two alias shapes the codebase uses into a list. */
export function aliasList(aliases: string | readonly string[] | null | undefined): string[] {
  if (!aliases) return [];
  if (Array.isArray(aliases)) return aliases.map((item) => item.trim()).filter(Boolean);
  return (aliases as string).split("|").map((item) => item.trim()).filter(Boolean);
}

const STATION_TYPES = new Set(["transit_stop", "rail_station", "transit_station"]);

export function isStationType(entityType: string): boolean {
  return STATION_TYPES.has(entityType);
}

/**
 * BATCH 12.2 — REGIONAL-sector entities are regional connection points, not Greater Cairo entities.
 *
 * CITY-ABU-SIMBEL and CITY-ALEXANDRIA are real registered entities that other facts and relations
 * point at, so they are never deleted or retyped; they are *presented* differently. This is the single
 * predicate every surface (directory, search, counts, the «المدن» layer) must use, so the atlas can
 * never drift into claiming Alexandria is inside Greater Cairo.
 */
export function isRegionalLink(entity: Pick<PresentableEntity, "sector">): boolean {
  return (entity.sector ?? "").trim().toUpperCase() === "REGIONAL";
}

export function regionalLinkLabel(language: PresentationLanguage): string {
  return language === "ar" ? "نقطة ربط إقليمية" : "Regional link";
}

export function regionalLinkNote(language: PresentationLanguage): string {
  return language === "ar"
    ? "خارج نطاق القاهرة الكبرى — مذكورة كنقطة ربط لأن حقائق أو علاقات تشير إليها."
    : "Outside Greater Cairo — listed as a regional link because facts or relations refer to it.";
}

/**
 * The type label used in a list row. A REGIONAL entity must never read as a plain «مدينة» inside a
 * Greater Cairo atlas, so its type label is replaced by the regional-link label.
 */
export function entityTypeLabel(entity: Pick<PresentableEntity, "entity_type" | "sector">, language: PresentationLanguage): string {
  if (isRegionalLink(entity)) return regionalLinkLabel(language);
  return translateLabel(ENTITY_TYPE_LABELS, entity.entity_type, language);
}

/** The extra qualifier a row needs after the name: mode/line for stations, nothing otherwise. */
export function entityQualifier(
  entity: Pick<PresentableEntity, "code" | "entity_type">,
  language: PresentationLanguage,
): string | null {
  if (!isStationType(entity.entity_type)) return null;
  const mode = transitModeLabel(entity.code, language);
  if (!mode) return null;
  return language === "ar" ? `محطة ${mode}` : mode;
}

/**
 * BATCH 12.3 — the one visible label a list/search row renders.
 *
 * Two different entities can share a name («6 أكتوبر» the city and «6 أكتوبر» the monorail station),
 * so the row is always name + type/mode. The type is part of the label rather than a separate cell so
 * that two rows can never render identical visible text.
 */
export function entityListLabel(entity: PresentableEntity, language: PresentationLanguage): string {
  const name = language === "ar" ? entity.name_ar : entity.name_en;
  const qualifier = entityQualifier(entity, language);
  const type = entityTypeLabel(entity, language);
  const detail = qualifier ?? type;
  return `${name} · ${detail}`;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0640\u200c\u200d\u00a0]/gu, "")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
    .replace(/[٠-٩۰-۹]/gu, (digit) => String("٠١٢٣٤٥٦٧٨٩".includes(digit) ? "٠١٢٣٤٥٦٧٨٩".indexOf(digit) : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

export function normalizeEntityName(value: string): string {
  return normalizeName(value);
}

export interface DisambiguationInput {
  code: string;
  displayLabel: string;
  /** Every name the entity is known by, including aliases. */
  names: readonly string[];
}

/**
 * BATCH 12.3 — when an alias exactly equals another entity's name (after normalisation), the row gets
 * a small line saying which entity that alias normally refers to. Nothing is renamed: the seed's names
 * and aliases are evidence, and the disambiguation lives in presentation only.
 */
export function disambiguationNote(
  entity: DisambiguationInput,
  all: readonly DisambiguationInput[],
  language: PresentationLanguage,
): string | null {
  const mine = new Set(entity.names.map(normalizeName).filter(Boolean));
  const colliding = all.find((other) => {
    if (other.code === entity.code) return false;
    const otherNames = new Set([...other.names, other.displayLabel].map(normalizeName).filter(Boolean));
    for (const name of mine) if (otherNames.has(name)) return true;
    return false;
  });
  if (!colliding) return null;
  const otherLabel = colliding.displayLabel;
  return language === "ar"
    ? `اسم يتكرر: يوجد أيضًا «${otherLabel}»، وهو كيان مختلف.`
    : `Shared name: «${otherLabel}» is a different entity.`;
}

/**
 * Ensures no two rows render the same visible label. Returns the codes that still collide, so the
 * caller (and the test) can prove the list is unambiguous instead of hoping it is.
 */
export function duplicateVisibleLabels(rows: ReadonlyArray<{ code: string; label: string }>): string[][] {
  const byLabel = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.label.trim();
    byLabel.set(key, [...(byLabel.get(key) ?? []), row.code]);
  }
  return [...byLabel.values()].filter((codes) => codes.length > 1);
}

/**
 * Splits a directory/search list into the Greater Cairo group and the regional-link group.
 * `sectorOf` lets a caller pass already-rendered rows instead of raw entities.
 */
export function groupByRegionalScope<T>(
  entities: readonly T[],
  sectorOf: (item: T) => string | null | undefined = (item) => (item as Pick<PresentableEntity, "sector">).sector,
): { local: T[]; regional: T[] } {
  const local: T[] = [];
  const regional: T[] = [];
  for (const entity of entities) (isRegionalLink({ sector: sectorOf(entity) }) ? regional : local).push(entity);
  return { local, regional };
}

/**
 * BATCH 12.2 — the «المدن» layer and city counts must ignore regional links, so Alexandria can never be
 * counted as a Greater Cairo city. Deleting it is not an option: relations and facts reference it.
 */
export function isGreaterCairoCity(entity: Pick<PresentableEntity, "entity_type" | "sector">): boolean {
  return entity.entity_type === "city" && !isRegionalLink(entity);
}

export function sectorLabel(sector: string | null | undefined, language: PresentationLanguage): string | null {
  if (!sector) return null;
  if (isRegionalLink({ sector })) return regionalLinkLabel(language);
  return translateLabel(SECTOR_LABELS, sector, language);
}
