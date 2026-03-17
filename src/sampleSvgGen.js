// ============================================================
// sampleSvgGen.js – Sample procedural prop painters (canvas 2D)
//
// These are the built-in fallback renderers used when no sprite
// image is registered for a given object kind. You can replace
// any of them with your own by registering actual sprites via
// stage.registerSprite() or by supplying a sprites atlas in the
// ScapeDefinition, in which case these never get called.
// ============================================================

export function drawConifer(ctx, x, groundY, w, h, color, trunkColor = '#2a1505') {
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

export function drawDeciduous(ctx, x, groundY, w, h, color, trunkColor = '#2a1505') {
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

export function drawGrass(ctx, x, groundY, size, color) {
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

export function drawRock(ctx, x, groundY, w, h, color) {
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

export function drawBush(ctx, x, groundY, w, h, color) {
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

export function drawBuilding(ctx, x, groundY, w, h, color) {
  // Body
  ctx.fillStyle = color;
  ctx.fillRect(x - w * 0.5, groundY - h, w, h);

  // Window grid — faint warm glow
  const cols  = Math.max(1, Math.round(w / 10));
  const rows  = Math.max(1, Math.round(h / 14));
  const cellW = w / cols;
  const cellH = h / rows;
  const padX  = cellW * 0.22;
  const padY  = cellH * 0.22;
  ctx.fillStyle = 'rgba(255,200,80,0.18)';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillRect(
        x - w * 0.5 + c * cellW + padX,
        groundY - h  + r * cellH + padY,
        cellW - padX * 2,
        cellH - padY * 2
      );
    }
  }
}

export function drawStreetlight(ctx, x, groundY, w, h, color) {
  const pw = Math.max(1, w * 0.18);
  ctx.fillStyle = color;
  // Vertical pole
  ctx.fillRect(x - pw * 0.5, groundY - h, pw, h);
  // Horizontal arm
  const armLen = w * 0.55;
  const armY   = groundY - h + pw;
  ctx.fillRect(x - armLen, armY, armLen, pw);
  // Lamp head
  ctx.fillStyle = 'rgba(255,220,120,0.85)';
  ctx.beginPath();
  ctx.arc(x - armLen, armY + pw * 0.5, w * 0.22, 0, Math.PI * 2);
  ctx.fill();
}
