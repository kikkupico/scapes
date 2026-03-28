// ============================================================
// ScapeEngine.js – 2.5D sidescroller engine (library version)
//
// Canvas-first: the caller supplies the <canvas> element.
// No DOM queries, no global state. Multiple instances per page work.
// ============================================================

export class ScapeEngine {
  /**
   * @param {HTMLCanvasElement} canvas  Caller-supplied canvas element.
   * @param {number} [W=960]
   * @param {number} [H=540]
   */
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
    this.focalLength = 300;
    this.viewAngle   = 20;
    this.horizonY    = this._calcHorizonY(H, 20);
    this.zNear       = 20;
    this.zFar        = 2200;

    // ── Layers ───────────────────────────────────────────────
    this.sky      = null;
    this.stage    = null;

    // ── Post-effects ─────────────────────────────────────────
    this.fog = { enabled: false, color: [180, 200, 180], maxAlpha: 0.88 };
    this.dof = { enabled: false, focusZ: 300, strength: 0.015 };

    this._running   = false;
    this._lastTime  = 0;
    this._raf       = null;
    this._listeners = {};
  }

  // ── Event emitter ──────────────────────────────────────────

  /** @param {'tick'|'resize'} event @param {Function} fn */
  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
    return this;
  }

  /** @param {'tick'|'resize'} event @param {Function} fn */
  off(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }
    return this;
  }

  _emit(event, ...args) {
    for (const fn of this._listeners[event] ?? []) fn(...args);
  }

  // ── Lifecycle ──────────────────────────────────────────────

  start() {
    this._running  = true;
    this._lastTime = performance.now();
    this._raf = requestAnimationFrame(t => this._tick(t));
    return this;
  }

  stop() {
    this._running = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  }

  /** Stop animation and release all layer references. */
  destroy() {
    this.stop();
    this._listeners = {};
    this.sky = this.stage = null;
  }

  // ── Setters ────────────────────────────────────────────────

  setCameraSpeed(v) { this.cameraSpeed = v; }

  setViewAngle(deg) {
    this.viewAngle = deg;
    this.horizonY  = this._calcHorizonY(this.H, deg);
  }

  /** @param {{ enabled?: boolean, density?: number, color?: number[] }} opts */
  setFog({ enabled, density, color } = {}) {
    if (enabled  != null) this.fog.enabled  = enabled;
    if (density  != null) this.fog.maxAlpha = density;
    if (color    != null) this.fog.color    = color;
  }

  /** @param {{ enabled?: boolean, focusZ?: number, strength?: number }} opts */
  setDOF({ enabled, focusZ, strength } = {}) {
    if (enabled  != null) this.dof.enabled  = enabled;
    if (focusZ   != null) this.dof.focusZ   = focusZ;
    if (strength != null) this.dof.strength = strength;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.canvas.width  = W;
    this.canvas.height = H;
    this.horizonY = this._calcHorizonY(H, this.viewAngle);
    this._emit('resize');
  }

  resetScroll(x = 0) { this.cameraX = x; }

  /** Camera height above the ground plane (derived from horizonY). */
  get eyeHeight() { return this.H - this.horizonY; }

  /**
   * Project a world-space point to screen-space.
   *   x – horizontal  (0 = centre lane)
   *   y – height above ground (0 = on ground, positive = up)
   *   z – depth (zNear = close, zFar = distant)
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

  _calcHorizonY(H, angleDeg) {
    return H * (0.5 + angleDeg / 120);
  }

  _tick(now) {
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;
    this.cameraX  += this.cameraSpeed * dt;
    this._render();
    this._emit('tick', dt);
    if (this._running) this._raf = requestAnimationFrame(t => this._tick(t));
  }

  _render() {
    const { ctx, W, H, fog, horizonY } = this;
    ctx.clearRect(0, 0, W, H);

    if (this.sky)   this.sky.render(ctx, W, H, this.cameraX);
    if (this.stage) this.stage.render(ctx, W, H, this);

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
