import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_SETTINGS, DISPLAY_SETTINGS_KEY, DISPLAY_SETTINGS_VERSION, LAYER_GROUPS,
  clampOpacity, clearDisplaySettings, isDefaultSettings, parseDisplaySettings, parseLayersParam,
  readDisplaySettings, resolveDisplaySettings, serializeDisplaySettings, writeDisplaySettings,
  type DisplaySettings,
} from "@/lib/atlas/display-settings";

/** A stand-in for localStorage that can be told to misbehave the way a real browser does. */
const fakeStorage = (initial: Record<string, string> = {}, mode: "ok" | "throws" = "ok") => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key: string) { if (mode === "throws") throw new DOMException("blocked", "SecurityError"); return data.get(key) ?? null; },
    setItem(key: string, value: string) { if (mode === "throws") throw new DOMException("quota", "QuotaExceededError"); data.set(key, value); },
    removeItem(key: string) { if (mode === "throws") throw new DOMException("blocked", "SecurityError"); data.delete(key); },
  };
};

const sample: DisplaySettings = {
  ...DEFAULT_DISPLAY_SETTINGS,
  layerGroups: { infrastructure: true, transport: false, areas: true, projects: false, reference: false },
  layerOpacity: { infrastructure: 0.8, transport: 0.45, areas: 1, projects: 0.6, reference: 0.3 },
  showRailNetwork: true,
  theme: "day",
};

describe("BATCH 14.2 — the settings serializer is versioned and strict", () => {
  it("round-trips a full settings object", () => {
    expect(parseDisplaySettings(serializeDisplaySettings(sample))).toEqual(sample);
  });

  it("defaults render identically to the map before this feature existed", () => {
    // Every group at full opacity is the whole point: a default of 0.9 would have changed every view.
    for (const group of LAYER_GROUPS) expect(DEFAULT_DISPLAY_SETTINGS.layerOpacity[group]).toBe(1);
    for (const group of LAYER_GROUPS) expect(DEFAULT_DISPLAY_SETTINGS.layerGroups[group]).toBe(true);
  });

  it("discards a blob from another version instead of migrating it blindly", () => {
    const old = JSON.stringify({ version: DISPLAY_SETTINGS_VERSION - 1, layerGroups: { transport: false }, theme: "day" });
    // Not merged, not partially applied: the shape may have changed meaning between versions.
    expect(parseDisplaySettings(old)).toBeNull();
    expect(parseDisplaySettings(JSON.stringify({ version: "2", theme: "day" }))).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    expect(parseDisplaySettings("{not json")).toBeNull();
    expect(parseDisplaySettings("[1,2,3]")).toBeNull();
    expect(parseDisplaySettings("null")).toBeNull();
    expect(parseDisplaySettings("")).toBeNull();
    expect(parseDisplaySettings(undefined)).toBeNull();
    expect(parseDisplaySettings(null)).toBeNull();
  });

  it("ignores unknown keys and keeps the known ones", () => {
    const blob = JSON.stringify({ version: DISPLAY_SETTINGS_VERSION, theme: "day", showRoadNetwork: false, somethingElse: { nested: true }, future_flag: "x" });
    const parsed = parseDisplaySettings(blob)!;
    expect(parsed.theme).toBe("day");
    expect(parsed.showRoadNetwork).toBe(false);
    expect("somethingElse" in parsed).toBe(false);
    expect("future_flag" in parsed).toBe(false);
    // Fields the blob never mentioned fall back to their default rather than becoming undefined.
    expect(parsed.showInterchanges).toBe(DEFAULT_DISPLAY_SETTINGS.showInterchanges);
  });

  it("drops a bad field without discarding the good ones", () => {
    const blob = JSON.stringify({
      version: DISPLAY_SETTINGS_VERSION,
      theme: "purple",
      showRailNetwork: "yes",
      layerGroups: { transport: false, areas: "nope", made_up_group: true },
      layerOpacity: { transport: 0.5, areas: "half" },
    });
    const parsed = parseDisplaySettings(blob)!;
    expect(parsed.theme).toBe(DEFAULT_DISPLAY_SETTINGS.theme);
    expect(parsed.showRailNetwork).toBe(DEFAULT_DISPLAY_SETTINGS.showRailNetwork);
    expect(parsed.layerGroups.transport).toBe(false);
    expect(parsed.layerGroups.areas).toBe(true);
    expect("made_up_group" in parsed.layerGroups).toBe(false);
    expect(parsed.layerOpacity.transport).toBe(0.5);
    expect(parsed.layerOpacity.areas).toBe(1);
  });

  it("clamps opacity so a corrupt value cannot hide a layer entirely", () => {
    expect(clampOpacity(5)).toBe(1);
    expect(clampOpacity(0)).toBe(0.1);
    expect(clampOpacity(-2)).toBe(0.1);
    expect(clampOpacity(Number.NaN)).toBe(1);
    expect(clampOpacity("0.5")).toBe(1);
    expect(clampOpacity(0.444)).toBe(0.44);
    const parsed = parseDisplaySettings(JSON.stringify({ version: DISPLAY_SETTINGS_VERSION, layerOpacity: { transport: 9 } }))!;
    expect(parsed.layerOpacity.transport).toBe(1);
  });
});

