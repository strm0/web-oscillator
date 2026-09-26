/* ═══════════════════════════════════════════════════════════
   capture-processor.js — AudioWorklet: continuous sample capture
   ═══════════════════════════════════════════════════════════

   Runs on the audio render thread. Accumulates incoming samples into
   fixed-size batches and ships each batch to the main thread via
   port.postMessage, where AudioEngine writes them into a ring buffer.
   This gives the trigger a clean, contiguous sample stream instead of
   the unpredictably-overwritten AnalyserNode time-domain frame.

   postMessage (not SharedArrayBuffer) is used on purpose: SAB needs
   cross-origin isolation (COOP/COEP) which `python3 -m http.server`
   does not send. At a 512-sample batch this is ~94 msgs/sec — trivial.
   ═══════════════════════════════════════════════════════════ */

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._batch = 512;
    this._accL = new Float32Array(this._batch);
    this._accR = new Float32Array(this._batch);
    this._w = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const L = input[0];
    const R = input[1] || input[0];        // mono → duplicate L into R
    for (let i = 0; i < L.length; i++) {
      this._accL[this._w] = L[i];
      this._accR[this._w] = R[i];
      if (++this._w >= this._batch) {
        // .slice() copies so the worklet can keep reusing its accumulators
        this.port.postMessage({ l: this._accL.slice(0), r: this._accR.slice(0) });
        this._w = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
