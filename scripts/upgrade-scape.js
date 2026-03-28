#!/usr/bin/env node
// ============================================================
// upgrade-scape.js
//
// Upgrades a generated scape from SVG sprites to AI-generated
// PNG sprites. Supports automatic (Gemini API) and manual
// (user generates via web UI) workflows.
//
// Subcommands:
//   prepare <name>   Assemble reference sheet + prompt, create HD folder
//   extract <name>   Extract sprites from upgraded sheet.png
//   auto    <name>   Full automatic pipeline (prepare → Gemini → extract)
//
// Usage:
//   node scripts/upgrade-scape.js prepare desert-market
//   node scripts/upgrade-scape.js extract desert-market
//   node scripts/upgrade-scape.js auto    desert-market
//
// Environment (auto only):
//   GEMINI_API_KEY   required
//   GEMINI_MODEL     optional, default: nano-banana-pro-preview
// ============================================================

import sharp from 'sharp';
import fs    from 'node:fs';
import path  from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Main dispatch ───────────────────────────────────────────

async function main() {
  const [cmd, name] = process.argv.slice(2);

  if (!cmd || !name) {
    throw new Error('Usage: node scripts/upgrade-scape.js <prepare|extract|auto> <scape-name>');
  }

  if (cmd === 'prepare') await runPrepare(name);
  else if (cmd === 'extract') await runExtract(name);
  else if (cmd === 'auto') await runAuto(name);
  else throw new Error(`Unknown subcommand: ${cmd}. Use prepare, extract, or auto.`);
}

main().catch(err => {
  console.error('\n[scapes] Error:', err.message);
  process.exit(1);
});

// ── Prepare: assemble reference sheet + prompt ──────────────

async function runPrepare(name) {
  const srcDir = path.join(ROOT, 'generated', name);
  if (!fs.existsSync(srcDir)) throw new Error(`No scape found at generated/${name}/`);

  const hdName    = `${name}-hd`;
  const outDir    = path.join(ROOT, 'generated', hdName);
  const assetsDir = path.join(outDir, 'assets');

  log(`Copying ${name} → ${hdName}`);
  fs.cpSync(srcDir, outDir, { recursive: true });

  const brief      = loadJSON(outDir, 'brief.json', name);
  const definition = loadJSON(outDir, 'definition.json', name);
  definition.name  = hdName;
  fs.writeFileSync(path.join(outDir, 'definition.json'), JSON.stringify(definition, null, 2));

  const { refSheet, layout, sheetW, sheetH } = await assembleSheet(outDir, definition);

  const refSheetPath = path.join(assetsDir, 'reference-sheet.png');
  fs.writeFileSync(refSheetPath, refSheet);
  log(`Reference sheet: ${sheetW}×${sheetH} (${refSheet.length} bytes)`);

  // Save layout for the extract step
  const layoutPath = path.join(outDir, 'layout.json');
  fs.writeFileSync(layoutPath, JSON.stringify({ sheetW, sheetH, cells: layout }, null, 2));

  // Generate and save prompt
  const prompt = buildPrompt(brief, layout, sheetW, sheetH);
  const promptPath = path.join(outDir, 'prompt.txt');
  fs.writeFileSync(promptPath, prompt);

  // Generate and save panorama prompt
  const panoramaPrompt = buildPanoramaPrompt(brief);
  const panoramaPromptPath = path.join(outDir, 'panorama-prompt.txt');
  fs.writeFileSync(panoramaPromptPath, panoramaPrompt);

  log('');
  log('Prepare complete!');
  log('');
  log('Files created:');
  log(`  generated/${hdName}/assets/reference-sheet.png`);
  log(`  generated/${hdName}/prompt.txt`);
  log(`  generated/${hdName}/panorama-prompt.txt`);
  log(`  generated/${hdName}/layout.json`);
  log('');
  log('Next steps:');
  log('  1. Open reference-sheet.png in an image generator (Gemini, etc.)');
  log('  2. Use the prompt from prompt.txt');
  log('  3. Save the result as:');
  log(`     generated/${hdName}/assets/sheet.png`);
  log('  4. (Optional) Generate a sky panorama using panorama-prompt.txt');
  log('     Save as:');
  log(`     generated/${hdName}/assets/sky-panorama.png`);
  log('  5. Run:');
  log(`     node scripts/upgrade-scape.js extract ${name}`);
}

