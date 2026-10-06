/* ═══════════════════════════════════════════════════════════
   presets.js — Default state + saving / loading presets
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'crt-scope-presets';

// ── Per-pane config ──────────────────────────────────────────
// Each pane is a self-contained mini-scope. Everything that can be set per
// pane (visualisation, signal/display, trigger, phosphor, CRT effects) lives
// here. Upstream audio-graph settings (device, input gain, coupling) stay
// global on the state object below.
export function makePaneConfig(overrides = {}) {
  return {
    mode: 'wave',           // 'wave' | 'fft' | 'xy' | 'both' | 'spectrogram'
    // signal / display
    gain: 1.0,
    sweep: 1,
    channel: 'l',           // 'l' | 'r' | 'mix'
    logScale: false,        // FFT
    xySource: 'auto',       // 'auto' | 'stereo' | 'self'
    phosphor: 'bw',
    // trigger (drives this pane's ScopeAnalyser)
    trigMode: 'auto',       // 'auto' | 'normal' | 'single'
    trigSlope: 'rise',      // 'rise' | 'fall'
    trigLevel: 0,
    // effects (drive this pane's CRTProcessor)
    crtEnabled: true,
    persistence: 0.35,
    glow: 1.0,
    lineWeight: 2.0,
    beamIntensity: 0.6,     // 0 = uniform trace … 1 = full velocity (Z-axis) modulation
    // video feedback (params matched to crt.js)
    feedbackEnabled: false, // default OFF; one pane tunneling at a time is plenty
    feedback: 0.85,         // amount/gain — clamped < 1.0; subtle but visible tail
    fbZoom: 0.99,           // <1 tunnels inward, >1 outward (slightly receding = stable)
    fbRotate: 0,            // radians per frame
    fbOffsetX: 0,           // px drift
    fbOffsetY: 0,
    fbBlur: 0,              // softness on the feedback path (px)
    ...overrides,
  };
}

const DEFAULT_STATE = {
  layout: 'single',         // 'single' | 'quad'
  focusedPane: 0,
  panes: [
    makePaneConfig({ mode: 'wave' }),
    makePaneConfig({ mode: 'fft' }),
    makePaneConfig({ mode: 'xy' }),
    makePaneConfig({ mode: 'spectrogram' }),
  ],
  // global (upstream / app-level)
  inputGain: 1.0,
  coupling: 'dc',
  // tools (single-layout only)
  cursorsEnabled: false,
};

export function getDefaultState() {
  return {
    ...DEFAULT_STATE,
    panes: [
      makePaneConfig({ mode: 'wave' }),
      makePaneConfig({ mode: 'fft' }),
      makePaneConfig({ mode: 'xy' }),
      makePaneConfig({ mode: 'spectrogram' }),
    ],
  };
}

// ── Presets ──────────────────────────────────────────────────
// A preset is the "look": layout, the four pane configs and the two global
// audio settings. Session state (device, focus, freeze, cursors) is left out.
//
// Presets are files in presets/<id>.json, written through server.py and
// listed by presets/index.json. Every save is mirrored to localStorage, which
// is only read when the files can't be (page served without server.py).

export function toPreset(name, state) {
  return {
    name,
    saved: new Date().toISOString(),
    layout: state.layout,
    inputGain: state.inputGain,
    coupling: state.coupling,
    panes: state.panes.map(p => ({ ...p })),
  };
}

// Fill in anything a preset lacks (older file, hand-edited) from the defaults.
export function normalizePreset(data) {
  const d = getDefaultState();
  return {
    layout: data.layout === 'quad' ? 'quad' : 'single',
    inputGain: Number.isFinite(data.inputGain) ? data.inputGain : d.inputGain,
    coupling: data.coupling === 'ac' ? 'ac' : 'dc',
    panes: d.panes.map((def, i) => ({ ...def, ...(data.panes?.[i] ?? {}) })),
  };
}

// File-safe id for a preset name ("Blå Tunnel 2" → "bla-tunnel-2").
export function presetId(name) {
  const id = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return id === 'index' ? 'index-preset' : id;   // index.json is the listing
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function writeLocal(all) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Could not store presets in the browser:', e);
  }
}

// → [{ id, name, local }], where local = only stored in this browser.
export async function listPresets() {
  let files = null;
  try {
    const res = await fetch('presets/index.json', { cache: 'no-store' });
    if (res.ok) files = await res.json();
  } catch (e) {}

  const list = (files ?? []).map(({ id, name }) => ({ id, name, local: false }));
  const inFolder = new Set(list.map(p => p.id));
  const local = readLocal();
  let pruned = false;
  for (const [id, entry] of Object.entries(local)) {
    if (inFolder.has(id) || !entry?.preset) continue;
    if (files && entry.synced) {   // its file has been removed from the folder
      delete local[id];
      pruned = true;
      continue;
    }
    list.push({ id, name: entry.preset.name || id, local: true });
  }
  if (pruned) writeLocal(local);
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

// Resolves true if the file was written, false if it only reached localStorage.
export async function savePreset(id, preset) {
  let synced = false;
  try {
    const res = await fetch(`presets/${id}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset, null, 2) + '\n',
    });
    synced = res.ok;
  } catch (e) {}
  const local = readLocal();
  local[id] = { preset, synced };
  writeLocal(local);
  return synced;
}

export async function loadPreset(id) {
  try {
    const res = await fetch(`presets/${id}.json`, { cache: 'no-store' });
    if (res.ok) return normalizePreset(await res.json());
  } catch (e) {}
  const entry = readLocal()[id];
  return entry?.preset ? normalizePreset(entry.preset) : null;
}

// Resolves false if the file could not be removed (nothing is deleted then).
export async function deletePreset({ id, local: browserOnly }) {
  if (!browserOnly) {
    try {
      const res = await fetch(`presets/${id}.json`, { method: 'DELETE' });
      if (!res.ok) return false;
    } catch (e) {
      return false;
    }
  }
  const local = readLocal();
  delete local[id];
  writeLocal(local);
  return true;
}
