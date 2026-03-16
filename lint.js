#!/usr/bin/env node
/**
 * JOI Script Linter for SpeedWashing
 *
 * Validates .txt scripts in scripts/ against joi_lint.json rules.
 * No dependencies. Run: node lint.js [optional specific files...]
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const RULES_FILE = path.join(ROOT, 'joi_lint.json');
const DEFAULT_WPM = 300;

// ─── Load rules ──────────────────────────────────────────────────────────────

const config = JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
const { rules, file_categories, deployment_variants } = config;

// ─── Script parser (mirrors rsvp.js logic) ───────────────────────────────────

/**
 * Parse a script file into a sequence of events.
 * Each event: { type, line, wordIndex, wpm, color, args, text, pauseMs }
 * Returns { events, words, totalWords }
 */
function parseScript(text) {
    const lines = text.split('\n');
    const events = [];
    let currentWPM = DEFAULT_WPM;
    let wordIndex = 0;
    let lineNum = 0;

    for (const rawLine of lines) {
        lineNum++;
        const trimmed = rawLine.trim();

        // Strip comments
        const stripped = trimmed.replace(/\s+\/\/.*$/, '').replace(/^\/\/.*$/, '');
        if (!stripped) continue;

        // @wpm
        const wpmMatch = stripped.match(/^@wpm\s+(\d+)/i);
        if (wpmMatch) {
            currentWPM = parseInt(wpmMatch[1], 10);
            events.push({ type: 'wpm', line: lineNum, wpm: currentWPM, wordIndex });
            continue;
        }

        // @pulseborder
        const pulseMatch = stripped.match(/^@pulseborder\s+(.+)/i);
        if (pulseMatch) {
            const args = pulseMatch[1].trim();
            const tokens = args.split(/\s+/);
            const colorToken = tokens[0].toLowerCase();
            let color = colorToken;
            // Normalize purple -> purple, raspberry -> raspberry
            if (color === 'off') {
                events.push({ type: 'pulseborder', line: lineNum, color: 'off', args, wordIndex, wpm: currentWPM });
            } else {
                events.push({ type: 'pulseborder', line: lineNum, color, args, wordIndex, wpm: currentWPM });
            }
            continue;
        }

        // @sfx
        const sfxMatch = stripped.match(/^@sfx\s+(.+)/i);
        if (sfxMatch) {
            events.push({ type: 'sfx', line: lineNum, args: sfxMatch[1].trim(), wordIndex, wpm: currentWPM });
            continue;
        }

        // @snap
        const snapMatch = stripped.match(/^@snap(?:\s+(.+))?$/i);
        if (snapMatch) {
            let pauseMs = 800;
            let snapWord = '';
            if (snapMatch[1]) {
                for (const token of snapMatch[1].trim().split(/\s+/)) {
                    if (token.startsWith('duration:')) {
                        const v = parseInt(token.split(':')[1], 10);
                        if (Number.isFinite(v)) pauseMs = v;
                    } else if (token.startsWith('word:')) {
                        snapWord = token.split(':')[1] || '';
                    }
                }
            }
            events.push({ type: 'snap', line: lineNum, pauseMs, snapWord, wordIndex, wpm: currentWPM });
            continue;
        }

        // @pause
        const pauseMatch = stripped.match(/^@pause(?:\s+(.+))?$/i);
        if (pauseMatch) {
            let pauseMs = 800;
            if (pauseMatch[1]) {
                for (const token of pauseMatch[1].trim().split(/\s+/)) {
                    if (token.startsWith('duration:')) {
                        const v = parseInt(token.split(':')[1], 10);
                        if (Number.isFinite(v)) pauseMs = v;
                    }
                }
            }
            events.push({ type: 'pause', line: lineNum, pauseMs, wordIndex, wpm: currentWPM });
            continue;
        }

        // @spiral, @subliminals, @binaural, @isochronic, @hybrid — skip (not linted)
        if (/^@(spiral|subliminals|binaural|isochronic|hybrid)\s/i.test(stripped)) {
            continue;
        }

        // @speed — not handled by parser, skip
        if (/^@speed\s/i.test(stripped)) {
            continue;
        }

        // Regular words
        const lineWords = stripped.split(/\s+/).filter(w => w.length > 0);
        for (const w of lineWords) {
            events.push({ type: 'word', line: lineNum, text: w, wordIndex, wpm: currentWPM });
            wordIndex++;
        }
    }

    return { events, totalWords: wordIndex };
}

