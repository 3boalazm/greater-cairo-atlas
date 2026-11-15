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
