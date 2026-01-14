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

        // Timing config
        this.minInterval = 200;   // ms between flashes
        this.maxInterval = 600;
        this.displayTime = 150;   // ms word is visible
    }

    /**
     * Parse @subliminals command
     * Format: @subliminals [opacity] [fade:X] word1 word2 word3...
     * Or: @subliminals off [fade:X]
     */
    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            opacity: 0.4,
            fade: 0.5,
            words: []
        };

        if (parts[0] === 'off') {
            result.action = 'off';
            for (let i = 1; i < parts.length; i++) {
                if (parts[i].startsWith('fade:')) {
                    result.fade = parseFloat(parts[i].split(':')[1]) || 0.5;
                }
            }
            return result;
        }

        for (const part of parts) {
            if (part.startsWith('fade:')) {
                result.fade = parseFloat(part.split(':')[1]) || 0.5;
            } else {
                const num = parseFloat(part);
                if (!isNaN(num) && num <= 1) {
                    result.opacity = num;
                } else if (part.length > 0) {
                    // It's a word
                    result.words.push(part.toLowerCase());
                }
            }
        }

        return result;
    }

    /**
     * Start flashing subliminals
     */
    start(opacity = 0.4, fade = 0.5, words = []) {
        this.opacity = opacity;
        this.fadeTime = fade;
        this.words = words;

        if (this.words.length === 0) {
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

        // Pick random word
        const word = this.words[Math.floor(Math.random() * this.words.length)];

        // Pick random position (top or bottom, or both sometimes)
        const showTop = Math.random() > 0.3;
        const showBottom = Math.random() > 0.3;

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
        setTimeout(() => {
            this.topEl.style.opacity = 0;
            this.bottomEl.style.opacity = 0;
        }, this.displayTime);
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubliminalEngine;
}
