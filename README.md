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

## Getting started

The app uses ES modules, so it needs to be served over HTTP.

```bash
cd oscilloscope
python3 -m http.server 8000
```

Open `http://localhost:8000` in Chrome. Select your audio input from the dropdown and press Start.

After editing the JS, hard reload with Cmd+Shift+R. The simple server sends no cache headers, so a
normal reload can mix old cached modules with the new HTML and break the page.

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

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| 1-5 | Switch display mode |
| A | Toggle AC/DC coupling |
| T | Cycle trigger mode |
| R | Rearm single trigger |
| C | Toggle cursors |
| Space | Freeze/unfreeze |
| ↑↓ | Adjust gain |
| ←→ | Adjust sweep speed |
| F | Toggle fullscreen |
| P | Toggle sidebar |
| Cmd+S | Screenshot |

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
    └── presets.js      — Default state, save/load configs
```

## Notes

- Disable echo cancellation, noise suppression, and auto gain control for clean signal capture
- For audio interfaces: Input 1 maps to the left channel, Input 2 to the right — use the channel selector to pick the active input
- XY mode always uses both channels (L on X, R on Y) regardless of channel selection
- Works best in Chrome; Firefox and Safari have varying Web Audio API support

## License

MIT
