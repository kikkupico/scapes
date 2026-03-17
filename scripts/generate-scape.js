#!/usr/bin/env node
// ============================================================
// generate-scape.js
//
// CLI pipeline: brief JSON → Gemini sprite sheet → chroma-key
// extraction → ScapeDefinition JSON + individual PNGs.
//
// Usage:
//   node scripts/generate-scape.js '<brief-json>'
//
// Environment:
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional, default: nano-banana-pro-preview
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Entry point ──────────────────────────────────────────────

async function main() {
  const brief = JSON.parse(process.argv[2] ?? '{}');

  if (!brief.name)               throw new Error('brief.name is required');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY env var is not set');

  const outDir    = path.join(ROOT, 'generated', brief.name);
  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const props   = brief.props ?? [];

  // ── Step 1: Generate sprite sheet ────────────────────────
  log('Calling Gemini for sprite sheet…');
  const sheetBuffer = await generateSpriteSheet(brief);
  const sheetPath   = path.join(assetsDir, 'sheet.png');
  fs.writeFileSync(sheetPath, sheetBuffer);
  log(`Sprite sheet saved (${sheetBuffer.length} bytes)`);

  // ── Step 2: Detect sprite regions ────────────────────────
  log('Detecting sprite regions…');
  const regions = await findSpriteRegions(sheetBuffer);
  log(`Found ${regions.length} sprite region(s)`);

  // ── Step 3: Extract sprites (with per-prop fallback) ─────
  log('Extracting sprites and removing backgrounds…');
  const sprites = [];

  const enoughRegions = regions.length >= Math.ceil(props.length / 2);

  if (enoughRegions) {
    // Happy path: cut regions out of the sheet
    for (let i = 0; i < regions.length; i++) {
      const label = props[i] ? slugify(props[i]) : `prop-${i}`;
      const file    = `${label}.png`;
      const outPath = path.join(assetsDir, file);
      const meta    = await extractSprite(sheetBuffer, regions[i], outPath);
      sprites.push({ name: label, file, ...meta, propLabel: props[i] ?? label });
      log(`  ✓ ${file}  (${meta.width}×${meta.height})`);
    }
  } else {
    // Fallback: generate each prop individually
    log(`Sheet yielded ${regions.length} region(s) for ${props.length} props — switching to per-prop generation`);
    for (let i = 0; i < props.length; i++) {
      const label = slugify(props[i]);
      const file    = `${label}.png`;
      const outPath = path.join(assetsDir, file);
      log(`  Generating prop ${i + 1}/${props.length}: ${props[i]}`);
      const propBuffer = await generateSingleProp(props[i], brief);
      const propRegions = await findSpriteRegions(propBuffer);
      if (propRegions.length > 0) {
        const meta = await extractSprite(propBuffer, propRegions[0], outPath);
        sprites.push({ name: label, file, ...meta, propLabel: props[i] });
        log(`    ✓ ${file}  (${meta.width}×${meta.height})`);
      } else {
        // No green-screen background — save the full image as-is
        fs.writeFileSync(outPath, propBuffer);
        const propMeta = await sharp(propBuffer).metadata();
        sprites.push({ name: label, file, width: propMeta.width, height: propMeta.height,
          aspectRatio: propMeta.width / propMeta.height, propLabel: props[i] });
        log(`    ✓ ${file}  (no green-screen, saved full image)`);
      }
    }
  }

  // ── Step 4: Assemble ScapeDefinition ─────────────────────
  log('Assembling scape definition…');
  const definition = buildDefinition(brief, sprites);
  const defPath    = path.join(outDir, 'definition.json');
  fs.writeFileSync(defPath, JSON.stringify(definition, null, 2));

  // ── Done ─────────────────────────────────────────────────
  log('');
  log(`Done!  generated/${brief.name}/`);
  log(`  definition.json`);
  log(`  assets/sheet.png`);
  sprites.forEach(s => log(`  assets/${s.file}`));
  log('');
  log(`Load it in the demo:`);
  log(`  applyPreset('./generated/${brief.name}/definition.json')`);
}

