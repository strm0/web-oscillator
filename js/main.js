/* ═══════════════════════════════════════════════════════════
   main.js — Init, animation loop, glue code
   ═══════════════════════════════════════════════════════════ */

import { AudioEngine }   from './audio.js';
import { ScopeAnalyser } from './analyser.js';
import { ScopeRenderer } from './renderer.js';
import { CRTProcessor }  from './crt.js';
import { Controls }       from './controls.js';
import { getDefaultState } from './presets.js';

// ── STATE ──
const state = getDefaultState();

// ── ENGINE INSTANCES ──
const audio    = new AudioEngine();

// Signal canvas (offscreen — renderer draws here)
const signalCanvas = document.getElementById('signalCanvas');
const renderer     = new ScopeRenderer(signalCanvas);

// Display canvas (visible — CRT processors composite here)
const displayCanvas = document.getElementById('scope');

// ── PANES ──
// Each pane is a self-contained mini-scope: its config (state.panes[i]) plus
// its own CRTProcessor, ScopeAnalyser and spectrogram history. All four exist
// at all times; single layout renders pane 0, quad renders all four.
const SPECTRO_MAX_ROWS = 128;
const panes = state.panes.map((config) => ({
  config,
  crt: new CRTProcessor(displayCanvas),
  analyser: new ScopeAnalyser(),
  spectroHistory: [],
}));

// ── LAYOUT CONSTANTS ──
const QUAD_GUTTER = 6;
const QUAD_INSET  = 10;   // grid inset inside each quad cell

// ── XY ──
const DEFAULT_XY_DELAY = 64;  // samples; ~1.3ms @48k

// Reusable mix buffers (avoid per-frame allocation when channel === 'mix')
let mixTimeBuf = null, mixFreqBuf = null;

// ── RING-BUFFER TIME SNAPSHOTS ──
// Reusable scratch for the once-per-frame time-domain snapshot pulled from the
// audio ring. Sized to the ring so any snapshot length fits via subarray().
const timeScratchL = new Float32Array(audio.RING);
const timeScratchR = new Float32Array(audio.RING);
const SINGLE_IDX = [0];
const QUAD_IDX = [0, 1, 2, 3];
// Snapshot = 2.25× the largest display window so the triggered window never
// clips at the buffer end (clipped → varying result length → horizontal jitter).
const SNAP_MARGIN = 2.25;
function snapshotLenFor(indices) {
  let maxWin = 0;
  for (const i of indices) {
    const spd = Math.floor(audio.analyserL.fftSize / (10 * panes[i].config.sweep));
    if (spd * 10 > maxWin) maxWin = spd * 10;
  }
  return Math.min(Math.max(64, Math.ceil(maxWin * SNAP_MARGIN)), audio.RING);
}

// Focus border shows for 2s after a focus change, then disappears (no fade).
const FOCUS_BORDER_MS = 2000;
let focusBorderUntil = 0;
function flashFocusBorder() { focusBorderUntil = performance.now() + FOCUS_BORDER_MS; }

// ── HELPERS ──
function focusedIdx() {
  return state.layout === 'single' ? 0 : state.focusedPane;
}
function focusedPane() {
  return panes[focusedIdx()];
}

// Quad 2×2 rects (each pane's full allocated region on the canvas)
function quadRects(W, H) {
  const pad = renderer.pad, g = QUAD_GUTTER;
  const innerW = W - pad * 2, innerH = H - pad * 2;
  const pw = Math.floor((innerW - g) / 2);
  const ph = Math.floor((innerH - g) / 2);
  return [
    { x: pad,             y: pad,             w: pw, h: ph }, // 0 TL
    { x: pad + pw + g,    y: pad,             w: pw, h: ph }, // 1 TR
    { x: pad,             y: pad + ph + g,    w: pw, h: ph }, // 2 BL
    { x: pad + pw + g,    y: pad + ph + g,    w: pw, h: ph }, // 3 BR
  ];
}

