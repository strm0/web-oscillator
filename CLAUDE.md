# web-oscillator (CRT audio oscilloscope)

Master's thesis prototype. The folder is named `oscilloscope`, but the GitHub remote is
`https://github.com/strm0/web-oscillator`. This is the only working copy. The older
`../oscilloscope.html` is a pre-repo single-file version; ignore it.

- Plain ES modules with no build step. Run it with `python3 server.py` from this folder, then open
  http://localhost:8000 in Chrome. `server.py` is a static server that also writes preset files;
  under plain `python3 -m http.server` presets only reach localStorage.
- Presets (added 2026-10-05) are files in `presets/<id>.json`, listed by `presets/index.json`, which
  `server.py` regenerates. They are meant to be committed.
- Pushing uses HTTPS with a GitHub personal access token (set up 2026-09-26). If a push asks for
  credentials, the user has to run it in their own Terminal, because the `!` prefix can't answer prompts.
- The user wants very short replies.

## Computer audio (done 2026-09-29)

The scope shows anything playing on the Mac through the **BlackHole 2ch** driver plus a Multi-Output
Device. It works with no code changes; setup steps are in README.md.

Optional follow-up the user was offered but hasn't chosen: a "Capture tab" button using
`getDisplayMedia({ audio: true })` for Chrome-tab audio with no driver needed.

## Notes

- The bottom readout strip (sample rate, channels, FFT size, FPS, mode) was removed on 2026-09-29
  because it looked generated. That also removed the on-screen FPS counter.
- `server.py` sends `Cache-Control: no-store`, so a normal reload picks up JS edits. Under the old
  `python3 -m http.server` a hard reload (Cmd+Shift+R) is still needed.
- Menu redesign done 2026-10-06: TUI-style panel in Monaco (fallbacks Menlo, Consolas, DejaVu Sans
  Mono; no web fonts). `js/tui.js` handles arrow-key navigation of `.row[data-item]` rows; the
  cursor moves on arrows or click, never on hover. Arrows no longer change gain/sweep. No header
  strip: MENU and FULLSCREEN float over the panel column. Sections: Source, Presets, View (layout),
  Display, Signal, CRT, Feedback, and a collapsed ADVANCED fold (coupling, trigger, beam strength,
  freeze, cursors). Glow is an ON/OFF toggle (ON = beamIntensity 0, classic halo renderer; OFF =
  beam renderer at the Advanced beam strength). The scope area CSS (4:3 box, max 1000px, rounded
  bezel, stretched only in fullscreen) must stay as in the original build: the user tuned their
  looks on it and rejected a full-viewport scope on 2026-10-06.
- Chrome freezes transitions, rAF and ResizeObserver in a hidden tab, so layout checks through the
  browser tools only work when the Chrome window is actually visible.
