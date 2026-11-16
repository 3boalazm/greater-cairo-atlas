/** Coordinates pending selection fits with asynchronous data and real user gestures. */
export class SelectionCamera {
  private selected: string | null = null;
  private lastFitted: string | null = null;
  private lastRequest = 0;
  private pending: string | null = null;
  private panelOpening = false;
  private userMoved = false;

  update(selected: string | null, request: number): void {
    const changed = selected !== this.selected;
    const requested = request !== this.lastRequest;
    this.selected = selected;
    this.lastRequest = request;
    if (changed || requested) {
      this.pending = selected;
      this.userMoved = false;
      this.panelOpening = changed && selected !== null;
      if (!selected) this.lastFitted = null;
    }
  }

  hasUserMoved(): boolean { return this.userMoved; }

  cancelForGesture(): void {
    this.pending = null;
    this.panelOpening = false;
    this.userMoved = true;
  }

  attempt(fit: (code: string) => boolean): void {
    if (this.pending && this.pending === this.selected && fit(this.pending)) {
      this.lastFitted = this.pending;
      this.pending = null;
    }
  }

  panelOpened(fit: (code: string) => boolean): void {
    if (!this.panelOpening) return;
    this.panelOpening = false;
    if (!this.userMoved && this.selected && this.lastFitted === this.selected) fit(this.selected);
  }
}
