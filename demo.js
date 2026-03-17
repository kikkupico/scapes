import { ScapeEngine, Sky, Backdrop, Stage, loadScape } from './src/index.js';

// ── Preset loading ────────────────────────────────────────────

const PRESET_URLS = {
  noon:             './presets/noon/definition.json',
  lantern:          './presets/lantern-lake/definition.json',
  city:             './presets/city/definition.json',
  'alpine-village': './generated/alpine-village/definition.json',
  'desert-market':  './generated/desert-market/definition.json',
};

// ── Engine setup ──────────────────────────────────────────────

const canvas = document.getElementById('scape');
let engine   = null;
let playing  = true;

async function applyPreset(nameOrUrl) {
  const wasPlaying = playing;

  // Stop current engine if one exists
  if (engine) engine.stop();

  // Accept either a key in PRESET_URLS or a direct JSON path/URL
  const url = PRESET_URLS[nameOrUrl] ?? nameOrUrl;
  const def = await fetch(url).then(r => r.json());
  const basePath = url.substring(0, url.lastIndexOf('/'));
  engine = await loadScape(canvas, def, { basePath });

  // Re-apply current UI control state (in case user changed things before switching)
  engine.cameraSpeed = +document.getElementById('sl-speed').value;
  engine.setViewAngle(+document.getElementById('sl-angle').value);
  engine.setFog({
    enabled: document.getElementById('cb-fog').checked,
    density: +document.getElementById('sl-fog-den').value,
  });
  engine.setDOF({
    enabled:  document.getElementById('cb-dof').checked,
    focusZ:   +document.getElementById('sl-dof-z').value,
    strength: +document.getElementById('sl-dof-str').value,
  });

  if (wasPlaying) engine.start();

  document.querySelectorAll('[data-preset]').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === name)
  );
}

// Boot with noon preset
applyPreset('noon');

// ── UI wiring ─────────────────────────────────────────────────

// Play / Pause
document.getElementById('btn-play').addEventListener('click', e => {
  playing = !playing;
  if (playing) { engine.start(); e.target.textContent = 'Pause'; e.target.classList.add('active'); }
  else         { engine.stop();  e.target.textContent = 'Play';  e.target.classList.remove('active'); }
});

// Speed
bind('sl-speed', 'vl-speed', v => engine && (engine.cameraSpeed = +v));

// View angle
bind('sl-angle', 'vl-angle', v => {
  if (engine) engine.setViewAngle(+v);
  document.querySelectorAll('[data-angle]').forEach(b =>
    b.classList.toggle('active', +b.dataset.angle === +v)
  );
}, v => `${v}°`);

// Guo Xi Three Distances — snap view-angle slider to a preset pitch
document.querySelectorAll('[data-angle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const deg = +btn.dataset.angle;
    const sl  = document.getElementById('sl-angle');
    const vl  = document.getElementById('vl-angle');
    sl.value       = deg;
    vl.textContent = `${deg}°`;
    if (engine) engine.setViewAngle(deg);
    document.querySelectorAll('[data-angle]').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
  });
});

// DoF
document.getElementById('cb-dof').addEventListener('change', e => {
  if (engine) engine.setDOF({ enabled: e.target.checked });
});
bind('sl-dof-z',   'vl-dof-z',   v => engine && engine.setDOF({ focusZ:   +v }));
bind('sl-dof-str', 'vl-dof-str', v => engine && engine.setDOF({ strength: +v }));

// Fog
document.getElementById('cb-fog').addEventListener('change', e => {
  if (engine) engine.setFog({ enabled: e.target.checked });
});
bind('sl-fog-den', 'vl-fog-den', v => engine && engine.setFog({ density: +v }));

// Presets
document.querySelectorAll('[data-preset]').forEach(btn =>
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset))
);

// Helper – bind range slider to label display and engine setter
function bind(sliderId, valId, fn, fmt = v => v) {
  const sl = document.getElementById(sliderId);
  const vl = document.getElementById(valId);
  sl.addEventListener('input', () => { fn(sl.value); vl.textContent = fmt(sl.value); });
}
