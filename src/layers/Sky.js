// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sky – full-canvas gradient, static
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @param {string[]} stops  CSS colours, top → bottom */
export class Sky {
  constructor(stops) {
    this.stops  = stops;
    this._grad  = null;
    this._lastH = -1;
  }

  render(ctx, W, H) {
    if (H !== this._lastH) {
      this._grad = ctx.createLinearGradient(0, 0, 0, H);
      this.stops.forEach((c, i) =>
        this._grad.addColorStop(i / (this.stops.length - 1), c)
      );
      this._lastH = H;
    }
    ctx.fillStyle = this._grad;
    ctx.fillRect(0, 0, W, H);
  }
}
