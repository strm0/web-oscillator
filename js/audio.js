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

    // Frequency-domain buffers (time-domain now comes from the ring buffer)
    this.freqBufL = null;
    this.freqBufR = null;

    // AC/DC coupling
    this.coupling = 'dc'; // 'ac' | 'dc'
    this.dcBlocker = null;

    // Continuous capture → ring buffer (time-domain source for triggers).
    // Frequency-domain still comes from the AnalyserNodes above.
    this.RING = 32768;          // power of two; ≈0.68s @48k
    this.ringL = null;
    this.ringR = null;
    this.ringW = 0;
    this.capture = null;
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

    // Continuous capture worklet → ring buffer (time-domain source for triggers).
    await this.ctx.audioWorklet.addModule('js/capture-processor.js');
    this.capture = new AudioWorkletNode(this.ctx, 'capture-processor', {
      numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2,
    });
    this.ringL = new Float32Array(this.RING);
    this.ringR = new Float32Array(this.RING);
    this.ringW = 0;
    this.capture.port.onmessage = (e) => {
      const { l, r } = e.data;
      for (let i = 0; i < l.length; i++) {
        this.ringL[this.ringW] = l[i];
        this.ringR[this.ringW] = r[i];
        this.ringW = (this.ringW + 1) & (this.RING - 1);
      }
    };

    // Wire up the graph (also connects the post-coupling node → capture)
    this._connectGraph();

    // Frequency-domain buffers (FFT / spectrogram still use the analysers)
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

    // Capture taps the SAME post-coupling node the analysers see, so the
    // time-domain trace stays consistent with AC/DC coupling (a mono source
    // is upmixed to 2ch / handled as duplicate-R inside the worklet).
    if (this.capture) outputNode.connect(this.capture);
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
    try { this.capture.disconnect(); } catch (e) {}
    if (this.capture) this.capture.port.onmessage = null;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.ctx) this.ctx.close();
    this.ctx = null;
    this.capture = null;
    this.ringL = null;
    this.ringR = null;
    this.inputChannels = 1;
  }

  // Pull latest frequency-domain data (time-domain comes from the ring via
  // getTimeSnapshot). Called once per frame regardless of pane count.
  getSamples() {
    if (!this.running) return null;
    this.analyserL.getByteFrequencyData(this.freqBufL);
    this.analyserR.getByteFrequencyData(this.freqBufR);
    return {
      freqL: this.freqBufL,
      freqR: this.freqBufR,
    };
  }

  // Copy the most recent `len` samples out of a ring into `out` (a reusable
  // linear scratch buffer), handling wraparound. `out.length` should equal len.
  getTimeSnapshot(out, channel, len) {
    const ring = channel === 'r' ? this.ringR : this.ringL;
    if (!ring) { out.fill(0); return out; }
    const mask = this.RING - 1;
    const start = (this.ringW - len) & mask;
    for (let i = 0; i < len; i++) out[i] = ring[(start + i) & mask];
    return out;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 0;
  }
}
