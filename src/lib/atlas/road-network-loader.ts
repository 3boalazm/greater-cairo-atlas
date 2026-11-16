/** Defer URL-backed OSM road sources until the first idle map, and detail until its layer is visible. */
export class RoadNetworkLoader {
  private idle = false;
  private baseRequested = false;
  private detailRequested = false;
  constructor(private readonly load: (kind: "base" | "detail") => void) {}

  firstIdle(enabled: boolean, zoom: number): void {
    this.idle = true;
    this.sync(enabled, zoom);
  }

  sync(enabled: boolean, zoom: number): void {
    if (!this.idle || !enabled) return;
    if (!this.baseRequested) {
      this.baseRequested = true;
      this.load("base");
    }
    // The detail layer begins at zoom 11; delaying beyond that would leave a visible gap.
    if (zoom >= 11 && !this.detailRequested) {
      this.detailRequested = true;
      this.load("detail");
    }
  }
}
