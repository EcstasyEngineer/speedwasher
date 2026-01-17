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
        this.onBinaural = options.onBinaural || (() => {});
        this.onBinaural2 = options.onBinaural2 || (() => {});
        this.onNoise = options.onNoise || (() => {});
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

        for (const line of lines) {
            const trimmed = line.trim();

            // Check for @wpm command
            const wpmMatch = trimmed.match(/^@wpm\s+(\d+)/i);
            if (wpmMatch) {
                currentWPM = parseInt(wpmMatch[1], 10);
                continue;
            }

            // Check for @spiral command
            const spiralMatch = trimmed.match(/^@spiral\s+(.+)/i);
            if (spiralMatch) {
                pendingCommands.push({
                    type: 'spiral',
                    args: spiralMatch[1]
                });
                continue;
            }

            // Check for @subliminals command
            const subMatch = trimmed.match(/^@subliminals\s+(.+)/i);
            if (subMatch) {
                pendingCommands.push({
                    type: 'subliminals',
                    args: subMatch[1]
                });
                continue;
            }

            // Check for @snap command (optional pause duration in ms)
            const snapMatch = trimmed.match(/^@snap(?:\s+(\d+))?/i);
            if (snapMatch) {
                pendingCommands.push({
                    type: 'snap',
                    pause: parseInt(snapMatch[1], 10) || 800  // Default 800ms pause
                });
                continue;
            }

            // Check for @binaural command
            const binauralMatch = trimmed.match(/^@binaural\s+(.+)/i);
            if (binauralMatch) {
                pendingCommands.push({
                    type: 'binaural',
                    args: binauralMatch[1]
                });
                continue;
            }

            // Check for @binaural2 command (hybrid dual-band)
            const binaural2Match = trimmed.match(/^@binaural2\s+(.+)/i);
            if (binaural2Match) {
                pendingCommands.push({
                    type: 'binaural2',
                    args: binaural2Match[1]
                });
                continue;
            }

            // Check for @noise command
            const noiseMatch = trimmed.match(/^@noise\s+(.+)/i);
            if (noiseMatch) {
                pendingCommands.push({
                    type: 'noise',
                    args: noiseMatch[1]
                });
                continue;
            }

            // Split line into words
            const lineWords = trimmed.split(/\s+/).filter(w => w.length > 0);

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
        const baseInterval = Math.round(60000 / wpm);

        // Proportional pause for punctuation (multipliers)
        const lastChar = word.slice(-1);

        if ('.!?'.includes(lastChar)) {
            // End of sentence - 2x base (natural breath)
            return Math.round(baseInterval * 2);
        } else if (',;:'.includes(lastChar)) {
            // Mid-sentence pause - 1.4x base
            return Math.round(baseInterval * 1.4);
        } else if ('—–-'.includes(lastChar)) {
            // Dash - 1.25x base
            return Math.round(baseInterval * 1.25);
        }

        return baseInterval;
    }

    /**
     * Display a word at the given index
     * @param {number} index
     */
    showWord(index) {
        if (index < 0 || index >= this.words.length) return;

        const wordObj = this.words[index];
        const parts = ORP.split(wordObj.word);

        // Process any commands attached to this word (only while playing)
        if (wordObj.commands && this.isPlaying) {
            for (const cmd of wordObj.commands) {
                if (cmd.type === 'spiral') {
                    this.onSpiral(cmd.args);
                } else if (cmd.type === 'subliminals') {
                    this.onSubliminals(cmd.args);
                } else if (cmd.type === 'snap') {
                    this.onSnap(cmd.pause);
                } else if (cmd.type === 'binaural') {
                    this.onBinaural(cmd.args);
                } else if (cmd.type === 'binaural2') {
                    this.onBinaural2(cmd.args);
                } else if (cmd.type === 'noise') {
                    this.onNoise(cmd.args);
                }
            }
        }

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
            this.pause();
            this.onComplete();
            return;
        }

        const wordObj = this.words[this.currentIndex];
        const effectiveWpm = this.followScript ? wordObj.wpm : this.manualWpm;
        const interval = this.getInterval(effectiveWpm, wordObj.word);

        this.showWord(this.currentIndex);
        this.currentIndex++;

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
        }
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RSVPEngine;
}
