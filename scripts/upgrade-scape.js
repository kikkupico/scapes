#!/usr/bin/env node
// ============================================================
// upgrade-scape.js
//
// Upgrades a generated scape from SVG sprites to AI-generated
// PNG sprites via Gemini image generation.
//
// Pipeline:
//   1. Read existing SVGs + brief.json
//   2. Render SVGs to PNG, composite into a reference sprite sheet
//   3. Send sheet to Gemini: "Redraw these sprites in [style]"
//   4. Chroma-key extract individual PNGs
//   5. Update definition.json to reference PNGs
//
// Usage:
//   node scripts/upgrade-scape.js <scape-name>
//
// Environment:
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional, default: nano-banana-pro-preview
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import fs    from 'node:fs';
import path  from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error('Usage: node scripts/upgrade-scape.js <scape-name>');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY env var is not set');

  const srcDir = path.join(ROOT, 'generated', name);
  if (!fs.existsSync(srcDir)) throw new Error(`No scape found at generated/${name}/`);

  // ── Create HD copy, leaving the original intact ─────────────
  const hdName    = `${name}-hd`;
  const outDir    = path.join(ROOT, 'generated', hdName);
  const assetsDir = path.join(outDir, 'assets');

  log(`Copying ${name} → ${hdName}`);
  fs.cpSync(srcDir, outDir, { recursive: true });

  // ── 1. Load brief + definition ─────────────────────────────
  const briefPath = path.join(outDir, 'brief.json');
  const defPath   = path.join(outDir, 'definition.json');
  if (!fs.existsSync(briefPath)) throw new Error(`No brief.json found in generated/${name}/`);
  if (!fs.existsSync(defPath))   throw new Error(`No definition.json found in generated/${name}/`);

  const brief      = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
  const definition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));
  definition.name  = hdName;

  const svgEntries = (definition.sprites?.individual ?? [])
    .filter(e => e.src.endsWith('.svg'));

  if (svgEntries.length === 0) {
    log('No SVG sprites to upgrade — already using images.');
    return;
  }

  log(`Upgrading ${svgEntries.length} SVG sprite(s) to AI-generated images`);

  // ── 2. Render SVGs to PNG and composite a reference sheet ──
  log('Rendering SVGs to reference sheet…');
  const CELL_H   = 512;
  const PADDING   = 40;
  const rendered  = [];

  for (const entry of svgEntries) {
    const svgPath = path.join(outDir, entry.src);
    if (!fs.existsSync(svgPath)) {
      log(`  ⚠ Missing: ${entry.src} — skip`);
      continue;
    }

    // Render SVG to PNG at a fixed height, preserving aspect ratio
    const pngBuf = await sharp(svgPath)
      .resize({ height: CELL_H, fit: 'inside' })
      .png()
      .toBuffer();

    const meta = await sharp(pngBuf).metadata();
    rendered.push({ name: entry.name, buf: pngBuf, w: meta.width, h: meta.height });
    log(`  ✓ ${entry.name}  (${meta.width}×${meta.height})`);
  }

  if (rendered.length === 0) throw new Error('No SVGs could be rendered');

  // Lay out sprites in a row with padding on a green background
  const sheetW = rendered.reduce((sum, r) => sum + r.w + PADDING, PADDING);
  const sheetH = CELL_H + PADDING * 2;

  // Build composite operations
  let xOffset = PADDING;
  const composites = [];
  const propLabels = [];

  for (const r of rendered) {
    composites.push({
      input: r.buf,
      left: xOffset,
      top: PADDING + Math.round((CELL_H - r.h) / 2),  // vertically center
    });
    propLabels.push(r.name);
    xOffset += r.w + PADDING;
  }

  // Green background + composited SVG renderings
  const refSheet = await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const refSheetPath = path.join(assetsDir, 'reference-sheet.png');
  fs.writeFileSync(refSheetPath, refSheet);
  log(`Reference sheet: ${sheetW}×${sheetH} (${refSheet.length} bytes)`);

  // ── 3. Send to Gemini ──────────────────────────────────────
  log('Sending to Gemini for upgrade…');

  const { style = 'flat illustration', mood = 'neutral', palette = [] } = brief;
  const props = brief.props ?? propLabels;
  const paletteDesc = palette.length ? `Color palette: ${palette.join(', ')}.` : '';

  const prompt = `I have a reference sprite sheet showing ${props.length} 2D game props on a green background. Redraw them as high-quality sprites in the same layout and positions.

REFERENCE: The attached image shows the current sprites. Keep the same props, silhouettes, and approximate positions, but upgrade the art quality.

PROPS (left to right): ${props.join(', ')}

STYLE:
- ${style}, high detail, clean edges
- Side-view profile for a 2.5D parallax scroller
- Mood: ${mood}
- Each sprite must remain fully separated — no overlapping
- Maintain similar proportions to the reference
- Lighting from upper-left
${paletteDesc}

BACKGROUND: The entire background MUST be pure bright green RGB(0, 255, 0). This is critical — no shadows, ground, or decorative elements outside the sprites. No green in the sprites themselves.

Redraw all ${props.length} sprites with significantly better art quality while keeping the same layout.`;

  const model = process.env.GEMINI_MODEL ?? 'nano-banana-pro-preview';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gen   = genAI.getGenerativeModel({ model });

  const refBase64 = refSheet.toString('base64');

  const result = await gen.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/png', data: refBase64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  });

  const parts     = result.response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart) {
    const text = parts.find(p => p.text)?.text ?? '(no text)';
    throw new Error(`Gemini did not return an image. Model said: ${text.slice(0, 200)}`);
  }

  const upgradedRaw = Buffer.from(imagePart.inlineData.data, 'base64');
  const upgradedSheet = await sharp(upgradedRaw).png().toBuffer();
  const upgradedPath = path.join(assetsDir, 'sheet.png');
  fs.writeFileSync(upgradedPath, upgradedSheet);
  log(`Upgraded sheet saved (${upgradedSheet.length} bytes)`);

  // ── 4. Detect regions + chroma-key extract ─────────────────
  log('Detecting sprite regions…');
  const regions = await findSpriteRegions(upgradedSheet);
  log(`Found ${regions.length} region(s)`);

  const newSprites = [];
  const enoughRegions = regions.length >= Math.ceil(props.length / 2);

  if (enoughRegions) {
    for (let i = 0; i < regions.length; i++) {
      const label   = i < propLabels.length ? propLabels[i] : `prop-${i}`;
      const file    = `${label}.png`;
      const outPath = path.join(assetsDir, file);
      const meta    = await extractSprite(upgradedSheet, regions[i], outPath);
      newSprites.push({ name: label, file, ...meta });
      log(`  ✓ ${file}  (${meta.width}×${meta.height})`);
    }
  } else {
    // Fallback: generate each prop individually
    log(`Sheet yielded ${regions.length} region(s) for ${props.length} props — per-prop fallback`);
    for (let i = 0; i < props.length; i++) {
      const label = i < propLabels.length ? propLabels[i] : `prop-${i}`;
      const file    = `${label}.png`;
      const outPath = path.join(assetsDir, file);
      log(`  Generating prop ${i + 1}/${props.length}: ${props[i]}`);
      const propBuffer = await generateSingleProp(props[i], brief);
      const propRegions = await findSpriteRegions(propBuffer);
      if (propRegions.length > 0) {
        const meta = await extractSprite(propBuffer, propRegions[0], outPath);
        newSprites.push({ name: label, file, ...meta });
        log(`    ✓ ${file}  (${meta.width}×${meta.height})`);
      } else {
        fs.writeFileSync(outPath, propBuffer);
        const propMeta = await sharp(propBuffer).metadata();
        newSprites.push({ name: label, file, width: propMeta.width, height: propMeta.height });
        log(`    ✓ ${file}  (no green-screen, saved full image)`);
      }
    }
  }

  // ── 5. Update definition.json ──────────────────────────────
  log('Updating definition…');
  definition.sprites.individual = newSprites.map(s => ({
    name: s.name,
    src: `assets/${s.file}`,
  }));
  fs.writeFileSync(defPath, JSON.stringify(definition, null, 2));

  log('');
  log(`Upgrade complete!  generated/${hdName}/`);
  log(`  definition.json  (updated)`);
  newSprites.forEach(s => log(`  assets/${s.file}`));
  log('');
  log(`Original SVG scape preserved at: generated/${name}/`);
  log(`HD scape created at: generated/${hdName}/`);
  log('');
  log(`Load it in the demo:`);
  log(`  applyPreset('./generated/${hdName}/definition.json')`);
}

