# SpeedWasher

**RSVP speed reading meets hypnotic scripts.**

A web-based tool that uses Rapid Serial Visual Presentation (RSVP) to deliver text one word at a time at high speeds. Originally designed for speed reading training, this implementation explores the hypnotic potential of forced-focus rapid text delivery — SpeedWashing.

**[Try it live](https://ecstasyengineer.github.io/speedwasher/)**

Pure static files: HTML + vanilla JS + WebGL + Web Audio. No build step, no dependencies, no analytics.

## How It Works

Words flash one at a time with a red **Optimal Recognition Point (ORP)** - the letter your eye should fixate on. Your eyes stay fixed while words stream directly into your visual cortex.

At higher speeds (600+ WPM), conscious analysis can't keep up. The words just... go in.

## The Induction Model

SpeedWashing exploits a simple asymmetry: **WPM is the induction**. The speed itself does the work.

At 200-300 WPM, the reader's inner voice narrates comfortably. They feel in control. As speed ramps to 500-750 WPM, the inner voice can't keep up and drops out — the reader shifts from *actively reading* to *passively receiving*. They don't choose to let go; they simply can't hold on. This is the cognitive overload window where suggestions bypass critical analysis.

The audio and visual layers exploit this further by inverting the listener's expectations:

- **Consonance (perfect fifths) accompanies the trance.** The harmonious, "correct" sound is paired with receptivity and surrender. The brain learns: consonance = safe to let go.
- **Dissonance (tritones) accompanies the wake-up.** The tense, unsettled intervals are paired with alertness and emergence. The brain learns: dissonance = being pulled away from the good place.

This is backwards from how most media uses tension. Usually dissonance = danger, consonance = resolution. Here, the consonant state *is* the trance — which means the listener's unconscious motivation is to return to it. The wake-up feels like something being taken away, not something being given back.

The drop reinforces this: maximum dissonance resolves to instant consonance at the moment of deepest surrender. Relief and release arrive together.

## Script Library

The main page ships a curated library of ten archetypes, each with an SFW and NSFW variant:

| Archetype | Theme |
|-----------|-------|
| Mommy | Comfort & safety |
| Yandere | Obsessive devotion |
| Teacher | Understanding is descent |
| Brat | The brat always wins |
| Succubus | Mutual transformation |
| Drone | Systems nominal |
| Puppet | Emptiness as relief |
| Goddess | Worship & devotion |
| Pet | Small and loved |
| Maid | Service with pride |

Plus additional scripts in the dropdown (Clarity, Purification, Doll, Dark Therapy, Obedience, Mask, and more — see `scripts/`).

- **NSFW gate**: NSFW scripts are hidden behind a toggle with an explicit 18+ confirmation modal. NSFW variants contain JOI pacing driven by the `@pulseborder` traffic-light system.
- **Denial slider**: visible once NSFW is unlocked. Sets the percentage chance that a script's `@branch deny` roll sends you down the deny path instead of the release path. Rolled once per playthrough.
- **Content warnings**: scripts can declare `@cw` lines; they're collected before playback and shown in a modal that must be acknowledged before the script will play.

## Features

- **Variable speed**: 100-1200 WPM with proportional punctuation pauses
- **Script commands**: Control speed, visuals, and audio inline
- **Layered audio engine**: Up to 8 simultaneous tone layers, each a hybrid of binaural beat and isochronic pulse, with named presets
- **Spiral visual**: Two WebGL shader spirals (Canvas 2D fallback) for enhanced focus
- **Spiral-as-state**: `@pulseborder` recolors a running spiral, making the spiral itself the state indicator
- **Subliminals**: Peripheral word flashing during high-speed sections
- **Snap induction**: Audio + white flash for trance drops
- **Pause**: Silent blocking pause (like snap without sound/flash)
- **Sound effects**: `@sfx name` plays custom sounds non-blocking (drop files in `audio/sfx/`)
- **Haptics**: `@haptic` drives a Bluetooth vibrator or e-stim device straight from the script, with a user-set intensity ceiling
- **Branching**: `@label` / `@goto` / `@branch` for deny/release path splits
- **Content warnings**: `@cw` pre-playback acknowledgment modal
- **Loop & rewind**: Loop toggle, rewind-to-start, shareable `loop=1` URL param
- **Script comments**: `//` comments (full-line or inline)
- **Sharable links**: Share scripts via URL (base64 or paste service links)
- **Fullscreen mode**: Immersive distraction-free reading
- **Editor**: Dedicated page with phase timeline and real-time lint
- **JOI script linter**: 30+ rules enforcing pacing structure, run via Node or in-browser

## Script Commands

Parameters use explicit `key:value` syntax; a few commands take a positional first token (sfx name, pulseborder color, label names).

### Comments
```
// This is a full-line comment
@wpm 300                     // Inline comments work too
@spiral color:#8B5CF6        // Hex colors are safe — requires space before //
```

### Speed
```
@wpm 300                     // Set reading speed to 300 words per minute
```

Punctuation gets proportional pauses: sentence-enders 2x the word interval, commas/semicolons 1.4x, dashes 1.25x.

### Audio
```
@binaural fade:8                                        // default "reactor" preset
@binaural type:warm fade:8                              // named preset
@binaural layers:60/2/4,95/3.5/5,190/4.5/6 fade:8      // custom layers
@binaural layers:202.5/4/7,135/3.5/4.6,120/1.5/2/0.5   // 4th value = per-layer volume
@binaural off fade:8                                    // stop all layers
```

Every layer is a **hybrid tone**: a binaural frequency split (carrier ± beat/2, one side per ear) combined with an isochronic pulse (raised-cosine envelope, left and right 180 degrees out of phase). The engine runs up to 8 simultaneous layers in an AudioWorklet.

Each `layers:` entry is `carrier/beat/pulse[/vol]`:

| Field | Description | Default |
|-------|-------------|---------|
| carrier | Base frequency in Hz | 100 |
| beat | Binaural beat frequency in Hz | 3 |
| pulse | Isochronic pulse rate in Hz | 5 |
| vol | Optional per-layer volume, 0-10 scale | (master default) |
| `fade:` | Transition time in seconds | 8 |

Reissuing `@binaural` with new values crossfades the existing layers to the new parameters (keyframing) — frequencies glide over the fade duration rather than restarting.

Named presets (`type:`): `reactor` (default), `warm`, `still`, `dark` — each a three-layer stack defined in `js/binaural.js`.

### Visuals — Spiral
```
@spiral opacity:0.3 speed:0.5 fade:2                     // default type:1, default colors
@spiral color1:#E30B5C color2:#8B5CF6 color3:#87CEEB     // 3 custom colors
@spiral color:#8B5CF6                                     // single color propagated to all 3
@spiral #8B5CF6 opacity:0.3 speed:0.5 fade:2            // bare #hex also works
@spiral type:2 opacity:0.3                                // happy spiral (type 2)
@spiral off fade:1                                        // fade out
```

Two WebGL shader types (falls back to Canvas 2D if WebGL unavailable):

| Type | Name | Description |
|------|------|-------------|
| `1` (default) | SDF Outline | Three independent logarithmic spiral layers at different speeds with glow, outlines, and ripple. Each layer takes one of the 3 colors. |
| `2` | Happy Spiral | Convergent pull with Chebyshev angular patterns, radial pulse, and center glow. |

| Parameter | Description | Default |
|-----------|-------------|---------|
| `type:` | Shader type (1 or 2) | 1 |
| `color:` | Single hex color (propagated to all 3 layers) | (uses defaults) |
| `color1:` | Layer 1 hex color | #E30B5C (raspberry) |
| `color2:` | Layer 2 hex color | #8B5CF6 (purple) |
| `color3:` | Layer 3 hex color | #87CEEB (light blue) |
| `opacity:` | Target opacity 0-1 | 0.8 |
| `speed:` | Rotations per second | 1 |
| `fade:` | Fade duration in seconds | 1 |

### Subliminals
```
@subliminals opacity:0.4 empty drift sink                // flash words at 40% opacity
@subliminals off                                          // stop
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `opacity:` | Flash opacity 0-1 | 0.4 |
| (bare tokens) | Words to flash | (none) |

### Snap
```
@snap duration:1500 word:Drop.      // snap + flash + show "Drop." for 1500ms
@snap duration:800                   // snap + flash + blank display for 800ms
@snap                                // default 800ms blank snap
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `duration:` | Pause duration in ms | 800 |
| `word:` | Word to display during pause (self-contained, doesn't consume next word) | (blank) |

**Snap is blocking:** commands placed *after* `@snap` don't fire until the pause completes and the next word displays. To have audio/visual changes coincide with the snap, place them *before* `@snap`:
```
@binaural off fade:0.1            // these fire immediately
@subliminals off
@snap duration:1500 word:Drop.    // then the snap fires
```

### Pause
```
@pause duration:2500              // silent pause, blank display, 2500ms
@pause duration:2000 word:Hold.   // silent pause with word shown
@pause                            // default 800ms blank pause
```

**Pause is blocking** (same timing as snap) but produces **no sound and no flash**. Use it for dramatic silences, vocalization gaps, or anywhere you want a timed pause without the snap's compliance-trigger connotations.

**Composing sfx + pause:** `@sfx` is non-blocking, so placing it before `@pause` fires the sound and then pauses:
```
@sfx bell                         // bell rings immediately
@pause duration:2500 word:Speak.  // then 2500ms silent pause with "Speak." shown
```

### Sound Effects
```
@sfx bell                         // plays audio/sfx/bell.ogg (falls back to .mp3)
@sfx snap                         // plays the snap sound without the flash/pause
@sfx pop vol:0.5                  // plays pop at half volume
@sfx whimper detune:300           // pitch-shift up 300 cents
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| (name) | Sound file name (looks in `audio/sfx/`) | (required) |
| `vol:` | Playback volume 0.0-1.0 | 1.0 |
| `detune:` | Pitch shift in cents, 0-1200 | 0 |

**Non-blocking** — just plays the sound, playback continues immediately. Files are lazy-loaded and cached (`.ogg` then `.mp3` fallback). Bundled: `bell`, `clicker`, `gong`, `pop`, `snap`, `whimper`. Drop files in `audio/sfx/` and reference by name.

### Pulse Border
```
@pulseborder green hz:0.33        // slow green pulse
@pulseborder yellow hz:0.5        // medium amber pulse
@pulseborder purple hz:0.5        // purple
@pulseborder raspberry hz:0.5     // hot pink / magenta
@pulseborder red hz:0.75          // red
@pulseborder pink hz:0.5          // pink
@pulseborder #8B5CF6 hz:0.5      // custom hex color
@pulseborder off fade:1           // fade out
```

Pulsing inset glow on the RSVP container for persistent ambient state indication. The glow pulses between 25% and 100% intensity (never fully off while active).

| Parameter | Description | Default |
|-----------|-------------|---------|
| (color) | Named (`green`, `yellow`, `purple`, `raspberry`, `red`, `pink`) or hex | green |
| `hz:` | Pulse frequency (cycles per second) | 0.33 |
| `fade:` | Transition time in seconds when switching/stopping | 1 |

**Spiral-as-state:** if a spiral is running, `@pulseborder` also shifts the spiral's palette to match the border color — the spiral becomes the primary state indicator.

**The traffic-light convention** (used by the NSFW library and enforced by the linter): green = go, red = stop/no-touch, yellow = warning window before an edge, raspberry/purple = edge. SFW scripts must not use `@pulseborder` at all.

### Haptics
```
@haptic intensity:0.3              // ramp straight to 30%
@haptic intensity:0.5 fade:4       // ease up to 50% over 4 seconds
@haptic intensity:0.7 for:2        // pulse to 70% for 2s, then back to zero
@haptic intensity:0.6 fade:1 for:3 // ease in over 1s, hold 3s, ease back out
@haptic off                        // cut to zero
@haptic off fade:5                 // ease down to zero over 5 seconds
```

Drives a Bluetooth vibrator or e-stim device directly from the script.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `intensity:` | Target intensity, 0.0-1.0 (scaled to whatever range the device uses) | 0.3 |
| `fade:` | Ramp time in seconds; 0 jumps immediately | 0 |
| `for:` | Hold this long (seconds), then ramp back to zero | 0 (hold until changed) |

**Non-blocking** — playback continues while the device runs. Intensity persists until the next `@haptic` command, so a script that ramps up must ramp back down.

**Connecting.** Press *Connect Device* in the controls and pick your device from the browser's pairing dialog. Requires a Chromium browser (Chrome, Edge) over HTTPS or localhost — Web Bluetooth does not exist in Firefox or Safari, and the control hides itself when it isn't available. Scripts containing `@haptic` play normally with nothing connected; the commands are simply ignored.

**The Max slider is a hard ceiling.** Every intensity a script asks for is clamped to it, it applies live (dragging it down cuts a running device immediately), and it persists across sessions. It defaults to 50%. A script written against someone else's tolerance cannot exceed your ceiling.

Output is cut to zero on manual pause, rewind, script end, and page close. Scripted `@pause`/`@snap` beats do **not** interrupt haptics — they are part of the script's pacing, same as the audio layers.

**Supported devices:** Lovense, We-Vibe, Satisfyer, LELO, Kiiroo, Svakom, Magic Motion, MysteryVibe, Aneros, and DG-Lab Coyote V2/V3 (e-stim). Device filters live in `js/haptic/device-config.json`, refreshable with `node scripts/update-devices.mjs`.

> E-stim can cause involuntary muscle contraction. Start low, raise the ceiling deliberately, and never place electrodes across the chest.

### Content Warnings
```
@cw Contains themes of identity dissolution.
@cw Explicit denial content.
```

`@cw` lines are extracted before playback and shown in a modal the reader must acknowledge before the script plays. They never appear in the word stream.

### Branching
```
@branch deny                      // jump to @label deny if the denial roll hits
...release path...
@goto end
@label deny
...deny path...
@label end
```

- `@label name` marks a position.
- `@goto name` jumps unconditionally.
- `@branch name` jumps only if the **denial roll** succeeds. The roll happens once per playthrough against the Denial slider percentage (0% = never branch, 100% = always). If the roll misses, playback falls through to the release path.

## The Editor

`editor.html` is a dedicated authoring page: script dropdown, live textarea, a **phase timeline** rendering the pulseborder color phases with branch/label/goto markers (click to scrub), word/duration stats, and **real-time lint** output as you type.

## The Linter

Scripts are validated against `joi_lint.json` by `lint.js` (Node, zero dependencies):

```bash
node lint.js                      # lint everything in scripts/
node lint.js scripts/demo.txt     # lint specific files
```

Rules are numbered `JOI-###` with error/warning/info severities and cover pacing structure: first green within N words, yellow must precede raspberry/purple edges, edge durations should escalate with variable reinforcement, red (no-touch) phases capped at a max duration, no close-your-eyes instructions (this is a *visual* medium), no personal references, and more. Which rules apply depends on the filename suffix (`_sfw`, `_nsfw`, `_cum`, default).

- Per-file opt-outs: `// @lint-disable JOI-011, JOI-016` at the top of a script.
- `js/lint-browser.js` runs the same rules in the editor.
- `.githooks/pre-push` blocks pushes on lint errors (enable with `git config core.hooksPath .githooks`).

## Audio Design Guide

### The Reactor Stack (Perfect Fifths)

The demo opens with five layers tuned in **perfect fifth intervals** (3:2 frequency ratio):

```
@binaural layers:202.5/4/7,135/3.5/4.6,90/3/3.3,60/2.5/2.55,303.75/4.5/5.5 fade:8
```

| Layer | Carrier | Beat | Pulse | Ratio to next |
|-------|---------|------|-------|---------------|
| high | 202.5 Hz | 4.0 Hz | 7.0 Hz | 1.5x |
| mid_high | 135 Hz | 3.5 Hz | 4.6 Hz | 1.5x |
| mid_low | 90 Hz | 3.0 Hz | 3.3 Hz | 1.5x |
| low | 60 Hz | 2.5 Hz | 2.55 Hz | (base) |
| fifth | 303.75 Hz | 4.5 Hz | 5.5 Hz | (above high) |

Perfect fifths are one of the most consonant intervals in music - stable, harmonious, and "resolved." This makes them a great baseline that listeners unconsciously perceive as "correct."

The pulse rates use **max-entropy spacing** - all pairs take 4+ seconds to synchronize, preventing repetitive beating patterns. This keeps the texture complex and alive.

### Creating Tension with Dissonance

To create psychological tension, drift multiple layers away from their perfect fifths simultaneously. The demo progressively deforms the stack during the speed ramp:

| Change | Freq | Ratio to partner | Interval | Feel |
|--------|------|-------------------|----------|------|
| mid_low baseline | 90 Hz | 135/90 = 1.500 | Perfect fifth | Consonant, stable |
| mid_low creep | 93 Hz | 135/93 = 1.452 | Between fifth and tritone | Slightly unsettled |
| mid_low peak | 95.5 Hz | 135/95.5 = 1.414 | **Exact tritone** | Maximally tense |
| mid_high drift | 138→140 Hz | 202.5/140 = 1.446 | Near tritone | Second dissonance axis |

The **tritone** (ratio of sqrt(2), roughly 1.414) is historically called "diabolus in musica" - the devil in music. It's the interval of maximum harmonic tension.

Beyond interval math, the demo amplifies dissonance by deforming **both** mid layers (tritone relationships with two different partners) and slowing the isochronic pulse rates during the drift, exposing the inter-carrier roughness that fast pulsing masks.

### The Drop Technique

The demo carries the **fifth layer at 303.75 Hz** from the start. It becomes part of the baseline texture - the listener habituates without knowing it's there.

At the snap (audio placed *before* `@snap` so both fire together):
```
@subliminals off
@binaural layers:202.5/4/7,135/3.5/4.6,90/3/3.3,60/2.5/2.55,120/1.5/2/0.5 fade:0.5
@snap duration:1500 word:Drop.
```
1. mid_low snaps back from 95.5 to 90 Hz — tritone resolves to perfect fifth
2. mid_high snaps back from 140 to 135 Hz — second tritone resolves
3. The habituated 303.75 Hz fifth is replaced by a quiet 120 Hz murmur
4. The snap fires with "Drop." displayed during the 1500ms pause

The drop isn't about adding something loud. It's about **removing something the listener didn't know they were relying on**, while simultaneously resolving the dissonance back to consonance. The brain registers both the absence and the relief.

### The Wake-Up Inversion

The wake-up section deliberately uses dissonance — detuned intervals and faster pulse rates pushing toward beta range — to make emergence feel *uncomfortable*. The listener's unconscious takeaway: the trance was the good part. Being awake is the wrong-sounding part. This inverts the usual framing where "coming back" is presented as positive.

The wake-up detuning is more aggressive than the tension buildup because the listener is in a more suggestible state post-drop. Subtlety matters less; the association between dissonance and waking is what matters.

### Tips for Script Creators

- **WPM is the induction.** Everything else is seasoning. A bare script with just `@wpm` ramps from 200→750→150 will induce on its own. Audio and visuals deepen what the speed already does.
- **Dissonance should build gradually.** Jump straight to a tritone and it just sounds bad. Drift there over 60+ seconds and it creates *tension*.
- **The drop = absence + resolution.** Kill one layer, resolve another. The contrast does the work.
- **Use `fade:` generously.** Long fades (10-30s) on frequency changes are subliminal. Short fades (0.1-0.5s) are dramatic events.
- **Reissuing `@binaural` = keyframing.** Each command crossfades the running layers to the new values over the fade duration. The engine interpolates smoothly.
- **Beat frequencies guide brainwave state:** 1-4 Hz = delta (deep sleep), 4-8 Hz = theta (trance/meditation), 8-12 Hz = alpha (relaxed), 12-30 Hz = beta (alert). The reactor stack uses theta-range beats.
- **Pair consonance with surrender, dissonance with waking.** This trains the listener to want the trance state back.
- **@snap and @pause are blocking.** They pause playback for their duration. Place non-blocking commands (`@sfx`, audio, visual changes) *before* them so they fire at the right moment. `word:` displays during the pause without consuming the next word in the script flow.
- **Reserve @snap for compliance triggers.** Use `@pause` for dramatic silences and vocalization gaps. Use `@sfx bell` + `@pause` for speaking prompts. Keep snap's sound+flash associated with obedience cues (Blank/Stop/Drop/Good).
- **Run the linter.** The JOI rules encode the pacing lessons above; a clean lint pass is a decent proxy for a well-structured script.

## Sharing Scripts

### Short scripts (< 2KB)
Click **Share** - the script is base64-encoded into the URL and copied to clipboard.

### Longer scripts
Paste your script to a CORS-friendly service, then share with `?paste=URL`:
- **[rentry.co](https://rentry.co)** - Paste, get URL, share as `?paste=https://rentry.co/yourpaste`
- **[dpaste.org](https://dpaste.org)** - Same idea
- **[gist.github.com](https://gist.github.com)** - Create a gist, share as `?paste=https://gist.github.com/user/id`

The app automatically converts paste URLs to their raw content endpoints.

## Keyboard Shortcuts

- `Space` - Play/Pause
- `R` - Rewind (restart from beginning; keeps playing if was playing)
- `L` - Toggle loop mode
- `F` - Fullscreen
- `Up/Down` - Adjust WPM

## Local Development

```bash
git clone https://github.com/EcstasyEngineer/speedwasher.git
cd speedwasher
python -m http.server 8000
# Open http://localhost:8000
```

No build step. No dependencies. Just static files.

Haptics need a secure context, so the device picker will not open over plain `http://` on a LAN address — use `localhost`, or serve over HTTPS to test from a phone.

## Credits

- BLE device filters and vibrator command formats: [buttplug.io](https://github.com/buttplugio/buttplug) (BSD-3-Clause, Nonpolynomial Labs LLC)
- Coyote e-stim protocol: [DG-LAB-OPENSOURCE](https://github.com/DG-LAB-OPENSOURCE/DG-LAB-OPENSOURCE) (MIT)

## Status

Actively developed. The command surface and playback engine are stable; the script library is under continuous revision against the lint rules.

---

*Speed reading + brainwashing = SpeedWashing*