// ── RESIZE ──
function resize() {
  const rect = displayCanvas.parentElement.getBoundingClientRect();
  const W = Math.round(rect.width);
  const H = Math.round(rect.height);

  // Signal canvas at native resolution
  signalCanvas.width = W;
  signalCanvas.height = H;
  renderer.resize(W, H);

  // Shared display canvas sized once here; CRT buffers sized per pane below.
  displayCanvas.width = W;
  displayCanvas.height = H;
  displayCanvas.style.width = W + 'px';
  displayCanvas.style.height = H + 'px';

  sizeCrtBuffers();
}

// Size each pane's CRT offscreen buffers to its current region.
function sizeCrtBuffers() {
  const W = renderer.W, H = renderer.H;
  if (state.layout === 'quad') {
    const rects = quadRects(W, H);
    for (let i = 0; i < 4; i++) panes[i].crt.resize(rects[i].w, rects[i].h);
  } else {
    panes[0].crt.resize(W, H);
  }
}
window.addEventListener('resize', resize);

// ── CHANNEL SELECTION ──
// Pick this pane's time/freq buffers from the single shared snapshot.
// The 'mix' branch fills shared buffers once per frame (cached on `frame`).
function selectChannel(frame, channel) {
  const s = frame.samples;
  if (channel === 'r') return { timeData: s.timeR, freqData: s.freqR };
  if (channel === 'mix') {
    if (!frame.mixComputed) {
      if (!mixTimeBuf || mixTimeBuf.length !== s.timeL.length) {
        mixTimeBuf = new Float32Array(s.timeL.length);
        mixFreqBuf = new Uint8Array(s.freqL.length);
      }
      for (let i = 0; i < mixTimeBuf.length; i++) {
        mixTimeBuf[i] = (s.timeL[i] + s.timeR[i]) * 0.5;
      }
      for (let i = 0; i < mixFreqBuf.length; i++) {
        mixFreqBuf[i] = (s.freqL[i] + s.freqR[i]) >> 1;
      }
      frame.mixComputed = true;
    }
    return { timeData: mixTimeBuf, freqData: mixFreqBuf };
  }
  return { timeData: s.timeL, freqData: s.freqL };
}

// ── XY DATA SELECTION (Phase 0) ──
function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
function meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}
// Decide what XY plots. 'self' plots a signal against a delayed copy of itself
// (a real phase-space figure even from a mono source); 'stereo' is classic
// L-vs-R Lissajous. 'auto' picks 'self' whenever stereo would be degenerate.
function pickXYData(frame, audio, cfg) {
  const L = frame.samples.timeL, R = frame.samples.timeR;
  let m = cfg.xySource;
  if (m === 'auto') {
    const stereo = audio.inputChannels >= 2;
    m = (!stereo || rms(R) < 0.0025 || meanAbsDiff(L, R) < 1e-4) ? 'self' : 'stereo';
  }
  if (m === 'self') {
    const src = rms(L) >= rms(R) ? L : R;
    return { dataX: src, dataY: src, delay: DEFAULT_XY_DELAY };
  }
  return { dataX: L, dataY: R, delay: 0 };
}

// ── CONFIG → ENGINES ──
// Config is the single source of truth: push the pane's settings into its
// CRTProcessor and ScopeAnalyser every frame so focus changes / control edits
// take effect with no extra plumbing.
function syncPaneToEngines(pane) {
  const c = pane.config, crt = pane.crt, a = pane.analyser;
  crt.persistence   = c.persistence;
  crt.glowIntensity = c.glow;
  crt.bloomRadius   = 6 + c.glow * 4;
  crt.bloomEnabled  = c.crtEnabled;
  crt.feedback      = c.feedbackEnabled ? Math.min(c.feedback, 0.98) : 0;
  crt.fbZoom        = c.fbZoom;
  crt.fbRotate      = c.fbRotate;
  crt.fbOffsetX     = c.fbOffsetX;
  crt.fbOffsetY     = c.fbOffsetY;
  crt.fbBlur        = c.fbBlur;
  a.triggerMode  = c.trigMode;
  a.triggerSlope = c.trigSlope;
  a.triggerLevel = c.trigLevel;
}

