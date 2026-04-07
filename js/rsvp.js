/**
 * RSVP (Rapid Serial Visual Presentation) Engine
 *
 * Handles parsing scripts, timing word display, and WPM control.
 */

class RSVPEngine {
    constructor(options = {}) {
        this.words = [];
        this.currentIndex = 0;
        this.wpm = options.wpm || 300;
        this.manualWpm = this.wpm;  // WPM set by user controls
        this.followScript = true;   // Whether to use script @wpm or manual
        this.isPlaying = false;
        this.loop = false;
        this.timer = null;

        // Callbacks
        this.onWord = options.onWord || (() => {});
        this.onProgress = options.onProgress || (() => {});
        this.onWPMChange = options.onWPMChange || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onStateChange = options.onStateChange || (() => {});
        this.onSpiral = options.onSpiral || (() => {});
        this.onSubliminals = options.onSubliminals || (() => {});
        this.onSnap = options.onSnap || (() => {});
        this.onPause = options.onPause || (() => {});
        this.onSfx = options.onSfx || (() => {});
        this.onBinaural = options.onBinaural || (() => {});
        this.onPulseBorder = options.onPulseBorder || (() => {});
        this.onContentWarning = options.onContentWarning || (() => {});
        this.contentWarnings = [];
        this.cwAcknowledged = false;
    }

    /**
     * Parse script text into word objects
     * Supports @wpm, @spiral, @subliminals commands
     *
     * @param {string} text - Script text
     * @returns {Array} - Array of {word, wpm, commands} objects
     */
    parse(text) {
        const lines = text.split('\n');
        const words = [];
        let currentWPM = this.wpm;
        let pendingCommands = [];  // Commands to attach to next word

        // Extract @cw content warnings (pre-playback metadata)
        this.contentWarnings = [];
        this.cwAcknowledged = false;
        for (const line of lines) {
            const cwMatch = line.trim().match(/^@cw\s+(.+)/i);
            if (cwMatch) this.contentWarnings.push(cwMatch[1]);
        }

        for (const line of lines) {
            const trimmed = line.trim();

            // Strip comments (// to end of line) and skip pure comment lines
            const stripped = trimmed.replace(/\s+\/\/.*$/, '').replace(/^\/\/.*$/, '');
            if (!stripped) continue;

            // Skip @cw lines (already extracted above)
            if (/^@cw\s/i.test(stripped)) continue;

            // Check for @wpm command
            const wpmMatch = stripped.match(/^@wpm\s+(\d+)/i);
            if (wpmMatch) {
                currentWPM = parseInt(wpmMatch[1], 10);
                continue;
            }

            // Check for @spiral command
            const spiralMatch = stripped.match(/^@spiral\s+(.+)/i);
            if (spiralMatch) {
                pendingCommands.push({
                    type: 'spiral',
                    args: spiralMatch[1]
                });
                continue;
            }

            // Check for @subliminals command
            const subMatch = stripped.match(/^@subliminals\s+(.+)/i);
            if (subMatch) {
                pendingCommands.push({
                    type: 'subliminals',
                    args: subMatch[1]
                });
                continue;
            }

            // Check for @pulseborder command
            const pulseMatch = stripped.match(/^@pulseborder\s+(.+)/i);
            if (pulseMatch) {
                pendingCommands.push({
                    type: 'pulseborder',
                    args: pulseMatch[1]
                });
                continue;
            }

            // Check for @sfx command (non-blocking — just plays a sound)
            const sfxMatch = stripped.match(/^@sfx\s+(.+)/i);
            if (sfxMatch) {
                const sfxTokens = sfxMatch[1].trim().split(/\s+/);
                const sfxName = sfxTokens[0];
                let sfxVol = 1;
                let sfxDetune = 0;
                for (const t of sfxTokens.slice(1)) {
                    if (t.startsWith('vol:')) {
                        const v = parseFloat(t.split(':')[1]);
                        if (Number.isFinite(v)) sfxVol = Math.max(0, Math.min(1, v));
                    }
                    if (t.startsWith('detune:')) {
                        const v = parseFloat(t.split(':')[1]);
                        if (Number.isFinite(v)) sfxDetune = Math.max(0, Math.min(1200, v));
                    }
                }
                pendingCommands.push({
                    type: 'sfx',
                    name: sfxName,
                    vol: sfxVol,
                    detune: sfxDetune
                });
                continue;
            }

            // Check for @pause command (blocking silent pause, like @snap without sound/flash)
            const pauseMatch = stripped.match(/^@pause(?:\s+(.+))?$/i);
            if (pauseMatch) {
                let pauseDuration = 800;
                let pauseWord = '';
                if (pauseMatch[1]) {
                    for (const token of pauseMatch[1].trim().split(/\s+/)) {
                        if (token.startsWith('duration:')) {
                            const v = parseInt(token.split(':')[1], 10);
                            if (Number.isFinite(v)) pauseDuration = v;
                        } else if (token.startsWith('word:')) {
                            pauseWord = token.split(':')[1] || '';
                        }
                    }
                }
                // Flush pending commands as a sentinel first
                if (pendingCommands.length > 0) {
                    words.push({ word: '', wpm: currentWPM, commands: pendingCommands });
                    pendingCommands = [];
                }
                // Insert pause as its own word object
                const pauseCmd = { type: 'pause', pause: pauseDuration, word: pauseWord };
                words.push({
                    word: pauseWord,
                    wpm: currentWPM,
                    commands: [pauseCmd]
                });
                continue;
            }

            // Check for @snap command (named params: duration:N word:X)
            const snapMatch = stripped.match(/^@snap(?:\s+(.+))?$/i);
            if (snapMatch) {
                let snapPause = 800;
                let snapWord = '';
                if (snapMatch[1]) {
                    for (const token of snapMatch[1].trim().split(/\s+/)) {
                        if (token.startsWith('duration:')) {
                            const v = parseInt(token.split(':')[1], 10);
                            if (Number.isFinite(v)) snapPause = v;
                        } else if (token.startsWith('word:')) {
                            snapWord = token.split(':')[1] || '';
                        }
                    }
                }
                // Flush pending commands as a sentinel first
                if (pendingCommands.length > 0) {
                    words.push({ word: '', wpm: currentWPM, commands: pendingCommands });
                    pendingCommands = [];
                }
                // Insert snap as its own word object
                const snapCmd = { type: 'snap', pause: snapPause, word: snapWord };
                words.push({
                    word: snapWord,
                    wpm: currentWPM,
                    commands: [snapCmd]
                });
                continue;
            }

            // Check for @binaural command
            const binauralMatch = stripped.match(/^@binaural\s+(.+)/i);
            if (binauralMatch) {
                pendingCommands.push({
                    type: 'binaural',
                    args: binauralMatch[1]
                });
                continue;
            }

            // Split line into words
            const lineWords = stripped.split(/\s+/).filter(w => w.length > 0);

            for (let i = 0; i < lineWords.length; i++) {
                const wordObj = {
                    word: lineWords[i],
                    wpm: currentWPM
                };

                // Attach pending commands to first word
                if (pendingCommands.length > 0 && i === 0) {
                    wordObj.commands = pendingCommands;
                    pendingCommands = [];
                }

                words.push(wordObj);
            }
        }

        // Flush any trailing commands that weren't attached to a word
        if (pendingCommands.length > 0) {
            words.push({ word: '', wpm: currentWPM, commands: pendingCommands });
        }

        return words;
    }

