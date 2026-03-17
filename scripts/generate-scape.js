#!/usr/bin/env node
// ============================================================
// generate-scape.js
//
// CLI pipeline: brief JSON → read SVG sprites from assets/ →
// ScapeDefinition JSON with explicit object placements.
//
// SVGs are created beforehand by the /scapes agent skill.
// Use upgrade-scape.js to upgrade SVGs to Gemini-generated PNGs.
//
// Usage:
//   node scripts/generate-scape.js '<brief-json>'
// ============================================================

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Entry point ──────────────────────────────────────────────

async function main() {
  const brief = JSON.parse(process.argv[2] ?? '{}');

  if (!brief.name) throw new Error('brief.name is required');

  const outDir    = path.join(ROOT, 'generated', brief.name);
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const props = brief.props ?? [];

  // ── Read SVGs from assets dir ──────────────────────────────
  log('Reading SVG sprites from assets/');
  const sprites = [];
  for (const prop of props) {
    // props can be strings (legacy) or objects { name, worldHeight, placement }
    const propName = typeof prop === 'string' ? prop : prop.name;
    const label = slugify(propName);
    const file  = `${label}.svg`;
    const svgPath = path.join(assetsDir, file);
    if (!fs.existsSync(svgPath)) {
      log(`  ⚠ Missing: ${file} — skip`);
      continue;
    }
    const svgText = fs.readFileSync(svgPath, 'utf-8');
    const dims = parseSvgDimensions(svgText);
    sprites.push({
      name: label, file,
      width: dims.width, height: dims.height,
      aspectRatio: dims.width / dims.height,
      propLabel: propName,
      // Agent-specified world dimensions and placement
      worldHeight: typeof prop === 'object' ? prop.worldHeight : undefined,
      placement:   typeof prop === 'object' ? prop.placement   : undefined,
    });
    log(`  ✓ ${file}  (${dims.width}×${dims.height})`);
  }

  if (sprites.length === 0) {
    throw new Error('No SVG sprites found in assets/. Create SVG files first.');
  }

  // ── Assemble ScapeDefinition ───────────────────────────────
  log('Assembling scape definition…');
  const definition = buildDefinition(brief, sprites);
  const defPath    = path.join(outDir, 'definition.json');
  fs.writeFileSync(defPath, JSON.stringify(definition, null, 2));

  // ── Save brief for upgrade-scape.js ────────────────────────
  const briefPath = path.join(outDir, 'brief.json');
  fs.writeFileSync(briefPath, JSON.stringify(brief, null, 2));

  log('');
  log(`Done!  generated/${brief.name}/`);
  log(`  definition.json`);
  log(`  brief.json`);
  sprites.forEach(s => log(`  assets/${s.file}`));
  log('');
  log(`Load it in the demo:`);
  log(`  applyPreset('./generated/${brief.name}/definition.json')`);
  log('');
  log(`To upgrade to AI-generated images:`);
  log(`  node scripts/upgrade-scape.js ${brief.name}`);
}

main().catch(err => {
  console.error('\n[scapes] Error:', err.message);
  process.exit(1);
});

// ── SVG dimension parser ─────────────────────────────────────

function parseSvgDimensions(svgText) {
  const wMatch = svgText.match(/width="(\d+(?:\.\d+)?)"/);
  const hMatch = svgText.match(/height="(\d+(?:\.\d+)?)"/);
  if (wMatch && hMatch) return { width: +wMatch[1], height: +hMatch[1] };

  const vbMatch = svgText.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/);
  if (vbMatch) return { width: +vbMatch[1], height: +vbMatch[2] };

  return { width: 60, height: 60 };
}

// ── ScapeDefinition assembly ─────────────────────────────────

