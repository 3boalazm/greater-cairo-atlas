import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RAIL_REFERENCE_STATION_LAYERS,
  railReferenceStationFilter,
  stationLayerVisibility,
  stationModeFilter,
  stationRingFilter,
} from "@/lib/atlas/station-layer-visibility";
import { TRANSIT_MODE_ORDER, type TransitMode } from "@/lib/atlas/transit-modes";
import { isTransitFeatureType, resolvedTransitModes, transitFeatureVisible, transitLineEnabled } from "@/lib/atlas/transit-feature-filters";

const ALL_MODES = [...TRANSIT_MODE_ORDER] as TransitMode[];
const mapViewSource = path.resolve(process.cwd(), "src/components/atlas/MapView.tsx");

function visibleOnly(modes: TransitMode[], overrides: Partial<Parameters<typeof stationLayerVisibility>[0]> = {}) {
  return stationLayerVisibility({ visibleModes: modes, showInterchanges: true, showRailReference: true, ...overrides });
}

const EVERY_STATION_LAYER = [
  "atlas-station-entity-interchange-ring",
  "atlas-station-entity-icons",
  "atlas-station-entity-labels",
  "atlas-transit-interchange-ring",
  "atlas-transit-station-icons",
  "atlas-transit-station-labels",
  ...RAIL_REFERENCE_STATION_LAYERS,
];