main().catch(err => {
  console.error('\n[scapes] Error:', err.message);
  process.exit(1);
});

// ── Gemini sprite sheet generation ───────────────────────────

async function generateSpriteSheet(brief) {
  const model = process.env.GEMINI_MODEL ?? 'nano-banana-pro-preview';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gen   = genAI.getGenerativeModel({ model });

  const prompt = buildSheetPrompt(brief);

  const result = await gen.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const parts     = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart) {
    const text = parts.find(p => p.text)?.text ?? '(no text)';
    throw new Error(`Gemini did not return an image. Model said: ${text.slice(0, 200)}`);
  }

  // Convert to PNG via sharp so we always have a consistent format for processing
  const raw = Buffer.from(imagePart.inlineData.data, 'base64');
  return sharp(raw).png().toBuffer();
}

function buildSheetPrompt(brief) {
  const { props = [], mood = 'neutral', style = 'flat illustration', palette = [] } = brief;

  // Arrange props in rows of 3
  const rows = [];
  for (let i = 0; i < props.length; i += 3) {
    rows.push(props.slice(i, i + 3));
  }
  const rowDesc = rows
    .map((row, i) => `Row ${i + 1}: ${row.map(p => `[${p}]`).join('  ')}`)
    .join('\n');

  const paletteDesc = palette.length
    ? `Color palette: ${palette.join(', ')}.`
    : '';

  return `Create a 2D game sprite sheet image.

BACKGROUND: Fill the ENTIRE image with pure bright green, exactly RGB(0, 255, 0) — this is critical for automated processing. There must be NO other green in the image.

SPRITES: Draw the following props as side-view 2D illustrations. Arrange them in a grid with at least 40px of pure green space between every sprite:

${rowDesc}

STYLE:
- ${style}, minimal shading, clean silhouettes
- Side-view profile suitable for a 2.5D parallax scroller
- Mood: ${mood}
- Each prop must be fully self-contained — no overlapping with neighbours
- Consistent scale: tallest prop ≈ 40% of image height
- Lighting from upper-left
${paletteDesc}

IMPORTANT: The background between and around ALL sprites must remain pure green RGB(0,255,0). Do not add any shadows, ground planes, or decorative borders.`;
}

// ── Per-prop generation (fallback) ───────────────────────────

async function generateSingleProp(propDescription, brief) {
  const model = process.env.GEMINI_MODEL ?? 'nano-banana-pro-preview';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gen   = genAI.getGenerativeModel({ model });

  const { style = 'flat illustration', palette = [], mood = '' } = brief;
  const paletteDesc = palette.length ? `Color palette: ${palette.join(', ')}.` : '';

  const prompt = `Create a single 2D game sprite image.

BACKGROUND: Fill the ENTIRE image with pure bright green, exactly RGB(0, 255, 0). No other green allowed.

SPRITE: Draw only this one prop, centered in the image:
"${propDescription}"

STYLE:
- ${style}, side-view profile
- Mood: ${mood}
- The prop should occupy about 60–70% of the image height
- Self-contained, no ground plane, no shadows outside the prop
- Clean silhouette with transparent-ready edges
${paletteDesc}

CRITICAL: Background must remain pure RGB(0,255,0) everywhere outside the sprite.`;

  const result = await gen.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const parts     = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart) {
    throw new Error(`Gemini returned no image for prop: ${propDescription}`);
  }

  const raw = Buffer.from(imagePart.inlineData.data, 'base64');
  return sharp(raw).png().toBuffer();
}

// ── Sprite region detection (bounding-box projection) ────────

