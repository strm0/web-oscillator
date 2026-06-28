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
const analyser = new ScopeAnalyser();

// Signal canvas (offscreen — renderer draws here)
const signalCanvas = document.getElementById('signalCanvas');
const renderer     = new ScopeRenderer(signalCanvas);

// Display canvas (visible — CRT processor composites here)
const displayCanvas = document.getElementById('scope');
const crt           = new CRTProcessor(displayCanvas);

// Spectrogram history buffer
const spectroHistory = [];
const SPECTRO_MAX_ROWS = 128;

// FPS tracking
let fpsFrames = 0, fpsLast = performance.now(), fpsDisplay = 0;

// ── RESIZE ──
function resize() {
  const rect = displayCanvas.parentElement.getBoundingClientRect();
  const W = Math.round(rect.width);
  const H = Math.round(rect.height - 22); // minus readout

  // Signal canvas at native resolution
  signalCanvas.width = W;
  signalCanvas.height = H;
  renderer.resize(W, H);

  // CRT display canvas
  crt.resize(W, H);

  displayCanvas.style.width = W + 'px';
  displayCanvas.style.height = (H + 22) + 'px';
}
window.addEventListener('resize', resize);

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

  setCoupling:  (mode)  => audio.setCoupling(mode),
  setInputGain: (v)     => audio.setInputGain(v),
  setTrigger:  (level) => analyser.triggerLevel = level,
  setTrigMode: (mode)  => {
    analyser.triggerMode = mode;
    if (mode === 'single') analyser.rearm();
  },
  setTrigSlope: (slope) => analyser.triggerSlope = slope,
  setPersistence: (v)   => crt.persistence = v,
  setFeedback:    (v)   => crt.feedback = v,
  setGlow:        (v)   => { crt.glowIntensity = v; crt.bloomRadius = 6 + v * 4; },
  setPhosphor:    (p)   => renderer.phosphor = p,

  setCrt: (on) => {
    state.crtFull = on;
    crt.bloomEnabled = on;
    document.getElementById('btnCrtOn').classList.toggle('active', on);
    document.getElementById('btnCrtOff').classList.toggle('active', !on);
    document.getElementById('crtOverlay').classList.toggle('off', !on);
    document.getElementById('scanlines').classList.toggle('off', !on);
    document.getElementById('scopeContainer').classList.toggle('crt-on', on);
  },

  toggleFreeze: () => {
    if (analyser.frozen) {
      analyser.unfreeze();
      controls.updateFreeze(false);
    } else {
      if (!audio.running || !audio.analyserL) return;
      // Grab current data to freeze
      const samples = audio.getSamples();
      if (samples) {
        const samplesPerDiv = Math.floor(audio.analyserL.fftSize / (10 * state.sweep));
        const triggered = analyser.getTriggeredWaveform(samples.timeL, samplesPerDiv);
        analyser.freeze(triggered);
      } else {
        analyser.freeze(null);
      }
      controls.updateFreeze(true);
    }
  },

  toggleCursors: () => {
    state.cursorsEnabled = !state.cursorsEnabled;
    analyser.cursorsEnabled = state.cursorsEnabled;
    controls.updateCursors(state.cursorsEnabled);
  },

  rearm: () => {
    analyser.rearm();
  },

  screenshot: () => {
    const link = document.createElement('a');
    link.download = `scope-${Date.now()}.png`;
    link.href = displayCanvas.toDataURL('image/png');
    link.click();
  },
});

// ── CURSOR DRAGGING ──
(function initCursorDrag() {
  const container = document.querySelector('.scope-container');
  let dragging = null;

  container.addEventListener('mousedown', (e) => {
    if (!state.cursorsEnabled) return;
    const rect = displayCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Find closest cursor
    const dists = [
      { id: 'x1', d: Math.abs(x - analyser.cursorX1) },
      { id: 'x2', d: Math.abs(x - analyser.cursorX2) },
      { id: 'y1', d: Math.abs(y - analyser.cursorY1) },
      { id: 'y2', d: Math.abs(y - analyser.cursorY2) },
    ];
    dists.sort((a, b) => a.d - b.d);
    if (dists[0].d < 0.04) dragging = dists[0].id;
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = displayCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    if (dragging === 'x1') analyser.cursorX1 = x;
    else if (dragging === 'x2') analyser.cursorX2 = x;
    else if (dragging === 'y1') analyser.cursorY1 = y;
    else if (dragging === 'y2') analyser.cursorY2 = y;
  });

  window.addEventListener('mouseup', () => { dragging = null; });
})();

