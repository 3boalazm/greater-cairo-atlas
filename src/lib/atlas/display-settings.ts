/**
 * BATCH 14.2 — saved display settings.
 *
 * The map has accumulated enough switches (layer groups, live modes, line toggles, reference networks,
 * theme, opacity) that losing them on every reload is a real annoyance, and saving them badly is worse
 * than not saving them. This module is the whole contract, and it is deliberately paranoid:
 *
 * - **Versioned.** A stored blob from an older build has a different shape; it is discarded, not merged.
 *   Merging unknown history is how a settings file starts silently changing what a user sees.
 * - **Strict.** Every field is validated on read. An unknown key is dropped; a wrong type falls back to
 *   the default for that field rather than poisoning the whole object.
 * - **Corrupt-safe.** `JSON.parse` throws on hand-edited or truncated storage, so every read is wrapped.
 *   A browser with storage disabled must behave exactly like a browser with no saved settings.
 * - **URL wins.** A shared link carries the sender's intent; it must beat whatever the recipient saved.
 *   That precedence lives in `resolveDisplaySettings`, so it is testable rather than buried in a component.
 *
 * Nothing here touches `window`: the parse/serialize halves are pure and the storage wrapper takes the
 * `Storage` object as an argument. That is what makes the failure modes testable at all.
 */

export const DISPLAY_SETTINGS_VERSION = 2;
export const DISPLAY_SETTINGS_KEY = "gca-display-settings-v2";

/** The layer groups the map draws, in the order the panel lists them. */
export const LAYER_GROUPS = ["infrastructure", "transport", "areas", "projects", "reference"] as const;
export type LayerGroup = (typeof LAYER_GROUPS)[number];
export type LayerGroupVisibility = Record<LayerGroup, boolean>;

/** Opacity is stored per group as 0–1 and clamped on read, never trusted as stored. */
export type LayerOpacity = Record<LayerGroup, number>;

export interface DisplaySettings {
  version: typeof DISPLAY_SETTINGS_VERSION;
  layerGroups: LayerGroupVisibility;
  layerOpacity: LayerOpacity;
  showRoadNetwork: boolean;
  showRailNetwork: boolean;
  showDisusedRail: boolean;
  showInterchanges: boolean;
  theme: "day" | "night";
}

export const DEFAULT_LAYER_GROUPS: LayerGroupVisibility = {
  infrastructure: true, transport: true, areas: true, projects: true, reference: true,
};

/**
 * Defaults are 1 for every group: "opacity 100%" must render byte-identically to the map before this
 * feature existed. A default of 0.9 would have subtly changed every existing view.
 */
export const DEFAULT_LAYER_OPACITY: LayerOpacity = {
  infrastructure: 1, transport: 1, areas: 1, projects: 1, reference: 1,
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  version: DISPLAY_SETTINGS_VERSION,
  layerGroups: { ...DEFAULT_LAYER_GROUPS },
  layerOpacity: { ...DEFAULT_LAYER_OPACITY },
  showRoadNetwork: true,
  showRailNetwork: false,
  showDisusedRail: false,
  showInterchanges: true,
  theme: "night",
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** Opacity is clamped rather than rejected, so a corrupt 0 or 5 still yields a usable map. */
export function clampOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, Math.round(value * 100) / 100));
}

function readLayerGroups(value: unknown): LayerGroupVisibility {
  const groups = { ...DEFAULT_LAYER_GROUPS };
  if (!isRecord(value)) return groups;
  for (const group of LAYER_GROUPS) {
    const stored = value[group];
    if (isBoolean(stored)) groups[group] = stored;
  }
  return groups;
}

function readLayerOpacity(value: unknown): LayerOpacity {
  const opacity = { ...DEFAULT_LAYER_OPACITY };
  if (!isRecord(value)) return opacity;
  for (const group of LAYER_GROUPS) {
    if (group in value) opacity[group] = clampOpacity(value[group]);
  }
  return opacity;
}

/**
 * Parse a stored blob.
 *
 * Returns `null` — not defaults — when the blob is unusable, so the caller can tell "nothing saved" from
 * "saved settings that happen to equal the defaults". A version mismatch is unusable: the shapes differ,
 * and guessing how to migrate a preference file is how people end up with a map they cannot reset.
 */