async function findSpriteRegions(sheetBuffer) {
  const { data, info } = await sharp(sheetBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  // Build foreground mask: true = not green-screen
  const fg = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    fg[i] = isGreenScreen(r, g, b) ? 0 : 1;
  }

  // Column projection: find runs of columns that contain any foreground pixels
  const colHasFg = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (fg[y * width + x]) { colHasFg[x] = 1; break; }
    }
  }

  // Collect contiguous column runs (gap tolerance: merge runs < 8px apart)
  const GAP = 8;
  const colRuns = [];
  let runStart = -1;
  for (let x = 0; x <= width; x++) {
    if (runStart === -1 && x < width && colHasFg[x]) {
      runStart = x;
    } else if (runStart !== -1) {
      // Look ahead for a gap
      if (x === width || (!colHasFg[x] && !colRuns.length && true)) {
        // Check if next run starts soon (gap tolerance)
        let gapLen = 0;
        let xCheck = x;
        while (xCheck < width && !colHasFg[xCheck] && gapLen <= GAP) { xCheck++; gapLen++; }
        if (xCheck >= width || gapLen > GAP) {
          colRuns.push({ start: runStart, end: x - 1 });
          runStart = -1;
        }
        // else: continue the run through the small gap
      }
    }
  }
  if (runStart !== -1) colRuns.push({ start: runStart, end: width - 1 });

  // For each column run find the tight Y bounding box
  const MARGIN = 3;
  const regions = [];
  for (const { start, end } of colRuns) {
    let minY = height, maxY = 0;
    for (let x = start; x <= end; x++) {
      for (let y = 0; y < height; y++) {
        if (fg[y * width + x]) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
    }
    if (maxY < minY) continue;
    regions.push({
      x: Math.max(0, start - MARGIN),
      y: Math.max(0, minY  - MARGIN),
      w: Math.min(width  - (start - MARGIN), end - start + 1 + MARGIN * 2),
      h: Math.min(height - (minY  - MARGIN), maxY - minY  + 1 + MARGIN * 2),
    });
  }

  return regions;
}

// ── Chroma-key extraction ────────────────────────────────────

async function extractSprite(sheetBuffer, region, outputPath) {
  const meta = await sharp(sheetBuffer).metadata();
  const left   = Math.max(0, region.x);
  const top    = Math.max(0, region.y);
  const width  = Math.min(region.w, meta.width  - left);
  const height = Math.min(region.h, meta.height - top);
  if (width < 1 || height < 1) throw new Error(`Invalid region: ${JSON.stringify(region)}`);

  const { data, info } = await sharp(sheetBuffer)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    out[i * 4]     = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = isGreenScreen(r, g, b) ? 0 : 255;
  }

  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath);

  return { width: info.width, height: info.height, aspectRatio: info.width / info.height };
}

// Tolerant green-screen check (handles JPEG compression artifacts)
function isGreenScreen(r, g, b) {
  return g > 150 && g > r * 1.4 && g > b * 1.4 && r < 120 && b < 120;
}

// ── ScapeDefinition assembly ─────────────────────────────────

