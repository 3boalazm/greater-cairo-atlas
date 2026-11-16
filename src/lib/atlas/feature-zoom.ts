/** Representative zooms for the API's four simplification bands. */
export function featureZoomBand(zoom: number): 7 | 9 | 11 | 12 {
  const clamped = Math.max(4, Math.min(20, Math.round(zoom)));
  return clamped <= 7 ? 7 : clamped <= 9 ? 9 : clamped <= 11 ? 11 : 12;
}

export function featureSimplificationTolerance(zoom: number): number {
  const band = featureZoomBand(zoom);
  return band === 7 ? 0.004 : band === 9 ? 0.001 : band === 11 ? 0.0002 : 0;
}

/** Debounce a potentially expensive request; cancellation also aborts an in-flight request. */
export function scheduleFeatureRequest(run: (signal: AbortSignal) => void, delay = 300): () => void {
  const controller = new AbortController();
  const timer = setTimeout(() => run(controller.signal), delay);
  return () => { clearTimeout(timer); controller.abort(); };
}