// ─── Timing helpers ──────────────────────────────────────────────────────────

/**
 * Calculate display duration for a word at given WPM (matches rsvp.js getInterval)
 */
function getWordInterval(wpm, word) {
    wpm = Math.max(1, wpm);
    const baseInterval = Math.round(60000 / wpm);
    const lastChar = word.slice(-1);
    let interval = baseInterval;

    if ('.!?'.includes(lastChar)) {
        interval = Math.round(baseInterval * 2);
    } else if (',;:'.includes(lastChar)) {
        interval = Math.round(baseInterval * 1.4);
    } else if ('—–-'.includes(lastChar)) {
        interval = Math.round(baseInterval * 1.25);
    }

    return Math.max(10, interval);
}

/**
 * Calculate the duration (in seconds) of a color phase.
 * A phase is the events between one @pulseborder and the next.
 * Duration = sum of word display times + pause/snap durations.
 */
function calculatePhaseDuration(events, startIdx, endIdx) {
    let totalMs = 0;
    for (let i = startIdx; i < endIdx; i++) {
        const ev = events[i];
        if (ev.type === 'word') {
            totalMs += getWordInterval(ev.wpm, ev.text);
        } else if (ev.type === 'snap') {
            totalMs += ev.pauseMs;
        } else if (ev.type === 'pause') {
            totalMs += ev.pauseMs;
        }
    }
    return totalMs / 1000;
}

/**
 * Count actual words in a phase (not directives).
 */
function countPhaseWords(events, startIdx, endIdx) {
    let count = 0;
    for (let i = startIdx; i < endIdx; i++) {
        if (events[i].type === 'word') count++;
    }
    return count;
}

// ─── Extract color phases ────────────────────────────────────────────────────

function extractColorPhases(events) {
    const phases = [];
    let currentColor = null;
    let phaseStart = 0;
    let phaseStartLine = 0;

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.type === 'pulseborder') {
            if (currentColor !== null) {
                phases.push({
                    color: currentColor,
                    startIdx: phaseStart,
                    endIdx: i,
                    startLine: phaseStartLine,
                    endLine: ev.line,
                    words: countPhaseWords(events, phaseStart, i),
                    durationSec: calculatePhaseDuration(events, phaseStart, i)
                });
            }
            currentColor = ev.color;
            phaseStart = i + 1;
            phaseStartLine = ev.line;
        }
    }

    // Final phase (from last @pulseborder to end)
    if (currentColor !== null) {
        phases.push({
            color: currentColor,
            startIdx: phaseStart,
            endIdx: events.length,
            startLine: phaseStartLine,
            endLine: events.length > 0 ? events[events.length - 1].line : phaseStartLine,
            words: countPhaseWords(events, phaseStart, events.length),
            durationSec: calculatePhaseDuration(events, phaseStart, events.length)
        });
    }

    return phases;
}

// ─── Extract lint-disable comments ───────────────────────────────────────────

function extractDisabledRules(text) {
    const disabled = new Set();
    const re = /\/\/\s*@lint-disable\s+([\w\-,\s]+)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        const ids = m[1].split(/[,\s]+/).filter(s => s.match(/^JOI-\d+$/));
        ids.forEach(id => disabled.add(id));
    }
    return disabled;
}

// ─── Detect @joitype variant ──────────────────────────────────────────────────

function detectJoiType(text) {
    const lines = text.split('\n').slice(0, 5);
    for (const line of lines) {
        const m = line.match(/\/\/\s*@joitype\s+(\S+)/i);
        if (m) return m[1].toLowerCase();
    }
    return null;
}

// ─── Extract lint-override comments (trojan_horse support) ────────────────────

function extractOverrides(text) {
    const overrides = new Set();
    const re = /\/\/\s*@lint-override\s+(JOI-\d+)\s*:\s*trojan/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        overrides.add(m[1]);
    }
    return overrides;
}

// ─── Determine file category ─────────────────────────────────────────────────

function getFileCategory(filename) {
    const base = path.basename(filename, '.txt');
    if (base.endsWith('_sfw')) return '_sfw';
    if (base.endsWith('_nsfw')) return '_nsfw';
    if (base.endsWith('_cum')) return '_cum';
    return 'default';
}