function buildDefinition(brief, sprites) {
  const { name, theme = 'generic', timeOfDay = 'noon', density = 'medium', seed } = brief;

  const scene = assembleScene(theme, timeOfDay, brief.palette);

  // Categorise sprites into tall vs short using aspect ratio + semantic label
  const densityValues = { sparse: 0.08, medium: 0.14, dense: 0.24 };
  const baseDensity   = densityValues[density] ?? 0.14;

  const tall  = [];
  const short = [];

  const TALL_KEYWORDS  = ['tree','pine','oak','birch','bamboo','willow','palm','building',
                           'tower','castle','pagoda','lighthouse','cliff','mountain','spire'];
  const SHORT_KEYWORDS = ['bush','rock','grass','flower','mushroom','lantern','sign',
                           'fence','post','log','pebble','stump','lily','lotus'];

  for (const sp of sprites) {
    const label = (sp.propLabel ?? sp.name).toLowerCase();
    const isTallByLabel  = TALL_KEYWORDS.some(k => label.includes(k));
    const isShortByLabel = SHORT_KEYWORDS.some(k => label.includes(k));
    // Tall sprites are narrow (low w/h ratio); short sprites are wide
    const isTallByShape  = sp.aspectRatio < 0.75;
    const isTall = isTallByLabel || (!isShortByLabel && isTallByShape);

    if (isTall) {
      // Stagger z-depth across tall layers: far → mid → near
      const zLevels = [1000, 650, 400];
      const z = zLevels[tall.length % zLevels.length];
      const kind = inferKind(label, 'tall');
      tall.push({
        sprites:    [sp.name],
        kind,
        z,
        width:      70,
        height:     280,
        density:    baseDensity,
        color:      pickColor(brief.palette, tall.length, '#2a4030'),
        ...(kind !== 'building' ? { trunkColor: '#2a1505' } : {}),
      });
    } else {
      const z = 300 + short.length * 20;
      short.push({
        sprites:  [sp.name],
        kind:     inferKind(label, 'short'),
        z,
        width:    55,
        height:   35,
        density:  baseDensity * 1.6,
        color:    pickColor(brief.palette, short.length + 3, '#2a3020'),
      });
    }
  }

  return {
    version:  1,
    name,
    seed:     seed ?? Math.floor(Math.random() * 9999),
    ...scene,
    sprites: {
      individual: sprites.map(s => ({ name: s.name, src: `assets/${s.file}` })),
    },
    objects: { tall, short },
    camera:  { speed: 80, viewAngle: 20 },
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
    forest:   { nearColor:'#1e3820', farColor:'#1a3030', gridColor:'rgba(80,160,80,0.35)' },
    mountain: { nearColor:'#2a2a20', farColor:'#1a1a18' },
    city:     { nearColor:'#09090c', farColor:'#07070e', gridColor:'rgba(100,90,80,0.5)' },
    desert:   { nearColor:'#6a5030', farColor:'#4a3820' },
    beach:    { nearColor:'#c8b870', farColor:'#a09050' },
    generic:  { nearColor:'#1e2a18', farColor:'#181e14', gridColor:'rgba(80,120,60,0.3)' },
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
    generic: [
      { baseY:0.87, amplitude:0.24, color:'#7090b0', snowColor:'rgba(255,255,255,0.85)', snowLine:0.38, parallaxFactor:0.05, seed:11 },
      { baseY:0.945,amplitude:0.18, color:'#507060', parallaxFactor:0.10, seed:77 },
      { baseY:1.005,amplitude:0.10, color:'#3a5848', parallaxFactor:0.16, seed:88 },
    ],
  };

  const skyColors = SKY[timeOfDay]  ?? SKY.noon;
  const fogColor  = FOG[timeOfDay]  ?? FOG.noon;
  const ground    = GROUND[theme]   ?? GROUND.generic;
  const ridges    = RIDGES[theme]   ?? RIDGES.generic;

  // If the user supplied a palette, tint the ground near-colour
  if (palette.length >= 1) ground.nearColor = palette[palette.length - 1];
  if (palette.length >= 2) ground.farColor  = palette[palette.length - 2];

  return {
    sky:      { gradient: skyColors.map((color, i) => ({ stop: i / (skyColors.length - 1), color })) },
    fog:      { enabled: false, density: 0.88, color: fogColor },
    backdrop: { ridges },
    ground,
  };
}

function inferKind(label, group) {
  if (group === 'tall') {
    if (/building|tower|castle|skyscraper|house|chalet|barn/.test(label)) return 'building';
    if (/pine|fir|spruce|cedar|conifer|cypress/.test(label))              return 'conifer';
    return 'deciduous';
  }
  if (/rock|stone|boulder|pebble/.test(label)) return 'rock';
  if (/grass|reed|wheat|hay/.test(label))      return 'grass';
  if (/streetlight|lamp|lantern|torch/.test(label)) return 'streetlight';
  return 'bush';
}

function pickColor(palette, idx, fallback) {
  if (!palette?.length) return fallback;
  return palette[idx % palette.length];
}

// ── Utilities ────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30);
}

function log(msg) {
  process.stdout.write(`[scapes] ${msg}\n`);
}
