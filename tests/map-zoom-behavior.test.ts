import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionCamera } from "@/lib/atlas/selection-camera";
import { featureZoomBand, featureSimplificationTolerance, scheduleFeatureRequest } from "@/lib/atlas/feature-zoom";
import { featureSimplificationTolerance as apiTolerance } from "@/lib/atlas/features-api";

afterEach(() => vi.useRealTimers());

describe("selection camera", () => {
  it("fits on selection and explicit request, not on feature or zoom changes, and not after close", () => {
    const camera = new SelectionCamera();
    const map = { fitBounds: vi.fn(), flyTo: vi.fn() };
    const fit = (code: string) => { if (code === "CITY") map.fitBounds(code); else map.flyTo(code); return true; };
    camera.update("CITY", 1); camera.attempt(fit);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i++) { camera.update("CITY", 1); camera.attempt(fit); }
    expect(map.fitBounds).toHaveBeenCalledTimes(1); expect(map.flyTo).not.toHaveBeenCalled();
    camera.update(null, 1); camera.attempt(fit); camera.panelOpened(fit);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    camera.update("STOP", 2); camera.attempt(fit);
    expect(map.flyTo).toHaveBeenCalledTimes(1);
    camera.update("STOP", 3); camera.attempt(fit);
    expect(map.flyTo).toHaveBeenCalledTimes(2);
  });

  it("cancels pending async fits and panel-open refits after a user gesture", () => {
    const camera = new SelectionCamera(); const fit = vi.fn(() => false);
    camera.update("CITY", 1); camera.attempt(fit);
    expect(fit).toHaveBeenCalledTimes(1);
    camera.cancelForGesture(); camera.update("CITY", 1); camera.attempt(fit); camera.panelOpened(fit);
    expect(fit).toHaveBeenCalledTimes(1);
    const success = vi.fn(() => true);
    camera.update("CITY", 2); camera.attempt(success); camera.cancelForGesture(); camera.panelOpened(success);
    expect(success).toHaveBeenCalledTimes(1);
    camera.update(null, 2); camera.update("CITY", 3); camera.attempt(success); camera.panelOpened(success); camera.panelOpened(success);
    expect(success).toHaveBeenCalledTimes(3); // new selection + its single panel-open adjustment
  });
});

describe("zoom-aware feature requests", () => {
  it("uses exactly the API simplification thresholds", () => {
    for (let zoom = 4; zoom <= 20; zoom++) {
      const band = featureZoomBand(zoom);
      expect(featureSimplificationTolerance(band)).toBe(apiTolerance(zoom));
    }
    expect([7, 8, 9, 10, 11, 12, 13, 17].map(featureZoomBand)).toEqual([7, 9, 9, 11, 11, 12, 12, 12]);
  });

  it("debounces threshold crossings, not every zoom in the same band", () => {
    vi.useFakeTimers();
    const fetch = vi.fn(); let currentBand: number | null = null; let cancel = () => {};
    const update = (zoom: number) => {
      const next = featureZoomBand(zoom);
      if (next === currentBand) return;
      cancel(); currentBand = next;
      cancel = scheduleFeatureRequest((signal) => fetch(next, signal));
    };
    update(8); update(9); vi.advanceTimersByTime(299); expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]?.[0]).toBe(9);
    update(8); update(9); vi.advanceTimersByTime(500); expect(fetch).toHaveBeenCalledTimes(1);
    const signal = fetch.mock.calls[0]![1] as AbortSignal;
    update(10); update(12); expect(signal.aborted).toBe(true);
    vi.advanceTimersByTime(300); expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls[1]?.[0]).toBe(12);
    cancel(); expect((fetch.mock.calls[1]![1] as AbortSignal).aborted).toBe(true);
  });

  it("wires the tested controls into the live map, not only into helpers", async () => {
    const app = await readFile("src/components/atlas/AtlasApp.tsx", "utf8");
    const map = await readFile("src/components/atlas/MapView.tsx", "utf8");
    expect(app).toContain("const featureZoom = featureZoomBand(zoom)");
    expect(app).toContain("scheduleFeatureRequest((signal)");
    expect(app).toContain("filters.status, featureZoom, language, timelineEnabled]");
    expect(app).not.toContain("zoom >= 13");
    expect(map).toContain('id: "atlas-admin-unit-outline-adm3", type: "line", source: sourceId, minzoom: 13');
    expect(map).toContain("appliedFeaturesRef.current !== features");
    expect(map).toContain("cooperativeGestures: compact");
    expect(map).toContain("selectionCameraRef.current.cancelForGesture()");
    expect(map).not.toContain("lastSelectedCodeRef");
  });
});
