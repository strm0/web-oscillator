# web-oscillator

A browser-based audio oscilloscope with CRT-style rendering. Connects to any audio input (microphone, audio interface, synth) via the Web Audio API and displays real-time waveforms, frequency spectra, Lissajous patterns, and spectrograms.

Built for use with hardware synths and audio interfaces like the Scarlett 2i2, and can also show audio
playing on the computer itself.

## Features

- **Five display modes** — Waveform, FFT spectrum, XY/Lissajous, Wave+FFT split, Spectrogram waterfall
- **Audio device selection** — Dropdown lists all available inputs, supports stereo interfaces with per-channel selection (IN 1 / IN 2 / MIX)
- **Trigger system** — Auto, Normal, and Single trigger modes with rising/falling edge and adjustable level
- **AC/DC coupling** — High-pass filter at 20Hz for AC mode
- **CRT post-processing** — Phosphor persistence, bloom, scanlines, barrel distortion vignette, flicker
- **Multiple phosphor colours** — White (default), P1 Green, P3 Amber, P11 Blue, P31 Bright Green
- **Measurement cursors** — Draggable time and voltage cursors with delta readout
- **Fullscreen mode** — Clean full-screen display, toggle with F key
- **Collapsible sidebar** — Slides away to give the scope more room
- **Keyboard shortcuts** — Every major control has a hotkey
- **Screenshot export** — Cmd+S saves the current display as PNG
- **Presets** — save all settings under a name; stored as JSON files in `presets/`

## Getting started

The app uses ES modules, so it needs to be served over HTTP.

```bash
cd oscilloscope
python3 server.py
```

Open `http://localhost:8000` in Chrome. Select your audio input from the dropdown and press Start.

`server.py` is a small static server that can also write preset files. The plain
`python3 -m http.server 8000` still runs the scope, but presets are then saved in the browser only.

## Presets

**Save preset** (under Audio Source) stores the layout, all four pane settings, input gain and
coupling under a name. Each preset is written to `presets/<name>.json`, so presets can be committed
and shared; any preset file placed in that folder appears in the list after a reload. Click a preset
to load it, or the `x` next to it to delete it (this removes the file, after a confirmation).

## Visualising audio playing on the computer (macOS)

The scope can show anything playing on the Mac (music, YouTube, etc.) through the free
[BlackHole](https://github.com/ExistentialAudio/BlackHole) virtual audio driver. No code changes are
needed, because the scope captures any audio input.

1. `brew install blackhole-2ch`, then reboot.
2. In Audio MIDI Setup, click **+** → **Create Multi-Output Device**. Tick your speakers or headphones
   and **BlackHole 2ch**, with the speakers first, and turn on drift correction for BlackHole.
3. In System Settings → Sound → Output, choose the Multi-Output Device. The volume keys don't work with
   it selected, so set volume in the playing app.
4. In the scope, choose **BlackHole 2ch** as the input and press Start. Use MIX or XY to see both channels.

If BlackHole is missing from the dropdown, reload the page (device names load after mic permission).

DAWs like Ableton ignore the system output and pick their own device. In Ableton, go to Settings → Audio
and set Output Device to the Multi-Output Device (or BlackHole 2ch alone). Make sure outputs 1/2 are
enabled under Output Config and that the sample rate matches the Multi-Output Device in Audio MIDI Setup.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Up/Down | Move the menu cursor |
| Left/Right | Change the highlighted value (Shift for bigger steps) |
| Enter | Activate the highlighted item |
| Esc | Close the menu |
| 1-5 | Switch display mode |
| 6 | Single/quad layout |
| [ ] | Focus pane (quad) |
| A | Toggle AC/DC coupling |
| T | Cycle trigger mode |
| R | Rearm single trigger |
| C | Toggle cursors |
| Space | Freeze/unfreeze |
| F | Toggle fullscreen |
| P | Toggle menu |
| Cmd+S | Screenshot |

The menu is a terminal-style list: hover or use the arrow keys to move the highlight. Coupling,
trigger and the freeze/cursor tools are under the collapsed ADVANCED section at the bottom.

## Project structure

```
oscilloscope/
├── index.html          — HTML shell and control panel
├── css/
│   └── scope.css       — All styling and CRT overlay rules
└── js/
    ├── main.js         — Init, animation loop, glue
    ├── audio.js        — Device enumeration, Web Audio API, stereo splitting
    ├── analyser.js     — Trigger logic, freeze, cursor measurements
    ├── renderer.js     — Grid, waveform, FFT, XY, spectrogram drawing
    ├── crt.js          — Phosphor persistence, bloom compositing
    ├── controls.js     — UI bindings, keyboard shortcuts
    ├── tui.js          — Arrow-key / mouse navigation of the menu
    ├── preset-panel.js — Preset list, save and delete dialogs
    └── presets.js      — Default state, save/load configs
```

## Notes

- Disable echo cancellation, noise suppression, and auto gain control for clean signal capture
- For audio interfaces: Input 1 maps to the left channel, Input 2 to the right — use the channel selector to pick the active input
- XY mode always uses both channels (L on X, R on Y) regardless of channel selection
- Works best in Chrome; Firefox and Safari have varying Web Audio API support

## License

MIT
