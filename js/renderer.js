/* ═══════════════════════════════════════════════════════════
   renderer.js — Signal drawing: grid, waveform, spectrum, XY
   ═══════════════════════════════════════════════════════════ */

export class ScopeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 0;
    this.H = 0;
    this.pad = 20;

    // Phosphor colours by type
    this.phosphorColors = {
      p1:  { main: '#33ff33', glow: '#33ff33', core: 'rgba(180,255,180,0.5)', grid: '#0b2a0b', gridBright: '#174017', dim: '#1a4a1a' },
      p3:  { main: '#ffaa33', glow: '#ffaa33', core: 'rgba(255,220,180,0.5)', grid: '#2a1a0b', gridBright: '#403017', dim: '#4a3a1a' },
      p11: { main: '#33aaff', glow: '#33aaff', core: 'rgba(180,220,255,0.5)', grid: '#0b1a2a', gridBright: '#173040', dim: '#1a3a4a' },
      p31: { main: '#55ff55', glow: '#55ff55', core: 'rgba(200,255,200,0.5)', grid: '#0b2a0b', gridBright: '#174017', dim: '#1a5a1a' },
      bw:  { main: '#ffffff', glow: '#ffffff', core: 'rgba(255,255,255,0.6)', grid: '#1a1a1a', gridBright: '#2a2a2a', dim: '#3a3a3a' },
    };
    this.phosphor = 'bw';
  }

  get colors() { return this.phosphorColors[this.phosphor]; }

  resize(w, h) {
    this.W = w;
    this.H = h;
  }

  // ── GRID ──
  drawGrid(x0, y0, w, h) {
    const ctx = this.ctx;
    const c = this.colors;
    const cols = 10, rows = 8;

    // Grid lines
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= cols; i++) {
      const x = x0 + (w / cols) * i;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = y0 + (h / rows) * j;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
    }

    // Centre crosshairs
    ctx.strokeStyle = c.gridBright;
    ctx.lineWidth = 0.7;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x0 + w, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + h); ctx.stroke();

    // Tick marks
    ctx.strokeStyle = c.gridBright;
    ctx.lineWidth = 0.4;
    for (let i = 0; i <= cols * 5; i++) {
      const x = x0 + (w / (cols * 5)) * i;
      const t = (i % 5 === 0) ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(x, cy - t); ctx.lineTo(x, cy + t); ctx.stroke();
    }
    for (let j = 0; j <= rows * 5; j++) {
      const y = y0 + (h / (rows * 5)) * j;
      const t = (j % 5 === 0) ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(cx - t, y); ctx.lineTo(cx + t, y); ctx.stroke();
    }
  }

  // ── WAVEFORM ──
  drawWaveform(data, x0, y0, w, h, gain, glowIntensity, lineWeight, beamIntensity = 0) {
    if (!data || data.length === 0) return;
    if (beamIntensity > 0) {
      const len = data.length;
      this._ensureBeamScratch(len);
      const bx = this._bx, by = this._by;
      for (let i = 0; i < len; i++) {
        bx[i] = x0 + (i / len) * w;
        by[i] = y0 + h / 2 - data[i] * gain * (h / 2);
      }
      this._renderBeamTrace(len, glowIntensity, lineWeight, beamIntensity);
      return;
    }
    const ctx = this.ctx;
    const c = this.colors;
    const len = data.length;

    // Glow pass (wide, dim)
    if (glowIntensity > 0) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 14 * glowIntensity;
      ctx.strokeStyle = c.glow.replace(')', `, ${0.2 * glowIntensity})`).replace('rgb', 'rgba');
      // Approximate: just lower the alpha
      ctx.globalAlpha = 0.25 * glowIntensity;
      ctx.strokeStyle = c.main;
      ctx.lineWidth = lineWeight * 3.5;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = x0 + (i / len) * w;
        const v = data[i] * gain;
        const y = y0 + h / 2 - v * (h / 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Main trace
    ctx.save();
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 4 * glowIntensity;
    ctx.strokeStyle = c.main;
    ctx.lineWidth = lineWeight;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = x0 + (i / len) * w;
      const v = data[i] * gain;
      const y = y0 + h / 2 - v * (h / 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Bright core
    ctx.save();
    ctx.strokeStyle = c.core;
    ctx.lineWidth = Math.max(0.5, lineWeight * 0.3);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = x0 + (i / len) * w;
      const v = data[i] * gain;
      const y = y0 + h / 2 - v * (h / 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── SPECTRUM (FFT) ──
  drawSpectrum(freqData, x0, y0, w, h, gain, glowIntensity, logScale) {
    if (!freqData || freqData.length === 0) return;
    const ctx = this.ctx;
    const c = this.colors;

    const binCount = freqData.length;
    let barCount, getIdx;

    if (logScale) {
      // Logarithmic frequency scale
      barCount = Math.min(200, Math.floor(w / 3));
      const logMin = Math.log(1);
      const logMax = Math.log(binCount);
      getIdx = (i) => {
        const logI = logMin + (i / barCount) * (logMax - logMin);
        return Math.min(Math.floor(Math.exp(logI)), binCount - 1);
      };
    } else {
      barCount = Math.min(binCount, Math.floor(w / 2));
      getIdx = (i) => Math.floor((i / barCount) * binCount);
    }

    const barW = w / barCount;

    // Glow
    if (glowIntensity > 0) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 6 * glowIntensity;
      ctx.globalAlpha = 0.2 * glowIntensity;
      for (let i = 0; i < barCount; i++) {
        const idx = getIdx(i);
        const val = freqData[idx] / 255;
        const barH = val * h * Math.min(gain, 2.5);
        ctx.fillStyle = c.main;
        ctx.fillRect(x0 + i * barW, y0 + h - barH, Math.max(1, barW - 0.5), barH);
      }
      ctx.restore();
    }

    // Bars
    ctx.save();
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 2 * glowIntensity;
    for (let i = 0; i < barCount; i++) {
      const idx = getIdx(i);
      const val = freqData[idx] / 255;
      const barH = val * h * Math.min(gain, 2.5);
      const brightness = 0.35 + val * 0.65;
      ctx.globalAlpha = brightness;
      ctx.fillStyle = c.main;
      ctx.fillRect(x0 + i * barW, y0 + h - barH, Math.max(1, barW - 0.5), barH);
    }
    ctx.restore();

    // Envelope line
    ctx.save();
    ctx.strokeStyle = c.core;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let i = 0; i < barCount; i++) {
      const idx = getIdx(i);
      const val = freqData[idx] / 255;
      const barH = val * h * Math.min(gain, 2.5);
      const x = x0 + i * barW + barW / 2;
      const y = y0 + h - barH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── XY / LISSAJOUS ──
  // dataX → horizontal, dataY → vertical.
  // delay > 0 plots self-XY: Y is read `delay` samples behind X (phase-space
  // plot of a signal against a delayed copy of itself). delay === 0 is the
  // classic L-vs-R Lissajous and is unchanged.
  drawXY(dataX, dataY, x0, y0, w, h, gain, glowIntensity, lineWeight, delay = 0, beamIntensity = 0) {
    if (!dataX || !dataY) return;
    const ctx = this.ctx;
    const c = this.colors;
    const len = Math.min(dataX.length, dataY.length);
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const start = delay > 0 ? delay : 0;
    if (start >= len) return;

    if (beamIntensity > 0) {
      const n = len - start;
      this._ensureBeamScratch(n);
      const bx = this._bx, by = this._by;
      for (let i = start; i < len; i++) {
        const j = i - start;
        bx[j] = cx + dataX[i] * gain * (w / 2);
        by[j] = cy - dataY[i - delay] * gain * (h / 2);
      }
      this._renderBeamTrace(n, glowIntensity, lineWeight, beamIntensity);
      return;
    }

    const trace = () => {
      ctx.beginPath();
      for (let i = start; i < len; i++) {
        const x = cx + dataX[i] * gain * (w / 2);
        const y = cy - dataY[i - delay] * gain * (h / 2);
        if (i === start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    // Glow
    if (glowIntensity > 0) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 12 * glowIntensity;
      ctx.globalAlpha = 0.2 * glowIntensity;
      ctx.strokeStyle = c.main;
      ctx.lineWidth = lineWeight * 3;
      trace();
      ctx.restore();
    }

    // Main trace
    ctx.save();
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 4 * glowIntensity;
    ctx.strokeStyle = c.main;
    ctx.lineWidth = lineWeight;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    trace();
    ctx.restore();

    // Core
    ctx.save();
    ctx.strokeStyle = c.core;
    ctx.lineWidth = Math.max(0.5, lineWeight * 0.3);
    ctx.lineJoin = 'round';
    trace();
    ctx.restore();
  }

  // ── BEAM-INTENSITY (Z-AXIS) TRACE ──
  // Brightness ∝ dwell time ∝ 1/(beam speed). Slow segments (sine caps,
  // square flats) glow; fast segments (zero crossings, vertical edges) dim.
  // Segments are bucketed by brightness so each pass is ~N strokes, not one
  // per segment, and drawn additively ('lighter') so overlaps build up.
  _ensureBeamScratch(n) {
    if (!this._bx || this._bx.length < n) {
      this._bx = new Float32Array(n);
      this._by = new Float32Array(n);
      this._bs = new Float32Array(n);   // per-segment speed
    }
    if (!this._bucketSegs) this._bucketSegs = Array.from({ length: 12 }, () => []);
  }

  // Render the point series in this._bx / this._by (n points) as a beam trace.
  _renderBeamTrace(n, glowIntensity, lineWeight, amount) {
    if (n < 2) return;
    const ctx = this.ctx, c = this.colors;
    const bx = this._bx, by = this._by, bs = this._bs, buckets = this._bucketSegs;
    const N = buckets.length;

    // refSpeed = mean segment length → effect self-scales with gain/sweep/zoom.
    let sum = 0;
    for (let i = 0; i < n - 1; i++) {
      const dx = bx[i + 1] - bx[i], dy = by[i + 1] - by[i];
      const sp = Math.sqrt(dx * dx + dy * dy);
      bs[i] = sp;
      sum += sp;
    }
    const refSpeed = Math.max(1e-3, sum / (n - 1));

    // Assign each segment to a brightness bucket.
    const FLOOR = 0.05;
    for (let b = 0; b < N; b++) buckets[b].length = 0;
    for (let i = 0; i < n - 1; i++) {
      let bright = 1 / (1 + bs[i] / refSpeed);          // slow→~1, fast→→0
      bright = (1 - amount) + amount * bright;          // blend toward uniform
      if (bright < FLOOR) bright = FLOOR;
      let q = Math.round(bright * (N - 1));
      if (q < 0) q = 0; else if (q > N - 1) q = N - 1;
      buckets[q].push(i);
    }

    // Two passes (main / bright core), same geometry, additive. No per-stroke
    // shadowBlur here — that was the FPS killer with bucketed strokes; the CRT
    // bloom pass already produces the phosphor glow from the persistence buffer.
    const passes = [
      { color: c.main, width: lineWeight,                      base: 1.0 },
      { color: c.core, width: Math.max(0.5, lineWeight * 0.3), base: 1.0 },
    ];
    for (const p of passes) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      for (let b = 0; b < N; b++) {
        const segs = buckets[b];
        if (segs.length === 0) continue;
        ctx.globalAlpha = p.base * (b / (N - 1));
        if (ctx.globalAlpha <= 0) continue;
        ctx.beginPath();
        for (let k = 0; k < segs.length; k++) {
          const i = segs[k];
          ctx.moveTo(bx[i], by[i]);
          ctx.lineTo(bx[i + 1], by[i + 1]);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Parse a '#rrggbb' phosphor colour to [r,g,b].
  _rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ── SPECTROGRAM (waterfall) ──
  // Built as an ImageData at bins×rows and blitted once (scaled), instead of a
  // fillRect per cell — the per-cell path cost tens of thousands of draw calls
  // per frame on busy/high-frequency content.
  drawSpectrogram(history, x0, y0, w, h) {
    if (!history || history.length === 0) return;
    const rows = history.length;
    const bins = history[0].length;

    if (!this._spCanvas) {
      this._spCanvas = document.createElement('canvas');
      this._spCtx = this._spCanvas.getContext('2d');
    }
    if (this._spCanvas.width !== bins || this._spCanvas.height !== rows) {
      this._spCanvas.width = bins;
      this._spCanvas.height = rows;
      this._spImg = this._spCtx.createImageData(bins, rows);
    }

    const data = this._spImg.data;
    const [pr, pg, pb] = this._rgb(this.colors.main);
    for (let r = 0; r < rows; r++) {
      const row = history[r];
      const base = r * bins * 4;
      for (let b = 0; b < bins; b++) {
        const val = row[b] / 255;
        const o = base + (b << 2);
        data[o] = pr * val;
        data[o + 1] = pg * val;
        data[o + 2] = pb * val;
        data[o + 3] = 255;
      }
    }
    this._spCtx.putImageData(this._spImg, 0, 0);

    const ctx = this.ctx;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._spCanvas, 0, 0, bins, rows, x0, y0, w, h);
    ctx.imageSmoothingEnabled = sm;
  }

  // ── TRIGGER INDICATOR ──
  drawTriggerLine(x0, y0, w, h, level) {
    const ctx = this.ctx;
    const trigY = y0 + h / 2 - level * (h / 2);
    ctx.save();
    ctx.strokeStyle = '#885500';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, trigY);
    ctx.lineTo(x0 + w, trigY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#885500';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillText('T', x0 - 11, trigY + 4);
    ctx.restore();
  }

  // ── CURSORS ──
  drawCursors(x0, y0, w, h, measurements) {
    if (!measurements) return;
    const ctx = this.ctx;
    const { x1Frac, x2Frac, y1Frac, y2Frac } = measurements;

    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 0.8;

    // X cursors (vertical)
    ctx.strokeStyle = '#ffff00';
    const cx1 = x0 + x1Frac * w;
    const cx2 = x0 + x2Frac * w;
    ctx.beginPath(); ctx.moveTo(cx1, y0); ctx.lineTo(cx1, y0 + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx2, y0); ctx.lineTo(cx2, y0 + h); ctx.stroke();

    // Y cursors (horizontal)
    ctx.strokeStyle = '#ff44ff';
    const cy1 = y0 + y1Frac * h;
    const cy2 = y0 + y2Frac * h;
    ctx.beginPath(); ctx.moveTo(x0, cy1); ctx.lineTo(x0 + w, cy1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, cy2); ctx.lineTo(x0 + w, cy2); ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── IDLE / NO-SIGNAL ──
  drawIdle(x0, y0, w, h) {
    const ctx = this.ctx;
    const c = this.colors;
    const cy = y0 + h / 2;

    ctx.save();
    ctx.strokeStyle = c.dim;
    ctx.lineWidth = 1;
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    for (let x = x0; x < x0 + w; x++) {
      const noise = (Math.random() - 0.5) * 2;
      if (x === x0) ctx.moveTo(x, cy + noise); else ctx.lineTo(x, cy + noise);
    }
    ctx.stroke();
    ctx.restore();

  }
}
