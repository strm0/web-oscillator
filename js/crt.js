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
    this.fbBlur = 0;       // softness on the feedback path (px)

    this.W = 0;
    this.H = 0;
  }

  /**
   * Size this processor's OFFSCREEN buffers. w/h are this pane's dimensions
   * (full canvas in single layout, one cell in quad). The shared display
   * canvas is sized once by the caller and must NOT be touched here — doing
   * so would wipe every other pane's output.
   */
  resize(w, h) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    this.W = w;
    this.H = h;

    this.persistCanvas.width = w;
    this.persistCanvas.height = h;

    this.feedbackCanvas.width = w;
    this.feedbackCanvas.height = h;
    this.feedbackTmp.width = w;
    this.feedbackTmp.height = h;

    // Bloom at half res for performance
    this.bloomCanvas.width = Math.max(1, Math.floor(w / 2));
    this.bloomCanvas.height = Math.max(1, Math.floor(h / 2));
  }

  /**
   * Composite a rendered signal frame onto the display with CRT effects.
   * @param {HTMLCanvasElement} signalCanvas - the raw signal render
   * @param {{x:number,y:number,w:number,h:number}} [rect] - sub-region of the
   *        signal/display canvases this pane owns. Defaults to the full buffer.
   *        The offscreen buffers work in local (0,0)-origin coords; only the
   *        reads from signalCanvas and writes to the display are offset by rect.
   */
  process(signalCanvas, rect) {
    const dCtx = this.displayCtx;
    const pCtx = this.persistCtx;
    const bCtx = this.bloomCtx;
    const W = this.W;
    const H = this.H;
    const rx = rect ? rect.x : 0;
    const ry = rect ? rect.y : 0;

    // ── 1. Phosphor persistence ──
    // Fade the persistence buffer toward black
    pCtx.globalCompositeOperation = 'source-over';
    pCtx.fillStyle = `rgba(0, 0, 0, ${1 - this.persistence})`;
    pCtx.fillRect(0, 0, W, H);

    // Draw new signal frame on top (additive-like via lighter).
    // Read only this pane's sub-rect of the signal canvas into the local buffer.
    pCtx.globalCompositeOperation = 'lighter';
    pCtx.drawImage(signalCanvas, rx, ry, W, H, 0, 0, W, H);
    pCtx.globalCompositeOperation = 'source-over';

    // ── 1b. Video feedback ──
    // Recursively feed the output back into itself: the previous feedback
    // buffer is re-drawn (scaled by the feedback gain, with a subtle echo
    // transform) and the new signal added on top → echo/tunnel trails.
    if (this.feedback > 0) {
      const fCtx = this.feedbackTmpCtx;
      fCtx.globalCompositeOperation = 'source-over';
      fCtx.clearRect(0, 0, W, H);

      // Fed-back (transformed) previous buffer, faded by the gain via alpha,
      // optionally softened by a blur on the feedback path.
      fCtx.save();
      fCtx.globalAlpha = this.feedback;
      if (this.fbBlur > 0) fCtx.filter = `blur(${this.fbBlur}px)`;
      fCtx.translate(W / 2 + this.fbOffsetX, H / 2 + this.fbOffsetY);
      fCtx.scale(this.fbZoom, this.fbZoom);
      fCtx.rotate(this.fbRotate);
      fCtx.translate(-W / 2, -H / 2);
      fCtx.drawImage(this.feedbackCanvas, 0, 0);
      fCtx.restore();

      // Add the fresh signal frame (this pane's sub-rect only)
      fCtx.globalCompositeOperation = 'lighter';
      fCtx.drawImage(signalCanvas, rx, ry, W, H, 0, 0, W, H);
      fCtx.globalCompositeOperation = 'source-over';

      // Ping-pong: the temp buffer becomes the new feedback accumulation
      let c = this.feedbackCanvas, cc = this.feedbackCtx;
      this.feedbackCanvas = this.feedbackTmp;
      this.feedbackCtx = this.feedbackTmpCtx;
      this.feedbackTmp = c;
      this.feedbackTmpCtx = cc;
    } else {
      // Feedback off — keep the buffer clean so re-enabling starts fresh
      // (no stale frame flashes back in).
      this.feedbackCtx.clearRect(0, 0, W, H);
    }

    // ── 2. Start compositing to display (offset into this pane's rect) ──
    dCtx.fillStyle = '#050505';
    dCtx.fillRect(rx, ry, W, H);

    // Draw persistence buffer
    dCtx.drawImage(this.persistCanvas, rx, ry);

    // Composite feedback buffer additively
    if (this.feedback > 0) {
      dCtx.save();
      dCtx.globalCompositeOperation = 'lighter';
      dCtx.drawImage(this.feedbackCanvas, rx, ry);
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
      dCtx.drawImage(this.bloomCanvas, rx, ry, W, H);
      dCtx.restore();
    }
  }
}