// ── DRAW ONE PANE (raw signal only, no CRT) ──
function drawPane(pane, paneRect, inset, frame) {
  const cfg = pane.config;
  renderer.phosphor = cfg.phosphor;

  const x0 = paneRect.x + inset;
  const y0 = paneRect.y + inset;
  const w  = paneRect.w - inset * 2;
  const h  = paneRect.h - inset * 2;
  if (w <= 0 || h <= 0) return;

  const spd = Math.floor(audio.analyserL.fftSize / (10 * cfg.sweep));
  const { timeData, freqData } = selectChannel(frame, cfg.channel);

  switch (cfg.mode) {
    case 'wave': {
      renderer.drawGrid(x0, y0, w, h);
      const waveData = pane.analyser.getTriggeredWaveform(timeData, spd);
      renderer.drawWaveform(waveData, x0, y0, w, h, cfg.gain, cfg.glow, cfg.lineWeight, cfg.beamIntensity);
      renderer.drawTriggerLine(x0, y0, w, h, cfg.trigLevel);
      break;
    }
    case 'fft':
      renderer.drawGrid(x0, y0, w, h);
      renderer.drawSpectrum(freqData, x0, y0, w, h, cfg.gain, cfg.glow, cfg.logScale);
      break;

    case 'xy': {
      renderer.drawGrid(x0, y0, w, h);
      const { dataX, dataY, delay } = pickXYData(frame, audio, cfg);
      renderer.drawXY(dataX, dataY, x0, y0, w, h, cfg.gain, cfg.glow, cfg.lineWeight, delay, cfg.beamIntensity);
      break;
    }

    case 'both': {
      const halfH = h / 2 - 4;
      renderer.drawGrid(x0, y0, w, halfH);
      const waveData = pane.analyser.getTriggeredWaveform(timeData, spd);
      renderer.drawWaveform(waveData, x0, y0, w, halfH, cfg.gain, cfg.glow, cfg.lineWeight, cfg.beamIntensity);
      renderer.drawTriggerLine(x0, y0, w, halfH, cfg.trigLevel);

      const sCtx = renderer.ctx;
      sCtx.strokeStyle = renderer.colors.gridBright;
      sCtx.lineWidth = 0.4;
      sCtx.beginPath();
      sCtx.moveTo(x0, y0 + halfH + 4);
      sCtx.lineTo(x0 + w, y0 + halfH + 4);
      sCtx.stroke();

      renderer.drawGrid(x0, y0 + halfH + 8, w, halfH);
      renderer.drawSpectrum(freqData, x0, y0 + halfH + 8, w, halfH, cfg.gain, cfg.glow, cfg.logScale);
      break;
    }

    case 'spectrogram':
      pane.spectroHistory.push(new Uint8Array(freqData));
      if (pane.spectroHistory.length > SPECTRO_MAX_ROWS) pane.spectroHistory.shift();
      renderer.drawSpectrogram(pane.spectroHistory, x0, y0, w, h);
      break;
  }
}