function buildDefinition(brief, sprites) {
  const { name, theme = 'generic', timeOfDay = 'noon', density = 'medium', seed } = brief;

  const scene = assembleScene(theme, timeOfDay, brief.palette);

  const densityScale = { sparse: 0.6, medium: 1.0, dense: 1.6 };
  const dScale       = densityScale[density] ?? 1.0;

  const Z_FAR   = [1100, 1000, 900];
  const Z_MID   = [700, 650, 600, 550];
  const Z_NEAR  = [420, 380, 350, 330, 310, 290];

  const tileWidth = 1200;
  const objects   = [];
  let farIdx = 0, midIdx = 0, nearIdx = 0;

  // Simple seeded PRNG for placement jitter
  let rngState = (seed ?? 42) * 2654435761 >>> 0;
  function rng() {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return (rngState >>> 0) / 4294967296;
  }

  for (const sp of sprites) {
    // World height: prefer agent-specified, fall back to 100
    const worldH = sp.worldHeight ?? 100;
    const worldW = Math.max(10, Math.round(worldH * sp.aspectRatio));
    // Placement: "background", "midground", "foreground", or "landmark" (single far instance)
    const placement = sp.placement ?? (worldH >= 100 ? 'background' : 'foreground');

    if (placement === 'landmark') {
      // Single instance, far away — for unique props like a lighthouse
      const z = Z_FAR[farIdx % Z_FAR.length];
      farIdx++;
      const x = rng() * tileWidth * 0.6 + tileWidth * 0.2;
      objects.push({
        sprite: sp.name,
        x: Math.round(x), y: 0, z,
        width: worldW, height: worldH,
        landmark: true,
      });
    } else if (placement === 'background') {
      // Place across 3 z-levels
      const zLevels = [
        Z_FAR[farIdx % Z_FAR.length],
        Z_MID[midIdx % Z_MID.length],
        Z_NEAR[nearIdx % Z_NEAR.length],
      ];
      farIdx++; midIdx++; nearIdx++;

      for (const z of zLevels) {
        const spacing = worldW * 2.5;
        const count   = Math.max(1, Math.round((tileWidth / spacing) * dScale));
        const step    = tileWidth / count;
        for (let i = 0; i < count; i++) {
          const x = step * i + rng() * step * 0.6;
          const scale = 0.85 + rng() * 0.3;
          objects.push({
            sprite: sp.name,
            x: Math.round(x), y: 0, z,
            width:  Math.round(worldW * scale),
            height: Math.round(worldH * scale),
          });
        }
      }
    } else if (placement === 'midground') {
      // Place at 1-2 mid z-levels
      const zLevels = [
        Z_MID[midIdx % Z_MID.length],
        Z_NEAR[nearIdx % Z_NEAR.length],
      ];
      midIdx++; nearIdx++;

      for (const z of zLevels) {
        const spacing = worldW * 2.5;
        const count   = Math.max(1, Math.round((tileWidth / spacing) * dScale));
        const step    = tileWidth / count;
        for (let i = 0; i < count; i++) {
          const x = step * i + rng() * step * 0.6;
          const scale = 0.85 + rng() * 0.3;
          objects.push({
            sprite: sp.name,
            x: Math.round(x), y: 0, z,
            width:  Math.round(worldW * scale),
            height: Math.round(worldH * scale),
          });
        }
      }
    } else {
      // foreground — scatter at near-z
      const z     = Z_NEAR[nearIdx % Z_NEAR.length];
      nearIdx++;
      const count = Math.max(3, Math.round(8 * dScale));
      const step  = tileWidth / count;
      for (let i = 0; i < count; i++) {
        const x     = step * i + rng() * step * 0.8;
        const scale = 0.7 + rng() * 0.6;
        objects.push({
          sprite: sp.name,
          x: Math.round(x), y: 0, z,
          width:  Math.round(worldW * scale),
          height: Math.round(worldH * scale),
        });
      }
    }
  }

  return {
    version:   2,
    name,
    seed:      seed ?? Math.floor(Math.random() * 9999),
    tileWidth,
    ...scene,
    sprites: {
      individual: sprites.map(s => ({ name: s.name, src: `assets/${s.file}` })),
    },
    objects,
    camera: { speed: 80, viewAngle: 20 },
  };
}

