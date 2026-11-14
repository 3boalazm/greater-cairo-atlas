import { describe, expect, it } from "vitest";
import { getAtlasMapStyleUrl, OPENFREEMAP_STYLE_URLS } from "@/components/atlas/map-styles";

describe("MapLibre basemap configuration", () => {
  it("uses the published OpenFreeMap style endpoints for both saved themes", () => {
    expect(getAtlasMapStyleUrl("night")).toBe("https://tiles.openfreemap.org/styles/dark");
    expect(getAtlasMapStyleUrl("day")).toBe("https://tiles.openfreemap.org/styles/positron");
    expect(Object.values(OPENFREEMAP_STYLE_URLS).every((url) => url.startsWith("https://tiles.openfreemap.org/styles/"))).toBe(true);
  });
});