describe("FIX D — station layers follow the same filter state as their line/mode", () => {
  it("hides every station layer when no transit mode is enabled (the «النقل» master toggle)", () => {
    const state = visibleOnly([]);
    expect(state.anyModeVisible).toBe(false);
    for (const layer of EVERY_STATION_LAYER) expect(state.layers[layer], layer).toBe(false);
    // The filter itself must match nothing rather than relying on visibility alone.
    expect(stationModeFilter(state.modes)).toEqual(["==", ["get", "osm_node_id"], -1]);
    expect(stationRingFilter(state.modes, true)).toEqual(["all", ["==", ["get", "osm_node_id"], -1], ["==", ["get", "interchange"], true]]);
  });

  it("drops the toggled mode from the station filter while keeping the remaining modes", () => {
    const withoutMetro = ALL_MODES.filter((mode) => mode !== "metro");
    const state = visibleOnly(withoutMetro);
    expect(state.modes).not.toContain("metro");
    expect(state.modes).toEqual(expect.arrayContaining(["lrt", "monorail_east", "brt", "enr"]));
    const filter = JSON.stringify(stationModeFilter(state.modes));
    expect(filter).not.toContain('"metro"');
    for (const mode of ["lrt", "monorail_east", "brt", "enr"]) expect(filter).toContain(`"${mode}"`);
    // Entity/metric station symbols stay on because other modes remain.
    expect(state.layers["atlas-station-entity-icons"]).toBe(true);
  });

  it.each(TRANSIT_MODE_ORDER)("hides both the %s line and its stations when that mode alone is off", (mode) => {
    const off = visibleOnly(ALL_MODES.filter((item) => item !== mode));
    const on = visibleOnly([mode]);
    // Line state: the mode disappears from the shared expression the line layers read.
    expect(JSON.stringify(stationModeFilter(on.modes))).toContain(`"${mode}"`);
    expect(JSON.stringify(stationModeFilter(off.modes))).not.toContain(`"${mode}"`);
    // Station state follows it: other modes remain, so entity stations stay visible and are
    // filtered by the same expression that just lost this mode.
    expect(off.anyModeVisible).toBe(true);
    expect(off.layers["atlas-station-entity-icons"]).toBe(true);
  });

  it("keeps the ENR reference stations tied to the ENR mode and the reference group", () => {
    expect(visibleOnly(ALL_MODES).layers["atlas-rail-stations"]).toBe(true);
    expect(visibleOnly(ALL_MODES, { showRailReference: false }).layers["atlas-rail-stations"]).toBe(false);
    const withoutEnr = ALL_MODES.filter((mode) => mode !== "enr");
    expect(visibleOnly(withoutEnr).layers["atlas-rail-stations"]).toBe(false);
    expect(visibleOnly(withoutEnr).layers["atlas-station-entity-icons"]).toBe(true);
  });

  it("removes interchange rings when the interchange toggle is off without touching plain station icons", () => {
    const state = visibleOnly(ALL_MODES, { showInterchanges: false });
    expect(state.showInterchangeRings).toBe(false);
    expect(state.layers["atlas-station-entity-interchange-ring"]).toBe(false);
    expect(state.layers["atlas-transit-interchange-ring"]).toBe(false);
    expect(state.layers["atlas-station-entity-icons"]).toBe(true);
    expect(stationRingFilter(state.modes, false)).toEqual(["==", ["get", "osm_node_id"], -1]);
  });

  it("filters rail reference stations by rail_status and drops disused/preserved unless requested", () => {
    const state = visibleOnly(ALL_MODES);
    expect(state.railStatuses).toEqual(["operational", "under_construction"]);
    const filter = JSON.stringify(railReferenceStationFilter(state.railStatuses));
    expect(filter).toContain('"rail_status"');
    expect(filter).not.toContain("disused");
    expect(railReferenceStationFilter(visibleOnly(ALL_MODES, { showDisusedRail: true }).railStatuses)).toEqual([
      "all", ["==", ["geometry-type"], "Point"], ["in", ["get", "railway"], ["literal", ["station", "halt"]]],
    ]);
  });

  it("never creates the compact-only overview layers on a compact map", () => {
    const state = visibleOnly(ALL_MODES, { compact: true });
    for (const layer of ["atlas-transit-interchange-ring", "atlas-transit-station-icons", "atlas-transit-station-labels"]) {
      expect(state.layers[layer], layer).toBe(false);
    }
    expect(state.layers["atlas-station-entity-icons"]).toBe(true);
  });

  it("routes every station layer in the map component through the shared visibility helper", async () => {
    const source = await readFile(mapViewSource, "utf8");
    // Every station layer id must be listed by the shared module and applied by the one helper.
    for (const layer of EVERY_STATION_LAYER) expect(source).toContain(`"${layer}"`);
    expect(source).toContain("applyStationLayerVisibility");
    expect(source).toContain("stationLayerVisibility(");
    // The old independent rail-station filter that bypassed the mode state must be gone.
    expect(source).not.toContain("RAIL_STATION_BASE_FILTER");
    expect(source).not.toMatch(/map\.setLayoutProperty\(id, "visibility", enabled \? "visible" : "none"\);\s*map\.setFilter\(id,/u);
  });
});

describe("FIX D — the React data filter cannot leak an unfiltered station either", () => {
  it("hides a transit feature whose mode list is empty when its mode is switched off", () => {
    // The reported bug: `if (modes.length && ...)` let an unresolved-mode station bypass the filter.
    expect(transitFeatureVisible("STOP-LRT-OBOUR", [], ["metro"])).toBe(false);
    expect(transitFeatureVisible("STOP-LRT-OBOUR", undefined, ["metro"])).toBe(false);
    expect(transitFeatureVisible("STOP-LRT-OBOUR", [], ["lrt"])).toBe(true);
  });

  it("treats an undetermined station mode as its own visible «unclassified» mode", () => {
    expect(resolvedTransitModes("STOP-UNKNOWN-X", [])).toEqual(["unclassified"]);
    expect(transitFeatureVisible("STOP-UNKNOWN-X", [], ["unclassified"])).toBe(true);
    expect(transitFeatureVisible("STOP-UNKNOWN-X", [], ["metro"])).toBe(false);
  });

  it("hides every transit feature when no mode is enabled at all", () => {
    for (const code of ["TRANSIT-METRO-L1", "STOP-BRT-EL-MARG", "STOP-UNKNOWN-X"]) {
      expect(transitFeatureVisible(code, [], []), code).toBe(false);
    }
  });

  it("keeps line toggles aligned with the same feature", () => {
    expect(transitLineEnabled("TRANSIT-BRT", [], ["TRANSIT-METRO-L1"])).toBe(false);
    expect(transitLineEnabled("TRANSIT-BRT", [], ["TRANSIT-BRT"])).toBe(true);
    expect(transitLineEnabled("STOP-BRT-EL-MARG", [], ["TRANSIT-METRO-L1"])).toBe(true);
  });

  it("classifies exactly the transit feature types", () => {
    expect(isTransitFeatureType("transit_stop")).toBe(true);
    expect(isTransitFeatureType("transit_line")).toBe(true);
    expect(isTransitFeatureType("road")).toBe(false);
  });
});
