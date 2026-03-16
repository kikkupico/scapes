// ============================================================
// ScapeEngine.js – 2.5D sidescroller engine
//
// Three layers:
//   Sky      – gradient backdrop, static
//   Backdrop – distant mountain ridges, slow parallax
//   Stage    – true perspective space; objects placed in (x, y, z)
//              and sized + positioned automatically from depth
// ============================================================

export class ScapeEngine {
  constructor(canvas, W = 960, H = 540) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W = W;
    this.H = H;
    canvas.width  = W;
    canvas.height = H;

    // ── Camera ───────────────────────────────────────────────
    this.cameraX     = 0;
    this.cameraSpeed = 80; // world-units / second

    // ── Perspective ──────────────────────────────────────────
    // Objects at z = focalLength appear at their reference size.
    this.focalLength = 300;
    // viewAngle: camera pitch in degrees.
    //   0° = level (horizon at screen centre)
    //  +ve = tilt down → more ground visible
    //  -ve = tilt up   → more sky visible
    // Drives horizonY; use setViewAngle() rather than setting horizonY directly.
    this.viewAngle = 20;
    this.horizonY  = this._horizonY(H, 20);
    this.zNear     = 20;
    this.zFar      = 2200;

    // ── Layers ───────────────────────────────────────────────
    this.sky      = null;   // Sky instance
    this.backdrop = null;   // Backdrop instance
    this.stage    = null;   // Stage instance

    // ── Post-effects ─────────────────────────────────────────
    this.fog = { enabled: false, color: [180, 200, 180], maxAlpha: 0.88 };
    this.dof = { enabled: false, focusZ: 300, strength: 0.015 };

    this._running  = false;
    this._lastTime = 0;
    this._raf      = null;
  }

  // ── Public API ──────────────────────────────────────────────

  start() {
    this._running  = true;
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(t => this._tick(t));
    return this;
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  resetScroll(x = 0) { this.cameraX = x; }

  /** Set camera pitch in degrees and recompute horizonY. */
  setViewAngle(deg) {
    this.viewAngle = deg;
    this.horizonY  = this._horizonY(this.H, deg);
  }

  /** Camera height above the ground (derived from horizonY). */
  get eyeHeight() { return this.H - this.horizonY; }

  /**
   * Project a world-space point to screen-space.
   *
   *   x – horizontal  (0 = centre lane)
   *   y – height above ground (0 = on ground, positive = up)
   *   z – depth into screen (zNear = close, zFar = distant)
   *
   * Returns { x, y, scale }
   */
  project(worldX, worldY, worldZ) {
    const scale     = this.focalLength / worldZ;
    const eyeHeight = this.H - this.horizonY;
    return {
      x: this.W / 2 + (worldX - this.cameraX) * scale,
      y: this.horizonY + (eyeHeight - worldY) * scale,
      scale,
    };
  }

  // ── Private ────────────────────────────────────────────────

  _horizonY(H, angleDeg) {
    return H * (0.5 + angleDeg / 120);
  }

  _tick(now) {
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;
    this.cameraX  += this.cameraSpeed * dt;
    this._render();
    if (this._running) this._raf = requestAnimationFrame(t => this._tick(t));
  }

  _render() {
    const { ctx, W, H, fog, horizonY } = this;
    ctx.clearRect(0, 0, W, H);

    // 1. Sky
    if (this.sky)      this.sky.render(ctx, W, H);

    // 2. Backdrop (distant ridges above the ground line)
    if (this.backdrop) this.backdrop.render(ctx, W, H, this.cameraX, horizonY);

    // 3. Stage (perspective ground + world objects, back → front)
    if (this.stage)    this.stage.render(ctx, W, H, this);

    // 4. Atmospheric fog – full-canvas gradient:
    //    ground: clear at bottom → dense at horizon
    //    sky:    dense at horizon → faint haze at top
    if (fog.enabled) {
      const [r, g, b] = fog.color;
      const horizonStop = (H - horizonY) / H;
      const grad = ctx.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0,           `rgba(${r},${g},${b},0)`);
      grad.addColorStop(horizonStop, `rgba(${r},${g},${b},${fog.maxAlpha})`);
      grad.addColorStop(1,           `rgba(${r},${g},${b},${(fog.maxAlpha * 0.2).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