function getApplicableRules(filename) {
    const cat = getFileCategory(filename);
    const catConfig = file_categories[cat] || file_categories['default'];
    return new Set(catConfig.applies);
}

// ─── Rule checks ─────────────────────────────────────────────────────────────

function lintFile(filename, text) {
    const findings = [];
    const disabled = extractDisabledRules(text);
    const applicable = getApplicableRules(filename);
    const { events, totalWords } = parseScript(text);
    const phases = extractColorPhases(events);
    const colorPhases = phases.filter(p => p.color !== 'off');

    function report(ruleId, message, severity) {
        if (disabled.has(ruleId)) return;
        if (!applicable.has(ruleId)) return;
        findings.push({ ruleId, severity: severity || rules[ruleId].severity, message });
    }

    // ─── JOI-002: First green within N words ────────────────────────────
    if (applicable.has('JOI-002') && !disabled.has('JOI-002')) {
        const maxWords = rules['JOI-002'].params.max_words;
        const firstGreen = phases.find(p => p.color === 'green');
        if (!firstGreen) {
            report('JOI-002', `No @pulseborder green found in script`);
        } else {
            // Count words before the first green phase starts
            const greenStartEvent = events.findIndex((ev, idx) =>
                ev.type === 'pulseborder' && ev.color === 'green');
            let wordsBeforeGreen = 0;
            for (let i = 0; i < greenStartEvent; i++) {
                if (events[i].type === 'word') wordsBeforeGreen++;
            }
            if (wordsBeforeGreen > maxWords) {
                report('JOI-002', `First GREEN at word ${wordsBeforeGreen} (max: ${maxWords})`);
            } else {
                report('JOI-002', `First GREEN at word ${wordsBeforeGreen} (max: ${maxWords})`, 'pass');
            }
        }
    }

    // ─── JOI-003: Red sections min words ────────────────────────────────
    if (applicable.has('JOI-003') && !disabled.has('JOI-003')) {
        const minWords = rules['JOI-003'].params.min_words;
        const redPhases = phases.filter(p => p.color === 'red');
        for (const phase of redPhases) {
            if (phase.words < minWords && phase.words > 0) {
                report('JOI-003', `RED phase at line ${phase.startLine} has ${phase.words} words (min: ${minWords})`);
            }
        }
    }

    // ─── JOI-004: Yellow must immediately precede raspberry/purple ──────
    if (applicable.has('JOI-004') && !disabled.has('JOI-004')) {
        const borderEvents = events.filter(ev => ev.type === 'pulseborder' && ev.color !== 'off');
        for (let i = 0; i < borderEvents.length; i++) {
            if (borderEvents[i].color === 'yellow') {
                const next = borderEvents[i + 1];
                if (!next || (next.color !== 'raspberry' && next.color !== 'purple')) {
                    report('JOI-004', `Yellow at line ${borderEvents[i].line} not followed by raspberry/purple (followed by ${next ? next.color : 'end'})`);
                }
            }
        }
    }

    // ─── JOI-005: Yellow duration 5-12 seconds ─────────────────────────
    if (applicable.has('JOI-005') && !disabled.has('JOI-005')) {
        const minSec = rules['JOI-005'].params.min_seconds;
        const maxSec = rules['JOI-005'].params.max_seconds;
        const yellowPhases = phases.filter(p => p.color === 'yellow');
        for (const phase of yellowPhases) {
            if (phase.durationSec < minSec || phase.durationSec > maxSec) {
                report('JOI-005', `Yellow phase at line ${phase.startLine} is ${phase.durationSec.toFixed(1)}s (must be ${minSec}-${maxSec}s)`);
            } else {
                report('JOI-005', `Yellow phase at line ${phase.startLine} is ${phase.durationSec.toFixed(1)}s (${minSec}-${maxSec}s)`, 'pass');
            }
        }
    }

    // ─── JOI-006: Raspberry/purple must be preceded by yellow ──────────
    if (applicable.has('JOI-006') && !disabled.has('JOI-006')) {
        const borderEvents = events.filter(ev => ev.type === 'pulseborder' && ev.color !== 'off');
        for (let i = 0; i < borderEvents.length; i++) {
            if (borderEvents[i].color === 'raspberry' || borderEvents[i].color === 'purple') {
                const prev = borderEvents[i - 1];
                if (!prev || prev.color !== 'yellow') {
                    report('JOI-006', `Raspberry/purple at line ${borderEvents[i].line} not preceded by yellow (preceded by ${prev ? prev.color : 'start'})`);
                }
            }
        }
    }

    // ─── JOI-007: Recovery green after edge should meet minimum duration ─
    if (applicable.has('JOI-007') && !disabled.has('JOI-007')) {
        const minRecoverySec = rules['JOI-007'].params.min_recovery_seconds;
        // Only flag GREENs that follow a PURPLE/RASPBERRY → RED → GREEN sequence
        // (actual post-edge recovery, not just any RED→GREEN transition)
        for (let i = 2; i < phases.length; i++) {
            if (phases[i].color === 'green' && phases[i - 1].color === 'red') {
                const edgePrev = phases[i - 2];
                if (edgePrev.color === 'purple' || edgePrev.color === 'raspberry') {
                    if (phases[i].durationSec < minRecoverySec) {
                        report('JOI-007', `Recovery GREEN at line ${phases[i].startLine} is ${phases[i].durationSec.toFixed(1)}s (min: ${minRecoverySec}s) after edge→red→green sequence`);
                    }
                }
            }
        }
    }

    // ─── JOI-008: SFW must not contain @pulseborder ────────────────────
    if (applicable.has('JOI-008') && !disabled.has('JOI-008')) {
        const borderEvents = events.filter(ev => ev.type === 'pulseborder');
        if (borderEvents.length > 0) {
            report('JOI-008', `SFW file contains ${borderEvents.length} @pulseborder directive(s)`);
        }
    }

    // ─── JOI-009: Edge durations should escalate (trend, not strict) ────
    if (applicable.has('JOI-009') && !disabled.has('JOI-009')) {
        const edgePhases = phases.filter(p => p.color === 'raspberry' || p.color === 'purple');
        const durations = edgePhases.map(p => Math.round(p.durationSec * 10) / 10);
        if (edgePhases.length === 2) {
            // Only 2 edges: not enough data points, downgrade to info
            if (durations[1] < durations[0]) {
                report('JOI-009', `Edge durations [${durations.map(d => d + 's').join(', ')}] - descending (only 2 edges, info only)`, 'info');
            }
        } else if (edgePhases.length >= 3) {
            // Linear regression over edge indices to check overall trend
            const n = durations.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (let i = 0; i < n; i++) {
                sumX += i;
                sumY += durations[i];
                sumXY += i * durations[i];
                sumX2 += i * i;
            }
            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            if (slope < 0) {
                report('JOI-009', `Edge durations [${durations.map(d => d + 's').join(', ')}] - negative trend (slope: ${slope.toFixed(2)}s/edge)`);
            }
        }
    }

    // ─── JOI-010: Edge duration variation ───────────────────────────────
    if (applicable.has('JOI-010') && !disabled.has('JOI-010')) {
        const edgePhases = phases.filter(p => p.color === 'raspberry' || p.color === 'purple');
        if (edgePhases.length >= 2) {
            const uniqueDurations = new Set(edgePhases.map(p => Math.round(p.durationSec)));
            const minUnique = rules['JOI-010'].params.min_unique_durations;
            if (uniqueDurations.size < minUnique) {
                report('JOI-010', `All ${edgePhases.length} edges have identical duration (~${Math.round(edgePhases[0].durationSec)}s)`);
            }
        }
    }

    // ─── JOI-011: Rapid GREEN/RED cycling ───────────────────────────────
    if (applicable.has('JOI-011') && !disabled.has('JOI-011')) {
        // Look for sections where green and red alternate quickly (each < 15s)
        let hasRapidCycling = false;
        for (let i = 0; i < phases.length - 1; i++) {
            const a = phases[i];
            const b = phases[i + 1];
            if ((a.color === 'green' && b.color === 'red') || (a.color === 'red' && b.color === 'green')) {
                if (a.durationSec < 15 && b.durationSec < 15) {
                    hasRapidCycling = true;
                    break;
                }
            }
        }
        if (!hasRapidCycling) {
            report('JOI-011', `No rapid GREEN/RED cycling section found`);
        }
    }

    // ─── JOI-012: @sfx must not contain volume params ───────────────────
    if (applicable.has('JOI-012') && !disabled.has('JOI-012')) {
        const sfxEvents = events.filter(ev => ev.type === 'sfx');
        for (const ev of sfxEvents) {
            if (/\bvol:/i.test(ev.args)) {
                report('JOI-012', `@sfx at line ${ev.line} contains vol: parameter`);
            }
        }
    }

    // ─── JOI-013: Min edge sequences ────────────────────────────────────
    if (applicable.has('JOI-013') && !disabled.has('JOI-013')) {
        const edgePhases = phases.filter(p => p.color === 'raspberry' || p.color === 'purple');
        const minEdges = rules['JOI-013'].params.min_edges;
        if (edgePhases.length < minEdges) {
            report('JOI-013', `Only ${edgePhases.length} edge sequence(s) found (min: ${minEdges})`);
        }
    }

    // ─── JOI-014: No personal references ────────────────────────────────
    if (applicable.has('JOI-014') && !disabled.has('JOI-014')) {
        const banned = rules['JOI-014'].params.banned_patterns;
        const lowerText = text.toLowerCase();
        for (const pattern of banned) {
            if (lowerText.includes(pattern.toLowerCase())) {
                // Find line number
                const textLines = text.split('\n');
                for (let i = 0; i < textLines.length; i++) {
                    if (textLines[i].toLowerCase().includes(pattern.toLowerCase())) {
                        report('JOI-014', `Banned pattern "${pattern}" found at line ${i + 1}`);
                    }
                }
            }
        }
    }

    // ─── JOI-019: No em dashes or en dashes ─────────────────────────────
    if (applicable.has('JOI-019') && !disabled.has('JOI-019')) {
        const bannedChars = (rules['JOI-019'].params && rules['JOI-019'].params.banned_chars) || ['—', '–'];
        const textLines = text.split('\n');
        for (let i = 0; i < textLines.length; i++) {
            const line = textLines[i];
            if (line.trimStart().startsWith('//')) continue; // skip comments
            for (const ch of bannedChars) {
                if (line.includes(ch)) {
                    report('JOI-019', `Em/en dash found at line ${i + 1}: "${line.trim().substring(0, 60)}..."`);
                }
            }
        }
    }

    // ─── JOI-015: Recovery after snap stop/denied ───────────────────────
    if (applicable.has('JOI-015') && !disabled.has('JOI-015')) {
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (ev.type === 'snap' && ev.snapWord && /^(Stop|Denied)\.?$/i.test(ev.snapWord)) {
                // Look at next few events for a pause or pulseborder off
                let hasRecovery = false;
                for (let j = i + 1; j < Math.min(i + 5, events.length); j++) {
                    if (events[j].type === 'pause' || (events[j].type === 'pulseborder' && events[j].color === 'off')) {
                        hasRecovery = true;
                        break;
                    }
                }
                if (!hasRecovery) {
                    report('JOI-015', `@snap word:${ev.snapWord} at line ${ev.line} not followed by recovery pause or border-off`);
                }
            }
        }
    }

    // ─── JOI-016: Opening red ───────────────────────────────────────────
    if (applicable.has('JOI-016') && !disabled.has('JOI-016')) {
        const firstBorder = events.find(ev => ev.type === 'pulseborder' && ev.color !== 'off');
        if (firstBorder && firstBorder.color !== 'red') {
            report('JOI-016', `First border color is ${firstBorder.color}, expected red`);
        } else if (!firstBorder) {
            report('JOI-016', `No @pulseborder directives found`);
        }
    }

    // ─── JOI-017: WPM range ────────────────────────────────────────────
    if (applicable.has('JOI-017') && !disabled.has('JOI-017')) {
        const minWpm = rules['JOI-017'].params.min_wpm;
        const maxWpm = rules['JOI-017'].params.max_wpm;
        const wpmEvents = events.filter(ev => ev.type === 'wpm');
        for (const ev of wpmEvents) {
            if (ev.wpm < minWpm || ev.wpm > maxWpm) {
                report('JOI-017', `@wpm ${ev.wpm} at line ${ev.line} outside range ${minWpm}-${maxWpm}`);
            }
        }
    }

    // ─── JOI-018: Border off before end ─────────────────────────────────
    if (applicable.has('JOI-018') && !disabled.has('JOI-018')) {
        const borderEvents = events.filter(ev => ev.type === 'pulseborder');
        if (borderEvents.length > 0) {
            const lastBorder = borderEvents[borderEvents.length - 1];
            if (lastBorder.color !== 'off') {
                report('JOI-018', `Last @pulseborder is "${lastBorder.color}" at line ${lastBorder.line} — not turned off`);
            }
        }
    }

    // ─── Deployment variant checks ────────────────────────────────────────
    const joiType = detectJoiType(text);
    if (joiType && deployment_variants && deployment_variants[joiType]) {
        const variantRules = new Set(deployment_variants[joiType]);
        const overrides = extractOverrides(text);
        const edgePhases = phases.filter(p => p.color === 'raspberry' || p.color === 'purple');
        const borderEventsAll = events.filter(ev => ev.type === 'pulseborder' && ev.color !== 'off');

        function variantReport(ruleId, message, severity) {
            if (disabled.has(ruleId)) return;
            if (overrides.has(ruleId)) return;
            if (!variantRules.has(ruleId)) return;
            findings.push({ ruleId, severity: severity || rules[ruleId].severity, message });
        }

        // ═══ compliance_loop checks ═══

        // JOI-020: Edge durations escalate within each compliance cycle (sawtooth OK)
        if (variantRules.has('JOI-020') && !disabled.has('JOI-020')) {
            if (edgePhases.length >= 2) {
                // Group edges into cycles by detecting resets (where duration drops)
                const groups = [[]];
                for (let i = 0; i < edgePhases.length; i++) {
                    if (i > 0 && edgePhases[i].durationSec < edgePhases[i - 1].durationSec * 0.8) {
                        groups.push([]);
                    }
                    groups[groups.length - 1].push(edgePhases[i]);
                }
                let hasNonEscalating = false;
                for (const group of groups) {
                    if (group.length < 2) continue;
                    for (let i = 1; i < group.length; i++) {
                        if (group[i].durationSec < group[i - 1].durationSec * 0.95) {
                            hasNonEscalating = true;
                            break;
                        }
                    }
                    if (hasNonEscalating) break;
                }
                if (hasNonEscalating) {
                    const durations = edgePhases.map(p => p.durationSec.toFixed(1) + 's');
                    variantReport('JOI-020', `Edge durations [${durations.join(', ')}] — not escalating within cycle groups`);
                } else {
                    variantReport('JOI-020', `Edge durations escalate within cycle groups (${groups.length} group(s))`, 'pass');
                }
            }
        }

        // JOI-021: Compliance loop structure (GREEN->cycles->YELLOW->PURPLE->RED pattern >= 2x)
        if (variantRules.has('JOI-021') && !disabled.has('JOI-021')) {
            // Look for GREEN...YELLOW->RASPBERRY/PURPLE...RED pattern
            let loopCount = 0;
            let i = 0;
            while (i < borderEventsAll.length) {
                // Find GREEN
                if (borderEventsAll[i].color === 'green') {
                    // Scan forward for YELLOW
                    let j = i + 1;
                    while (j < borderEventsAll.length && borderEventsAll[j].color !== 'yellow') j++;
                    if (j < borderEventsAll.length) {
                        // Check if YELLOW is followed by raspberry/purple
                        let k = j + 1;
                        if (k < borderEventsAll.length && (borderEventsAll[k].color === 'raspberry' || borderEventsAll[k].color === 'purple')) {
                            // Check if raspberry/purple is eventually followed by red
                            let l = k + 1;
                            while (l < borderEventsAll.length && borderEventsAll[l].color !== 'red' && borderEventsAll[l].color !== 'green') l++;
                            if (l < borderEventsAll.length && borderEventsAll[l].color === 'red') {
                                loopCount++;
                                i = l + 1;
                                continue;
                            }
                        }
                    }
                }
                i++;
            }
            const minLoops = rules['JOI-021'].params.min_loops;
            if (loopCount < minLoops) {
                variantReport('JOI-021', `Found ${loopCount} compliance loop(s) (min: ${minLoops})`);
            } else {
                variantReport('JOI-021', `Found ${loopCount} compliance loop(s) (min: ${minLoops})`, 'pass');
            }
        }

        // JOI-022: Variable edge gaps (CV > 0.2)
        if (variantRules.has('JOI-022') && !disabled.has('JOI-022')) {
            if (edgePhases.length >= 3) {
                // Calculate gaps between edge start positions (in word indices)
                const edgeBorderIndices = [];
                for (let i = 0; i < events.length; i++) {
                    if (events[i].type === 'pulseborder' && (events[i].color === 'raspberry' || events[i].color === 'purple')) {
                        edgeBorderIndices.push(events[i].wordIndex);
                    }
                }
                if (edgeBorderIndices.length >= 3) {
                    const gaps = [];
                    for (let i = 1; i < edgeBorderIndices.length; i++) {
                        gaps.push(edgeBorderIndices[i] - edgeBorderIndices[i - 1]);
                    }
                    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                    const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
                    const stddev = Math.sqrt(variance);
                    const cv = mean > 0 ? stddev / mean : 0;
                    const minCV = rules['JOI-022'].params.min_cv;
                    if (cv < minCV) {
                        variantReport('JOI-022', `Edge gap CV=${cv.toFixed(2)} (min: ${minCV}) — too regular for compliance_loop`);
                    } else {
                        variantReport('JOI-022', `Edge gap CV=${cv.toFixed(2)} (min: ${minCV})`, 'pass');
                    }
                }
            }
        }

        // ═══ clicker_training checks ═══

        // JOI-030: 4+ GREEN/RED transitions within 120 words
        if (variantRules.has('JOI-030') && !disabled.has('JOI-030')) {
            const minTransitions = rules['JOI-030'].params.min_transitions;
            const maxWords = rules['JOI-030'].params.max_words;
            let foundRapid = false;
            // Sliding window over border events
            for (let i = 0; i < borderEventsAll.length && !foundRapid; i++) {
                let transitions = 0;
                let windowWords = 0;
                for (let j = i; j < borderEventsAll.length - 1; j++) {
                    const a = borderEventsAll[j];
                    const b = borderEventsAll[j + 1];
                    // Count words between a and b
                    const wordsInPhase = countPhaseWords(events,
                        events.indexOf(a) + 1,
                        events.indexOf(b));
                    windowWords += wordsInPhase;
                    if (windowWords > maxWords) break;
                    if ((a.color === 'green' && b.color === 'red') || (a.color === 'red' && b.color === 'green')) {
                        transitions++;
                    }
                    if (transitions >= minTransitions) {
                        foundRapid = true;
                        break;
                    }
                }
            }
            if (!foundRapid) {
                variantReport('JOI-030', `No rapid cycling section with ${minTransitions}+ GREEN/RED transitions in ${maxWords} words`);
            } else {
                variantReport('JOI-030', `Found rapid cycling section (${minTransitions}+ transitions in ${maxWords} words)`, 'pass');
            }
        }

        // JOI-031: Regular intervals in rapid cycling sections
        if (variantRules.has('JOI-031') && !disabled.has('JOI-031')) {
            const maxDev = rules['JOI-031'].params.max_deviation;
            // Find rapid cycling sections (consecutive GREEN/RED alternations)
            let rapidSections = [];
            let currentSection = [];
            for (let i = 0; i < phases.length; i++) {
                if (phases[i].color === 'green' || phases[i].color === 'red') {
                    if (currentSection.length === 0 ||
                        ((currentSection[currentSection.length - 1].color === 'green' && phases[i].color === 'red') ||
                         (currentSection[currentSection.length - 1].color === 'red' && phases[i].color === 'green'))) {
                        if (phases[i].durationSec < 20) {
                            currentSection.push(phases[i]);
                        } else {
                            if (currentSection.length >= 4) rapidSections.push(currentSection);
                            currentSection = [phases[i]];
                        }
                    } else {
                        if (currentSection.length >= 4) rapidSections.push(currentSection);
                        currentSection = [phases[i]];
                    }
                } else {
                    if (currentSection.length >= 4) rapidSections.push(currentSection);
                    currentSection = [];
                }
            }
            if (currentSection.length >= 4) rapidSections.push(currentSection);

            let irregular = false;
            for (const section of rapidSections) {
                const durations = section.map(p => p.durationSec);
                const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
                for (const d of durations) {
                    if (Math.abs(d - avg) / avg > maxDev) {
                        irregular = true;
                        break;
                    }
                }
            }
            if (rapidSections.length === 0) {
                variantReport('JOI-031', `No rapid cycling sections found to check regularity`);
            } else if (irregular) {
                variantReport('JOI-031', `Rapid cycling phases have irregular intervals (>${(maxDev * 100).toFixed(0)}% deviation from mean)`);
            } else {
                variantReport('JOI-031', `Rapid cycling phases have regular intervals`, 'pass');
            }
        }

        // JOI-032: Edge regularity OK (info only)
        if (variantRules.has('JOI-032') && !disabled.has('JOI-032')) {
            variantReport('JOI-032', `clicker_training: edge regularity requirement suppressed`, 'pass');
        }

        // ═══ trojan_horse checks ═══

        // JOI-040: First third fewer transitions than final third
        if (variantRules.has('JOI-040') && !disabled.has('JOI-040')) {
            if (borderEventsAll.length >= 3) {
                // Split by word position into thirds
                const totalW = totalWords;
                const firstThirdEnd = Math.floor(totalW / 3);
                const finalThirdStart = Math.floor(totalW * 2 / 3);
                const firstThirdTransitions = borderEventsAll.filter(ev => ev.wordIndex <= firstThirdEnd).length;
                const finalThirdTransitions = borderEventsAll.filter(ev => ev.wordIndex >= finalThirdStart).length;
                if (firstThirdTransitions >= finalThirdTransitions) {
                    variantReport('JOI-040', `First third has ${firstThirdTransitions} transitions, final third has ${finalThirdTransitions} — no escalation`);
                } else {
                    variantReport('JOI-040', `Transition density escalates: first third ${firstThirdTransitions}, final third ${finalThirdTransitions}`, 'pass');
                }
            }
        }

        // JOI-041: Report overridden rules as info
        if (variantRules.has('JOI-041') && !disabled.has('JOI-041')) {
            if (overrides.size > 0) {
                variantReport('JOI-041', `Trojan overrides active: ${[...overrides].join(', ')}`, 'pass');
            }
        }
    }

    return findings;
}

