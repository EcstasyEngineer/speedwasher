# SpeedWashing

**RSVP speed reading meets hypnotic scripts.**

A web-based tool that uses Rapid Serial Visual Presentation (RSVP) to deliver text one word at a time at high speeds. Originally designed for speed reading training, this implementation explores the hypnotic potential of forced-focus rapid text delivery.

**[Try it live](https://ecstasyengineer.github.io/speedwashing/)**

## How It Works

Words flash one at a time with a red **Optimal Recognition Point (ORP)** - the letter your eye should fixate on. Your eyes stay fixed while words stream directly into your visual cortex.

At higher speeds (600+ WPM), conscious analysis can't keep up. The words just... go in.

## Features

- **Variable speed**: 100-1200 WPM with proportional punctuation pauses
- **Script commands**: Control speed, visuals, and effects inline
- **Spiral visual**: Rotating background spiral for enhanced focus
- **Subliminals**: Peripheral word flashing during high-speed sections
- **Snap induction**: Audio + white flash for trance drops
- **Fullscreen mode**: Immersive distraction-free reading

## Script Commands

```
@wpm 300
Sets reading speed to 300 words per minute.

@spiral on #8B5CF6 0.3 0.5 fade:2
Enables purple spiral at 30% opacity, 0.5 rotations/sec, 2s fade in.

@spiral off fade:1
Fades spiral out over 1 second.

@subliminals 0.4 fade:0.5 empty drift sink deeper
Flashes words at 40% opacity with 0.5s fade.

@subliminals off fade:0.3
Stops subliminals.

@snap 1000
Plays snap sound, white flash, 1000ms pause.
```

## Keyboard Shortcuts

- `Space` - Play/Pause
- `R` - Restart
- `F` - Fullscreen
- `↑/↓` - Adjust WPM

## The Hypnotic Angle

Traditional hypnosis uses slow, deliberate pacing. SpeedWashing flips it:

- **Cognitive overload** bypasses the critical faculty
- **Forced focus** creates absorption similar to trance
- **Speed transitions** mirror deepening (fast→snap→slow)
- **Subliminals** plant suggestions in peripheral vision

The included demo script demonstrates a full induction arc: challenge → escalation → overload → snap → trance → wake.

## Local Development

```bash
# Clone and serve
git clone https://github.com/EcstasyEngineer/speedwashing.git
cd speedwashing
python -m http.server 8000
# Open http://localhost:8000
```

## Future Ideas

- `@binaural` - Background binaural beats
- `@pause` - Timed pauses without snap
- Export scripts as video
- Physiological integration (HRV, eye tracking)

## License

MIT

---

*Speed reading + brainwashing = SpeedWashing*
