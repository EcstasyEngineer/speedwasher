# SpeedWashing

**RSVP Speed Reading + Hypnotic Script Delivery**

A web-based RSVP (Rapid Serial Visual Presentation) reader that combines speed reading techniques with hypnotic script delivery. Inspired by the [Spritz](https://spritz.com/) speed reading method.

## Concept

Speed reading via RSVP forces single-point focus by flashing one word at a time with an **Optimal Recognition Point (ORP)** highlighted. This creates:

1. **Forced absorption** - No skipping ahead, no backtracking
2. **Reduced subvocalization** - Reading faster than you can speak internally
3. **Hypnotic potential** - The rhythm and forced attention create trance-like states

### The Hypnotic Application

Traditional hypnosis scripts rely on slow, deliberate pacing. But what if we flip it?

- **Cognitive overload** - At 600-900 WPM, conscious analysis becomes impossible
- **Direct absorption** - Suggestions bypass the critical faculty
- **Rhythmic induction** - The steady pulse of words becomes entrancing

**Key question to explore**: Does speed reading compete with or enhance dissociation?

Possible approaches:
- **Constant acceleration** - Build up speed for overload effect
- **Variable pacing** - Fast for induction, slow for key suggestions
- **Wave patterns** - Oscillate between speeds for hypnotic rhythm

## Technical Details

### RSVP Format

Each word is displayed with:
- **White text** on black background
- **Red ORP letter** - The "pivot point" where eyes should focus
- **Center alignment** - ORP always aligns to the same screen position
- **WPM indicator** - Shows current reading speed

### ORP Algorithm (Spritz-style)

The Optimal Recognition Point is typically 20-35% into the word:

```javascript
function getORPIndex(word) {
  const len = word.length;
  if (len <= 1) return 0;
  if (len <= 4) return 1;  // 2nd character
  if (len <= 8) return 2;  // 3rd character
  if (len <= 13) return 3; // 4th character
  return 4;                // 5th character for very long words
}
```

### WPM Reference (from source video)

| Timestamp | WPM | ms/word |
|-----------|-----|---------|
| 0:00 | 300 | 200ms |
| 0:13 | 360 | 167ms |
| 0:47 | 450 | 133ms |
| 1:23 | 600 | 100ms |
| 2:06 | 900 | 67ms |

## Project Structure

```
speedwashing/
├── README.md
├── index.html          # Main GitHub Pages app
├── css/
│   └── style.css       # RSVP styling
├── js/
│   ├── app.js          # Main application
│   ├── rsvp.js         # RSVP engine
│   └── orp.js          # ORP calculation
├── scripts/
│   └── default.txt     # Default demo script
├── data/
│   └── source_transcript.csv  # OCR'd original video
└── tools/
    └── analyze_frames.py      # Video analysis script
```

## Features (Planned)

### MVP
- [ ] Basic RSVP player with ORP highlighting
- [ ] WPM control (slider or presets)
- [ ] Paste-your-own-script input
- [ ] Play/pause/restart controls

### Enhanced
- [ ] Variable speed zones (mark sections for different WPM)
- [ ] Preset hypnotic scripts
- [ ] Audio integration (background drone, binaural beats)
- [ ] Session history/progress tracking
- [ ] Full-screen immersive mode

### Advanced
- [ ] Script editor with WPM annotations
- [ ] Export scripts as video
- [ ] WebVR support for immersive reading
- [ ] Physiological integration (HRV, eye tracking)

## Data Format

### Script CSV Format

```csv
word,timestamp_ms,orp_index,wpm
Let's,600,1,300
see,800,1,300
if,1000,1,300
you,1200,1,300
can,1400,1,300
keep,1600,1,300
up,1800,1,300
with,2000,1,300
```

### Script Text Format (Simple)

```
@wpm 300
Let's see if you can keep up with reading this text.
@wpm 450
Now we're going faster. Can you still follow along?
@wpm 600
Your mind is absorbing these words directly now.
```

## Development

### Prerequisites
- Python 3.x (for analysis tools)
- Modern web browser

### Running Locally
```bash
# Serve the directory
python -m http.server 8000

# Open http://localhost:8000
```

### Video Analysis
```bash
# Create venv and install deps
python -m venv venv
source venv/bin/activate
pip install pillow numpy pytesseract

# Run frame extraction (requires ffmpeg)
ffmpeg -i source.mp4 -vf "fps=15" analysis_frames/frame_%04d.png

# Analyze frames
python tools/analyze_frames.py
```

## Research Questions

1. **Absorption vs Dissociation**: Does the focused absorption of speed reading complement or compete with hypnotic dissociation?

2. **Optimal WPM for suggestions**: Is there a sweet spot where suggestions are absorbed most effectively?

3. **Acceleration patterns**: Linear ramp-up vs sudden jumps vs oscillating patterns?

4. **Content adaptation**: Should different types of content (inductions, deepeners, suggestions) use different speeds?

5. **Recovery/integration**: Should sessions end with a slowdown period?

## References

- [Spritz Technology](https://spritz.com/) - Original RSVP speed reading
- [RSVP Reading Research](https://en.wikipedia.org/wiki/Rapid_serial_visual_presentation)
- [Bionic Reading](https://bionic-reading.com/) - Related technique using bold beginnings

## License

MIT

---

*Project inception: Inspired by a viral speed reading video and the question "what if we did this with a hypnotic script instead?"*
