// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage – perspective ground plane + 3D world objects
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { hexLuminance, zoneRng }                           from '../procedural.js';
import {
  drawConifer, drawDeciduous, drawGrass, drawRock, drawBush,
  drawBuilding, drawStreetlight,
}                                                          from '../sampleSvgGen.js';

// Atmospheric perspective baked into precomputed sprite canvases.
// t = 0 at ATMO_Z_NEAR (no tint), t = 1 at ATMO_Z_FAR (full cool/desat/lighten).
const ATMO_Z_NEAR = 250;
const ATMO_Z_FAR  = 1400;
const ATMO_HUE    = 15;    // degrees cool hue-rotate at t=1
const ATMO_DESAT  = 0.35;  // saturation reduction at t=1
const ATMO_LIGHT  = 0.18;  // brightness gain at t=1

const ZONE_W = 280; // world-space zone width (x axis only)

/**
 * Objects live in world-space (x, y, z) and are projected automatically.
 *
 * Sprites are supplied via the `sprites` Map (name → CanvasImageSource).
 * If a named sprite is absent, the object falls back to kind-based procedural
 * drawing (conifer, deciduous, grass, rock, bush).
 *
 * @param {object}   ground      { nearColor, farColor, gridColor? }
 * @param {object[]} objects     Hand-placed objects
 * @param {object}   procedural  { tall: [], short: [] }
 * @param {number}   seed
 * @param {Map<string,CanvasImageSource>} sprites  Sprite registry
 */
export class Stage {
  constructor({ ground, objects = [], procedural = null, seed = 1, sprites = new Map() } = {}) {
    this.ground     = ground;
    this.objects    = objects;
    this.procedural = procedural;
    this.seed       = seed;
    this._sprites   = sprites;        // Map<name, CanvasImageSource>
    this._zoneCache   = new Map();
    this._spriteCache = new Map();    // "name|specIdx" → HTMLCanvasElement
    this._minTallZ    = Infinity;
  }

  /**
   * Register (or replace) a sprite by name.
   * Clears the precomputed cache — call precompute() again afterwards.
   * @param {string} name
   * @param {CanvasImageSource} source
   */
  registerSprite(name, source) {
    this._sprites.set(name, source);
    this._spriteCache.clear();
  }