main().catch(err => {
  console.error('\n[scapes] Error:', err.message);
  process.exit(1);
});

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

// ── Sprite region detection ──────────────────────────────────

async function findSpriteRegions(sheetBuffer) {
  const { data, info } = await sharp(sheetBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  const fg = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    fg[i] = isGreenScreen(r, g, b) ? 0 : 1;
  }

  const colHasFg = new Uint8Array(width);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (fg[y * width + x]) { colHasFg[x] = 1; break; }
    }
  }

  const GAP = 8;
  const colRuns = [];
  let runStart = -1;
  for (let x = 0; x <= width; x++) {
    if (runStart === -1 && x < width && colHasFg[x]) {
      runStart = x;
    } else if (runStart !== -1) {
      if (x === width || !colHasFg[x]) {
        let gapLen = 0;
        let xCheck = x;
        while (xCheck < width && !colHasFg[xCheck] && gapLen <= GAP) { xCheck++; gapLen++; }
        if (xCheck >= width || gapLen > GAP) {
          colRuns.push({ start: runStart, end: x - 1 });
          runStart = -1;
        }
      }
    }
  }
  if (runStart !== -1) colRuns.push({ start: runStart, end: width - 1 });

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

function isGreenScreen(r, g, b) {
  return g > 150 && g > r * 1.4 && g > b * 1.4 && r < 120 && b < 120;
}
