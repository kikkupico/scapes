// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Backdrop – distant mountain ridges with slow parallax
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { fbm } from '../procedural.js';

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
