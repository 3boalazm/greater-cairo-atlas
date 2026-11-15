import { transitModesForEntityCode, type TransitMode } from "./transit-modes";

const TRANSIT_FEATURE_TYPES = new Set(["transit_line", "transit_stop", "rail_station", "transit_station"]);

export function isTransitFeatureType(featureType: string): boolean {
  return TRANSIT_FEATURE_TYPES.has(featureType);
}

/**
 * Resolves the modes that a transit feature is drawn under.
 *
 * The map data comes from two places: `/api/atlas/features` (a database row with explicit
 * `modes`) and the static home-page dataset. Both may leave `modes` empty for a station whose line
 * is not documented, so the entity code is used as the last resort — exactly like the MapLibre
 * symbol layers do. Returning `["unclassified"]` keeps such a station visible under the
 * «محطة — الخط غير موثق» mode instead of making it unconditionally immune to every filter.
 */
export function resolvedTransitModes(
  entityCode: string,
  featureModes: readonly string[] | undefined,
  lineCodes: readonly string[] = [],
): TransitMode[] {
  if (featureModes?.length) return featureModes as TransitMode[];
  const inferred = transitModesForEntityCode(entityCode, lineCodes);
  if (inferred.length) return inferred;
  return ["unclassified"];
}

/** FIX D: a transit feature is visible only when at least one of its modes is enabled. */
export function transitFeatureVisible(
  entityCode: string,
  featureModes: readonly string[] | undefined,
  visibleModes: readonly TransitMode[],
  lineCodes: readonly string[] = [],
): boolean {
  const modes = resolvedTransitModes(entityCode, featureModes, lineCodes);
  // Never let an unresolved mode become an unfilterable station: with no modes enabled nothing shows.
  if (!visibleModes.length) return false;
  return modes.some((mode) => visibleModes.includes(mode));
}

/** FIX D: a transit feature is visible only when at least one of its lines is enabled. */
export function transitLineEnabled(
  entityCode: string,
  featureLineCodes: readonly string[] | undefined,
  visibleLines: readonly string[],
): boolean {
  const lineCodes = featureLineCodes?.length ? featureLineCodes : entityCode.startsWith("TRANSIT-") ? [entityCode] : [];
  if (!lineCodes.length) return true;
  return lineCodes.some((line) => visibleLines.includes(line));
}
