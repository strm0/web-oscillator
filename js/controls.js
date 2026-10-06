/* ═══════════════════════════════════════════════════════════
   controls.js — UI bindings, keyboard shortcuts, panel logic
   ═══════════════════════════════════════════════════════════

   Controls edit the FOCUSED pane's config (state.panes[focusedIdx]).
   In single layout the focused pane is always pane 0, so behaviour is
   identical to the single-scope build. The per-frame sync in main.js pushes
   config → that pane's CRTProcessor / ScopeAnalyser, so most controls only
   need to mutate config here.
   ═══════════════════════════════════════════════════════════ */

import { syncRange } from './tui.js';

const MODES = ['wave', 'fft', 'xy', 'both', 'spectrogram'];

export class Controls {
  constructor(state, callbacks) {
    this.state = state;
    this.cb = callbacks;
    this._bindUI();
    this._bindKeyboard();
    this._populateDevices();
    this._refreshFocusUI();
    this.refreshControls();
  }

  // Focused pane index + its config (the editing target)
  _focusedIdx() {
    return this.state.layout === 'single' ? 0 : this.state.focusedPane;
  }
  _cfg() {
    return this.state.panes[this._focusedIdx()];
  }

  // ── Device dropdown ──
  async _populateDevices() {
    const devices = await this.cb.getDevices();
    const sel = document.getElementById('audioSource');
    sel.innerHTML = '<option value="">default input</option>';
    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || ('Input ' + d.deviceId.slice(0, 8));
      sel.appendChild(opt);
    });
    navigator.mediaDevices.addEventListener('devicechange', () => this._populateDevices());
  }

  // ── UI bindings ──
  _bindUI() {
    const cb = this.cb;

    // Start / Stop
    document.getElementById('btnStart').addEventListener('click', () => cb.start());
    document.getElementById('btnStop').addEventListener('click', () => cb.stop());

    // Layout
    document.getElementById('btnLayoutSingle')?.addEventListener('click', () => this._setLayout('single'));
    document.getElementById('btnLayoutQuad')?.addEventListener('click', () => this._setLayout('quad'));

    // Pane focus selector (quad only)
    for (let i = 0; i < 4; i++) {
      document.getElementById('focus-' + i)?.addEventListener('click', () => this.setFocus(i));
    }

    // Display mode
    MODES.forEach(mode => {
      const btn = document.getElementById('btn-' + mode);
      if (btn) btn.addEventListener('click', () => this._setMode(mode));
    });

    // XY source
    [['Auto', 'auto'], ['Stereo', 'stereo'], ['Self', 'self']].forEach(([label, val]) => {
      const btn = document.getElementById('btnXy' + label);
      if (btn) btn.addEventListener('click', () => this._setXYSource(val));
    });

    // Channel select
    ['L', 'R', 'Mix'].forEach(ch => {
      const btn = document.getElementById('btnCh' + ch);
      if (btn) btn.addEventListener('click', () => this._setChannel(ch.toLowerCase()));
    });

    // Coupling (global)
    document.getElementById('btnAC').addEventListener('click', () => this._setCoupling('ac'));
    document.getElementById('btnDC').addEventListener('click', () => this._setCoupling('dc'));

    // Trigger mode
    ['auto', 'normal', 'single'].forEach(m => {
      const btn = document.getElementById('trig-' + m);
      if (btn) btn.addEventListener('click', () => this._setTrigMode(m));
    });

    // Trigger slope
    document.getElementById('trigRise').addEventListener('click', () => this._setTrigSlope('rise'));
    document.getElementById('trigFall').addEventListener('click', () => this._setTrigSlope('fall'));

    // Sliders — global
    this._slider('inputGainSlider', 'inputGainVal', v => {
      this.state.inputGain = parseFloat(v); cb.setInputGain(parseFloat(v));
    }, v => v + 'x');

    // Sliders — per focused pane
    this._slider('gainSlider', 'gainVal', v => { this._cfg().gain = parseFloat(v); }, v => v + 'x');
    this._slider('sweepSlider', 'sweepVal', v => { this._cfg().sweep = parseFloat(v); }, v => v + 'x');
    this._slider('trigSlider', 'trigVal', v => { this._cfg().trigLevel = parseFloat(v); });
    this._slider('persSlider', 'persVal', v => { this._cfg().persistence = parseFloat(v); });
    this._slider('glowSlider', 'glowVal', v => { this._cfg().glow = parseFloat(v); });
    this._slider('lwSlider', 'lwVal', v => { this._cfg().lineWeight = parseFloat(v); });
    // Beam strength only applies while glow is off (beamIntensity > 0).
    this._slider('beamSlider', 'beamVal', v => {
      this._beamStrength = parseFloat(v);
      if (this._cfg().beamIntensity > 0) this._cfg().beamIntensity = this._beamStrength;
    });

    // Glow ON = classic halo renderer (beam 0); OFF = velocity-modulated beam renderer.
    document.getElementById('btnGlowOn')?.addEventListener('click', () => this._setGlow(true));
    document.getElementById('btnGlowOff')?.addEventListener('click', () => this._setGlow(false));

    // Feedback (per focused pane)
    document.getElementById('btnFbOn')?.addEventListener('click', () => this._setFeedbackEnabled(true));
    document.getElementById('btnFbOff')?.addEventListener('click', () => this._setFeedbackEnabled(false));
    this._slider('fbSlider', 'fbVal', v => { this._cfg().feedback = parseFloat(v); });
    this._slider('fbZoomSlider', 'fbZoomVal', v => { this._cfg().fbZoom = parseFloat(v); });
    this._slider('fbRotateSlider', 'fbRotateVal', v => { this._cfg().fbRotate = parseFloat(v) * Math.PI / 180; });
    this._slider('fbOffXSlider', 'fbOffXVal', v => { this._cfg().fbOffsetX = parseFloat(v); });
    this._slider('fbOffYSlider', 'fbOffYVal', v => { this._cfg().fbOffsetY = parseFloat(v); });
    this._slider('fbBlurSlider', 'fbBlurVal', v => { this._cfg().fbBlur = parseFloat(v); });

    // CRT mode
    document.getElementById('btnCrtOn').addEventListener('click', () => cb.setCrt(true));
    document.getElementById('btnCrtOff').addEventListener('click', () => cb.setCrt(false));

    // Phosphor type
    document.getElementById('phosphorSelect').addEventListener('change', (e) => {
      this._cfg().phosphor = e.target.value;
    });

    // Freeze / cursors
    document.getElementById('btnFreeze').addEventListener('click', () => cb.toggleFreeze());
    document.getElementById('btnCursors').addEventListener('click', () => cb.toggleCursors());

    // FFT frequency axis (only shown in FFT / W+F modes)
    document.getElementById('btnLinScale')?.addEventListener('click', () => this._setLogScale(false));
    document.getElementById('btnLogScale')?.addEventListener('click', () => this._setLogScale(true));

    // Rearm single trigger
    document.getElementById('btnRearm')?.addEventListener('click', () => cb.rearm());

    // Panel / fullscreen
    document.getElementById('btnTogglePanel').addEventListener('click', () => this._togglePanel());
    document.getElementById('btnFullscreen').addEventListener('click', () => this._toggleFullscreen());
  }

  _slider(sliderId, valId, setter, formatter) {
    const el = document.getElementById(sliderId);
    const valEl = document.getElementById(valId);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = el.value;
      setter(v);
      if (valEl) valEl.textContent = formatter ? formatter(v) : v;
    });
  }

  // ── Layout ──
  _setLayout(layout) {
    this.cb.setLayout(layout);   // main.js updates state + calls updateLayout back
  }

  updateLayout(layout) {
    document.getElementById('btnLayoutSingle')?.classList.toggle('active', layout === 'single');
    document.getElementById('btnLayoutQuad')?.classList.toggle('active', layout === 'quad');
    document.getElementById('scopeContainer')?.classList.toggle('quad', layout === 'quad');
    // Focus selector is only meaningful in quad.
    const single = layout === 'single';
    document.getElementById('focusRowItem')?.classList.toggle('hidden', single);
    for (let i = 0; i < 4; i++) {
      const b = document.getElementById('focus-' + i);
      if (b) b.disabled = single;
    }
    this._refreshFocusUI();
    this.refreshControls();   // reflect focused pane (pane 0 in single)
  }

  // ── Pane focus ──
  setFocus(idx) {
    if (this.state.layout !== 'quad') return;   // focus only applies in quad
    this.state.focusedPane = idx;               // render reads this for the highlight
    this._refreshFocusUI();
    this.refreshControls();
    this.cb.onFocusChange?.();                  // (re)show the focus border briefly
  }

  _cycleFocus(dir) {
    if (this.state.layout !== 'quad') return;
    this.setFocus((this.state.focusedPane + dir + 4) % 4);
  }

  _refreshFocusUI() {
    const idx = this._focusedIdx();
    const names = ['TL', 'TR', 'BL', 'BR'];
    for (let i = 0; i < 4; i++) {
      document.getElementById('focus-' + i)?.classList.toggle('active', i === idx);
    }
    const lbl = document.getElementById('focusLabel');
    if (lbl) lbl.textContent = names[idx] + (this.state.layout === 'single' ? ' · single' : '');
  }

  // ── Two-way binding: write a slider's value + label from config ──
  _setSlider(sliderId, valId, value, formatter) {
    const el = document.getElementById(sliderId);
    if (el) { el.value = value; syncRange(el); }
    const valEl = document.getElementById(valId);
    if (valEl) valEl.textContent = formatter ? formatter(el ? el.value : value) : (el ? el.value : value);
  }

  // Read the focused pane's config into every per-pane control.
  refreshControls() {
    const c = this._cfg();

    // Display mode
    MODES.forEach(m => document.getElementById('btn-' + m)?.classList.toggle('active', m === c.mode));

    // XY source
    [['Auto', 'auto'], ['Stereo', 'stereo'], ['Self', 'self']].forEach(([l, v]) =>
      document.getElementById('btnXy' + l)?.classList.toggle('active', v === c.xySource));

    // Channel
    document.getElementById('btnChL').classList.toggle('active', c.channel === 'l');
    document.getElementById('btnChR').classList.toggle('active', c.channel === 'r');
    document.getElementById('btnChMix').classList.toggle('active', c.channel === 'mix');

    // Trigger
    ['auto', 'normal', 'single'].forEach(m =>
      document.getElementById('trig-' + m)?.classList.toggle('active', m === c.trigMode));
    document.getElementById('trigRise').classList.toggle('active', c.trigSlope === 'rise');
    document.getElementById('trigFall').classList.toggle('active', c.trigSlope === 'fall');

    // Sliders
    this._setSlider('trigSlider', 'trigVal', c.trigLevel);
    this._setSlider('gainSlider', 'gainVal', c.gain, v => v + 'x');
    this._setSlider('sweepSlider', 'sweepVal', c.sweep, v => v + 'x');
    this._setSlider('persSlider', 'persVal', c.persistence);
    this._setSlider('glowSlider', 'glowVal', c.glow);
    this._setSlider('lwSlider', 'lwVal', c.lineWeight);
    this._refreshGlowUI();

    // Feedback section
    this._refreshFeedbackUI(c.feedbackEnabled);
    this._setSlider('fbSlider', 'fbVal', c.feedback);
    this._setSlider('fbZoomSlider', 'fbZoomVal', c.fbZoom);
    this._setSlider('fbRotateSlider', 'fbRotateVal', (c.fbRotate * 180 / Math.PI).toFixed(1));
    this._setSlider('fbOffXSlider', 'fbOffXVal', c.fbOffsetX);
    this._setSlider('fbOffYSlider', 'fbOffYVal', c.fbOffsetY);
    this._setSlider('fbBlurSlider', 'fbBlurVal', c.fbBlur);

    // Phosphor + FFT axis
    document.getElementById('phosphorSelect').value = c.phosphor;
    this._refreshFftAxisUI();

    // CRT on/off + overlay (follows focused pane)
    const on = c.crtEnabled;
    document.getElementById('btnCrtOn').classList.toggle('active', on);
    document.getElementById('btnCrtOff').classList.toggle('active', !on);
    document.getElementById('crtOverlay').classList.toggle('off', !on);
    document.getElementById('scanlines').classList.toggle('off', !on);
    document.getElementById('scopeContainer').classList.toggle('crt-on', on);

    // Freeze state lives on the pane's analyser, not config
    this.updateFreeze(this.cb.getPaneFrozen(this._focusedIdx()));
  }

  _setMode(mode) {
    const cfg = this._cfg();
    const prev = cfg.mode;
    cfg.mode = mode;
    if (prev === 'spectrogram' && mode !== 'spectrogram') {
      this.cb.resetPaneHistory(this._focusedIdx());
    }
    MODES.forEach(m => {
      const btn = document.getElementById('btn-' + m);
      if (btn) btn.classList.toggle('active', m === mode);
    });
    this._refreshFftAxisUI();
  }

  _setLogScale(on) {
    this._cfg().logScale = on;
    this._refreshFftAxisUI();
  }

  // LIN / LOG buttons; the row only exists for modes that draw a spectrum.
  _refreshFftAxisUI() {
    const c = this._cfg();
    const hasFft = c.mode === 'fft' || c.mode === 'both';
    document.getElementById('fftAxisRow')?.classList.toggle('hidden', !hasFft);
    document.getElementById('btnLinScale')?.classList.toggle('active', !c.logScale);
    document.getElementById('btnLogScale')?.classList.toggle('active', !!c.logScale);
  }

  _setXYSource(src) {
    this._cfg().xySource = src;
    [['Auto', 'auto'], ['Stereo', 'stereo'], ['Self', 'self']].forEach(([label, val]) => {
      document.getElementById('btnXy' + label)?.classList.toggle('active', val === src);
    });
  }

  // ── Glow / beam ──
  _setGlow(on) {
    const c = this._cfg();
    if (on) {
      if (c.beamIntensity > 0) this._beamStrength = c.beamIntensity;
      c.beamIntensity = 0;
    } else {
      c.beamIntensity = this._beamStrength ?? 0.6;
    }
    this._refreshGlowUI();
  }

  _refreshGlowUI() {
    const c = this._cfg();
    const on = c.beamIntensity === 0;
    if (!on) this._beamStrength = c.beamIntensity;
    document.getElementById('btnGlowOn')?.classList.toggle('active', on);
    document.getElementById('btnGlowOff')?.classList.toggle('active', !on);
    const glow = document.getElementById('glowSlider');
    const beam = document.getElementById('beamSlider');
    if (glow) glow.disabled = !on;
    if (beam) beam.disabled = on;
    this._setSlider('beamSlider', 'beamVal', this._beamStrength ?? 0.6);
  }

  // ── Feedback ──
  _setFeedbackEnabled(on) {
    this._cfg().feedbackEnabled = on;
    this._refreshFeedbackUI(on);
  }

  // Toggle buttons + enable/disable the param sliders (only meaningful when on).
  _refreshFeedbackUI(on) {
    document.getElementById('btnFbOn')?.classList.toggle('active', on);
    document.getElementById('btnFbOff')?.classList.toggle('active', !on);
    ['fbSlider', 'fbZoomSlider', 'fbRotateSlider', 'fbOffXSlider', 'fbOffYSlider', 'fbBlurSlider']
      .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !on; });
  }

  _setChannel(ch) {
    this._cfg().channel = ch;
    document.getElementById('btnChL').classList.toggle('active', ch === 'l');
    document.getElementById('btnChR').classList.toggle('active', ch === 'r');
    document.getElementById('btnChMix').classList.toggle('active', ch === 'mix');
  }

  _setCoupling(mode) {
    this.state.coupling = mode;
    this.cb.setCoupling(mode);
    this.refreshGlobals();
  }

  // Read the global (audio graph) settings into their controls.
  refreshGlobals() {
    const mode = this.state.coupling;
    document.getElementById('btnAC').classList.toggle('active', mode === 'ac');
    document.getElementById('btnDC').classList.toggle('active', mode === 'dc');
    this._setSlider('inputGainSlider', 'inputGainVal', this.state.inputGain, v => v + 'x');
  }

  _setTrigMode(mode) {
    this._cfg().trigMode = mode;
    ['auto', 'normal', 'single'].forEach(m => {
      document.getElementById('trig-' + m)?.classList.toggle('active', m === mode);
    });
    this.cb.setTrigMode(mode);
  }

  _setTrigSlope(slope) {
    this._cfg().trigSlope = slope;
    document.getElementById('trigRise').classList.toggle('active', slope === 'rise');
    document.getElementById('trigFall').classList.toggle('active', slope === 'fall');
  }

  // ── PANEL TOGGLE ──
  _togglePanel(open) {
    const panel = document.getElementById('sidePanel');
    panel.classList.toggle('collapsed', open === undefined ? undefined : !open);
    setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
  }
  closePanel() { this._togglePanel(false); }

  // ── FULLSCREEN ──
  _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        document.body.classList.add('fullscreen');
        document.getElementById('topBar').classList.add('visible');
        setTimeout(() => document.getElementById('topBar').classList.remove('visible'), 1500);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      });
    } else {
      document.exitFullscreen().then(() => {
        document.body.classList.remove('fullscreen');
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      });
    }
  }

  // ── KEYBOARD SHORTCUTS ──
  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (document.querySelector('dialog[open]')) return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          this.cb.toggleFreeze();
          break;
        case '1': this._setMode('wave'); break;
        case '2': this._setMode('xy'); break;
        case '3': this._setMode('fft'); break;
        case '4': this._setMode('spectrogram'); break;
        case '5': this._setMode('both'); break;
        case '6': this._setLayout(this.state.layout === 'quad' ? 'single' : 'quad'); break;
        case '[': this._cycleFocus(-1); break;
        case ']': this._cycleFocus(1); break;
        case 'c': this.cb.toggleCursors(); break;
        case 'a': this._setCoupling(this.state.coupling === 'ac' ? 'dc' : 'ac'); break;
        case 'f': this._toggleFullscreen(); break;
        case 'p': this._togglePanel(); break;
        case 't': {
          const m = this._cfg().trigMode;
          this._setTrigMode(m === 'auto' ? 'normal' : m === 'normal' ? 'single' : 'auto');
          break;
        }
        case 'r': this.cb.rearm(); break;
        case 's':
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.cb.screenshot(); }
          break;
      }
    });

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen');
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      }
    });
  }

  // ── UI state updates ──
  showRunning(info) {
    document.getElementById('btnStart').style.display = 'none';
    document.getElementById('btnStop').style.display = '';
    document.getElementById('startHint').classList.add('off');
    document.getElementById('statusText').textContent = '';
    document.getElementById('statusText').className = 'status';
  }

  showStopped() {
    document.getElementById('btnStart').style.display = '';
    document.getElementById('btnStop').style.display = 'none';
    document.getElementById('startHint').classList.remove('off');
    document.getElementById('statusText').textContent = '';
    document.getElementById('statusText').className = 'status';
  }

  showError(msg) {
    document.getElementById('statusText').textContent = 'ERR: ' + msg;
    document.getElementById('statusText').className = 'status error';
  }

  updateFreeze(on) {
    document.getElementById('freezeBadge').classList.toggle('on', on);
    document.getElementById('btnFreeze').classList.toggle('active', on);
  }

  updateCursors(on) {
    document.getElementById('btnCursors').classList.toggle('active', on);
    document.getElementById('cursorReadout').classList.toggle('off', !on);
  }

  updateCursorReadout(m) {
    if (!m) return;
    const el = document.getElementById('cursorReadout');
    const tStr = m.deltaT >= 0.001 ? (m.deltaT * 1000).toFixed(2) + ' ms' : (m.deltaT * 1e6).toFixed(1) + ' µs';
    const fStr = m.freq < 100000 ? m.freq.toFixed(1) + ' Hz' : (m.freq / 1000).toFixed(1) + ' kHz';
    el.innerHTML = `ΔT ${tStr} (${fStr})<br>ΔV ${m.deltaV.toFixed(3)}`;
  }
}