  /**
   * Pre-render every sprite at each layer's exact screen size with
   * per-layer atmospheric perspective baked in. Call once after construction
   * (all sprites should be loaded before calling).
   */
  precompute(engine) {
    this._spriteCache.clear();

    // ── Carlson value-zone check ──────────────────────────────
    if (this.ground?.nearColor) {
      const groundL = hexLuminance(this.ground.nearColor);
      for (const spec of this.procedural?.tall ?? []) {
        if (spec.trunkColor) {
          const trunkL = hexLuminance(spec.trunkColor);
          if (trunkL > groundL) {
            console.warn(
              `[Carlson] Trunk ${spec.trunkColor} (L=${trunkL.toFixed(3)}) is lighter than ` +
              `ground ${this.ground.nearColor} (L=${groundL.toFixed(3)}). ` +
              `Violates Carlson's value hierarchy.`
            );
          }
        }
      }
    }

    if (!this.procedural) return;

    const tall  = this.procedural.tall  ?? [];
    const short = this.procedural.short ?? [];
    const allSpecs = [
      ...tall.map( (spec, i) => ({ spec, si: i })),
      ...short.map((spec, i) => ({ spec, si: i + tall.length })),
    ];

    for (const { spec, si } of allSpecs) {
      const z = spec.z ?? 500;
      const t = Math.max(0, Math.min(1, (z - ATMO_Z_NEAR) / (ATMO_Z_FAR - ATMO_Z_NEAR)));
      const filter = t > 0 ? [
        `hue-rotate(${(ATMO_HUE * t).toFixed(1)}deg)`,
        `saturate(${(1 - ATMO_DESAT * t).toFixed(3)})`,
        `brightness(${(1 + ATMO_LIGHT * t).toFixed(3)})`,
      ].join(' ') : '';

      for (const name of spec.sprites ?? []) {
        const key = `${name}|${si}`;
        if (this._spriteCache.has(key)) continue;

        const img = this._sprites.get(name);
        if (!img) continue;
        if (img instanceof HTMLImageElement && (!img.complete || img.naturalWidth === 0)) continue;

        const iw = img.naturalWidth  ?? img.width;
        const ih = img.naturalHeight ?? img.height;
        if (!iw || !ih) continue;

        const scale = engine.focalLength / z;
        const sh    = Math.min(Math.ceil((spec.height ?? 280) * scale), 1024);
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
  }

  render(ctx, W, H, engine) {
    this._drawGround(ctx, W, H, engine);

    const all = [...this.objects];
    if (this.procedural) all.push(...this._collectVisible(engine));

    all.sort((a, b) => b.z - a.z);

    const { dof } = engine;
    for (const obj of all) {
      if (obj.z < engine.zNear || obj.z > engine.zFar) continue;

      const p  = engine.project(obj.x, obj.y ?? 0, obj.z);
      const sw = obj.width  * p.scale;
      const sh = obj.height * p.scale;

      if (p.x + sw * 0.5 < 0 || p.x - sw * 0.5 > W) continue;
      if (p.y - sh > H) continue;

      ctx.save();
      if (dof.enabled) {
        const blur = Math.min(Math.abs(obj.z - dof.focusZ) * dof.strength, 24);
        if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`;
      }
      this._drawObject(ctx, obj, p.x, p.y, sw, sh);
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

  // ── Procedural generation ───────────────────────────────────

  _collectVisible(engine) {
    const { cameraX, focalLength, W } = engine;
    const objects = [];
    const tall  = this.procedural.tall  ?? [];
    const short = this.procedural.short ?? [];

    this._minTallZ = tall.length
      ? Math.min(...tall.map(s => s.z ?? 500))
      : Infinity;

    const visit = (spec, si, group) => {
      const z     = spec.z ?? 500;
      const xHalf = (W / 2) * (z / focalLength) + ZONE_W;
      const ixMin = Math.floor((cameraX - xHalf) / ZONE_W);
      const ixMax = Math.ceil ((cameraX + xHalf) / ZONE_W);
      for (let ix = ixMin; ix <= ixMax; ix++) {
        const key = `${ix}|${si}`;
        if (!this._zoneCache.has(key)) {
          this._zoneCache.set(key, this._generateZone(ix, si, spec, group));
        }
        objects.push(...this._zoneCache.get(key));
      }
    };

    tall.forEach( (spec, i) => visit(spec, i,              'tall' ));
    short.forEach((spec, i) => visit(spec, i + tall.length, 'short'));

    if (this._zoneCache.size > 2000) {
      const keys = [...this._zoneCache.keys()];
      for (let i = 0; i < 500; i++) this._zoneCache.delete(keys[i]);
    }

    return objects;
  }

  _generateZone(ix, si, spec, group) {
    const { seed } = this;
    const objects  = [];
    const z        = spec.z ?? 500;

    if (group === 'tall') {
      const sOff   = 71 + si * 89;
      const grid   = spec.width * 1.7;
      const jitter = grid * 0.15;
      const giMin  = Math.ceil(ix * ZONE_W / grid);

      for (let gi = giMin; gi * grid < (ix + 1) * ZONE_W; gi++) {
        // Coulisse: bias density to zone edge-thirds on the nearest tall spec.
        let densityMult = 1;
        if (z === this._minTallZ) {
          const zoneFrac = Math.max(0, Math.min(1, (gi * grid - ix * ZONE_W) / ZONE_W));
          densityMult = (zoneFrac < 0.33 || zoneFrac > 0.67) ? 2.0 : 0.5;
        }
        if (zoneRng(gi, si, 0, seed + sOff) > Math.min(1, spec.density * densityMult)) continue;
        const x      = gi * grid + (zoneRng(gi, si, 1, seed + sOff) - 0.5) * 2 * jitter;
        const sprite = spec.sprites?.[Math.floor(zoneRng(gi, si, 2, seed + sOff) * spec.sprites.length)];
        objects.push({
          group: 'tall', x, y: 0, z, specIdx: si,
          width: spec.width, height: spec.height,
          sprite, kind: spec.kind,
          color: spec.color, trunkColor: spec.trunkColor,
        });
      }
    } else {
      const count = Math.max(0, Math.round(
        spec.density * 15 + (zoneRng(ix, si, 0, seed) - 0.5) * 4
      ));
      for (let i = 0; i < count; i++) {
        const r0 = zoneRng(ix, si, i * 4 + 1, seed);
        const r1 = zoneRng(ix, si, i * 4 + 2, seed);
        const r2 = zoneRng(ix, si, i * 4 + 3, seed);
        const r3 = zoneRng(ix, si, i * 4 + 4, seed);
        const x      = ix * ZONE_W + r0 * ZONE_W;
        const sprite = spec.sprites
          ? spec.sprites[Math.floor(r1 * spec.sprites.length)]
          : null;
        const w = spec.width  * (0.7 + r2 * 0.6);
        const h = spec.height * (0.7 + r3 * 0.6);
        let y = 0;
        if (spec.floatY) {
          const [yMin, yMax] = spec.floatY;
          y = yMin + zoneRng(ix, si, i * 4 + 5, seed) * (yMax - yMin);
        }
        let oz = z;
        if (spec.floatZ) {
          const [zMin, zMax] = spec.floatZ;
          oz = zMin + zoneRng(ix, si, i * 4 + 6, seed) * (zMax - zMin);
        }
        objects.push({
          group: 'short', kind: spec.kind,
          x, y, z: oz, specIdx: si,
          width: w, height: h,
          sprite, color: spec.color,
        });
      }
    }

    return objects;
  }

  // ── Object rendering ────────────────────────────────────────

  _drawObject(ctx, obj, sx, sy, sw, sh) {
    // Try precomputed (atmospherically-tinted) sprite canvas first.
    if (obj.sprite) {
      const cached = this._spriteCache.get(`${obj.sprite}|${obj.specIdx}`);
      if (cached) {
        const dh = sh;
        const dw = dh * (cached.width / cached.height);
        ctx.drawImage(cached, sx - dw * 0.5, sy - dh, dw, dh);
        return;
      }
      // Fall back to raw image (unprocessed, no atmospheric tint).
      const img = this._sprites.get(obj.sprite);
      if (img) {
        const iw = img.naturalWidth  ?? img.width;
        const ih = img.naturalHeight ?? img.height;
        if (iw && ih) {
          const dw = sh * (iw / ih);
          ctx.drawImage(img, sx - dw * 0.5, sy - sh, dw, sh);
          return;
        }
      }
      // Sprite not available — fall through to procedural kind drawing.
    }

    switch (obj.kind) {
      case 'conifer':     drawConifer     (ctx, sx, sy, sw, sh, obj.color, obj.trunkColor); break;
      case 'deciduous':   drawDeciduous   (ctx, sx, sy, sw, sh, obj.color, obj.trunkColor); break;
      case 'grass':       drawGrass       (ctx, sx, sy, Math.max(sw, sh), obj.color);       break;
      case 'rock':        drawRock        (ctx, sx, sy, sw, sh, obj.color);                 break;
      case 'bush':        drawBush        (ctx, sx, sy, sw, sh, obj.color);                 break;
      case 'building':    drawBuilding    (ctx, sx, sy, sw, sh, obj.color);                 break;
      case 'streetlight': drawStreetlight (ctx, sx, sy, sw, sh, obj.color);                 break;
    }
  }
}
