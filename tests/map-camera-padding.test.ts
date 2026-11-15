import { describe, expect, it } from "vitest";
import { getMapCameraPadding, type MapRect } from "@/lib/atlas/map-camera";
import { selectedAreaFilter, SELECTED_AREA_GEOMETRY_FILTER } from "@/lib/atlas/map-selection-filters";

const mapRect: MapRect = { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };

function rect(left: number, top: number, right: number, bottom: number): MapRect {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

describe("map camera overlays and selected geometry filters", () => {
  it("adds measured padding on the right for an LTR side panel", () => {
    expect(getMapCameraPadding(mapRect, rect(820, 66, 1200, 800), 70)).toEqual({
      top: 70, right: 450, bottom: 70, left: 70,
    });
  });

  it("adds measured padding on the left for an RTL side panel", () => {
    expect(getMapCameraPadding(mapRect, rect(0, 66, 380, 800), 54)).toEqual({
      top: 54, right: 54, bottom: 54, left: 434,
    });
  });

  it("uses the measured bottom-sheet height as bottom padding on mobile", () => {
    expect(getMapCameraPadding(mapRect, rect(0, 360, 1200, 800), 28)).toEqual({
      top: 28, right: 28, bottom: 468, left: 28,
    });
  });

  it("keeps line selection out of the fill layer while allowing polygonal areas", () => {
    expect(SELECTED_AREA_GEOMETRY_FILTER).toEqual([
      "in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]],
    ]);
    expect(selectedAreaFilter("ROAD-REGIONAL-RING")).toEqual([
      "all",
      ["==", ["get", "entity_code"], "ROAD-REGIONAL-RING"],
      SELECTED_AREA_GEOMETRY_FILTER,
    ]);
  });
});