// ── Extract: split upgraded sheet into individual sprites ────

async function runExtract(name) {
  const hdName    = `${name}-hd`;
  const outDir    = path.join(ROOT, 'generated', hdName);
  const assetsDir = path.join(outDir, 'assets');

  if (!fs.existsSync(outDir)) throw new Error(`No HD folder found at generated/${hdName}/. Run 'prepare' first.`);

  const sheetPath  = path.join(assetsDir, 'sheet.png');
  const layoutPath = path.join(outDir, 'layout.json');

  if (!fs.existsSync(sheetPath))  throw new Error(`No sheet.png found at generated/${hdName}/assets/. Place the upgraded image there first.`);
  if (!fs.existsSync(layoutPath)) throw new Error(`No layout.json found at generated/${hdName}/. Run 'prepare' first.`);

  const { sheetW, sheetH, cells } = JSON.parse(fs.readFileSync(layoutPath, 'utf-8'));
  const upgradedSheet = fs.readFileSync(sheetPath);

  const newSprites = await extractSprites(upgradedSheet, cells, sheetW, sheetH, assetsDir);

  // Update definition
  const defPath    = path.join(outDir, 'definition.json');
  const definition = JSON.parse(fs.readFileSync(defPath, 'utf-8'));
  definition.sprites.individual = newSprites.map(s => ({
    name: s.name,
    src: `assets/${s.file}`,
  }));

  // Detect sky panorama
  const skyPanoPath = path.join(assetsDir, 'sky-panorama.png');
  if (fs.existsSync(skyPanoPath)) {
    definition.sky = definition.sky ?? {};
    definition.sky.panorama = {
      src:   'assets/sky-panorama.png',
      speed: 0.01,
    };
    log('  + sky-panorama.png detected, added to definition');
  }

  fs.writeFileSync(defPath, JSON.stringify(definition, null, 2));

  log('');
  log(`Upgrade complete!  generated/${hdName}/`);
  log(`  definition.json  (updated)`);
  newSprites.forEach(s => log(`  assets/${s.file}`));
  if (fs.existsSync(skyPanoPath)) log(`  assets/sky-panorama.png  (sky)`);
  log('');
  log(`Original SVG scape preserved at: generated/${name}/`);
  log(`HD scape created at: generated/${hdName}/`);
}

// ── Auto: full pipeline (prepare → Gemini API → extract) ────

async function runAuto(name) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY env var is not set');

  const srcDir = path.join(ROOT, 'generated', name);
  if (!fs.existsSync(srcDir)) throw new Error(`No scape found at generated/${name}/`);

  const hdName    = `${name}-hd`;
  const outDir    = path.join(ROOT, 'generated', hdName);
  const assetsDir = path.join(outDir, 'assets');

  log(`Copying ${name} → ${hdName}`);
  fs.cpSync(srcDir, outDir, { recursive: true });

  const brief      = loadJSON(outDir, 'brief.json', name);
  const definition = loadJSON(outDir, 'definition.json', name);
  definition.name  = hdName;

  const { refSheet, layout, sheetW, sheetH } = await assembleSheet(outDir, definition);

  const refSheetPath = path.join(assetsDir, 'reference-sheet.png');
  fs.writeFileSync(refSheetPath, refSheet);
  log(`Reference sheet: ${sheetW}×${sheetH} (${refSheet.length} bytes)`);

  // Save layout for reference
  fs.writeFileSync(path.join(outDir, 'layout.json'),
    JSON.stringify({ sheetW, sheetH, cells: layout }, null, 2));

  // Gemini call
  log('Sending to Gemini for upgrade…');
  const prompt = buildPrompt(brief, layout, sheetW, sheetH);

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const model = process.env.GEMINI_MODEL ?? 'nano-banana-pro-preview';
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const gen   = genAI.getGenerativeModel({ model });

  const upgradedSheet = await callGeminiWithRetry(gen, [
    { inlineData: { mimeType: 'image/png', data: refSheet.toString('base64') } },
    { text: prompt },
  ], 'sprite sheet');

  const upgradedPath = path.join(assetsDir, 'sheet.png');
  fs.writeFileSync(upgradedPath, upgradedSheet);
  log(`Upgraded sheet saved (${upgradedSheet.length} bytes)`);

  // Extract sprites
  const newSprites = await extractSprites(upgradedSheet, layout, sheetW, sheetH, assetsDir);

  // Generate sky panorama
  log('Generating sky panorama…');
  const panoramaPrompt = buildPanoramaPrompt(brief);
  try {
    const panoramaBuf = await callGeminiWithRetry(gen, [
      { text: panoramaPrompt },
    ], 'sky panorama');

    const panoramaPath = path.join(assetsDir, 'sky-panorama.png');
    fs.writeFileSync(panoramaPath, panoramaBuf);
    log(`Sky panorama saved (${panoramaBuf.length} bytes)`);

    definition.sky = definition.sky ?? {};
    definition.sky.panorama = { src: 'assets/sky-panorama.png', speed: 0.01 };
  } catch (err) {
    log(`  ⚠ Sky panorama generation failed: ${err.message.slice(0, 100)}`);
    log('  Falling back to procedural sky');
  }

  // Update definition
  definition.sprites.individual = newSprites.map(s => ({
    name: s.name,
    src: `assets/${s.file}`,
  }));
  fs.writeFileSync(path.join(outDir, 'definition.json'), JSON.stringify(definition, null, 2));

  log('');
  log(`Upgrade complete!  generated/${hdName}/`);
  log(`  definition.json  (updated)`);
  newSprites.forEach(s => log(`  assets/${s.file}`));
  if (definition.sky?.panorama) log(`  assets/sky-panorama.png  (sky)`);
  log('');
  log(`Original SVG scape preserved at: generated/${name}/`);
  log(`HD scape created at: generated/${hdName}/`);
}

