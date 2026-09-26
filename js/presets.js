/* ═══════════════════════════════════════════════════════════
   presets.js — Save / load scope configurations
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
