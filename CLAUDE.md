# web-oscillator (CRT audio oscilloscope)

Master's thesis prototype. The folder is named `oscilloscope`, but the GitHub remote is
`https://github.com/strm0/web-oscillator`. This is the only working copy. The older
`../oscilloscope.html` is a pre-repo single-file version; ignore it.

- Plain ES modules with no build step. Run it with `python3 -m http.server 8000 --bind 127.0.0.1`
  from this folder, then open http://localhost:8000 in Chrome.
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
- After JS edits, the user must hard reload (Cmd+Shift+R). The dev server sends no cache headers.
- Next up: the user wants to redesign the menu/side panel UI and make cosmetic upgrades.
