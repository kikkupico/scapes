// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage – perspective ground plane + sprite-based world objects
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Atmospheric perspective baked into precomputed sprite canvases.
// t = 0 at ATMO_Z_NEAR (no tint), t = 1 at ATMO_Z_FAR (full cool/desat/lighten).
const ATMO_Z_NEAR = 250;
const ATMO_Z_FAR  = 1400;
const ATMO_HUE    = 15;    // degrees cool hue-rotate at t=1
const ATMO_DESAT  = 0.35;  // saturation reduction at t=1
const ATMO_LIGHT  = 0.18;  // brightness gain at t=1

/** Sine-based noise for ground texture. Returns roughly -1..1. */
function groundNoise(x, y, seed) {
  let v = 0;
  v += Math.sin(x * 0.03 + seed) * Math.sin(y * 0.05 + seed * 1.7);
  v += Math.sin(x * 0.07 + seed * 2.3 + Math.sin(y * 0.04 + seed) * 0.3) * 0.6;
  v += Math.sin(x * 0.15 + y * 0.08 + seed * 0.5) * 0.3;
  return v;
}

/**
 * Renders a ground plane and sprite objects with perspective projection.
 *
 * Objects are explicitly positioned in world-space (x, y, z).
 * When `tileWidth` > 0, the object set repeats infinitely along x.
 *
 * @param {object}   ground     { nearColor, farColor, gridColor?, texture? }
 * @param {object[]} objects    Array of { sprite, x, y, z, width, height }
 * @param {number}   tileWidth  World units before the pattern repeats (0 = no tiling)
 * @param {Map<string,CanvasImageSource>} sprites  Sprite registry
 */
export class Stage {
  constructor({ ground, objects = [], tileWidth = 0, sprites = new Map() } = {}) {
    this.ground    = ground;
    this.objects   = objects;
    this.tileWidth = tileWidth;
    this._sprites  = sprites;
    this._spriteCache = new Map();  // "sprite|z" → HTMLCanvasElement
  }

  /**
   * Register (or replace) a sprite by name.
   * Clears the precomputed cache — call precompute() again afterwards.
   */
  registerSprite(name, source) {
    this._sprites.set(name, source);
    this._spriteCache.clear();
  }

  /**
   * Pre-render sprites at each depth layer with atmospheric perspective
   * baked in. Call once after construction (all sprites should be loaded).
   */
  precompute(engine) {
    this._spriteCache.clear();

    // Group objects by sprite+z and pick the tallest for cache resolution
    const groups = new Map();
    for (const obj of this.objects) {
      if (!obj.sprite) continue;
      const key = `${obj.sprite}|${obj.z}`;
      const prev = groups.get(key);
      if (!prev || obj.height > prev.height) groups.set(key, obj);
    }

    for (const [key, obj] of groups) {
      const img = this._sprites.get(obj.sprite);
      if (!img) continue;
      if (img instanceof HTMLImageElement && (!img.complete || img.naturalWidth === 0)) continue;

      const iw = img.naturalWidth  ?? img.width;
      const ih = img.naturalHeight ?? img.height;
      if (!iw || !ih) continue;

      const z = obj.z;
      const t = Math.max(0, Math.min(1, (z - ATMO_Z_NEAR) / (ATMO_Z_FAR - ATMO_Z_NEAR)));
      const filter = t > 0 ? [
        `hue-rotate(${(ATMO_HUE * t).toFixed(1)}deg)`,
        `saturate(${(1 - ATMO_DESAT * t).toFixed(3)})`,
        `brightness(${(1 + ATMO_LIGHT * t).toFixed(3)})`,
      ].join(' ') : '';

      const scale = engine.focalLength / z;
      const sh    = Math.min(Math.ceil(obj.height * scale), 1024);
      const sw    = Math.ceil(sh * (iw / ih));
      if (sh < 1 || sw < 1) continue;

      const oc   = document.createElement('canvas');
      oc.width   = sw;
      oc.height  = sh;
      const octx = oc.getContext('2d');
      if (filter) octx.filter = filter;
      octx.drawImage(img, 0, 0, sw, sh);
      this._spriteCache.set(key, oc);
    }
  }

  render(ctx, W, H, engine) {
    this._drawGround(ctx, W, H, engine);

    const visible = this._collectVisible(W, engine);
    visible.sort((a, b) => b.z - a.z);

    const { dof } = engine;
    for (const { obj, worldX } of visible) {
      if (obj.z < engine.zNear || obj.z > engine.zFar) continue;

      const p  = engine.project(worldX, obj.y ?? 0, obj.z);
      const sw = obj.width  * p.scale;
      const sh = obj.height * p.scale;

      if (p.x + sw * 0.5 < 0 || p.x - sw * 0.5 > W) continue;
      if (p.y - sh > H) continue;

      ctx.save();
      if (dof.enabled) {
        const blur = Math.min(Math.abs(obj.z - dof.focusZ) * dof.strength, 24);
        if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
      }
      this._drawSprite(ctx, obj, p.x, p.y, sh);
      ctx.restore();
    }
  }

