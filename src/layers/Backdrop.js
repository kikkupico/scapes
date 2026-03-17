// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Backdrop – distant mountain ridges with slow parallax
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Fractional Brownian Motion – deterministic sine-based terrain. */
function fbm(x, seed, octaves = 4, baseFreq = 0.0008) {
  let v = 0, a = 0.5, f = baseFreq;
  for (let i = 0; i < octaves; i++) {
    v += Math.sin(x * f + seed + i * 3.713) * a;
    v += Math.sin(x * f * 1.31 + seed * 1.73 + i * 2.29) * a * 0.45;
    a *= 0.52; f *= 2.07;
  }
  return v;
}

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