    /**
     * Load a script
     * @param {string} text - Script text
     */
    load(text) {
        this.stop();
        this.words = this.parse(text);
        this.currentIndex = 0;
        this.onProgress(0, this.words.length);

        if (this.words.length > 0) {
            this.showWord(0);
        }
    }

    /**
     * Get word count
     */
    getWordCount() {
        return this.words.length;
    }

    /**
     * Calculate display time for a word at given WPM
     * Adds proportional pause for punctuation (scales with speed)
     * @param {number} wpm
     * @param {string} word - The word (to check for punctuation)
     * @returns {number} - Milliseconds
     */
    getInterval(wpm, word = '') {
        wpm = Math.max(1, wpm);
        const baseInterval = Math.round(60000 / wpm);

        // Proportional pause for punctuation (multipliers)
        const lastChar = word.slice(-1);
        let interval = baseInterval;

        if ('.!?'.includes(lastChar)) {
            // End of sentence - 2x base (natural breath)
            interval = Math.round(baseInterval * 2);
        } else if (',;:'.includes(lastChar)) {
            // Mid-sentence pause - 1.4x base
            interval = Math.round(baseInterval * 1.4);
        } else if ('—–-'.includes(lastChar)) {
            // Dash - 1.25x base
            interval = Math.round(baseInterval * 1.25);
        }

        return Math.max(10, interval);
    }

