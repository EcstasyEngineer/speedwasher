# SpeedWashing

**RSVP speed reading meets hypnotic scripts.**

A web-based tool that uses Rapid Serial Visual Presentation (RSVP) to deliver text one word at a time at high speeds. Originally designed for speed reading training, this implementation explores the hypnotic potential of forced-focus rapid text delivery.

**[Try it live](https://ecstasyengineer.github.io/speedwashing/)**

## How It Works

Words flash one at a time with a red **Optimal Recognition Point (ORP)** - the letter your eye should fixate on. Your eyes stay fixed while words stream directly into your visual cortex.

At higher speeds (600+ WPM), conscious analysis can't keep up. The words just... go in.

## Features

- **Variable speed**: 100-1200 WPM with proportional punctuation pauses
- **Script commands**: Control speed, visuals, and audio inline
- **Three audio modes**: Binaural beats, isochronic tones, and hybrid (both)
- **Named layers**: Up to 8 simultaneous audio layers, each independently keyframeable
- **Spiral visual**: Rotating background spiral for enhanced focus
- **Subliminals**: Peripheral word flashing during high-speed sections
- **Snap induction**: Audio + white flash for trance drops
- **Sharable links**: Share scripts via URL (base64 or paste service links)
- **Fullscreen mode**: Immersive distraction-free reading

## Script Commands

### Speed
```
@wpm 300                    Set reading speed to 300 words per minute
```

### Audio - Three Modes

All three modes support **named layers**. Reusing a name transitions to the new values (keyframing). Name is optional (defaults to `_default`).

```
@binaural [name] <carrier> <beat> [amp_db] [fade:N] [vol:N] [interleave:N]
@isochronic [name] <carrier> <pulse> [amp_db] [L|R|LR] [fade:N] [vol:N]
@hybrid [name] <carrier> <beat> <pulse> [amp_db] [fade:N] [vol:N] [interleave:N]
```

**Binaural** - Two slightly different frequencies, one per ear. The brain perceives a "beat" at the difference frequency. Pure sine tones, no pulsing.

**Isochronic** - A single carrier pulsed on and off with a raised cosine envelope. Both ears hear the same thing (or route to L/R only). No frequency split.

**Hybrid** - Binaural frequency split AND isochronic pulsing. L/R envelopes are 180 degrees out of phase (when left peaks, right troughs).

**Parameter order** (matches [hypnocli](https://github.com/EcstasyEngineer/hypnocli)):
| Mode | Positional params |
|------|------------------|
| binaural | carrier, beat, amplitude_db |
| isochronic | carrier, pulse_rate, amplitude_db |
| hybrid | carrier, beat, pulse_rate, amplitude_db |

**Options:**
- `fade:N` - Transition time in seconds (default 2)
- `vol:N` - Master volume 0-0.8 (default 0.15, sticky once set)
- `interleave:N` - R channel delay in ms for spatial width (default 0)
- `amp_db` - Layer volume relative to master. 0 = full, -6 = half power, -12 = quarter

**Examples:**
```
@hybrid bass 312 3 5 0 vol:0.15 fade:8     Start "bass" layer: 312Hz carrier, 3Hz beat, 5Hz pulse, 0dB
@hybrid bass 200 2 3 -6 fade:30            Keyframe: transition "bass" to new params over 30s
@binaural fifth 303.75 4.5 -4 fade:15      Add a pure binaural layer called "fifth"
@binaural fifth off fade:0.1               Kill "fifth" instantly
@hybrid off fade:2                          Stop ALL layers with 2s fade
```

### Visuals
```
@spiral on #8B5CF6 0.3 0.5 fade:2          Purple spiral, 30% opacity, 0.5 rot/sec, 2s fade
@spiral off fade:1                          Fade out

@subliminals 0.4 fade:0.5 empty drift sink  Flash words at 40% opacity
@subliminals off fade:0.3                    Stop
```

### Effects
```
@snap 1000                                  Snap sound + white flash + 1000ms pause
```

## Audio Design Guide

### The Reactor Preset (Perfect Fifths)

The default demo uses four hybrid layers tuned in **perfect fifth intervals** (3:2 frequency ratio):

| Layer | Carrier | Beat | Pulse | Amp | Ratio to next |
|-------|---------|------|-------|-----|---------------|
| high | 202.5 Hz | 4.0 Hz | 7.0 Hz | 0 dB | 1.5x |
| mid_high | 135 Hz | 3.5 Hz | 4.6 Hz | -4 dB | 1.5x |
| mid_low | 90 Hz | 3.0 Hz | 3.3 Hz | -6 dB | 1.5x |
| low | 60 Hz | 2.5 Hz | 2.55 Hz | -8 dB | (base) |

Perfect fifths are one of the most consonant intervals in music - stable, harmonious, and "resolved." This makes them a great baseline that listeners unconsciously perceive as "correct."

The pulse rates use **max-entropy spacing** - all pairs take 4+ seconds to synchronize, preventing repetitive beating patterns. This keeps the texture complex and alive.

### Creating Tension with Dissonance

To create psychological tension, nudge one layer away from its perfect fifth. The demo drifts `mid_low` during the speed ramp:

| mid_low freq | Ratio to 135 Hz | Musical interval | Feel |
|-------------|-----------------|-----------------|------|
| 90 Hz | 1.500 | Perfect fifth | Consonant, stable |
| 93 Hz | 1.452 | Between fifth and tritone | Slightly unsettled |
| 96 Hz | 1.406 | Near tritone (1.414 = tritone) | Clearly tense |

The **tritone** (ratio of sqrt(2), roughly 1.414) is historically called "diabolus in musica" - the devil in music. It's the interval of maximum harmonic tension. 96 Hz puts mid_low within 1% of a tritone relationship with mid_high, which is close enough for the brain to register as "wrong" without being able to articulate why.

Going to exactly 95.46 Hz (the mathematical tritone from 135) would be maximum dissonance. Staying at 96 is "almost the worst" - unsettling but not jarring.

### The Drop Technique

The demo adds a pure **binaural layer at 303.75 Hz** (the next perfect fifth *above* the reactor stack) during the buildup. This becomes part of the texture - the listener habituates to it.

At the snap:
1. The 303.75 Hz binaural layer is killed instantly (`fade:0.1`)
2. mid_low snaps back from 96 to 90 Hz (`fade:0.5`)
3. Everything else stays

The drop isn't about adding something loud. It's about **removing something the listener didn't know they were relying on**, while simultaneously resolving the dissonance back to consonance. The brain registers both the absence and the relief.

### Tips for Script Creators

- **Dissonance should build gradually.** Jump straight to a tritone and it just sounds bad. Drift there over 60+ seconds and it creates *tension*.
- **The drop = absence + resolution.** Kill one layer, resolve another. The contrast does the work.
- **Use `fade:` generously.** Long fades (10-30s) on frequency changes are subliminal. Short fades (0.1-0.5s) are dramatic events.
- **Layer naming = keyframing.** Every time you use `@hybrid mid_low ...`, you're setting a new keyframe for that layer. The engine interpolates smoothly.
- **Beat frequencies guide brainwave state:** 1-4 Hz = delta (deep sleep), 4-8 Hz = theta (trance/meditation), 8-12 Hz = alpha (relaxed), 12-30 Hz = beta (alert). The reactor uses theta-range beats.

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
- `R` - Restart
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