// ── CALLBACKS FOR CONTROLS ──
const controls = new Controls(state, {
  getDevices: () => audio.enumerateDevices(),

  start: async () => {
    const deviceId = document.getElementById('audioSource').value;
    try {
      const info = await audio.start(deviceId);
      controls.showRunning(info);
      requestAnimationFrame(drawLoop);
    } catch (e) {
      controls.showError(e.message);
    }
  },

  stop: () => {
    audio.stop();
    controls.showStopped();
    requestAnimationFrame(drawIdle);
  },

  // Global (audio graph)
  setCoupling:  (mode)  => audio.setCoupling(mode),
  setInputGain: (v)     => audio.setInputGain(v),

  // Per-pane: config is written by controls.js; these only need engine-side
  // side effects that aren't covered by the per-frame sync.
  setTrigMode: (mode) => { if (mode === 'single') focusedPane().analyser.rearm(); },
  rearm:       ()     => focusedPane().analyser.rearm(),

  setLayout: (layout) => {
    state.layout = layout;
    if (layout === 'single') state.focusedPane = 0;
    sizeCrtBuffers();
    controls.updateLayout(layout);
    if (layout === 'quad') flashFocusBorder();
  },

  onFocusChange: () => flashFocusBorder(),

  // Reset spectrogram history when a pane leaves spectrogram mode.
  resetPaneHistory: (idx) => { panes[idx].spectroHistory.length = 0; },

  // Read-back of per-pane runtime state that doesn't live in config.
  getPaneFrozen: (idx) => panes[idx].analyser.frozen,

  setCrt: (on) => {
    focusedPane().config.crtEnabled = on;
    document.getElementById('btnCrtOn').classList.toggle('active', on);
    document.getElementById('btnCrtOff').classList.toggle('active', !on);
    document.getElementById('crtOverlay').classList.toggle('off', !on);
    document.getElementById('scanlines').classList.toggle('off', !on);
    document.getElementById('scopeContainer').classList.toggle('crt-on', on);
  },

  toggleFreeze: () => {
    const pane = focusedPane();
    const a = pane.analyser;
    if (a.frozen) {
      a.unfreeze();
      controls.updateFreeze(false);
    } else {
      if (!audio.running || !audio.analyserL) return;
      const spd = Math.floor(audio.analyserL.fftSize / (10 * pane.config.sweep));
      const snapLen = Math.min(Math.max(64, Math.ceil(spd * 10 * SNAP_MARGIN)), audio.RING);
      const ch = pane.config.channel === 'r' ? 'r' : 'l';
      const buf = audio.getTimeSnapshot(timeScratchL.subarray(0, snapLen), ch, snapLen);
      const triggered = a.getTriggeredWaveform(buf, spd);
      a.freeze(triggered);   // returns a copy, so reusing the scratch is safe
      controls.updateFreeze(true);
    }
  },

  toggleCursors: () => {
    state.cursorsEnabled = !state.cursorsEnabled;
    panes[0].analyser.cursorsEnabled = state.cursorsEnabled;
    controls.updateCursors(state.cursorsEnabled);
  },

  screenshot: () => {
    const link = document.createElement('a');
    link.download = `scope-${Date.now()}.png`;
    link.href = displayCanvas.toDataURL('image/png');
    link.click();
  },
});

// ── CURSOR DRAGGING (single layout only) ──
(function initCursorDrag() {
  const container = document.querySelector('.scope-container');
  let dragging = null;
  const a = () => panes[0].analyser;  // cursors are single-layout → pane 0

  container.addEventListener('mousedown', (e) => {
    if (!state.cursorsEnabled || state.layout !== 'single') return;
    const rect = displayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const dists = [
      { id: 'x1', d: Math.abs(x - a().cursorX1) },
      { id: 'x2', d: Math.abs(x - a().cursorX2) },
      { id: 'y1', d: Math.abs(y - a().cursorY1) },
      { id: 'y2', d: Math.abs(y - a().cursorY2) },
    ];
    dists.sort((p, q) => p.d - q.d);
    if (dists[0].d < 0.04) dragging = dists[0].id;
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = displayCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    if (dragging === 'x1') a().cursorX1 = x;
    else if (dragging === 'x2') a().cursorX2 = x;
    else if (dragging === 'y1') a().cursorY1 = y;
    else if (dragging === 'y2') a().cursorY2 = y;
  });

  window.addEventListener('mouseup', () => { dragging = null; });
})();

// ── CLICK-TO-FOCUS (quad layout only) ──
displayCanvas.addEventListener('mousedown', (e) => {
  if (state.layout !== 'quad') return;
  const r = displayCanvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * displayCanvas.width;
  const py = (e.clientY - r.top) / r.height * displayCanvas.height;
  const rects = quadRects(renderer.W, renderer.H);
  for (let i = 0; i < 4; i++) {
    const q = rects[i];
    if (px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h) {
      controls.setFocus(i);
      break;
    }
  }
});

