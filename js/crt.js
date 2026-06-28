/* ═══════════════════════════════════════════════════════════
   crt.js — CRT post-processing: persistence, bloom, barrel
   ═══════════════════════════════════════════════════════════

   Works by compositing the signal canvas onto the display
   canvas with phosphor persistence (frame accumulation)
   and optional bloom via offscreen blur passes.
   ═══════════════════════════════════════════════════════════ */

export class CRTProcessor {
  constructor(displayCanvas) {
    this.display = displayCanvas;
    this.displayCtx = displayCanvas.getContext('2d');

    // Persistence buffer (accumulates previous frames)
    this.persistCanvas = document.createElement('canvas');
    this.persistCtx = this.persistCanvas.getContext('2d');

    // Bloom buffer
    this.bloomCanvas = document.createElement('canvas');
    this.bloomCtx = this.bloomCanvas.getContext('2d');

    // Feedback buffers (ping-pong: output is recursively fed back into itself)
    this.feedbackCanvas = document.createElement('canvas');
    this.feedbackCtx = this.feedbackCanvas.getContext('2d');
    this.feedbackTmp = document.createElement('canvas');
    this.feedbackTmpCtx = this.feedbackTmp.getContext('2d');

    // Settings
    this.persistence = 0.35;
    this.glowIntensity = 1.0;
    this.bloomEnabled = true;
    this.bloomRadius = 8;

    // Video feedback (0 = off; near 1 = very long tail)
    this.feedback = 0;
    this.fbZoom = 0.985;   // <1 = echoes recede/shrink into the distance (tunnel away)
    this.fbRotate = 0;     // echo rotation per frame (radians)
    this.fbOffsetX = 0;    // echo drift (px)
    this.fbOffsetY = 0;

    this.W = 0;
    this.H = 0;
  }

  resize(w, h) {
    this.W = w;
    this.H = h;

    this.display.width = w;
    this.display.height = h;
    this.persistCanvas.width = w;
    this.persistCanvas.height = h;

    this.feedbackCanvas.width = w;
    this.feedbackCanvas.height = h;
    this.feedbackTmp.width = w;
    this.feedbackTmp.height = h;

    // Bloom at half res for performance
    this.bloomCanvas.width = Math.floor(w / 2);
    this.bloomCanvas.height = Math.floor(h / 2);
  }

  /**
   * Composite a rendered signal frame onto the display with CRT effects
   * @param {HTMLCanvasElement} signalCanvas - the raw signal render
   */
  process(signalCanvas) {
    const dCtx = this.displayCtx;
    const pCtx = this.persistCtx;
    const bCtx = this.bloomCtx;
    const W = this.W;
    const H = this.H;

    // ── 1. Phosphor persistence ──
    // Fade the persistence buffer toward black
    pCtx.globalCompositeOperation = 'source-over';
    pCtx.fillStyle = `rgba(0, 0, 0, ${1 - this.persistence})`;
    pCtx.fillRect(0, 0, W, H);

    // Draw new signal frame on top (additive-like via lighter)
    pCtx.globalCompositeOperation = 'lighter';
    pCtx.drawImage(signalCanvas, 0, 0, W, H);
    pCtx.globalCompositeOperation = 'source-over';

    // ── 1b. Video feedback ──
    // Recursively feed the output back into itself: the previous feedback
    // buffer is re-drawn (scaled by the feedback gain, with a subtle echo
    // transform) and the new signal added on top → echo/tunnel trails.
    if (this.feedback > 0) {
      const fCtx = this.feedbackTmpCtx;
      fCtx.globalCompositeOperation = 'source-over';
      fCtx.clearRect(0, 0, W, H);

      // Fed-back (transformed) previous buffer, faded by the gain via alpha
      fCtx.save();
      fCtx.globalAlpha = this.feedback;
      fCtx.translate(W / 2 + this.fbOffsetX, H / 2 + this.fbOffsetY);
      fCtx.scale(this.fbZoom, this.fbZoom);
      fCtx.rotate(this.fbRotate);
      fCtx.translate(-W / 2, -H / 2);
      fCtx.drawImage(this.feedbackCanvas, 0, 0);
      fCtx.restore();

      // Add the fresh signal frame
      fCtx.globalCompositeOperation = 'lighter';
      fCtx.drawImage(signalCanvas, 0, 0, W, H);
      fCtx.globalCompositeOperation = 'source-over';

      // Ping-pong: the temp buffer becomes the new feedback accumulation
      let c = this.feedbackCanvas, cc = this.feedbackCtx;
      this.feedbackCanvas = this.feedbackTmp;
      this.feedbackCtx = this.feedbackTmpCtx;
      this.feedbackTmp = c;
      this.feedbackTmpCtx = cc;
    }

    // ── 2. Start compositing to display ──
    dCtx.fillStyle = '#050505';
    dCtx.fillRect(0, 0, W, H);

    // Draw persistence buffer
    dCtx.drawImage(this.persistCanvas, 0, 0);

    // Composite feedback buffer additively
    if (this.feedback > 0) {
      dCtx.save();
      dCtx.globalCompositeOperation = 'lighter';
      dCtx.drawImage(this.feedbackCanvas, 0, 0);
      dCtx.restore();
    }

    // ── 3. Bloom pass (simple CSS-filter blur approach) ──
    if (this.bloomEnabled && this.glowIntensity > 0) {
      const bW = this.bloomCanvas.width;
      const bH = this.bloomCanvas.height;

      // Draw signal into bloom buffer at half size
      bCtx.clearRect(0, 0, bW, bH);
      bCtx.filter = `blur(${Math.round(this.bloomRadius * this.glowIntensity)}px)`;
      bCtx.drawImage(this.persistCanvas, 0, 0, bW, bH);
      bCtx.filter = 'none';

      // Composite bloom onto display (additive)
      dCtx.save();
      dCtx.globalCompositeOperation = 'lighter';
      dCtx.globalAlpha = 0.3 * this.glowIntensity;
      dCtx.drawImage(this.bloomCanvas, 0, 0, W, H);
      dCtx.restore();
    }
  }
}
