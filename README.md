# SpeedWashing

**RSVP speed reading meets hypnotic scripts.**

A web-based tool that uses Rapid Serial Visual Presentation (RSVP) to deliver text one word at a time at high speeds. Originally designed for speed reading training, this implementation explores the hypnotic potential of forced-focus rapid text delivery.

**[Try it live](https://ecstasyengineer.github.io/speedwashing/)**

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

## Features

- **Variable speed**: 100-1200 WPM with proportional punctuation pauses
- **Script commands**: Control speed, visuals, and audio inline
- **Three audio modes**: Binaural beats, isochronic tones, and hybrid (both)
- **Named layers**: Up to 8 simultaneous audio layers, each independently keyframeable
- **Spiral visual**: Rotating background spiral for enhanced focus
- **Subliminals**: Peripheral word flashing during high-speed sections
- **Snap induction**: Audio + white flash for trance drops
- **Pause**: Silent blocking pause (like snap without sound/flash)
- **Sound effects**: `@sfx name [vol:0-1]` plays custom sounds non-blocking (drop files in `audio/sfx/`)
- **Pulse border**: Pulsing colored glow for ambient state indication
- **Loop & rewind**: Loop toggle, rewind-to-start, shareable `loop=1` URL param
- **Script comments**: `//` comments (full-line or inline)
- **Sharable links**: Share scripts via URL (base64 or paste service links)
- **Fullscreen mode**: Immersive distraction-free reading

## Script Commands

All parameters (except `@wpm` and layer names) use explicit `key:value` syntax.

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

### Audio - Three Modes

All three modes support **named layers**. Reusing a name transitions to the new values (keyframing). Name is optional (defaults to `_default`) — it's the first token if it starts with a letter and has no colon.

```
@binaural [name] carrier:N beat:N db:N fade:N vol:N interleave:N   // frequency split between ears
@isochronic [name] carrier:N pulse:N db:N ear:L|R|LR fade:N vol:N // pulsed on/off carrier
@hybrid [name] carrier:N beat:N pulse:N db:N fade:N vol:N         // binaural + isochronic
@<mode> [name] off [fade:N]                                        // stop layer(s)
```

**Binaural** - Two slightly different frequencies, one per ear. The brain perceives a "beat" at the difference frequency. Pure sine tones, no pulsing.

**Isochronic** - A single carrier pulsed on and off with a raised cosine envelope. Both ears hear the same thing (or route to L/R only). No frequency split.

**Hybrid** - Binaural frequency split AND isochronic pulsing. L/R envelopes are 180 degrees out of phase (when left peaks, right troughs).

| Parameter | Description | Default |
|-----------|-------------|---------|
| `carrier:` | Base frequency in Hz | 200 |
| `beat:` | Binaural beat frequency in Hz | 0 |
| `pulse:` | Isochronic pulse rate in Hz | 0 |
| `db:` | Layer amplitude relative to master (0 = full, -6 = half power) | 0 |
| `fade:` | Transition time in seconds | 2 |
| `vol:` | Master volume 0-0.8 (sticky once set) | 0.15 |
| `interleave:` | R channel delay in ms for spatial width | 0 |
| `ear:` | Ear routing: L, R, or LR (isochronic only) | LR |

**Examples:**
```
@hybrid bass carrier:312 beat:3 pulse:5 db:0 vol:0.15 fade:8   // start "bass" layer
@hybrid bass carrier:200 beat:2 pulse:3 db:-6 fade:30          // keyframe to new params over 30s
@binaural fifth carrier:303.75 beat:4.5 db:-4 fade:15          // add binaural layer "fifth"
@binaural fifth off fade:0.1                                    // kill "fifth" instantly
@hybrid off fade:2                                              // stop ALL layers with 2s fade
```

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
| `opacity:` | Target opacity 0-1 | 0.3 |
| `speed:` | Rotations per second | 1 |
| `fade:` | Fade duration in seconds | 1 |

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
@hybrid layer off fade:0.1        // these fire immediately
@subliminals off
@snap duration:1500 word:Drop.    // then the snap fires
```

### Pause
```
@pause duration:2500              // silent pause, blank display, 2500ms
@pause duration:2000 word:Hold.   // silent pause with word shown
@pause                            // default 800ms blank pause
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| `duration:` | Pause duration in ms | 800 |
| `word:` | Word to display during pause | (blank) |

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
```

| Parameter | Description | Default |
|-----------|-------------|---------|
| (name) | Sound file name (looks in `audio/sfx/`) | (required) |
| `vol:` | Playback volume 0.0-1.0 | 0.7 |

**Non-blocking** — just plays the sound, playback continues immediately. Files are lazy-loaded and cached (`.ogg` then `.mp3` fallback). Drop files in `audio/sfx/` and reference by name.

### Pulse Border
```
@pulseborder green hz:0.33        // slow green pulse
@pulseborder yellow hz:0.5        // medium amber pulse
@pulseborder purple hz:0.5        // purple
@pulseborder raspberry hz:0.5     // hot pink / magenta
@pulseborder red hz:0.75          // red
@pulseborder #8B5CF6 hz:0.5      // custom hex color
@pulseborder off fade:1           // fade out
```

Pulsing inset glow on the RSVP container for persistent ambient state indication. The glow pulses between 25% and 100% intensity (never fully off while active). Use colors to communicate whatever you want — traffic light logic, intensity levels, mood shifts. You'll figure it out.

| Parameter | Description | Default |
|-----------|-------------|---------|
| (color) | Named (`green`, `yellow`, `purple`, `raspberry`, `red`) or hex | green |
| `hz:` | Pulse frequency (cycles per second) | 0.33 |
| `fade:` | Transition time in seconds when switching/stopping | 1 |

## Audio Design Guide

### The Reactor Preset (Perfect Fifths)

The default demo uses four hybrid layers tuned in **perfect fifth intervals** (3:2 frequency ratio):

```
@hybrid high carrier:202.5 beat:4 pulse:7 db:0 vol:0.15 fade:8
@hybrid mid_high carrier:135 beat:3.5 pulse:4.6 db:-4 fade:8
@hybrid mid_low carrier:90 beat:3 pulse:3.3 db:-6 fade:8
@hybrid low carrier:60 beat:2.5 pulse:2.55 db:-8 fade:8
@hybrid fifth carrier:303.75 beat:4.5 pulse:5.5 db:-8 fade:8
```

| Layer | Carrier | Beat | Pulse | Amp | Ratio to next |
|-------|---------|------|-------|-----|---------------|
| high | 202.5 Hz | 4.0 Hz | 7.0 Hz | 0 dB | 1.5x |
| mid_high | 135 Hz | 3.5 Hz | 4.6 Hz | -4 dB | 1.5x |
| mid_low | 90 Hz | 3.0 Hz | 3.3 Hz | -6 dB | 1.5x |
| low | 60 Hz | 2.5 Hz | 2.55 Hz | -8 dB | (base) |

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

Three mechanisms amplify the dissonance beyond just interval math:
- **Multi-layer deformation**: Both mid_low AND mid_high drift, creating tritone relationships with two different partners
- **Amplitude boost**: mid_low rises from -6 to -2 dB at peak tension (roughness scales with amplitude product)
- **Pulse rate slowdown**: Isochronic pulsing slows from ~3.3 Hz to ~1.5 Hz, exposing the inter-carrier roughness that fast pulsing masks

### The Drop Technique

The demo includes a **fifth layer at 303.75 Hz** (the next perfect fifth above the reactor stack) from the start. It's quiet (-8 dB) and becomes part of the baseline texture - the listener habituates without knowing it's there.

At the snap (note: audio changes placed *before* `@snap` so they fire simultaneously):
```
@hybrid fifth carrier:120 beat:1.5 pulse:2 db:-20 fade:3.5
@hybrid mid_low carrier:90 beat:3 pulse:3.3 db:-6 fade:0.5
@hybrid mid_high carrier:135 beat:3.5 pulse:4.6 db:-4 fade:0.5
@snap duration:1500 word:Drop.
```
1. The fifth layer is crushed to near-silence (`db:-20`)
2. mid_low snaps back from 95.5 to 90 Hz — tritone resolves to perfect fifth
3. mid_high snaps back from 140 to 135 Hz — second tritone resolves
4. The snap fires with "Drop." displayed during the 1500ms pause

The drop isn't about adding something loud. It's about **removing something the listener didn't know they were relying on**, while simultaneously resolving the dissonance back to consonance. The brain registers both the absence and the relief.

### The Wake-Up Inversion

The wake-up section deliberately uses dissonance — detuned intervals and faster pulse rates pushing toward beta range — to make emergence feel *uncomfortable*. The listener's unconscious takeaway: the trance was the good part. Being awake is the wrong-sounding part. This inverts the usual framing where "coming back" is presented as positive.

The wake-up detuning is more aggressive than the tension buildup (ratios of 1.33 and 1.42 vs the pre-drop 1.41) because the listener is in a more suggestible state post-drop. Subtlety matters less; the association between dissonance and waking is what matters.

### Tips for Script Creators

- **WPM is the induction.** Everything else is seasoning. A bare script with just `@wpm` ramps from 200→750→150 will induce on its own. Audio and visuals deepen what the speed already does.
- **Dissonance should build gradually.** Jump straight to a tritone and it just sounds bad. Drift there over 60+ seconds and it creates *tension*.
- **The drop = absence + resolution.** Kill one layer, resolve another. The contrast does the work.
- **Use `fade:` generously.** Long fades (10-30s) on frequency changes are subliminal. Short fades (0.1-0.5s) are dramatic events.
- **Layer naming = keyframing.** Every time you use `@hybrid mid_low carrier:... beat:...`, you're setting a new keyframe for that layer. The engine interpolates smoothly.
- **Beat frequencies guide brainwave state:** 1-4 Hz = delta (deep sleep), 4-8 Hz = theta (trance/meditation), 8-12 Hz = alpha (relaxed), 12-30 Hz = beta (alert). The reactor uses theta-range beats.
- **Pair consonance with surrender, dissonance with waking.** This trains the listener to want the trance state back.
- **@snap and @pause are blocking.** They pause playback for their duration. Place non-blocking commands (`@sfx`, audio, visual changes) *before* them so they fire at the right moment. `word:` displays during the pause without consuming the next word in the script flow.
- **Reserve @snap for compliance triggers.** Use `@pause` for dramatic silences and vocalization gaps. Use `@sfx bell` + `@pause` for speaking prompts. Keep snap's sound+flash associated with obedience cues (Blank/Stop/Drop/Good).

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
git clone https://github.com/EcstasyEngineer/speedwashing.git
cd speedwashing
python -m http.server 8000
# Open http://localhost:8000
```

No build step. No dependencies. Just static files.

## License

MIT

---

*Speed reading + brainwashing = SpeedWashing*
