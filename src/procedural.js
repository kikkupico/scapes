// ============================================================
// procedural.js – Math utilities for terrain and world generation
// ============================================================

/** Fractional Brownian Motion – deterministic sine-based terrain. */
export function fbm(x, seed, octaves = 4, baseFreq = 0.0008) {
  let v = 0, a = 0.5, f = baseFreq;
  for (let i = 0; i < octaves; i++) {
    v += Math.sin(x * f + seed + i * 3.713) * a;
    v += Math.sin(x * f * 1.31 + seed * 1.73 + i * 2.29) * a * 0.45;
    a *= 0.52; f *= 2.07;
  }
  return v;
}

/** Seeded pseudo-random for zone-based world generation. */
export function zoneRng(ix, iz, slot, seed) {
  const n = ((ix % 2000) * 73 + (iz % 2000) * 37 + slot * 13 + seed * 7) % 9973;
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Parse a hex colour string to linear [0,1] luminance (Carlson check). */
export function hexLuminance(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return 0;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