export function parseDisplaySettings(raw: string | null | undefined): DisplaySettings | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== DISPLAY_SETTINGS_VERSION) return null;

  // Field by field, so one bad value cannot discard an otherwise good set of preferences.
  return {
    version: DISPLAY_SETTINGS_VERSION,
    layerGroups: readLayerGroups(parsed.layerGroups),
    layerOpacity: readLayerOpacity(parsed.layerOpacity),
    showRoadNetwork: isBoolean(parsed.showRoadNetwork) ? parsed.showRoadNetwork : DEFAULT_DISPLAY_SETTINGS.showRoadNetwork,
    showRailNetwork: isBoolean(parsed.showRailNetwork) ? parsed.showRailNetwork : DEFAULT_DISPLAY_SETTINGS.showRailNetwork,
    showDisusedRail: isBoolean(parsed.showDisusedRail) ? parsed.showDisusedRail : DEFAULT_DISPLAY_SETTINGS.showDisusedRail,
    showInterchanges: isBoolean(parsed.showInterchanges) ? parsed.showInterchanges : DEFAULT_DISPLAY_SETTINGS.showInterchanges,
    theme: parsed.theme === "day" || parsed.theme === "night" ? parsed.theme : DEFAULT_DISPLAY_SETTINGS.theme,
  };
}

/** Serialize for storage. Keys are written in a fixed order so the value is stable and diffable. */
export function serializeDisplaySettings(settings: DisplaySettings): string {
  return JSON.stringify({
    version: DISPLAY_SETTINGS_VERSION,
    layerGroups: Object.fromEntries(LAYER_GROUPS.map((group) => [group, settings.layerGroups[group]])),
    layerOpacity: Object.fromEntries(LAYER_GROUPS.map((group) => [group, clampOpacity(settings.layerOpacity[group])])),
    showRoadNetwork: settings.showRoadNetwork,
    showRailNetwork: settings.showRailNetwork,
    showDisusedRail: settings.showDisusedRail,
    showInterchanges: settings.showInterchanges,
    theme: settings.theme,
  });
}

/**
 * Read from a Storage-like object. Any thrown error (private mode, disabled storage, quota) becomes
 * `null`: a browser that cannot store preferences must still work, just without remembering them.
 */
export function readDisplaySettings(storage: Pick<Storage, "getItem"> | null | undefined): DisplaySettings | null {
  if (!storage) return null;
  try {
    return parseDisplaySettings(storage.getItem(DISPLAY_SETTINGS_KEY));
  } catch {
    return null;
  }
}

/** Write to a Storage-like object. Returns whether it actually stuck, so a caller can stay quiet on failure. */
export function writeDisplaySettings(storage: Pick<Storage, "setItem"> | null | undefined, settings: DisplaySettings): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DISPLAY_SETTINGS_KEY, serializeDisplaySettings(settings));
    return true;
  } catch {
    return false;
  }
}

export function clearDisplaySettings(storage: Pick<Storage, "removeItem"> | null | undefined): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(DISPLAY_SETTINGS_KEY);
    return true;
  } catch {
    return false;
  }
}

/** What a URL is allowed to override. Deliberately narrow: only what a shared link is meant to convey. */
export interface UrlDisplayIntent {
  layerGroups?: Partial<LayerGroupVisibility>;
  showRoadNetwork?: boolean;
  showRailNetwork?: boolean;
  showDisusedRail?: boolean;
}

/**
 * URL beats saved settings, per-key.
 *
 * If the link says `layers=transport`, the recipient sees only transport — not their saved layers merged
 * with it, which would quietly show more than the sender was pointing at. Keys the URL is silent about
 * keep the saved value, so a link about one thing does not reset everything else.
 */
export function resolveDisplaySettings(saved: DisplaySettings | null, url: UrlDisplayIntent | null): DisplaySettings {
  const base = saved ?? DEFAULT_DISPLAY_SETTINGS;
  if (!url) return base;
  const merged: DisplaySettings = {
    ...base,
    layerGroups: { ...base.layerGroups, ...(url.layerGroups ?? {}) },
    layerOpacity: { ...base.layerOpacity },
  };
  if (isBoolean(url.showRoadNetwork)) merged.showRoadNetwork = url.showRoadNetwork;
  if (isBoolean(url.showRailNetwork)) merged.showRailNetwork = url.showRailNetwork;
  if (isBoolean(url.showDisusedRail)) merged.showDisusedRail = url.showDisusedRail;
  return merged;
}

/** True when the settings are the defaults, so the UI can disable «إعادة الضبط» instead of no-oping. */
export function isDefaultSettings(settings: DisplaySettings): boolean {
  return serializeDisplaySettings(settings) === serializeDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
}

/**
 * Parse `?layers=` into an intent. An unknown group name is ignored, never invented as `false`.
 *
 * `?layers=` with an empty value means "no intent", not "hide everything": an empty parameter is what a
 * query-string builder leaves behind when every group is on, and reading it as "hide all" would hand the
 * recipient a blank map from a link whose sender was looking at a full one.
 */
export function parseLayersParam(value: string | null): Partial<LayerGroupVisibility> | undefined {
  if (value === null) return undefined;
  const requested = new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
  if (requested.size === 0) return undefined;
  return Object.fromEntries(LAYER_GROUPS.map((group) => [group, requested.has(group)])) as Partial<LayerGroupVisibility>;
}