// ── DRAW LOOP ──
function drawLoop() {
  if (!audio.running) return;

  // FPS
  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast > 500) {
    fpsDisplay = Math.round(fpsFrames / ((now - fpsLast) / 1000));
    fpsFrames = 0;
    fpsLast = now;
    controls.updateFps(fpsDisplay);
  }

  // Get samples
  const samples = audio.getSamples();
  if (!samples) { requestAnimationFrame(drawLoop); return; }

  const pad = renderer.pad;
  const W = renderer.W;
  const H = renderer.H;
  const scopeW = W - pad * 2;
  const scopeH = H - pad * 2;

  // Clear signal canvas
  const sCtx = renderer.ctx;
  sCtx.clearRect(0, 0, W, H);

  const samplesPerDiv = Math.floor(audio.analyserL.fftSize / (10 * state.sweep));

  // ── Channel selection ──
  // Pick time-domain and freq-domain buffers based on selected channel
  let timeData, freqData;
  if (state.channel === 'r') {
    timeData = samples.timeR;
    freqData = samples.freqR;
  } else if (state.channel === 'mix') {
    // Mix L+R into a temporary buffer
    timeData = new Float32Array(samples.timeL.length);
    freqData = new Uint8Array(samples.freqL.length);
    for (let i = 0; i < timeData.length; i++) {
      timeData[i] = (samples.timeL[i] + samples.timeR[i]) * 0.5;
    }
    for (let i = 0; i < freqData.length; i++) {
      freqData[i] = Math.round((samples.freqL[i] + samples.freqR[i]) * 0.5);
    }
  } else {
    timeData = samples.timeL;
    freqData = samples.freqL;
  }

  if (state.mode === 'wave') {
    renderer.drawGrid(pad, pad, scopeW, scopeH);
    const waveData = analyser.getTriggeredWaveform(timeData, samplesPerDiv);
    renderer.drawWaveform(waveData, pad, pad, scopeW, scopeH, state.gain, state.glowIntensity, state.lineWeight);
    renderer.drawTriggerLine(pad, pad, scopeW, scopeH, state.triggerLevel);

  } else if (state.mode === 'fft') {
    renderer.drawGrid(pad, pad, scopeW, scopeH);
    renderer.drawSpectrum(freqData, pad, pad, scopeW, scopeH, state.gain, state.glowIntensity, state.logScale);

  } else if (state.mode === 'xy') {
    // XY always uses L vs R regardless of channel selection
    renderer.drawGrid(pad, pad, scopeW, scopeH);
    renderer.drawXY(samples.timeL, samples.timeR, pad, pad, scopeW, scopeH, state.gain, state.glowIntensity, state.lineWeight);

  } else if (state.mode === 'both') {
    const halfH = scopeH / 2 - 4;
    renderer.drawGrid(pad, pad, scopeW, halfH);
    const waveData = analyser.getTriggeredWaveform(timeData, samplesPerDiv);
    renderer.drawWaveform(waveData, pad, pad, scopeW, halfH, state.gain, state.glowIntensity, state.lineWeight);
    renderer.drawTriggerLine(pad, pad, scopeW, halfH, state.triggerLevel);

    // Divider
    sCtx.strokeStyle = renderer.colors.gridBright;
    sCtx.lineWidth = 0.4;
    sCtx.beginPath();
    sCtx.moveTo(pad, pad + halfH + 4);
    sCtx.lineTo(pad + scopeW, pad + halfH + 4);
    sCtx.stroke();

    renderer.drawGrid(pad, pad + halfH + 8, scopeW, halfH);
    renderer.drawSpectrum(freqData, pad, pad + halfH + 8, scopeW, halfH, state.gain, state.glowIntensity, state.logScale);

  } else if (state.mode === 'spectrogram') {
    spectroHistory.push(new Uint8Array(freqData));
    if (spectroHistory.length > SPECTRO_MAX_ROWS) spectroHistory.shift();
    renderer.drawSpectrogram(spectroHistory, pad, pad, scopeW, scopeH);
  }

  // Cursors
  if (state.cursorsEnabled && state.mode !== 'spectrogram') {
    const m = analyser.getCursorMeasurements(scopeW, scopeH, samplesPerDiv, audio.sampleRate, state.gain);
    renderer.drawCursors(pad, pad, scopeW, scopeH, m);
    controls.updateCursorReadout(m);
  }

  // CRT post-processing
  crt.process(signalCanvas);

  requestAnimationFrame(drawLoop);
}

// ── IDLE LOOP (no signal) ──
function drawIdle() {
  if (audio.running) return;

  const pad = renderer.pad;
  const W = renderer.W;
  const H = renderer.H;

  const sCtx = renderer.ctx;
  sCtx.clearRect(0, 0, W, H);
  renderer.drawGrid(pad, pad, W - pad * 2, H - pad * 2);
  renderer.drawIdle(pad, pad, W - pad * 2, H - pad * 2);

  crt.process(signalCanvas);

  requestAnimationFrame(drawIdle);
}

// ── INIT ──
resize();
drawIdle();