  // ── Ground plane ────────────────────────────────────────────

  _drawGround(ctx, W, H, engine) {
    const { horizonY, cameraX, focalLength, zNear, zFar } = engine;
    const eyeHeight = H - horizonY;
    const { nearColor, farColor, gridColor } = this.ground;

    const grad = ctx.createLinearGradient(0, horizonY, 0, H);
    grad.addColorStop(0, farColor);
    grad.addColorStop(1, nearColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // ── Ground texture ──────────────────────────────────────
    const texture = this.ground.texture;
    if (texture) {
      const {
        color = 'rgba(0,0,0,0.15)',
        seed  = 42,
        scale = 1,
      } = texture;

      const STEP = 4;

      ctx.save();
      ctx.fillStyle = color;

      for (let sy = Math.round(horizonY) + STEP; sy < H; sy += STEP) {
        // Derive world-z from screen y (inverse perspective projection)
        const depthT = (sy - horizonY) / eyeHeight; // 0 at horizon, 1 at bottom
        if (depthT <= 0) continue;
        const worldZ = focalLength / depthT;

        // Perspective-correct scroll: each row scrolls at its own depth rate
        const rowScroll = cameraX * (focalLength / worldZ);
        const depthScale = depthT * depthT; // stronger near camera

        for (let sx = 0; sx < W; sx += STEP) {
          const n = groundNoise((sx + rowScroll) * scale, worldZ * scale * 0.1, seed);
          if (n < 0) continue;
          const alpha = n * depthScale * 1.5;
          if (alpha < 0.01) continue;

          ctx.globalAlpha = alpha;
          ctx.fillRect(sx, sy, STEP, STEP);
        }
      }

      ctx.restore();
    }

    if (gridColor) {
      const vx = W / 2;
      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth   = 0.5;
      ctx.globalAlpha = 0.35;

      for (const z of [100, 160, 260, 420, 680, 1100, 1800]) {
        if (z < zNear || z > zFar) continue;
        const sy = horizonY + eyeHeight * (focalLength / z);
        if (sy > H || sy < horizonY) continue;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(W, sy);
        ctx.stroke();
      }

      const xStep  = focalLength * 0.75;
      const nLines = Math.ceil(W / xStep) + 2;
      const offset = cameraX % xStep;
      for (let i = -nLines; i <= nLines; i++) {
        const groundX = vx + (i * xStep - offset);
        if (groundX < -xStep || groundX > W + xStep) continue;
        ctx.beginPath();
        ctx.moveTo(groundX, H);
        ctx.lineTo(vx, horizonY);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ── Visibility (tiling) ───────────────────────────────────────

  _collectVisible(W, engine) {
    const { cameraX, focalLength } = engine;
    const results = [];

    for (const obj of this.objects) {
      if (!obj.sprite) continue;

      if (this.tileWidth > 0 && !obj.landmark) {
        // Find tile repetitions that bring this object into view
        const scale    = focalLength / obj.z;
        const viewHalf = (W / 2) / scale + obj.width;
        const first    = Math.floor((cameraX - viewHalf - obj.x) / this.tileWidth);
        const last     = Math.ceil ((cameraX + viewHalf - obj.x) / this.tileWidth);
        for (let t = first; t <= last; t++) {
          results.push({ obj, worldX: obj.x + t * this.tileWidth, z: obj.z });
        }
      } else {
        results.push({ obj, worldX: obj.x, z: obj.z });
      }
    }

    return results;
  }

  // ── Sprite rendering ──────────────────────────────────────────

  _drawSprite(ctx, obj, sx, sy, sh) {
    // Try precomputed (atmospherically-tinted) sprite canvas first
    const cached = this._spriteCache.get(`${obj.sprite}|${obj.z}`);
    if (cached) {
      const dh = sh;
      const dw = dh * (cached.width / cached.height);
      ctx.drawImage(cached, sx - dw * 0.5, sy - dh, dw, dh);
      return;
    }

    // Fall back to raw image (unprocessed)
    const img = this._sprites.get(obj.sprite);
    if (img) {
      const iw = img.naturalWidth  ?? img.width;
      const ih = img.naturalHeight ?? img.height;
      if (iw && ih) {
        const dw = sh * (iw / ih);
        ctx.drawImage(img, sx - dw * 0.5, sy - sh, dw, sh);
      }
    }
  }
}