    /**
     * Display a word at the given index
     * @param {number} index
     */
    showWord(index) {
        if (index < 0 || index >= this.words.length) return;

        const wordObj = this.words[index];

        // Process any commands attached to this word (only while playing)
        if (wordObj.commands && this.isPlaying) {
            for (const cmd of wordObj.commands) {
                if (cmd.type === 'spiral') {
                    this.onSpiral(cmd.args);
                } else if (cmd.type === 'subliminals') {
                    this.onSubliminals(cmd.args);
                } else if (cmd.type === 'snap') {
                    this.onSnap(cmd.pause, cmd.word);
                } else if (cmd.type === 'pause') {
                    this.onPause(cmd.pause, cmd.word);
                } else if (cmd.type === 'sfx') {
                    this.onSfx(cmd.name, cmd.vol, cmd.detune);
                } else if (cmd.type === 'binaural') {
                    this.onBinaural(cmd.args);
                } else if (cmd.type === 'pulseborder') {
                    this.onPulseBorder(cmd.args);
                }
            }
        }

        // Skip display for empty sentinel words (EOF command flush)
        if (wordObj.word === '') return;

        const parts = ORP.split(wordObj.word);

        // Check if WPM changed (only if following script)
        if (this.followScript && wordObj.wpm !== this.wpm) {
            this.wpm = wordObj.wpm;
            this.onWPMChange(this.wpm);
        }

        this.onWord(parts, wordObj);
        this.onProgress(index + 1, this.words.length);
    }

    /**
     * Start playback
     */
    play() {
        if (this.words.length === 0) return;
        if (this.isPlaying) return;

        // Gate on content warnings
        if (this.contentWarnings.length > 0 && !this.cwAcknowledged) {
            this.onContentWarning(this.contentWarnings, () => {
                this.cwAcknowledged = true;
                this.play();
            });
            return;
        }

        // If at end, restart
        if (this.currentIndex >= this.words.length) {
            this.currentIndex = 0;
        }

        this.isPlaying = true;
        this.onStateChange(true);
        this.scheduleNext();
    }

    /**
     * Pause playback
     */
    pause() {
        this.isPlaying = false;
        this.onStateChange(false);

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /**
     * Toggle play/pause
     */
    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Stop and reset to beginning
     */
    stop() {
        this.pause();
        this.currentIndex = 0;
        this.onProgress(0, this.words.length);
    }

    /**
     * Restart from beginning
     */
    restart() {
        this.stop();
        if (this.words.length > 0) {
            this.showWord(0);
        }
    }

    /**
     * Set manual WPM (used when followScript is false)
     * @param {number} wpm
     */
    setWPM(wpm) {
        this.manualWpm = wpm;
        if (!this.followScript) {
            this.wpm = wpm;
            this.onWPMChange(wpm);
        }
    }

    /**
     * Set loop mode (restart on complete)
     * @param {boolean} enabled
     */
    setLoop(enabled) {
        this.loop = enabled;
    }

    /**
     * Set whether to follow script @wpm commands or use manual WPM
     * @param {boolean} follow
     */
    setFollowScript(follow) {
        this.followScript = follow;
        if (!follow) {
            this.wpm = this.manualWpm;
            this.onWPMChange(this.manualWpm);
        }
    }

    /**
     * Schedule the next word display
     */
    scheduleNext() {
        if (!this.isPlaying) return;
        if (this.currentIndex >= this.words.length) {
            if (this.loop) {
                this.currentIndex = 0;
                this.onProgress(0, this.words.length);
                this.scheduleNext();
                return;
            }
            this.pause();
            this.onComplete();
            return;
        }

        const wordObj = this.words[this.currentIndex];

        // Skip sentinel words (EOF command flush) — process commands, no delay
        if (wordObj.word === '') {
            this.showWord(this.currentIndex);
            this.currentIndex++;
            this.scheduleNext();
            return;
        }

        const effectiveWpm = this.followScript ? wordObj.wpm : this.manualWpm;
        const interval = this.getInterval(effectiveWpm, wordObj.word);

        this.showWord(this.currentIndex);
        this.currentIndex++;

        // Guard: if showWord triggered a snap (or other pause), bail out
        // before creating an orphan timer. The index is already advanced
        // so the snap resume will pick up at the next word.
        if (!this.isPlaying) return;

        this.timer = setTimeout(() => {
            this.scheduleNext();
        }, interval);
    }

    /**
     * Jump to a specific position (0-1)
     * @param {number} position
     */
    seek(position) {
        const index = Math.floor(position * this.words.length);
        this.currentIndex = Math.max(0, Math.min(index, this.words.length - 1));

        if (this.words.length > 0) {
            this.showWord(this.currentIndex);
            this.currentIndex++;
        }

        // If playing, reschedule from new position
        if (this.isPlaying) {
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            this.scheduleNext();
        }
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RSVPEngine;
}
