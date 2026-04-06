/* ═══════════════════════════════════════════════════════════
   audio.js — Device enumeration & Web Audio API management
   ═══════════════════════════════════════════════════════════

   Handles mono and stereo interfaces correctly.
   The Scarlett 2i2 may present as 1 or 2 channels depending
   on browser/OS config. We handle both cases by merging a
   mono source to both L+R analysers when needed.
   ═══════════════════════════════════════════════════════════ */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.analyserL = null;
    this.analyserR = null;
    this.splitter = null;
    this.merger = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.stream = null;
    this.running = false;
    this.fftSize = 2048;
    this.smoothing = 0.65;
    this.inputChannels = 1;

    // Buffers
    this.timeBufL = null;
    this.timeBufR = null;
    this.freqBufL = null;
    this.freqBufR = null;

    // AC/DC coupling
    this.coupling = 'dc'; // 'ac' | 'dc'
    this.dcBlocker = null;
  }

  async enumerateDevices() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch (e) { /* permission denied — labels will be empty */ }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  async start(deviceId) {
    // First try stereo, fall back to mono if the device doesn't support 2ch
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: { ideal: 2 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 48000 },
        }
      });
    } catch (e) {
      // Retry with minimal constraints
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
    }

    this.stream = stream;

    // Determine actual channel count from the track
    const trackSettings = stream.getAudioTracks()[0].getSettings();
    this.inputChannels = trackSettings.channelCount || 1;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.sourceNode = this.ctx.createMediaStreamSource(stream);

    // Input gain node — useful for hot signals from synths
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;

    // DC blocker (high-pass at ~20Hz) for AC coupling
    this.dcBlocker = this.ctx.createBiquadFilter();
    this.dcBlocker.type = 'highpass';
    this.dcBlocker.frequency.value = 20;
    this.dcBlocker.Q.value = 0.707;

    // Stereo splitter
    this.splitter = this.ctx.createChannelSplitter(2);

    // Two analysers: left and right
    this.analyserL = this.ctx.createAnalyser();
    this.analyserL.fftSize = this.fftSize;
    this.analyserL.smoothingTimeConstant = this.smoothing;

    this.analyserR = this.ctx.createAnalyser();
    this.analyserR.fftSize = this.fftSize;
    this.analyserR.smoothingTimeConstant = this.smoothing;

    // Wire up the graph
    this._connectGraph();

    // Allocate buffers
    this.timeBufL = new Float32Array(this.analyserL.fftSize);
    this.timeBufR = new Float32Array(this.analyserR.fftSize);
    this.freqBufL = new Uint8Array(this.analyserL.frequencyBinCount);
    this.freqBufR = new Uint8Array(this.analyserR.frequencyBinCount);

    this.running = true;

    console.log(`[scope] Audio started: ${this.ctx.sampleRate}Hz, ${this.inputChannels}ch, device="${trackSettings.label || deviceId}"`);

    return {
      sampleRate: this.ctx.sampleRate,
      fftSize: this.fftSize,
      channels: this.inputChannels,
    };
  }

  _connectGraph() {
    // Disconnect everything first
    try { this.sourceNode.disconnect(); } catch (e) {}
    try { this.gainNode.disconnect(); } catch (e) {}
    try { this.dcBlocker.disconnect(); } catch (e) {}
    try { this.splitter.disconnect(); } catch (e) {}

    // Source → Gain
    this.sourceNode.connect(this.gainNode);

    // Gain → (optional DC blocker) → routing
    let outputNode;
    if (this.coupling === 'ac') {
      this.gainNode.connect(this.dcBlocker);
      outputNode = this.dcBlocker;
    } else {
      outputNode = this.gainNode;
    }

    if (this.inputChannels >= 2) {
      // Stereo: split into L and R
      outputNode.connect(this.splitter);
      this.splitter.connect(this.analyserL, 0);
      this.splitter.connect(this.analyserR, 1);
    } else {
      // Mono: feed the same signal to both analysers
      // This ensures the waveform shows up regardless of which
      // Scarlett input the synth is plugged into
      outputNode.connect(this.analyserL);
      outputNode.connect(this.analyserR);
    }
  }

  setCoupling(mode) {
    this.coupling = mode;
    if (this.running) this._connectGraph();
  }

  setInputGain(value) {
    if (this.gainNode) this.gainNode.gain.value = value;
  }

  stop() {
    this.running = false;
    try { this.sourceNode.disconnect(); } catch (e) {}
    try { this.gainNode.disconnect(); } catch (e) {}
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.inputChannels = 1;
  }

  // Pull latest data
  getSamples() {
    if (!this.running) return null;
    this.analyserL.getFloatTimeDomainData(this.timeBufL);
    this.analyserR.getFloatTimeDomainData(this.timeBufR);
    this.analyserL.getByteFrequencyData(this.freqBufL);
    this.analyserR.getByteFrequencyData(this.freqBufR);
    return {
      timeL: this.timeBufL,
      timeR: this.timeBufR,
      freqL: this.freqBufL,
      freqR: this.freqBufR,
    };
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 0;
  }
}
