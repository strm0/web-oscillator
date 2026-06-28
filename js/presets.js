/* ═══════════════════════════════════════════════════════════
   presets.js — Save / load scope configurations
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'crt-scope-presets';

const DEFAULT_STATE = {
  mode: 'wave',
  gain: 1.0,
  sweep: 1,
  triggerLevel: 0,
  triggerMode: 'auto',
  triggerSlope: 'rise',
  coupling: 'dc',
  persistence: 0.35,
  feedback: 0,
  glowIntensity: 1.0,
  lineWeight: 2.0,
  crtFull: true,
  phosphor: 'bw',
  logScale: false,
  channel: 'l',   // 'l' | 'r' | 'mix'
  cursorsEnabled: false,
  cursorX1: 0.25,
  cursorX2: 0.75,
  cursorY1: 0.25,
  cursorY2: 0.75,
};

export function getDefaultState() {
  return { ...DEFAULT_STATE };
}

export function savePreset(name, state) {
  const presets = loadAllPresets();
  presets[name] = { ...state, _saved: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('Could not save preset:', e);
  }
}

export function loadPreset(name) {
  const presets = loadAllPresets();
  return presets[name] ? { ...DEFAULT_STATE, ...presets[name] } : null;
}

export function loadAllPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function deletePreset(name) {
  const presets = loadAllPresets();
  delete presets[name];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {}
}
