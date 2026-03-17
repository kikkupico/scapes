// ============================================================
// loader.js – loadScape(): hydrate a ScapeDefinition into an engine
// ============================================================

import { ScapeEngine } from './ScapeEngine.js';
import { Sky }         from './layers/Sky.js';
import { Backdrop }    from './layers/Backdrop.js';
import { Stage }       from './layers/Stage.js';

/** Load a single image from any src (URL, data URI, blob URL). */
function loadImageSrc(src) {
  return new Promise((resolve, reject) => {
    const img  = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Resolve a possibly-relative path against a basePath.
 * Absolute URLs, data URIs, and blob URLs are returned as-is.
 */
function resolvePath(path, basePath) {
  if (!basePath) return path;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return basePath.replace(/\/?$/, '/') + path;
}

/**
 * Load all sprites referenced in the definition.
 * Supports:
 *   sprites.atlas + sprites.manifest  →  single sprite-sheet
 *   sprites.individual                →  array of { name, src } entries
 *
 * @returns {Promise<Map<string,CanvasImageSource>>}
 */
async function loadSprites(definition, basePath) {
  const sprites = new Map();
  if (!definition.sprites) return sprites;

  const { atlas, manifest, individual } = definition.sprites;

  if (atlas && manifest) {
    const atlasImg = await loadImageSrc(resolvePath(atlas, basePath));
    for (const entry of manifest) {
      const oc  = document.createElement('canvas');
      oc.width  = entry.w;
      oc.height = entry.h;
      oc.getContext('2d').drawImage(
        atlasImg,
        entry.x, entry.y, entry.w, entry.h,
        0, 0, entry.w, entry.h
      );
      sprites.set(entry.name, oc);
    }
  }

  if (individual?.length) {
    await Promise.all(individual.map(async ({ name, src }) => {
      const img = await loadImageSrc(resolvePath(src, basePath));
      sprites.set(name, img);
    }));
  }

  return sprites;
}

/**
 * Load a ScapeDefinition and return a configured (but not started) engine.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} definition  ScapeDefinition object
 * @param {object} [options]
 * @param {string} [options.basePath]  Base URL/path for resolving relative asset paths
 * @returns {Promise<ScapeEngine>}
 *
 * @example
 * const engine = await loadScape(canvas, definition, { basePath: '/assets' });
 * engine.start();
 */
export async function loadScape(canvas, definition, options = {}) {
  const { basePath = '' } = options;

  // 1. Load all sprites (atlas or individual files)
  const sprites = await loadSprites(definition, basePath);

  // 2. Create engine
  const W = definition.width  ?? 960;
  const H = definition.height ?? 540;
  const engine = new ScapeEngine(canvas, W, H);

  // 3. Sky
  if (definition.sky) {
    const stops = definition.sky.gradient.map(g => g.color);
    engine.sky = new Sky(stops);
  }

  // 4. Backdrop
  if (definition.backdrop) {
    engine.backdrop = new Backdrop(definition.backdrop.ridges ?? []);
  }

  // 5. Stage
  if (definition.ground) {
    engine.stage = new Stage({
      ground:    definition.ground,
      objects:   definition.objects ?? [],
      tileWidth: definition.tileWidth ?? 0,
      sprites,
    });
    engine.stage.precompute(engine);
  }

  // 6. Camera defaults from definition
  if (definition.camera) {
    if (definition.camera.speed     != null) engine.cameraSpeed = definition.camera.speed;
    if (definition.camera.viewAngle != null) engine.setViewAngle(definition.camera.viewAngle);
  }

  // 7. Fog
  if (definition.fog) {
    engine.fog.enabled = definition.fog.enabled ?? false;
    if (definition.fog.color   != null) engine.fog.color    = definition.fog.color;
    if (definition.fog.density != null) engine.fog.maxAlpha = definition.fog.density;
  }

  // 8. DoF
  if (definition.dof) {
    engine.dof.enabled = definition.dof.enabled ?? false;
    if (definition.dof.focusZ   != null) engine.dof.focusZ   = definition.dof.focusZ;
    if (definition.dof.strength != null) engine.dof.strength = definition.dof.strength;
  }

  return engine;
}
