import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { RoadNetworkLoader } from "@/lib/atlas/road-network-loader";

describe("road network lazy loading", () => {
  it("wires initially empty URL-backed sources to idle, zoom and layer state", async () => {
    const source = await readFile("src/components/atlas/MapView.tsx", "utf8");
    expect(source).toContain('map.addSource(roadNetworkSourceId, { type: "geojson", data: EMPTY_GEOJSON })');
    expect(source).toContain('map.addSource(roadNetworkDetailSourceId, { type: "geojson", data: EMPTY_GEOJSON })');
    expect(source).toContain('map.once("idle", () => roads.firstIdle');
    expect(source).toContain('map.on("zoomend", () => roads.sync');
    expect(source).toContain('roadLoaders.get(map)?.sync(showRoadNetwork, map.getZoom())');
    expect(source).toContain('id: roadNetworkDetailLayerId, type: "line", source: roadNetworkDetailSourceId, minzoom: 11');
    expect(source).toContain(').setData(url)');
  });
  it("waits for first map idle and the detail layer zoom threshold", () => {
    const load = vi.fn();
    const roads = new RoadNetworkLoader(load);
    roads.sync(true, 14);
    expect(load).not.toHaveBeenCalled();
    roads.firstIdle(true, 9);
    expect(load.mock.calls).toEqual([["base"]]);
    roads.sync(true, 10.99);
    expect(load).toHaveBeenCalledTimes(1);
    roads.sync(true, 11);
    roads.sync(true, 15);
    expect(load.mock.calls).toEqual([["base"], ["detail"]]);
  });
  it("respects a disabled reference layer and supports a high-zoom deep link", () => {
    const load = vi.fn();
    const roads = new RoadNetworkLoader(load);
    roads.firstIdle(false, 15);
    roads.sync(false, 15);
    expect(load).not.toHaveBeenCalled();
    roads.sync(true, 15);
    expect(load.mock.calls).toEqual([["base"], ["detail"]]);
    roads.sync(false, 9);
    roads.sync(true, 15);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
