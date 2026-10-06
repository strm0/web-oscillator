/* ═══════════════════════════════════════════════════════════
   tui.js — terminal-style navigation for the side panel

   The panel is a list of rows (`.row[data-item]`). One row is the cursor
   (`.cur`, drawn inverse). Up/Down move it, Left/Right change the row's
   value, Enter activates. Clicking a row moves the cursor there.

   Row kinds (data-item):
     choice  several .btn, one .active   left/right/enter cycle them
     toggle  one .btn with on/off state  left/right/enter click it
     slider  <input type=range>          left/right step (shift = x10)
     select  <select>                    left/right cycle options
     action  one or more buttons         enter (or click on the row) clicks
     fold    collapsible section header  enter/left/right open or close
   ═══════════════════════════════════════════════════════════ */

// Keep a range input's fill (--pct) in sync with its value.
export function syncRange(el) {
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const pct = ((parseFloat(el.value) - min) / (max - min)) * 100;
  el.style.setProperty('--pct', pct.toFixed(2) + '%');
}

export class Tui {
  constructor(panel, { onEscape } = {}) {
    this.panel = panel;
    this.onEscape = onEscape;
    this.cur = null;

    panel.querySelectorAll('input[type="range"]').forEach(syncRange);
    panel.addEventListener('input', e => {
      if (e.target.type === 'range') syncRange(e.target);
    });

    // Mouse: clicking a row moves the cursor there (hovering does not);
    // clicking an action row's empty space counts as pressing its button.
    panel.addEventListener('click', e => {
      const row = e.target.closest('.row');
      if (!row) return;
      if (this._usable(row)) this._setCursor(row, false);
      if (e.target.closest('button, select, input')) return;
      const kind = row.dataset.item;
      if (kind === 'action' || kind === 'toggle' || kind === 'fold') this._activate(row, 1, false, true);
    });
    // Native focus would make Enter/arrows act twice and swallow the letter
    // shortcuts, so drop it once the mouse is done with a control.
    panel.addEventListener('mouseup', () => {
      const a = document.activeElement;
      if (a && (a.tagName === 'BUTTON' || a.type === 'range')) a.blur();
    });
    panel.addEventListener('change', e => {
      if (e.target.tagName === 'SELECT') e.target.blur();
    });

    document.addEventListener('keydown', e => this._onKey(e));

    const start = panel.querySelector('#btnStart')?.closest('.row') || this._items()[0];
    if (start) this._setCursor(start, false);
  }

  _usable(row) {
    if (!row.dataset.item || row.offsetParent === null) return false;
    const ctl = row.querySelector('input, select');
    return !(ctl && ctl.disabled);
  }

  _items() {
    return [...this.panel.querySelectorAll('.row[data-item]')].filter(r => this._usable(r));
  }

  _setCursor(row, scroll = true) {
    this.cur?.classList.remove('cur');
    this.cur = row;
    if (!row) return;
    row.classList.add('cur');
    if (scroll) row.scrollIntoView({ block: 'nearest' });
  }

  _move(dir) {
    const items = this._items();
    if (!items.length) return;
    let i = items.indexOf(this.cur);
    i = i < 0 ? (dir > 0 ? 0 : items.length - 1) : (i + dir + items.length) % items.length;
    this._setCursor(items[i]);
  }

  _onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.target instanceof Element && e.target.matches('input[type="text"]')) return;
    if (this.panel.classList.contains('collapsed')) return;

    const cur = this.cur && this._usable(this.cur) ? this.cur : null;
    switch (e.key) {
      case 'ArrowDown':  this._move(1); break;
      case 'ArrowUp':    this._move(-1); break;
      case 'ArrowLeft':  if (cur) this._activate(cur, -1, e.shiftKey, false); break;
      case 'ArrowRight': if (cur) this._activate(cur, 1, e.shiftKey, false); break;
      case 'Enter':      if (cur) this._activate(cur, 1, e.shiftKey, true); break;
      case 'Backspace':
      case 'Delete': {
        const del = cur?.querySelector('.preset-del');
        if (!del) return;
        del.click();
        break;
      }
      case 'Escape':
        if (!this.onEscape) return;
        this.onEscape();
        break;
      default: return;
    }
    e.preventDefault();
  }

  // dir: -1 / +1, big: shift held, enter: Enter (or click) rather than an arrow
  _activate(row, dir, big, enter) {
    switch (row.dataset.item) {
      case 'choice': {
        const btns = [...row.querySelectorAll('.btn')].filter(b => !b.disabled);
        if (!btns.length) return;
        const i = btns.findIndex(b => b.classList.contains('active'));
        btns[(i + dir + btns.length) % btns.length].click();
        break;
      }
      case 'toggle':
        row.querySelector('.btn')?.click();
        break;
      case 'slider': {
        const el = row.querySelector('input[type="range"]');
        if (!el) return;
        if (enter) return;
        const step = (parseFloat(el.step) || 1) * (big ? 10 : 1);
        const v = parseFloat(el.value) + dir * step;
        el.value = Math.max(parseFloat(el.min), Math.min(parseFloat(el.max), v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      }
      case 'select': {
        const s = row.querySelector('select');
        const n = s?.options.length || 0;
        if (!n) return;
        s.selectedIndex = (s.selectedIndex + dir + n) % n;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
      case 'action': {
        if (!enter) return;
        const btn = [...row.querySelectorAll('button')].find(b => !b.disabled && b.offsetParent !== null);
        btn?.click();
        break;
      }
      case 'fold':
        row.closest('.fold')?.classList.toggle('collapsed');
        break;
    }
  }
}
