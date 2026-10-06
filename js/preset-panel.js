/* ═══════════════════════════════════════════════════════════
   preset-panel.js — Presets section: list, save dialog, delete
   ═══════════════════════════════════════════════════════════ */

import { listPresets, savePreset, loadPreset, deletePreset, presetId } from './presets.js';

const NEEDS_SERVER = 'Start the app with python3 server.py to write files.';

// Show a modal <dialog>; resolves true only if it was closed by its OK button.
function openDialog(dlg) {
  return new Promise(resolve => {
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

export class PresetPanel {
  // getPreset(name) → preset object for the current settings
  // applyPreset(preset) → set the scope to those settings
  constructor({ getPreset, applyPreset }) {
    this.getPreset = getPreset;
    this.applyPreset = applyPreset;
    this.presets = [];

    this.listEl = document.getElementById('presetList');
    this.msgEl = document.getElementById('presetMsg');
    this.nameDlg = document.getElementById('presetNameDialog');
    this.nameInput = document.getElementById('presetNameInput');
    this.confirmDlg = document.getElementById('confirmDialog');

    document.getElementById('btnSavePreset').addEventListener('click', () => this._save());
    document.getElementById('presetNameCancel').addEventListener('click', () => this.nameDlg.close());
    document.getElementById('confirmCancel').addEventListener('click', () => this.confirmDlg.close());
    // A name with no letters or digits has no file name; keep the dialog open.
    this.nameDlg.querySelector('form').addEventListener('submit', (e) => {
      if (!presetId(this.nameInput.value)) {
        e.preventDefault();
        this.nameInput.select();
      }
    });

    this.refresh();
  }

  async refresh() {
    this.presets = await listPresets();
    this.listEl.replaceChildren();
    if (!this.presets.length) {
      const empty = document.createElement('div');
      empty.className = 'preset-msg';
      empty.textContent = 'No presets saved yet';
      this.listEl.appendChild(empty);
      return;
    }
    for (const p of this.presets) {
      const row = document.createElement('div');
      row.className = 'row preset-row';
      row.dataset.item = 'action';

      const load = document.createElement('button');
      load.className = 'btn preset-name';
      load.textContent = p.name;
      load.title = p.local ? 'Stored in this browser only' : `presets/${p.id}.json`;
      load.addEventListener('click', () => this._load(p));

      const del = document.createElement('button');
      del.className = 'btn preset-del';
      del.textContent = 'x';
      del.title = 'Delete preset';
      del.addEventListener('click', () => this._delete(p));

      row.append(load, del);
      this.listEl.appendChild(row);
    }
  }

  _say(text) {
    this.msgEl.textContent = text;
  }

  _confirm(text, okLabel) {
    document.getElementById('confirmText').textContent = text;
    document.getElementById('confirmOk').textContent = okLabel;
    return openDialog(this.confirmDlg);
  }

  async _save() {
    this._say('');
    this.nameInput.value = '';
    if (!await openDialog(this.nameDlg)) return;

    const name = this.nameInput.value.trim();
    const id = presetId(name);
    const existing = this.presets.find(p => p.id === id);
    if (existing && !await this._confirm(`A preset named "${existing.name}" already exists. Overwrite it?`, 'OVERWRITE')) return;

    const written = await savePreset(id, this.getPreset(name));
    if (!written) this._say('Saved in this browser only. ' + NEEDS_SERVER);
    await this.refresh();
  }

  async _load(p) {
    this._say('');
    const preset = await loadPreset(p.id);
    if (!preset) {
      this._say(`Could not load "${p.name}".`);
      return this.refresh();
    }
    this.applyPreset(preset);
  }

  async _delete(p) {
    this._say('');
    const where = p.local ? 'It is stored in this browser only.' : `This removes presets/${p.id}.json.`;
    if (!await this._confirm(`Delete preset "${p.name}"? ${where}`, 'DELETE')) return;

    if (!await deletePreset(p)) this._say('Could not delete the file. ' + NEEDS_SERVER);
    await this.refresh();
  }
}
