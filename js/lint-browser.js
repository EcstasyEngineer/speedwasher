/**
 * Browser-compatible JOI script linter.
 * Extracted from lint.js for use in the editor.
 */

const LintEngine = (() => {
    const DEFAULT_WPM = 300;

    const PULSE_COLORS = {
        green: '#22c55e', yellow: '#eab308', purple: '#8B5CF6',
        raspberry: '#e91e8c', red: '#ef4444', pink: '#ec4899'
    };

    function parseScript(text) {
        const lines = text.split('\n');
        const events = [];
        let currentWPM = DEFAULT_WPM;
        let wordIndex = 0;
        let lineNum = 0;

        for (const rawLine of lines) {
            lineNum++;
            const trimmed = rawLine.trim();
            const stripped = trimmed.replace(/\s+\/\/.*$/, '').replace(/^\/\/.*$/, '');
            if (!stripped) continue;

            const wpmMatch = stripped.match(/^@wpm\s+(\d+)/i);
            if (wpmMatch) {
                currentWPM = parseInt(wpmMatch[1], 10);
                events.push({ type: 'wpm', line: lineNum, wpm: currentWPM, wordIndex });
                continue;
            }

            const pulseMatch = stripped.match(/^@pulseborder\s+(.+)/i);
            if (pulseMatch) {
                const args = pulseMatch[1].trim();
                const color = args.split(/\s+/)[0].toLowerCase();
                events.push({ type: 'pulseborder', line: lineNum, color, args, wordIndex, wpm: currentWPM });
                continue;
            }

            const sfxMatch = stripped.match(/^@sfx\s+(.+)/i);
            if (sfxMatch) {
                events.push({ type: 'sfx', line: lineNum, args: sfxMatch[1].trim(), wordIndex, wpm: currentWPM });
                continue;
            }

            const snapMatch = stripped.match(/^@snap(?:\s+(.+))?$/i);
            if (snapMatch) {
                let pauseMs = 800, snapWord = '';
                if (snapMatch[1]) {
                    for (const token of snapMatch[1].trim().split(/\s+/)) {
                        if (token.startsWith('duration:')) pauseMs = parseInt(token.split(':')[1], 10) || 800;
                        else if (token.startsWith('word:')) snapWord = token.split(':')[1] || '';
                    }
                }
                events.push({ type: 'snap', line: lineNum, pauseMs, snapWord, wordIndex, wpm: currentWPM });
                continue;
            }

            const pauseMatch = stripped.match(/^@pause(?:\s+(.+))?$/i);
            if (pauseMatch) {
                let pauseMs = 800;
                if (pauseMatch[1]) {
                    for (const token of pauseMatch[1].trim().split(/\s+/)) {
                        if (token.startsWith('duration:')) pauseMs = parseInt(token.split(':')[1], 10) || 800;
                    }
                }
                events.push({ type: 'pause', line: lineNum, pauseMs, wordIndex, wpm: currentWPM });
                continue;
            }

            if (/^@(spiral|subliminals|binaural|cw)\s/i.test(stripped)) continue;
            if (/^@\w/i.test(stripped)) continue;

            const lineWords = stripped.split(/\s+/).filter(w => w.length > 0);
            for (const w of lineWords) {
                events.push({ type: 'word', line: lineNum, text: w, wordIndex, wpm: currentWPM });
                wordIndex++;
            }
        }
        return { events, totalWords: wordIndex };
    }

    function getWordInterval(wpm, word) {
        wpm = Math.max(1, wpm);
        const base = Math.round(60000 / wpm);
        const last = word.slice(-1);
        let interval = base;
        if ('.!?'.includes(last)) interval = Math.round(base * 2);
        else if (',;:'.includes(last)) interval = Math.round(base * 1.4);
        return Math.max(10, interval);
    }

    function calculatePhaseDuration(events, startIdx, endIdx) {
        let totalMs = 0;
        for (let i = startIdx; i < endIdx; i++) {
            const ev = events[i];
            if (ev.type === 'word') totalMs += getWordInterval(ev.wpm, ev.text);
            else if (ev.type === 'snap') totalMs += ev.pauseMs;
            else if (ev.type === 'pause') totalMs += ev.pauseMs;
        }
        return totalMs / 1000;
    }

    function extractColorPhases(events) {
        const phases = [];
        let currentColor = 'off';
        let phaseStart = 0;
        let phaseStartLine = 0;
        let phaseWords = 0;

        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (ev.type === 'pulseborder') {
                if (currentColor !== 'off' || phaseWords > 0) {
                    phases.push({
                        color: currentColor,
                        startLine: phaseStartLine,
                        startIdx: phaseStart,
                        endIdx: i,
                        words: phaseWords,
                        durationSec: calculatePhaseDuration(events, phaseStart, i)
                    });
                }
                currentColor = ev.color;
                phaseStart = i;
                phaseStartLine = ev.line;
                phaseWords = 0;
            } else if (ev.type === 'word') {
                phaseWords++;
            }
        }
        if (phaseStart < events.length) {
            phases.push({
                color: currentColor,
                startLine: phaseStartLine,
                startIdx: phaseStart,
                endIdx: events.length,
                words: phaseWords,
                durationSec: calculatePhaseDuration(events, phaseStart, events.length)
            });
        }
        return phases;
    }

    function lint(text, filename) {
        const findings = [];
        const { events, totalWords } = parseScript(text);
        const phases = extractColorPhases(events);
        const report = (rule, msg, severity) => findings.push({ rule, msg, severity: severity || 'warning' });

        // JOI-019: No emdashes
        const textLines = text.split('\n');
        for (let i = 0; i < textLines.length; i++) {
            const line = textLines[i];
            if (line.trimStart().startsWith('//')) continue;
            if (line.includes('\u2014') || line.includes('\u2013')) {
                report('JOI-019', `Em/en dash at line ${i + 1}`, 'error');
            }
        }

        // JOI-051: Long hyphenated words
        for (let i = 0; i < textLines.length; i++) {
            const line = textLines[i];
            if (line.trimStart().startsWith('//') || line.trimStart().startsWith('@')) continue;
            const matches = line.match(/\b\w+-\w+(?:-\w+)*\b/g);
            if (matches) {
                for (const m of matches) {
                    if (m.length > 12) report('JOI-051', `Long word "${m}" (${m.length} chars) at line ${i + 1}`);
                }
            }
        }

        // JOI-052: Max red duration
        for (const phase of phases) {
            if (phase.color === 'red' && phase.durationSec > 30) {
                report('JOI-052', `RED at line ${phase.startLine} is ${phase.durationSec.toFixed(1)}s (max 30s)`);
            }
        }

        // JOI-004: Yellow must precede purple/raspberry
        for (let i = 0; i < phases.length; i++) {
            const p = phases[i];
            if ((p.color === 'raspberry' || p.color === 'purple') && i > 0) {
                const prev = phases[i - 1];
                if (prev.color !== 'yellow' && prev.color !== 'purple') {
                    report('JOI-004', `${p.color} at line ${p.startLine} not preceded by yellow`, 'error');
                }
            }
        }

        return { findings, events, phases, totalWords };
    }

    function getTotalDuration(events) {
        let totalMs = 0;
        for (const ev of events) {
            if (ev.type === 'word') totalMs += getWordInterval(ev.wpm, ev.text);
            else if (ev.type === 'snap') totalMs += ev.pauseMs;
            else if (ev.type === 'pause') totalMs += ev.pauseMs;
        }
        return totalMs / 1000;
    }

    return { parseScript, extractColorPhases, lint, getTotalDuration, PULSE_COLORS, getWordInterval };
})();
