import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const read = (relative: string) => readFile(path.join(process.cwd(), relative), "utf8");

/** Code only: a promise made in a comment ("must never say it opened in 2019") is not a claim in the UI. */
const codeOf = (source: string) => source
  .split("\n")
  .filter((line) => !/^\s*(\/\/|\/?\*)/u.test(line))
  .join("\n");

describe("BATCH 14 — the tested helpers are the ones the UI actually runs", () => {
  it("the map reads its year from the URL through the tested resolver", async () => {
    const app = await read("src/components/atlas/AtlasApp.tsx");
    // A helper nobody calls is a test of nothing. The bug this feature started with was exactly in this
    // glue, so the glue must call the function the tests pin.
    expect(app).toContain("resolveTimelineUrlState(params.get(\"year\"), timeRange)");
    expect(app).toContain("resolveTimelineUrlState(next.get(\"year\"), timeRange)");
    expect(app).toContain("timelineYearParam({ year: timelineYear, enabled: timelineEnabled }, timeRange.max)");
    // And the status resolution itself.
    expect(app).toContain("resolveStatusByYear(statusTimeline, timelineYear)");
  });

  it("the timeline is available outside researcher mode", async () => {
    const app = await read("src/components/atlas/AtlasApp.tsx");
    // The control is rendered in the general toolbar, not inside a ResearcherOnly block.
    const control = app.indexOf("<TimeControl");
    const before = app.slice(0, control);
    expect(before.lastIndexOf("<ResearcherOnly>")).toBeLessThan(before.lastIndexOf("</ResearcherOnly>"));
    // The resolver is no longer gated on research mode either.
    expect(app).toContain("const useTimeline = timelineEnabled;");
    expect(app).not.toContain("researcherMode && timelineEnabled");
  });

  it("the researcher panel names the deciding fact rather than asserting a status", async () => {
    const panel = await read("src/components/atlas/EntityPanel.tsx");
    expect(panel).toContain("TimelinePanelNote");
    const note = await read("src/components/atlas/TimeControl.tsx");
    // The note must be able to say "no claim exists", not only to report one.
    expect(note).toContain("undatedStatusLabel");
    expect(note).toContain("notDrawnReasonLabel");
    // It must never claim an entity opened because of an interval it does not have.
    expect(codeOf(note)).not.toMatch(/opened in|must have opened|بالتأكيد افتتح/u);
  });

  it("display settings are read and written through the versioned store", async () => {
    const app = await read("src/components/atlas/AtlasApp.tsx");
    expect(app).toContain("readDisplaySettings(window.localStorage)");
    expect(app).toContain("writeDisplaySettings(window.localStorage, settings)");
    expect(app).toContain("clearDisplaySettings(window.localStorage)");
    expect(app).toContain("resolveDisplaySettings(storedDisplay");
    // Theme must actually be read back from the store, or it is a dead field and the user's choice is
    // restored from a second key that can disagree with it.
    expect(app).toContain("setTheme(storedDisplay.theme)");
    // Researcher filters still use their older blob, but display state must go through the versioned store
    // so the two shapes cannot half-overwrite each other.
    const writer = codeOf(app).slice(codeOf(app).indexOf("gca-map-state"));
    expect(writer.slice(0, 200)).toContain("filters");
    expect(codeOf(app)).toContain("writeDisplaySettings(window.localStorage, settings)");
  });

  it("opacity reaches the map and the panel, from one state", async () => {
    const app = await read("src/components/atlas/AtlasApp.tsx");
    expect(app).toContain("opacity={layerOpacity}");
    expect(app).toContain("<LayerOpacityControls");
    const map = await read("src/components/atlas/MapView.tsx");
    expect(map).toContain("applyGroupOpacity(map, opacity, authoredOpacity.current)");
  });

  it("a restored opacity cannot compound when the slider is dragged repeatedly", async () => {
    const map = await read("src/components/atlas/MapView.tsx");
    // The authored value is captured once per style build; reading it back each time would square the factor.
    expect(map).toContain("authoredCache.get(key)");
    expect(map).toContain("authoredCache.set(key, base)");
    expect(map).toContain("authoredOpacity.current.clear()");
  });
});

describe("BATCH 14.2 — restoring must not overwrite what it is restoring", () => {
  /** A minimal model of the two effects, to prove the guard rather than assert on source text. */
  const simulateMount = (saved: unknown, guardEnabled = true) => {
    // The state starts at the defaults, exactly like the component.
    let state = { theme: "night", opacity: { transport: 1 } };
    let wrote = 0;
    let storage = saved === null ? null : JSON.stringify(saved);
    let displayHydrated = false;
    let preferencesHydrated = false;

    // Effect 1: hydrate from storage — the flag flips now, but the state change only lands on the next render.
    preferencesHydrated = true;
    const parsed = storage ? JSON.parse(storage) as { theme: string; layerOpacity: { transport: number } } : null;
    const restored = parsed ? { theme: parsed.theme, opacity: { transport: parsed.layerOpacity.transport } } : null;

    // Effect 2: persist current state (this is the effect that must not run before the restore lands).
    const persist = () => {
      if (!preferencesHydrated) return;
      if (guardEnabled && !displayHydrated) { displayHydrated = true; return; }
      wrote += 1;
      storage = JSON.stringify({ theme: state.theme, layerOpacity: state.opacity });
    };
    persist();

    // Render: the restored state lands now.
    state = restored ?? state;
    return { state, storage, wrote };
  };

  it("does not write the defaults over saved settings on the first commit", () => {
    // With the guard: nothing is written before the restored values land.
    const guarded = simulateMount({ theme: "day", layerOpacity: { transport: 0.4 } });
    expect(guarded.state.theme).toBe("day");
    expect(JSON.parse(guarded.storage!).theme).toBe("day");
    expect(JSON.parse(guarded.storage!).layerOpacity.transport).toBe(0.4);
    expect(guarded.wrote).toBe(0);
  });

  it("demonstrates the failure it prevents, so the test cannot pass for the wrong reason", () => {
    // Without the guard, the first persist runs while state is still the default and the user's chosen
    // theme is destroyed in storage before it was ever applied.
    const naive = simulateMount({ theme: "day", layerOpacity: { transport: 0.4 } }, false);
    expect(naive.wrote).toBe(1);
    expect(JSON.parse(naive.storage!).theme).toBe("night");
    // And the damage is persistent: the next visit restores the overwritten value, not the user's choice.
    expect(JSON.parse(naive.storage!).layerOpacity.transport).toBe(1);
  });

  it("keeps the guard in the component, not only in this model", async () => {
    const app = await read("src/components/atlas/AtlasApp.tsx");
    expect(app).toContain("displaySettingsHydrated");
    expect(app).toContain("if (!displaySettingsHydrated.current) { displaySettingsHydrated.current = true; return; }");
    // It must be its own flag: reusing `preferencesHydrated` is the bug this guards against.
    expect(app).toContain("const displaySettingsHydrated = useRef(false);");
  });
});