describe("BATCH 14.2 — storage failures never break the map", () => {
  it("reads null when storage throws, as in private mode", () => {
    expect(readDisplaySettings(fakeStorage({}, "throws"))).toBeNull();
  });

  it("reads null when no storage exists at all", () => {
    expect(readDisplaySettings(null)).toBeNull();
    expect(readDisplaySettings(undefined)).toBeNull();
  });

  it("reports a failed write instead of throwing", () => {
    expect(writeDisplaySettings(fakeStorage({}, "throws"), sample)).toBe(false);
    expect(clearDisplaySettings(fakeStorage({}, "throws"))).toBe(false);
  });

  it("writes and reads back through a working storage", () => {
    const storage = fakeStorage();
    expect(writeDisplaySettings(storage, sample)).toBe(true);
    expect(storage.data.get(DISPLAY_SETTINGS_KEY)).toBe(serializeDisplaySettings(sample));
    expect(readDisplaySettings(storage)).toEqual(sample);
  });

  it("treats a corrupt stored blob as 'nothing saved'", () => {
    const storage = fakeStorage({ [DISPLAY_SETTINGS_KEY]: "{{{ broken" });
    expect(readDisplaySettings(storage)).toBeNull();
  });
});

describe("BATCH 14.2 — a shared link beats saved settings, per key", () => {
  it("lets the URL's layers win over saved layers", () => {
    const saved: DisplaySettings = { ...sample, layerGroups: { infrastructure: true, transport: true, areas: true, projects: true, reference: true } };
    const resolved = resolveDisplaySettings(saved, { layerGroups: parseLayersParam("transport") });
    // The link said "transport only" — the recipient must not see their own saved groups merged in.
    expect(resolved.layerGroups).toEqual({ infrastructure: false, transport: true, areas: false, projects: false, reference: false });
  });

  it("keeps saved values for keys the URL is silent about", () => {
    const resolved = resolveDisplaySettings(sample, { layerGroups: parseLayersParam("areas") });
    expect(resolved.layerGroups.areas).toBe(true);
    // Untouched by the link, so the saved preferences survive.
    expect(resolved.theme).toBe("day");
    expect(resolved.showRailNetwork).toBe(true);
    expect(resolved.layerOpacity).toEqual(sample.layerOpacity);
  });

  it("lets the URL turn a reference network on even when it was saved off", () => {
    const saved: DisplaySettings = { ...DEFAULT_DISPLAY_SETTINGS, showRailNetwork: false };
    expect(resolveDisplaySettings(saved, { showRailNetwork: true }).showRailNetwork).toBe(true);
  });

  it("falls back to defaults when nothing is saved and the URL says nothing", () => {
    expect(resolveDisplaySettings(null, null)).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it("does not let a URL with an empty layers value blank the map", () => {
    // A query builder leaves `?layers=` behind when every group is on. Reading that as "hide all" would
    // hand the recipient an empty map from a link whose sender was looking at a full one.
    expect(parseLayersParam("")).toBeUndefined();
    expect(parseLayersParam(",")).toBeUndefined();
    // A missing key is no intent either.
    expect(parseLayersParam(null)).toBeUndefined();
  });

  it("ignores unknown group names in the URL", () => {
    const intent = parseLayersParam("transport,not_a_group")!;
    expect(intent.transport).toBe(true);
    expect("not_a_group" in intent).toBe(false);
  });
});

describe("BATCH 14.2 — reset", () => {
  it("recognises the defaults so the reset button can be disabled", () => {
    expect(isDefaultSettings(DEFAULT_DISPLAY_SETTINGS)).toBe(true);
    expect(isDefaultSettings(sample)).toBe(false);
    // A settings object equal to the defaults in every field is still "default", whatever its history.
    expect(isDefaultSettings({ ...DEFAULT_DISPLAY_SETTINGS })).toBe(true);
  });

  it("clears the stored key on reset", () => {
    const storage = fakeStorage({ [DISPLAY_SETTINGS_KEY]: serializeDisplaySettings(sample) });
    expect(clearDisplaySettings(storage)).toBe(true);
    expect(storage.data.has(DISPLAY_SETTINGS_KEY)).toBe(false);
    expect(readDisplaySettings(storage)).toBeNull();
  });
});