function assembleScene(theme, timeOfDay, palette = []) {
  const SKY = {
    dawn:     ['#0d1a2e','#1a3050','#c06040','#e09060','#f0c080'],
    noon:     ['#1a70c0','#2a90e0','#55b0f0','#88ccf8','#c0e8ff'],
    dusk:     ['#0a0520','#3d1250','#7a2060','#c44860','#e87840','#f4c060'],
    night:    ['#000004','#020410','#06081c','#0c0c26','#180c20'],
    overcast: ['#4a5060','#606878','#a0aab0','#c0c8d0'],
  };
  const FOG = {
    dawn: [200,140,90], noon: [210,230,255], dusk: [220,130,70],
    night: [80,80,120], overcast: [180,185,190],
  };
  const GROUND = {
    forest:   { nearColor:'#1e3820', farColor:'#1a3030', texture: { color:'rgba(40,80,30,0.3)', seed:31, scale:1.2 } },
    mountain: { nearColor:'#2a2a20', farColor:'#1a1a18', texture: { color:'rgba(60,55,40,0.25)', seed:19 } },
    city:     { nearColor:'#09090c', farColor:'#07070e', gridColor:'rgba(100,90,80,0.5)' },
    desert:   { nearColor:'#6a5030', farColor:'#4a3820', texture: { color:'rgba(180,150,90,0.2)', seed:42, scale:0.8 } },
    beach:    { nearColor:'#c8b870', farColor:'#a09050', texture: { color:'rgba(200,180,120,0.15)', seed:55, scale:0.7 } },
    generic:  { nearColor:'#1e2a18', farColor:'#181e14', texture: { color:'rgba(60,90,40,0.2)', seed:63 } },
  };
  const RIDGES = {
    mountain: [
      { baseY:0.82, amplitude:0.30, color:'#6080a0', snowColor:'rgba(255,255,255,0.85)', snowLine:0.35, parallaxFactor:0.04, seed:11 },
      { baseY:0.92, amplitude:0.20, color:'#405060', parallaxFactor:0.10, seed:22 },
      { baseY:1.00, amplitude:0.12, color:'#304050', parallaxFactor:0.16, seed:33 },
    ],
    city: [
      { baseY:0.88, amplitude:0.07, color:'#0c0e1a', parallaxFactor:0.02, seed:91 },
      { baseY:0.94, amplitude:0.04, color:'#090c16', parallaxFactor:0.06, seed:82 },
      { baseY:1.00, amplitude:0.02, color:'#070910', parallaxFactor:0.12, seed:73 },
    ],
    desert: [
      { baseY:0.90, amplitude:0.12, color:'#8a6040', parallaxFactor:0.04, seed:41 },
      { baseY:0.96, amplitude:0.07, color:'#705030', parallaxFactor:0.09, seed:55 },
      { baseY:1.02, amplitude:0.04, color:'#584028', parallaxFactor:0.15, seed:67 },
    ],
    beach: [
      { baseY:0.92, amplitude:0.04, color:'#5a7090', parallaxFactor:0.03, seed:11 },
      { baseY:0.96, amplitude:0.03, color:'#4a6070', parallaxFactor:0.07, seed:44 },
      { baseY:1.00, amplitude:0.02, color:'#3a5060', parallaxFactor:0.12, seed:77 },
    ],
    generic: [
      { baseY:0.87, amplitude:0.24, color:'#7090b0', snowColor:'rgba(255,255,255,0.85)', snowLine:0.38, parallaxFactor:0.05, seed:11 },
      { baseY:0.945,amplitude:0.18, color:'#507060', parallaxFactor:0.10, seed:77 },
      { baseY:1.005,amplitude:0.10, color:'#3a5848', parallaxFactor:0.16, seed:88 },
    ],
  };

  const CLOUDS = {
    dawn:     { color:'rgba(255,200,150,0.5)', speed:0.02, density:0.35, seed:17, top:0.05, bottom:0.5 },
    noon:     { color:'rgba(255,255,255,0.6)', speed:0.02, density:0.4,  seed:7,  top:0.02, bottom:0.55 },
    dusk:     { color:'rgba(255,160,100,0.5)', speed:0.02, density:0.45, seed:23, top:0.05, bottom:0.55 },
    night:    null,
    overcast: { color:'rgba(200,200,210,0.7)', speed:0.015,density:0.7,  seed:11, top:0.0,  bottom:0.6 },
  };

  const skyColors = SKY[timeOfDay]  ?? SKY.noon;
  const fogColor  = FOG[timeOfDay]  ?? FOG.noon;
  const clouds    = CLOUDS[timeOfDay] ?? CLOUDS.noon;
  const ground    = GROUND[theme]   ?? GROUND.generic;
  const ridges    = RIDGES[theme]   ?? RIDGES.generic;

  const sky = { gradient: skyColors.map((color, i) => ({ stop: i / (skyColors.length - 1), color })) };
  if (clouds) sky.clouds = clouds;

  return {
    sky,
    fog:      { enabled: false, density: 0.88, color: fogColor },
    backdrop: { ridges },
    ground,
  };
}

// ── Utilities ────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30);
}

function log(msg) {
  process.stdout.write(`[scapes] ${msg}\n`);
}