// ── DRAW LOOP ──
function drawLoop() {
  if (!audio.running) return;

  const now = performance.now();

  // Single acquisition per frame — every pane renders from this one snapshot.
  // Frequency from the analysers; time-domain from the ring buffer.
  const fdata = audio.getSamples();
  if (!fdata) { requestAnimationFrame(drawLoop); return; }

  const W = renderer.W, H = renderer.H;
  const sCtx = renderer.ctx;
  sCtx.clearRect(0, 0, W, H);

  // One ring snapshot per frame, sized so every rendered pane's triggered
  // window fits without clipping; all panes share it (single-acquisition).
  const snapLen = snapshotLenFor(state.layout === 'quad' ? QUAD_IDX : SINGLE_IDX);
  const timeL = audio.getTimeSnapshot(timeScratchL.subarray(0, snapLen), 'l', snapLen);
  const timeR = audio.getTimeSnapshot(timeScratchR.subarray(0, snapLen), 'r', snapLen);

  const frame = {
    samples: { timeL, timeR, freqL: fdata.freqL, freqR: fdata.freqR },
    mixComputed: false,
  };

  if (state.layout === 'quad') {
    const rects = quadRects(W, H);
    // 1. raw render every pane into its cell of the signal canvas
    for (let i = 0; i < 4; i++) {
      syncPaneToEngines(panes[i]);
      drawPane(panes[i], rects[i], QUAD_INSET, frame);
    }
    // 2. per-pane CRT composite (each maintains its own buffers)
    const dCtx = displayCanvas.getContext('2d');
    dCtx.fillStyle = '#050505';
    dCtx.fillRect(0, 0, W, H); // paint gutters/margins once
    for (let i = 0; i < 4; i++) panes[i].crt.process(signalCanvas, rects[i]);

    // Focus highlight — drawn on the display (not signal) so it doesn't smear
    // through the focused pane's persistence/feedback buffers. Shows for 2s
    // after a focus change, then disappears completely.
    if (now < focusBorderUntil) {
      const fr = rects[state.focusedPane];
      dCtx.save();
      dCtx.strokeStyle = '#ffcc33';
      dCtx.lineWidth = 2;
      dCtx.strokeRect(fr.x + 1, fr.y + 1, fr.w - 2, fr.h - 2);
      dCtx.restore();
    }

  } else {
    const pane = panes[0];
    const full = { x: 0, y: 0, w: W, h: H };
    syncPaneToEngines(pane);
    drawPane(pane, full, renderer.pad, frame);

    // Cursors (single layout only)
    if (state.cursorsEnabled && pane.config.mode !== 'spectrogram') {
      const pad = renderer.pad;
      const spd = Math.floor(audio.analyserL.fftSize / (10 * pane.config.sweep));
      const m = pane.analyser.getCursorMeasurements(
        W - pad * 2, H - pad * 2, spd, audio.sampleRate, pane.config.gain);
      renderer.drawCursors(pad, pad, W - pad * 2, H - pad * 2, m);
      controls.updateCursorReadout(m);
    }

    pane.crt.process(signalCanvas, full);
  }

  requestAnimationFrame(drawLoop);
}

// ── IDLE LOOP (no signal) ──
function drawIdle() {
  if (audio.running) return;

  const pad = renderer.pad;
  const W = renderer.W, H = renderer.H;

  const sCtx = renderer.ctx;
  sCtx.clearRect(0, 0, W, H);
  renderer.phosphor = panes[0].config.phosphor;
  renderer.drawGrid(pad, pad, W - pad * 2, H - pad * 2);
  renderer.drawIdle(pad, pad, W - pad * 2, H - pad * 2);

  syncPaneToEngines(panes[0]);
  panes[0].crt.process(signalCanvas, { x: 0, y: 0, w: W, h: H });

  requestAnimationFrame(drawIdle);
}

// ── INIT ──
resize();
drawIdle();
