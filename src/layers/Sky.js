// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sky – gradient background + scrolling procedural clouds
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Multi-octave value noise for cloud shapes.
 * Returns -1..1 range with good spread.
 */
function cloudNoise(x, y, seed) {
  let v = 0;
  v += Math.sin(x * 0.003 + seed * 1.0 + Math.sin(y * 0.004 + seed) * 0.5);
  v += Math.sin(y * 0.005 + seed * 2.3 + Math.sin(x * 0.003 + seed * 1.7) * 0.4) * 0.8;
  v += Math.sin(x * 0.009 + y * 0.006 + seed * 0.7) * 0.4;
  v += Math.sin(x * 0.02  + seed * 3.1) * Math.sin(y * 0.015 + seed * 0.3) * 0.3;
  return v / 2.5; // normalize to roughly -1..1
}

/**
 * @param {string[]} stops  CSS colours, top → bottom
 * @param {object}   [clouds]  { color, speed, density, seed, top, bottom }
 * @param {object}   [panorama] { img, speed } — tiling sky image, overrides gradient+clouds
 */
export class Sky {
  constructor(stops, clouds, panorama) {
    this.stops    = stops;
    this.clouds   = clouds ?? null;
    this.panorama = panorama ?? null;
    this._grad    = null;
    this._lastH   = -1;
  }

  render(ctx, W, H, cameraX = 0) {
    // ── Panorama (overrides gradient + clouds) ─────────────
    if (this.panorama) {
      const iw = this.panorama.img.naturalWidth  ?? this.panorama.img.width;
      if (iw > 0) {
        this._renderPanorama(ctx, W, H, cameraX);
        return;
      }
    }

    // ── Gradient ─────────────────────────────────────────────
    if (H !== this._lastH) {
      this._grad = ctx.createLinearGradient(0, 0, 0, H);
      this.stops.forEach((c, i) =>
        this._grad.addColorStop(i / (this.stops.length - 1), c)
      );
      this._lastH = H;
    }
    ctx.fillStyle = this._grad;
    ctx.fillRect(0, 0, W, H);

    // ── Clouds ───────────────────────────────────────────────
    if (!this.clouds) return;

    const {
      color   = 'rgba(255,255,255,0.8)',
      speed   = 0.02,
      density = 0.4,
      seed    = 7,
      top     = 0.02,
      bottom  = 0.55,
    } = this.clouds;

    const yStart  = Math.round(H * top);
    const yEnd    = Math.round(H * bottom);
    const STEP    = 4;
    const scrollX = cameraX * speed;
    // density controls the threshold: higher density = lower threshold = more clouds
    const threshold = 0.3 - density * 0.6; // density 0.4 → threshold 0.06

    ctx.save();
    ctx.fillStyle = color;

    for (let sy = yStart; sy < yEnd; sy += STEP) {
      const yt    = (sy - yStart) / (yEnd - yStart);
      const yFade = Math.sin(yt * Math.PI); // bell-curve vertical fade

      for (let sx = 0; sx < W; sx += STEP) {
        const n = cloudNoise(sx + scrollX, sy, seed);
        if (n < threshold) continue;

        // Smooth ramp from threshold to peak
        const strength = Math.min((n - threshold) / 0.4, 1);
        const alpha = strength * yFade * 0.85;
        if (alpha < 0.01) continue;

        ctx.globalAlpha = alpha;
        ctx.fillRect(sx, sy, STEP, STEP);
      }
    }

    ctx.restore();
  }

  // ── Panorama tiling ────────────────────────────────────────

  _renderPanorama(ctx, W, H, cameraX) {
    const { img, speed = 0.01 } = this.panorama;
    const iw = img.naturalWidth  ?? img.width;
    const ih = img.naturalHeight ?? img.height;
    if (!iw || !ih) return;

    // Scale image to fill canvas height
    const scale = H / ih;
    const drawW = Math.ceil(iw * scale);

    // Parallax offset, wrapped to image width for seamless tiling
    const rawOffset = cameraX * speed;
    const offset = ((rawOffset % drawW) + drawW) % drawW;

    // Draw tiling copies to cover the viewport
    const startX = -offset;
    for (let x = startX; x < W; x += drawW) {
      ctx.drawImage(img, x, 0, drawW, H);
    }
    if (startX > 0) {
      ctx.drawImage(img, startX - drawW, 0, drawW, H);
    }
  }
}
