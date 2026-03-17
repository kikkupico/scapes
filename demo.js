import { ScapeEngine, Sky, Backdrop, Stage, loadScape } from './src/index.js';

// ── Scape registry ──────────────────────────────────────────

const SCAPES = [
  { id: 'desert-market',     name: 'Desert Market',      url: './generated/desert-market/definition.json',     tag: 'generated' },
  { id: 'desert-market-hd',  name: 'Desert Market HD',   url: './generated/desert-market-hd/definition.json',  tag: 'generated' },
];

// ── Engine setup ────────────────────────────────────────────

const canvas = document.getElementById('scape');
let engine   = null;
let playing  = true;
let activeId = null;

async function applyScape(id) {
  const entry = SCAPES.find(s => s.id === id);
  if (!entry) return;

  const wasPlaying = playing;
  if (engine) engine.stop();

  const def = await fetch(entry.url).then(r => r.json());
  const basePath = entry.url.substring(0, entry.url.lastIndexOf('/'));
  engine = await loadScape(canvas, def, { basePath });

  // Apply current UI state
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

  // Update active state
  activeId = id;
  document.querySelectorAll('.scape-card').forEach(c =>
    c.classList.toggle('active', c.dataset.id === id)
  );

  // Update floating label
  document.getElementById('scape-label').textContent = entry.name;
}

// ── Build gallery ───────────────────────────────────────────

const gallery = document.getElementById('gallery-items');

for (const scape of SCAPES) {
  const card = document.createElement('div');
  card.className = 'scape-card';
  card.dataset.id = scape.id;

  const spriteCount = ''; // filled async
  card.innerHTML = `
    <span class="card-name">${scape.name}</span>
    <span class="card-tag">${scape.tag}</span>
  `;

  card.addEventListener('click', () => applyScape(scape.id));
  gallery.appendChild(card);

  // Load sprite count asynchronously
  fetch(scape.url)
    .then(r => r.json())
    .then(def => {
      const count = def.sprites?.individual?.length ?? 0;
      const meta = card.querySelector('.card-tag');
      if (meta) {
        const ext = def.sprites?.individual?.[0]?.src?.split('.').pop() ?? 'svg';
        meta.textContent = `${count} sprites`;
        if (ext === 'png') meta.textContent += ' \u00b7 HD';
      }
    })
    .catch(() => {});
}

// Boot with first scape
applyScape(SCAPES[0].id);

// ── UI wiring ───────────────────────────────────────────────

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
}, v => `${v}\u00b0`);

// Angle presets
document.querySelectorAll('[data-angle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const deg = +btn.dataset.angle;
    const sl  = document.getElementById('sl-angle');
    const vl  = document.getElementById('vl-angle');
    sl.value       = deg;
    vl.textContent = `${deg}\u00b0`;
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

// Helper
function bind(sliderId, valId, fn, fmt = v => v) {
  const sl = document.getElementById(sliderId);
  const vl = document.getElementById(valId);
  sl.addEventListener('input', () => { fn(sl.value); vl.textContent = fmt(sl.value); });
}
