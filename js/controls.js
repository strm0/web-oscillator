/* ═══════════════════════════════════════════════════════════
   controls.js — UI bindings, keyboard shortcuts, panel logic
   ═══════════════════════════════════════════════════════════ */

export class Controls {
  constructor(state, callbacks) {
    this.state = state;
    this.cb = callbacks;
    this._bindUI();
    this._bindKeyboard();
    this._populateDevices();
  }

  // ── Device dropdown ──
  async _populateDevices() {
    const devices = await this.cb.getDevices();
    const sel = document.getElementById('audioSource');
    sel.innerHTML = '<option value="">-- select device --</option>';
    devices.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || ('Input ' + d.deviceId.slice(0, 8));
      sel.appendChild(opt);
    });
    // Re-enumerate on device change
    navigator.mediaDevices.addEventListener('devicechange', () => this._populateDevices());
  }

  // ── UI bindings ──
  _bindUI() {
    const s = this.state;
    const cb = this.cb;

    // Start / Stop
    document.getElementById('btnStart').addEventListener('click', () => cb.start());
    document.getElementById('btnStop').addEventListener('click', () => cb.stop());

    // Display mode
    ['wave', 'fft', 'xy', 'both', 'spectrogram'].forEach(mode => {
      const btn = document.getElementById('btn-' + mode);
      if (btn) btn.addEventListener('click', () => this._setMode(mode));
    });

    // Channel select
    ['L', 'R', 'Mix'].forEach(ch => {
      const btn = document.getElementById('btnCh' + ch);
      if (btn) btn.addEventListener('click', () => this._setChannel(ch.toLowerCase()));
    });

    // Coupling
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

    // Sliders
    this._slider('inputGainSlider', 'inputGainVal', v => { cb.setInputGain(parseFloat(v)); }, v => v + 'x');
    this._slider('gainSlider', 'gainVal', v => { s.gain = parseFloat(v); }, v => v + 'x');
    this._slider('sweepSlider', 'sweepVal', v => { s.sweep = parseFloat(v); }, v => v + 'x');
    this._slider('trigSlider', 'trigVal', v => { s.triggerLevel = parseFloat(v); cb.setTrigger(parseFloat(v)); });
    this._slider('persSlider', 'persVal', v => { s.persistence = parseFloat(v); cb.setPersistence(parseFloat(v)); });
    this._slider('fbSlider', 'fbVal', v => { s.feedback = parseFloat(v); cb.setFeedback(parseFloat(v)); });
    this._slider('glowSlider', 'glowVal', v => { s.glowIntensity = parseFloat(v); cb.setGlow(parseFloat(v)); });
    this._slider('lwSlider', 'lwVal', v => { s.lineWeight = parseFloat(v); });

    // CRT mode
    document.getElementById('btnCrtOn').addEventListener('click', () => cb.setCrt(true));
    document.getElementById('btnCrtOff').addEventListener('click', () => cb.setCrt(false));

    // Phosphor type
    document.getElementById('phosphorSelect').addEventListener('change', (e) => {
      s.phosphor = e.target.value;
      cb.setPhosphor(e.target.value);
    });

    // Freeze
    document.getElementById('btnFreeze').addEventListener('click', () => cb.toggleFreeze());

    // Cursors
    document.getElementById('btnCursors').addEventListener('click', () => cb.toggleCursors());

    // FFT log scale
    const logBtn = document.getElementById('btnLogScale');
    if (logBtn) logBtn.addEventListener('click', () => {
      s.logScale = !s.logScale;
      logBtn.classList.toggle('active', s.logScale);
    });

    // Rearm single trigger
    document.getElementById('btnRearm')?.addEventListener('click', () => cb.rearm());

    // Panel toggle
    document.getElementById('btnTogglePanel').addEventListener('click', () => this._togglePanel());

    // Fullscreen
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

  _setMode(mode) {
    this.state.mode = mode;
    ['wave', 'fft', 'xy', 'both', 'spectrogram'].forEach(m => {
      const btn = document.getElementById('btn-' + m);
      if (btn) btn.classList.toggle('active', m === mode);
    });
    const labels = { wave: 'WAVEFORM', fft: 'SPECTRUM', xy: 'XY MODE', both: 'WAVE+FFT', spectrogram: 'SPECTRO' };
    document.getElementById('rdMode').textContent = labels[mode] || mode.toUpperCase();
  }

  _setChannel(ch) {
    this.state.channel = ch;
    document.getElementById('btnChL').classList.toggle('active', ch === 'l');
    document.getElementById('btnChR').classList.toggle('active', ch === 'r');
    document.getElementById('btnChMix').classList.toggle('active', ch === 'mix');
  }

  _setCoupling(mode) {
    this.state.coupling = mode;
    document.getElementById('btnAC').classList.toggle('active', mode === 'ac');
    document.getElementById('btnDC').classList.toggle('active', mode === 'dc');
    this.cb.setCoupling(mode);
  }

  _setTrigMode(mode) {
    this.state.triggerMode = mode;
    ['auto', 'normal', 'single'].forEach(m => {
      document.getElementById('trig-' + m)?.classList.toggle('active', m === mode);
    });
    this.cb.setTrigMode(mode);
  }

  _setTrigSlope(slope) {
    this.state.triggerSlope = slope;
    document.getElementById('trigRise').classList.toggle('active', slope === 'rise');
    document.getElementById('trigFall').classList.toggle('active', slope === 'fall');
    this.cb.setTrigSlope(slope);
  }

  // ── PANEL TOGGLE ──
  _togglePanel() {
    const panel = document.getElementById('sidePanel');
    panel.classList.toggle('collapsed');
    // Trigger resize so scope fills the space
    setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
  }

  // ── FULLSCREEN ──
  _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        document.body.classList.add('fullscreen');
        // Briefly show top bar so user knows how to exit
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

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          this.cb.toggleFreeze();
          break;
        case '1': this._setMode('wave'); break;
        case '2': this._setMode('fft'); break;
        case '3': this._setMode('xy'); break;
        case '4': this._setMode('both'); break;
        case '5': this._setMode('spectrogram'); break;
        case 'c': this.cb.toggleCursors(); break;
        case 'a': this._setCoupling(this.state.coupling === 'ac' ? 'dc' : 'ac'); break;
        case 'f': this._toggleFullscreen(); break;
        case 'p': this._togglePanel(); break;
        case 't':
          if (this.state.triggerMode === 'auto') this._setTrigMode('normal');
          else if (this.state.triggerMode === 'normal') this._setTrigMode('single');
          else this._setTrigMode('auto');
          break;
        case 'r': this.cb.rearm(); break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.cb.screenshot();
          }
          break;
        case 'arrowup':
          e.preventDefault();
          this._adjustSlider('gainSlider', 0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          this._adjustSlider('gainSlider', -0.1);
          break;
        case 'arrowleft':
          e.preventDefault();
          this._adjustSlider('sweepSlider', -0.25);
          break;
        case 'arrowright':
          e.preventDefault();
          this._adjustSlider('sweepSlider', 0.25);
          break;
      }
    });

    // Listen for fullscreen exit via Escape
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        document.body.classList.remove('fullscreen');
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      }
    });
  }

  _adjustSlider(id, delta) {
    const el = document.getElementById(id);
    if (!el) return;
    const newVal = Math.max(parseFloat(el.min), Math.min(parseFloat(el.max), parseFloat(el.value) + delta));
    el.value = newVal;
    el.dispatchEvent(new Event('input'));
  }

  // ── UI state updates ──
  showRunning(info) {
    document.getElementById('btnStart').style.display = 'none';
    document.getElementById('btnStop').style.display = '';
    document.getElementById('statusText').textContent = '';
    document.getElementById('statusText').className = 'status';
    document.getElementById('rdSampleRate').textContent = info.sampleRate;
    document.getElementById('rdFftSize').textContent = info.fftSize;
    document.getElementById('rdChannels').textContent = info.channels + 'ch';
  }

  showStopped() {
    document.getElementById('btnStart').style.display = '';
    document.getElementById('btnStop').style.display = 'none';
    document.getElementById('statusText').textContent = '';
    document.getElementById('statusText').className = 'status';
  }

  showError(msg) {
    document.getElementById('statusText').textContent = 'ERR: ' + msg;
    document.getElementById('statusText').className = 'status error';
  }

  updateFps(fps) {
    document.getElementById('rdFps').textContent = fps;
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