// ── Shared: assemble reference sprite sheet ─────────────────

async function assembleSheet(outDir, definition) {
  const svgEntries = (definition.sprites?.individual ?? [])
    .filter(e => e.src.endsWith('.svg'));

  if (svgEntries.length === 0) throw new Error('No SVG sprites to upgrade — already using images.');

  log(`Upgrading ${svgEntries.length} SVG sprite(s)`);
  log('Rendering SVGs to reference sheet…');

  const CELL_H  = 512;
  const PADDING = 40;
  const cells   = [];

  for (const entry of svgEntries) {
    const svgPath = path.join(outDir, entry.src);
    if (!fs.existsSync(svgPath)) {
      log(`  ⚠ Missing: ${entry.src} — skip`);
      continue;
    }

    const pngBuf = await sharp(svgPath)
      .resize({ width: CELL_H, height: CELL_H, fit: 'inside' })
      .png()
      .toBuffer();

    const meta = await sharp(pngBuf).metadata();
    cells.push({ name: entry.name, buf: pngBuf, w: meta.width, h: meta.height });
    log(`  ✓ ${entry.name}  (${meta.width}×${meta.height})`);
  }

  if (cells.length === 0) throw new Error('No SVGs could be rendered');

  // Grid layout — pick column count closest to 1:1 aspect ratio
  const CELL_W = CELL_H;
  let bestCols = cells.length, bestRatio = Infinity;

  for (let cols = 1; cols <= cells.length; cols++) {
    const rows = Math.ceil(cells.length / cols);
    const w = cols * (CELL_W + PADDING) + PADDING;
    const h = rows * (CELL_H + PADDING) + PADDING;
    const ratio = Math.abs(Math.log(w / h));
    if (ratio < bestRatio) { bestRatio = ratio; bestCols = cols; }
  }

  const numCols = bestCols;
  const numRows = Math.ceil(cells.length / numCols);
  const sheetW  = numCols * (CELL_W + PADDING) + PADDING;
  const sheetH  = numRows * (CELL_H + PADDING) + PADDING;

  const composites = [];
  const layout     = [];

  for (let i = 0; i < cells.length; i++) {
    const c   = cells[i];
    const col = i % numCols;
    const row = Math.floor(i / numCols);
    const cellX = PADDING + col * (CELL_W + PADDING);
    const cellY = PADDING + row * (CELL_H + PADDING);
    const x = cellX + Math.round((CELL_W - c.w) / 2);
    const y = cellY + Math.round((CELL_H - c.h) / 2);
    composites.push({ input: c.buf, left: x, top: y });
    layout.push({ name: c.name, x: cellX, y: cellY, w: CELL_W, h: CELL_H });
  }

  log(`Grid: ${numCols}×${numRows} (${sheetW}×${sheetH})`);

  const refSheet = await sharp({
    create: {
      width: sheetW, height: sheetH, channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  return { refSheet, layout, sheetW, sheetH };
}

// ── Shared: build the upgrade prompt ────────────────────────

function buildPrompt(brief, layout, sheetW, sheetH) {
  const { style = 'flat illustration', mood = '', upgradeStyle } = brief;

  // Allow brief to override the full upgrade prompt
  if (upgradeStyle) return upgradeStyle;

  return [
    `Redraw every sprite on this sheet in ${style} style.`,
    mood ? `Mood and atmosphere: ${mood}.` : '',
    `Each sprite must keep the same position, bounding box, and transparent (green) background as the original — only the art style changes.`,
    `Preserve the exact grid layout. Output at the same resolution.`,
  ].filter(Boolean).join('\n');
}

// ── Shared: build sky panorama prompt ────────────────────────

function buildPanoramaPrompt(brief) {
  const { style = 'painterly', mood = '', theme = '', timeOfDay = 'day' } = brief;

  return [
    `Generate a wide seamlessly horizontally tileable panoramic sky image.`,
    `Style: ${style}. Time of day: ${timeOfDay}. Theme: ${theme}.`,
    mood ? `Mood: ${mood}.` : '',
    `The image should be 2048 pixels wide and 540 pixels tall.`,
    `It must tile seamlessly left-to-right (left edge matches right edge perfectly).`,
    `Include clouds and atmospheric effects appropriate to the time of day.`,
    `The bottom ~15% should fade to a hazy horizon — no ground, buildings, or foreground.`,
    `Do NOT include any text, watermarks, or borders.`,
  ].filter(Boolean).join('\n');
}

// ── Shared: extract sprites from upgraded sheet ─────────────

async function extractSprites(sheetBuf, cells, sheetW, sheetH, assetsDir) {
  log('Extracting sprites at known positions…');

  const sheetMeta = await sharp(sheetBuf).metadata();
  const scaleX = sheetMeta.width  / sheetW;
  const scaleY = sheetMeta.height / sheetH;

  if (scaleX !== 1 || scaleY !== 1) {
    log(`  Sheet is ${sheetMeta.width}×${sheetMeta.height} (${scaleX.toFixed(2)}x, ${scaleY.toFixed(2)}x of reference) — scaling extraction coords`);
  }

  const newSprites = [];

  for (const cell of cells) {
    const left   = Math.round(cell.x * scaleX);
    const top    = Math.round(cell.y * scaleY);
    const width  = Math.min(Math.round(cell.w * scaleX), sheetMeta.width  - left);
    const height = Math.min(Math.round(cell.h * scaleY), sheetMeta.height - top);

    if (width < 1 || height < 1) {
      log(`  ⚠ Skipping ${cell.name} — invalid region`);
      continue;
    }

    const file    = `${cell.name}.png`;
    const outPath = path.join(assetsDir, file);

    const { data, info } = await sharp(sheetBuf)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Chroma-key: green → transparent
    const out = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0; i < info.width * info.height; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      out[i * 4]     = r;
      out[i * 4 + 1] = g;
      out[i * 4 + 2] = b;
      out[i * 4 + 3] = isGreenScreen(r, g, b) ? 0 : 255;
    }

    await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(outPath);

    newSprites.push({ name: cell.name, file });
    log(`  ✓ ${file}  (${info.width}×${info.height})`);
  }

  return newSprites;
}

// ── Gemini call with retry ──────────────────────────────────

async function callGeminiWithRetry(gen, parts, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await gen.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      });

      const responseParts = result.response.candidates?.[0]?.content?.parts ?? [];
      const imagePart = responseParts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

      if (!imagePart) {
        const text = responseParts.find(p => p.text)?.text ?? '(no text)';
        throw new Error(`Gemini returned no image for ${label}. Model said: ${text.slice(0, 200)}`);
      }

      const raw = Buffer.from(imagePart.inlineData.data, 'base64');
      return sharp(raw).png().toBuffer();
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = attempt * 5000;
        log(`  Retry ${attempt}/${maxRetries} for ${label} in ${delay / 1000}s — ${err.message.slice(0, 80)}`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

// ── Utilities ───────────────────────────────────────────────

function loadJSON(dir, file, name) {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) throw new Error(`No ${file} found in generated/${name}/`);
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function isGreenScreen(r, g, b) {
  return g > 150 && g > r * 1.4 && g > b * 1.4 && r < 120 && b < 120;
}

function log(msg) {
  process.stdout.write(`[scapes] ${msg}\n`);
}
