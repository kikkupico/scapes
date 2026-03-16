// ============================================================
// ScapeLayers.js – Sky, Backdrop, and Stage layer classes
// ============================================================

// ── Image cache ──────────────────────────────────────────────

const _imgCache = new Map();

function loadImage(src) {
  if (!_imgCache.has(src)) {
    const img = new Image();
    img.src = src;
    _imgCache.set(src, img);
  }
  return _imgCache.get(src);
}

/** Sprite atlas – paths relative to scapes/index.html */
const SPRITES = {
  pine1:  loadImage('props/trees/pine1.png'),
  pine2:  loadImage('props/trees/pine2.png'),
  oak1:   loadImage('props/trees/oak1.png'),
  oak2:   loadImage('props/trees/oak2.png'),
  birch1: loadImage('props/trees/birch1.png'),
  bush1:  loadImage('props/near/bush1.png'),
  bush2:  loadImage('props/near/bush2.png'),
  shrub1: loadImage('props/near/shrub1.png'),
  shrub2: loadImage('props/near/shrub2.png'),
  // Lantern lake
  willow:    loadImage('props/lantern/willow.svg'),
  bamboo:    loadImage('props/lantern/bamboo.svg'),
  pagoda:    loadImage('props/lantern/pagoda.svg'),
  lantern:   loadImage('props/lantern/lantern.svg'),
  lotus:     loadImage('props/lantern/lotus.svg'),
  // City
  building1: loadImage('props/city/building1.svg'),
  building2: loadImage('props/city/building2.svg'),
  building3: loadImage('props/city/building3.svg'),
  streetlight: loadImage('props/city/streetlight.svg'),
};

/** Pick a spec from an array weighted by density. */
function pickSpec(r, specs) {
  const total = specs.reduce((s, sp) => s + (sp.density ?? 0.25), 0);
  if (total === 0) return null;
  let acc = 0;
  for (const sp of specs) {
    acc += (sp.density ?? 0.25) / total;
    if (r < acc) return sp;
  }
  return specs[specs.length - 1];
}

// ── Math helpers ─────────────────────────────────────────────

/** Fractional Brownian Motion – deterministic sine-based terrain */
function fbm(x, seed, octaves = 4, baseFreq = 0.0008) {
  let v = 0, a = 0.5, f = baseFreq;
  for (let i = 0; i < octaves; i++) {
    v += Math.sin(x * f + seed + i * 3.713) * a;
    v += Math.sin(x * f * 1.31 + seed * 1.73 + i * 2.29) * a * 0.45;
    a *= 0.52; f *= 2.07;
  }
  return v;
}

