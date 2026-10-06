# web-oscillator

A browser-based audio oscilloscope with CRT-style rendering. It takes any audio input the browser can
see (audio interface, microphone, virtual loopback device) and draws it as a waveform, XY/Lissajous
figure, spectrum, or spectrogram.

## Setup

You need Chrome and Python 3. Nothing is installed; the app is plain HTML and JavaScript.

```bash
git clone https://github.com/strm0/web-oscillator.git
cd web-oscillator
python3 server.py        # Windows: python server.py
```

Open http://localhost:8000 in Chrome and allow microphone access when asked.

`server.py` serves the files and also saves presets as JSON files in `presets/`. Any other static
server works too, but presets are then kept in the browser only.

## Use

1. Choose your input under **Source** (the default is whatever the system uses as microphone) and
   press **START**.
2. Press **F** for fullscreen and **P** to hide or show the menu.

The menu is a list. Move with the arrow keys, change the highlighted row with Left/Right (hold Shift
for bigger steps), and press Enter to activate a button. Clicking also works.

- **Presets** saves the current settings under a name. Click a preset to load it.
- **View** switches between one scope and four, each with its own settings.
- **Display** picks WAVE, XY, FFT, SPEC (spectrogram) or W+F (wave over spectrum). XY draws input 1
  against input 2.
- **Signal** chooses the input channel and sets gain and sweep speed.
- **CRT** sets phosphor colour, persistence, line weight and glow.
- **Feedback** feeds the image back into itself for tunnel effects.
- **Advanced** holds coupling, trigger, beam strength, freeze and measurement cursors. Coupling DC
  is the normal setting; AC removes any offset but bends low notes.

Cmd+S (Ctrl+S on Windows and Linux) saves a screenshot.

## Showing audio that plays on the computer

The scope can only see audio inputs, so sound playing on the computer has to be routed through a
loopback device. Once that device is selected under Source, nothing else changes.

### macOS: BlackHole

1. `brew install blackhole-2ch`, then reboot.
2. Open Audio MIDI Setup, click **+** and create a **Multi-Output Device**. Tick your speakers or
   headphones first, then **BlackHole 2ch**, and turn on drift correction for BlackHole.
3. In System Settings, Sound, Output, choose the Multi-Output Device. The volume keys stop working
   while it is selected, so set volume in the playing app.
4. In the scope choose **BlackHole 2ch** as input and press START.

DAWs pick their own output device. In Ableton, set Output Device to the Multi-Output Device under
Settings, Audio, and make sure outputs 1/2 are enabled.

### Windows: VB-CABLE or Stereo Mix

Some sound cards offer **Stereo Mix**. Open Sound settings, Recording, right-click and show disabled
devices, enable Stereo Mix, then pick it in the scope.

If there is no Stereo Mix, install the free [VB-CABLE](https://vb-audio.com/Cable/) and reboot.

1. In Sound settings set the output device to **CABLE Input**.
2. To keep hearing the audio, open the Recording tab, choose **CABLE Output**, Properties, Listen,
   tick "Listen to this device" and pick your speakers.
3. In the scope choose **CABLE Output** as input and press START.

### Linux: PulseAudio or PipeWire monitor

Every output has a monitor source. Chrome does not list it, but you can redirect Chrome to it:

1. Install `pavucontrol` (works with both PulseAudio and PipeWire).
2. In the scope press START with any input.
3. In pavucontrol, Recording tab, find Chrome and change its source to **Monitor of** your output
   device.

The change sticks for Chrome until you pick something else.

## Project structure

```
web-oscillator/
├── index.html          — HTML shell and menu
├── server.py           — Static server that also writes preset files
├── presets/            — Saved presets (JSON), listed by index.json
├── css/
│   └── scope.css       — Styling and CRT overlay rules
└── js/
    ├── main.js         — Init, draw loop, glue
    ├── audio.js        — Device enumeration, Web Audio graph, stereo capture
    ├── analyser.js     — Trigger logic, freeze, cursor measurements
    ├── renderer.js     — Grid, waveform, FFT, XY, spectrogram drawing
    ├── crt.js          — Phosphor persistence, bloom compositing
    ├── controls.js     — Menu bindings, keyboard shortcuts
    ├── tui.js          — Arrow-key navigation of the menu
    ├── preset-panel.js — Preset list, save and delete dialogs
    └── presets.js      — Default state, preset files
```

## Notes

- Input 1 of an audio interface is the left channel, input 2 the right.
- Chrome is the tested browser. Firefox and Safari differ in Web Audio support.

## License

MIT
