/**
 * Subliminals - flash words in periphery during playback
 */

class SubliminalEngine {
    constructor(topEl, bottomEl) {
        this.topEl = topEl;
        this.bottomEl = bottomEl;
        this.words = [];
        this.isActive = false;
        this.opacity = 0.4;
        this.fadeTime = 0.5;  // seconds
        this.intervalId = null;
        this.hideTimeoutId = null;

        // Timing config
        this.minInterval = 200;   // ms between flashes
        this.maxInterval = 600;
        this.displayTime = 150;   // ms word is visible
    }

    /**
     * Parse @subliminals command
     * Format: @subliminals [opacity:N] word1 word2 word3...
     * Or: @subliminals off
     */
    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            opacity: 0.4,
            words: []
        };

        if (parts[0] === 'off') {
            result.action = 'off';
            return result;
        }

        for (const part of parts) {
            if (part.includes(':')) {
                const [key, val] = part.split(':');
                if (key === 'opacity') {
                    const v = parseFloat(val);
                    if (Number.isFinite(v)) result.opacity = Math.max(0, Math.min(1, v));
                }
                // Unknown key:value pairs silently ignored
            } else if (part.length > 0) {
                result.words.push(part.toLowerCase());
            }
        }

        return result;
    }

    /**
     * Start flashing subliminals
     */
    start(opacity = 0.4, fade = 0.5, words = []) {
        // Clear any existing timers to prevent stacking
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        if (this.hideTimeoutId) {
            clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }

        this.opacity = opacity;
        this.fadeTime = fade;
        this.words = words;

        if (this.words.length === 0) {
            this.isActive = false;
            return;
        }

        // Set transition time
        this.topEl.style.transition = `opacity ${fade}s ease`;
        this.bottomEl.style.transition = `opacity ${fade}s ease`;

        this.isActive = true;
        this.scheduleNext();
    }

    /**
     * Stop subliminals with fade out
     */
    stop(fade = 0.5) {
        this.isActive = false;

        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }
        if (this.hideTimeoutId) {
            clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }

        // Fade out
        this.topEl.style.transition = `opacity ${fade}s ease`;
        this.bottomEl.style.transition = `opacity ${fade}s ease`;
        this.topEl.style.opacity = 0;
        this.bottomEl.style.opacity = 0;
    }

    /**
     * Schedule next subliminal flash
     */
    scheduleNext() {
        if (!this.isActive || this.words.length === 0) return;

        const interval = this.minInterval + Math.random() * (this.maxInterval - this.minInterval);

        this.intervalId = setTimeout(() => {
            this.flash();
            this.scheduleNext();
        }, interval);
    }

    /**
     * Flash a random word in a random position
     */
    flash() {
        if (!this.isActive || this.words.length === 0) return;

        // Clear any pending hide from a previous flash
        if (this.hideTimeoutId) {
            clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }

        // Pick random word
        const word = this.words[Math.floor(Math.random() * this.words.length)];

        // Pick random position (top or bottom, or both sometimes)
        let showTop = Math.random() > 0.3;
        let showBottom = Math.random() > 0.3;
        if (!showTop && !showBottom) showTop = true;

        // Different words for top and bottom if both showing
        const word2 = this.words[Math.floor(Math.random() * this.words.length)];

        if (showTop) {
            this.topEl.textContent = word;
            this.topEl.style.opacity = this.opacity;
        }
        if (showBottom) {
            this.bottomEl.textContent = showTop ? word2 : word;
            this.bottomEl.style.opacity = this.opacity;
        }

        // Hide after display time
        this.hideTimeoutId = setTimeout(() => {
            this.hideTimeoutId = null;
            this.topEl.style.opacity = 0;
            this.bottomEl.style.opacity = 0;
        }, this.displayTime);
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubliminalEngine;
}