// ─── Output formatting ───────────────────────────────────────────────────────

const SYMBOLS = {
    pass: '\x1b[32m✓\x1b[0m',
    error: '\x1b[31m✗\x1b[0m',
    warning: '\x1b[33m⚠\x1b[0m',
    info: '\x1b[36mℹ\x1b[0m'
};

function formatFinding(f) {
    const sym = SYMBOLS[f.severity] || ' ';
    return `  ${sym} ${f.ruleId}: ${f.message}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2);
    let files;

    if (args.length > 0) {
        files = args.map(f => path.resolve(f));
    } else {
        if (!fs.existsSync(SCRIPTS_DIR)) {
            console.error(`Scripts directory not found: ${SCRIPTS_DIR}`);
            process.exit(1);
        }
        files = fs.readdirSync(SCRIPTS_DIR)
            .filter(f => f.endsWith('.txt'))
            .sort()
            .map(f => path.join(SCRIPTS_DIR, f));
    }

    let hasErrors = false;
    let totalFindings = { pass: 0, error: 0, warning: 0, info: 0 };

    for (const filepath of files) {
        const text = fs.readFileSync(filepath, 'utf-8');
        const relPath = path.relative(ROOT, filepath);
        const findings = lintFile(filepath, text);
        const joiType = detectJoiType(text);

        // Filter out passes for display (but count them)
        const visible = findings.filter(f => f.severity !== 'pass');
        const passes = findings.filter(f => f.severity === 'pass');

        if (visible.length > 0 || passes.length > 0) {
            const typeLabel = joiType ? ` \x1b[35m[@joitype ${joiType}]\x1b[0m` : '';
            console.log(`\n\x1b[1m${relPath}\x1b[0m${typeLabel}`);
            for (const f of passes) {
                console.log(formatFinding(f));
                totalFindings.pass++;
            }
            for (const f of visible) {
                console.log(formatFinding(f));
                totalFindings[f.severity] = (totalFindings[f.severity] || 0) + 1;
                if (f.severity === 'error') hasErrors = true;
            }
        }
    }

    // Summary
    console.log(`\n\x1b[1m─── Summary ───\x1b[0m`);
    console.log(`  Files scanned: ${files.length}`);
    console.log(`  ${SYMBOLS.pass} Passed: ${totalFindings.pass}`);
    console.log(`  ${SYMBOLS.error} Errors: ${totalFindings.error}`);
    console.log(`  ${SYMBOLS.warning} Warnings: ${totalFindings.warning}`);
    console.log(`  ${SYMBOLS.info} Info: ${totalFindings.info}`);

    process.exit(hasErrors ? 1 : 0);
}

main();