/** Seeded pseudo-random for zone-based world generation. */
function zoneRng(ix, iz, slot, seed) {
  const n = ((ix % 2000) * 73 + (iz % 2000) * 37 + slot * 13 + seed * 7) % 9973;
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Parse a hex colour string to linear [0,1] luminance (Carlson check). */
function hexLuminance(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── Object-drawing primitives ─────────────────────────────────

function drawConifer(ctx, x, groundY, w, h, color, trunkColor = '#2a1505') {
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const frac = i / 3;
    const ty = groundY - h + h * frac * 0.55;
    const bw = w * (0.35 + 0.65 * (i + 1) / 3);
    const th = (h * 0.55) / 3 * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, ty);
    ctx.lineTo(x + bw * 0.5, ty + th);
    ctx.lineTo(x - bw * 0.5, ty + th);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = trunkColor;
  ctx.fillRect(x - w * 0.09, groundY - h * 0.22, w * 0.18, h * 0.22);
}

function drawDeciduous(ctx, x, groundY, w, h, color, trunkColor = '#2a1505') {
  ctx.fillStyle = trunkColor;
  ctx.fillRect(x - w * 0.1, groundY - h * 0.42, w * 0.2, h * 0.42);
  ctx.fillStyle = color;
  for (const [dx, dy, rx, ry] of [
    [0, -0.68, 0.52, 0.46],
    [-0.28, -0.52, 0.37, 0.34],
    [0.28, -0.52, 0.37, 0.34],
    [0,    -0.48, 0.42, 0.36],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * w, groundY + dy * h, rx * w, ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrass(ctx, x, groundY, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, size * 0.08);
  for (let i = -2; i <= 2; i++) {
    const lean = (i / 2) * 0.45;
    ctx.beginPath();
    ctx.moveTo(x + i * size * 0.22, groundY);
    ctx.quadraticCurveTo(
      x + i * size * 0.22 + Math.sin(lean) * size * 0.35,
      groundY - size * 0.55,
      x + i * size * 0.22 + Math.sin(lean) * size * 0.75,
      groundY - size
    );
    ctx.stroke();
  }
}

function drawRock(ctx, x, groundY, w, h, color) {
  const cy = groundY - h * 0.48;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(x - w * 0.14, cy - h * 0.18, w * 0.18, h * 0.16, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawBush(ctx, x, groundY, w, h, color) {
  ctx.fillStyle = color;
  for (const [dx, dy, rx, ry] of [
    [0, -0.5, 0.5, 0.45],
    [-0.3, -0.35, 0.36, 0.32],
    [0.32, -0.35, 0.34, 0.30],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x + dx * w, groundY + dy * h, rx * w, ry * h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Backdrop – distant mountain ridges with slow parallax
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @param {Array} ridges  Each ridge:
 *   { baseY, amplitude, color, snowColor?, snowLine?, parallaxFactor, seed }
 */
export class Backdrop {
  constructor(ridges = []) {
    this.ridges = ridges;
  }

  render(ctx, W, H, cameraX, horizonY) {
    const sorted = [...this.ridges].sort((a, b) => a.parallaxFactor - b.parallaxFactor);
    for (const ridge of sorted) {
      this._drawRidge(ctx, W, H, cameraX, horizonY, ridge);
    }
  }

  _drawRidge(ctx, W, H, cameraX, horizonY, { baseY, amplitude, color, snowColor, snowLine = 0.38, parallaxFactor, seed }) {
    // baseY is a fraction of horizonY (not H), so ridges track the horizon
    // as the view angle changes. Authored at viewAngle=20°.
    const by   = baseY * horizonY;
    const amp  = amplitude * H;
    const ox   = cameraX * parallaxFactor;
    const STEP = 3;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let sx = 0; sx <= W; sx += STEP) {
      ctx.lineTo(sx, by - fbm(sx + ox, seed) * amp);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    if (snowColor) {
      const snowFloor = by - amp * snowLine;
      ctx.save();
      ctx.fillStyle = snowColor;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W; sx += STEP) {
        const py = by - fbm(sx + ox, seed) * amp;
        ctx.lineTo(sx, Math.max(py, snowFloor));
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fill();
      ctx.restore();
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stage – perspective ground plane + 3D world objects
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Atmospheric perspective baked into precomputed sprite canvases.
// t = 0 at ATMO_Z_NEAR (no tint), t = 1 at ATMO_Z_FAR (full cool/desat/lighten).
// Each spec's z drives t independently — no discrete layer bucketing.
const ATMO_Z_NEAR = 250;   // world-z below which no atmospheric tint is applied
const ATMO_Z_FAR  = 1400;  // world-z at which full atmospheric tint is applied
const ATMO_HUE    = 15;    // degrees cool hue-rotate at t=1
const ATMO_DESAT  = 0.35;  // saturation reduction at t=1
const ATMO_LIGHT  = 0.18;  // brightness gain at t=1

const ZONE_W = 280; // world-space zone width (x axis only)

/**
 * Objects live in world-space (x, y, z) and are projected automatically.
 *
 * @param {object}   ground      { nearColor, farColor, gridColor? }
 * @param {object[]} objects     Hand-placed objects
 * @param {object}   procedural  { tall, short } density configs
 * @param {number}   seed
 */
export class Stage {
  constructor({ ground, objects = [], procedural = null, seed = 1 } = {}) {
    this.ground       = ground;
    this.objects      = objects;
    this.procedural   = procedural;
    this.seed         = seed;
    this._zoneCache   = new Map();
    this._spriteCache = new Map(); // "spriteName|specIdx" → HTMLCanvasElement
    this._minTallZ    = Infinity;  // cached for coulisse targeting
  }

  /**
   * Pre-render every sprite at each layer's exact screen size with
   * per-layer atmospheric perspective baked in. Call once after a preset
   * change, and again after all images load (see whenSpritesLoaded()).
   */
  precompute(engine) {
    this._spriteCache.clear();

    // ── Carlson value-zone check ──────────────────────────────
    // Tree trunks must be darker than the near ground (Carlson's hierarchy:
    // sky > ground > slopes > verticals). Warn in dev if violated.
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

    if (this.procedural) {
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
          const img = SPRITES[name];
          if (!img?.complete || img.naturalWidth === 0) continue;

          const scale = engine.focalLength / z;
          const sh    = Math.min(Math.ceil((spec.height ?? 280) * scale), 1024);
          const sw    = Math.ceil(sh * (img.naturalWidth / img.naturalHeight));
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
      ctx.lineWidth = 0.5;
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

  // ── Procedural generation (spec-based, arbitrary z) ────────

  _collectVisible(engine) {
    const { cameraX, focalLength, W } = engine;
    const objects = [];
    const tall  = this.procedural.tall  ?? [];
    const short = this.procedural.short ?? [];

    // Pre-compute min tall z for coulisse targeting (nearest stand of trees).
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
        const sprite = spec.sprites[Math.floor(zoneRng(gi, si, 2, seed + sOff) * spec.sprites.length)];
        objects.push({
          group: 'tall', x, y: 0, z, specIdx: si,
          width: spec.width, height: spec.height,
          sprite, color: spec.color, trunkColor: spec.trunkColor,
        });
      }
    } else {
      // Short: density-scaled random count, overlap allowed.
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

  // ── Object rendering ───────────────────────────────────────

  _drawObject(ctx, obj, sx, sy, sw, sh) {
    if (obj.sprite) {
      const cached = this._spriteCache.get(`${obj.sprite}|${obj.specIdx}`);
      if (cached) {
        // Use projected sw/sh so objects with per-object z variation render at the correct size.
        const aspect = cached.width / cached.height;
        const dh = sh;
        const dw = dh * aspect;
        ctx.drawImage(cached, sx - dw * 0.5, sy - dh, dw, dh);
      } else {
        const img = SPRITES[obj.sprite];
        if (img?.complete && img.naturalWidth > 0) {
          const iw = sh * (img.naturalWidth / img.naturalHeight);
          ctx.drawImage(img, sx - iw * 0.5, sy - sh, iw, sh);
        }
      }
      return;
    }

    switch (obj.kind) {
      case 'grass': drawGrass(ctx, sx, sy, Math.max(sw, sh), obj.color); break;
      case 'rock':  drawRock (ctx, sx, sy, sw, sh, obj.color);           break;
      case 'bush':  drawBush (ctx, sx, sy, sw, sh, obj.color);           break;
    }
  }

}

/**
 * Resolves once every prop sprite image has finished loading.
 * Use this to trigger a second precompute() call after initial load.
 */
export function whenSpritesLoaded() {
  return Promise.all(
    Object.values(SPRITES).map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise(resolve => { img.onload = img.onerror = resolve; })
    )
  );
}
