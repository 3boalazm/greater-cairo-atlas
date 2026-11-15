import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getMapCameraPadding, type MapRect } from "@/lib/atlas/map-camera";
import { selectedAreaFilter, selectionBoundaryFilter, SELECTED_AREA_GEOMETRY_FILTER } from "@/lib/atlas/map-selection-filters";
import { boundsOfGeometry, hasDrawableBoundary, isPolygonalGeometry, mergeBounds, selectionFit } from "@/lib/atlas/map-fit";
import { getAreaBoundary, type AreaBoundaryFeature } from "@/lib/atlas/area-boundaries";

const mapViewPath = path.resolve(process.cwd(), "src/components/atlas/MapView.tsx");
const atlasAppPath = path.resolve(process.cwd(), "src/components/atlas/AtlasApp.tsx");
const entityPanelPath = path.resolve(process.cwd(), "src/components/atlas/EntityPanel.tsx");

const pointFeature = (longitude: number, latitude: number) => ({
  geometry: { type: "Point", coordinates: [longitude, latitude] },
});

describe("FIX E — selecting a city/district highlights its whole area", () => {
  it("draws the official CAPMAS boundary of CITY-OBOUR instead of only its representative point", async () => {
    const boundary = await getAreaBoundary("CITY-OBOUR");
    expect(boundary).not.toBeNull();
    expect(boundary!.properties.license).toBe("CC BY-IGO");
    expect(isPolygonalGeometry(boundary!.geometry)).toBe(true);

    // The atlas point for CITY-OBOUR sits outside the CAPMAS polygon, which is exactly why framing
    // the point zoomed the user away from the city instead of showing its area.
    const fit = selectionFit({ features: [pointFeature(31.450548, 30.1914)], boundary });
    expect(fit).toMatchObject({ target: "area" });
    expect(fit!.bounds.west).toBeCloseTo(31.43209, 4);
    expect(fit!.bounds.east).toBeCloseTo(31.4632, 4);
    expect(fit!.bounds.south).toBeCloseTo(30.19156, 4);
    expect(fit!.bounds.north).toBeCloseTo(30.25056, 4);
    expect(fit!.isPointLike).toBe(false);
    // The point is genuinely outside the polygon bounds — the old behaviour centred the camera on it.
    expect(30.1914 < fit!.bounds.south).toBe(true);
  });

  it("fills only Polygon/MultiPolygon boundaries and keeps the geometry filter shared with selection", () => {
    expect(SELECTED_AREA_GEOMETRY_FILTER).toEqual(["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]]);
    expect(selectedAreaFilter("CITY-OBOUR")).toEqual([
      "all", ["==", ["get", "entity_code"], "CITY-OBOUR"], SELECTED_AREA_GEOMETRY_FILTER,
    ]);
    expect(isPolygonalGeometry({ type: "Polygon" })).toBe(true);
    expect(isPolygonalGeometry({ type: "MultiPolygon" })).toBe(true);
    expect(isPolygonalGeometry({ type: "LineString" })).toBe(false);
    expect(isPolygonalGeometry({ type: "Point" })).toBe(false);
    expect(hasDrawableBoundary(null)).toBe(false);
  });

  it("keeps the point behaviour for entities without a boundary", () => {
    const fit = selectionFit({ features: [pointFeature(31.24, 30.04)], boundary: null });
    expect(fit).toMatchObject({ target: "features", isPointLike: true });
    expect(fit!.bounds).toEqual({ west: 31.24, south: 30.04, east: 31.24, north: 30.04 });

    const lineFit = selectionFit({ features: [{ geometry: { type: "LineString", coordinates: [[31.2, 30.0], [31.4, 30.1]] } }], boundary: null });
    expect(lineFit).toMatchObject({ target: "features", isPointLike: false });
    expect(lineFit!.bounds).toEqual({ west: 31.2, south: 30.0, east: 31.4, north: 30.1 });

    expect(selectionFit({ features: [], boundary: null })).toBeNull();
  });

  it("falls back to features when a boundary is not polygonal, without ever filling a line", () => {
    const lineBoundary = {
      type: "Feature", id: "X",
      geometry: { type: "LineString", coordinates: [[31.2, 30.0], [31.3, 30.1]] },
      properties: { entity_code: "CITY-X" },
    } as unknown as AreaBoundaryFeature;
    expect(hasDrawableBoundary(lineBoundary)).toBe(false);
    expect(selectionFit({ features: [pointFeature(31.25, 30.05)], boundary: lineBoundary })).toMatchObject({ target: "features" });
    expect(selectionBoundaryFilter(false)).toEqual(["==", ["get", "entity_code"], "__none__"]);
    expect(selectionBoundaryFilter(true)).toEqual(["all", SELECTED_AREA_GEOMETRY_FILTER]);
  });

  it("uses the panel-aware padding so the area is not centred under the open panel", () => {
    const mapRect: MapRect = { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
    const rightPanel: MapRect = { left: 820, top: 66, right: 1200, bottom: 800, width: 380, height: 734 };
    const leftPanel: MapRect = { left: 0, top: 66, right: 380, bottom: 800, width: 380, height: 734 };
    const bottomSheet: MapRect = { left: 0, top: 360, right: 1200, bottom: 800, width: 1200, height: 440 };
    expect(getMapCameraPadding(mapRect, rightPanel, 90)).toEqual({ top: 90, right: 470, bottom: 90, left: 90 });
    expect(getMapCameraPadding(mapRect, leftPanel, 90)).toEqual({ top: 90, right: 90, bottom: 90, left: 470 });
    expect(getMapCameraPadding(mapRect, bottomSheet, 28)).toEqual({ top: 28, right: 28, bottom: 468, left: 28 });
  });

  it("handles MultiPolygon bounds and merges multiple features", () => {
    const multi = { type: "MultiPolygon", coordinates: [
      [[[31.0, 30.0], [31.1, 30.0], [31.1, 30.1], [31.0, 30.1], [31.0, 30.0]]],
      [[[31.4, 30.3], [31.5, 30.3], [31.5, 30.4], [31.4, 30.4], [31.4, 30.3]]],
    ] };
    expect(boundsOfGeometry(multi)).toEqual({ west: 31.0, south: 30.0, east: 31.5, north: 30.4 });
    expect(mergeBounds({ west: 31, south: 30, east: 31, north: 30 }, null)).toEqual({ west: 31, south: 30, east: 31, north: 30 });
    expect(mergeBounds(null, { west: 31, south: 30, east: 31, north: 30 })).toEqual({ west: 31, south: 30, east: 31, north: 30 });
    expect(boundsOfGeometry({ type: "Point", coordinates: [Number.NaN, 1] })).toBeNull();
    expect(boundsOfGeometry(null)).toBeNull();
  });

  it("wires the behaviour into the app instead of leaving it in the point-only path", async () => {
    const [mapView, atlasApp, entityPanel] = await Promise.all([
      readFile(mapViewPath, "utf8"), readFile(atlasAppPath, "utf8"), readFile(entityPanelPath, "utf8"),
    ]);
    // Boundary is fetched automatically for a selected entity that has one.
    expect(atlasApp).toMatch(/detail\.has_boundary/u);
    expect(atlasApp).toContain("/boundary");
    // Clearing happens when the panel closes or another feature is selected.
    expect(atlasApp).toMatch(/const closeEntity[\s\S]{0,400}setHighlightBoundary\(null\)/u);
    expect(atlasApp).toMatch(/const selectEntity[\s\S]{0,400}setHighlightBoundary\(null\)/u);
    // The map frames the boundary, not just the point.
    expect(mapView).toContain("selectionFit(");
    expect(mapView).toContain("atlas-selection-boundary-fill");
    expect(mapView).toContain("atlas-selection-boundary-outline");
    expect(mapView).toContain("cameraPadding(map");
    // «اعرض على الخريطة» refits instead of closing the panel.
    expect(entityPanel).toContain("onShowOnMap");
    expect(atlasApp).toContain("requestShowOnMap");
    expect(atlasApp).toContain("fitRequest={fitRequest}");
  });
});

describe("FIX E — the area highlight is a state the user controls, not a sticky overlay", () => {
  it("does not fight a boundary the user switched off by hand", async () => {
    const atlasApp = await readFile(atlasAppPath, "utf8");
    // Without this guard the auto-load effect re-added the boundary on the next render, so the
    // «إظهار الحدود» toggle could never turn the area off.
    expect(atlasApp).toMatch(/boundaryDismissedCode/u);
    expect(atlasApp).toMatch(/if \(boundaryDismissedCode === selectedCode\) return;/u);
    expect(atlasApp).toMatch(/setBoundaryDismissedCode\(code\)/u);
    expect(atlasApp).toMatch(/setBoundaryDismissedCode\(null\)/u);
  });

  it("clears the selection highlight when the panel closes", async () => {
    const atlasApp = await readFile(atlasAppPath, "utf8");
    const closeEntity = atlasApp.slice(atlasApp.indexOf("const closeEntity"));
    expect(closeEntity.slice(0, 600)).toContain("setHighlightBoundary(null)");
  });
});
