/* ═══════════════════════════════════════════════════════════
   analyser.js — Trigger logic, measurements, cursor math
   ═══════════════════════════════════════════════════════════ */

export class ScopeAnalyser {
  constructor() {
    // Trigger
    this.triggerMode = 'auto';   // auto | normal | single
    this.triggerSlope = 'rise';  // rise | fall
    this.triggerLevel = 0;
    this.triggerHoldoff = 0;     // samples to skip after trigger
    this.singleTriggered = false;
    this.lastTriggerIndex = 0;

    // Time/Div — expressed as samples per division
    // The scope has 10 horizontal divisions
    this.timeDiv = 1;    // multiplier: 1 = default, <1 = zoom in, >1 = zoom out

    // Volts/Div — expressed as a gain multiplier
    this.voltsDiv = 1;

    // Freeze
    this.frozen = false;
    this.frozenData = null;

    // Cursors
    this.cursorsEnabled = false;
    this.cursorX1 = 0.25;  // normalised 0-1
    this.cursorX2 = 0.75;
    this.cursorY1 = 0.25;
    this.cursorY2 = 0.75;
    this.activeCursor = null; // for dragging
  }

  /**
   * Find trigger point in buffer
   * Returns index of trigger crossing, or -1 if none found
   */
  findTrigger(buf) {
    const level = this.triggerLevel;
    const rising = this.triggerSlope === 'rise';

    // Start searching from a small offset to allow pre-trigger view
    const start = Math.floor(buf.length * 0.05);
    const end = Math.floor(buf.length * 0.6);

    for (let i = start; i < end; i++) {
      if (rising) {
        if (buf[i - 1] < level && buf[i] >= level) return i;
      } else {
        if (buf[i - 1] > level && buf[i] <= level) return i;
      }
    }
    return -1;
  }

  /**
   * Get the visible portion of the waveform, triggered and windowed
   */
  getTriggeredWaveform(buf, samplesPerDiv) {
    // If frozen, return frozen data
    if (this.frozen && this.frozenData) return this.frozenData;

    const totalSamples = Math.floor(samplesPerDiv * 10); // 10 divisions
    let start = 0;

    if (this.triggerMode === 'single' && this.singleTriggered) {
      // Already triggered once, keep showing that frame
      if (this.frozenData) return this.frozenData;
    }

    const trigIdx = this.findTrigger(buf);

    if (this.triggerMode === 'normal') {
      if (trigIdx === -1) {
        // No trigger found — show nothing (blank)
        return null;
      }
      start = trigIdx;
    } else if (this.triggerMode === 'single') {
      if (trigIdx === -1 && !this.singleTriggered) return null;
      if (trigIdx >= 0 && !this.singleTriggered) {
        this.singleTriggered = true;
        start = trigIdx;
      }
    } else {
      // Auto: trigger if possible, free-run otherwise
      start = trigIdx >= 0 ? trigIdx : 0;
    }

    // Centre the trigger point: put it 10% from left
    const preTrigger = Math.floor(totalSamples * 0.1);
    const windowStart = Math.max(0, start - preTrigger);
    const windowEnd = Math.min(buf.length, windowStart + totalSamples);

    const result = buf.slice(windowStart, windowEnd);

    if (this.triggerMode === 'single' && this.singleTriggered) {
      this.frozenData = result;
    }

    return result;
  }

  /**
   * Freeze / unfreeze the display
   */
  freeze(data) {
    this.frozen = true;
    if (data) this.frozenData = data;
  }

  unfreeze() {
    this.frozen = false;
    this.frozenData = null;
    this.singleTriggered = false;
  }

  /**
   * Compute cursor measurements given scope dimensions
   */
  getCursorMeasurements(scopeW, scopeH, samplesPerDiv, sampleRate, voltsPerDiv) {
    if (!this.cursorsEnabled) return null;

    // Time cursors (vertical lines)
    const dx = Math.abs(this.cursorX2 - this.cursorX1);
    const totalTime = (samplesPerDiv * 10) / sampleRate;
    const deltaT = dx * totalTime;
    const freq = deltaT > 0 ? 1 / deltaT : Infinity;

    // Voltage cursors (horizontal lines)
    const dy = Math.abs(this.cursorY2 - this.cursorY1);
    const totalVolts = voltsPerDiv * 8; // 8 vertical divisions
    const deltaV = dy * totalVolts;

    return {
      deltaT,
      freq,
      deltaV,
      x1Frac: this.cursorX1,
      x2Frac: this.cursorX2,
      y1Frac: this.cursorY1,
      y2Frac: this.cursorY2,
    };
  }

  /**
   * Reset single trigger
   */
  rearm() {
    this.singleTriggered = false;
    this.frozenData = null;
  }
}
