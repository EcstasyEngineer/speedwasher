/**
 * ORP (Optimal Recognition Point) Calculator
 *
 * The ORP is the character in a word where the eye naturally fixates.
 * For speed reading, highlighting this point reduces eye movement and
 * increases reading speed.
 *
 * Based on Spritz algorithm - typically 20-35% into the word.
 */

const ORP = {
    /**
     * Calculate the ORP index for a given word
     * @param {string} word - The word to calculate ORP for
     * @returns {number} - Zero-based index of the ORP character
     */
    getIndex(word) {
        // Strip punctuation for length calculation
        const cleanWord = word.replace(/[^a-zA-Z]/g, '');
        const len = cleanWord.length;

        if (len <= 1) return 0;
        if (len <= 4) return 1;   // 2nd character
        if (len <= 8) return 2;   // 3rd character
        if (len <= 13) return 3;  // 4th character
        return 4;                  // 5th character for very long words
    },

    /**
     * Split a word into before-ORP, ORP character, and after-ORP parts
     * @param {string} word - The word to split
     * @returns {Object} - {before, orp, after}
     */
    split(word) {
        if (!word || word.length === 0) {
            return { before: '', orp: '', after: '' };
        }

        const index = this.getIndex(word);

        return {
            before: word.substring(0, index),
            orp: word.charAt(index),
            after: word.substring(index + 1)
        };
    },

    /**
     * Get detailed ORP info for debugging/display
     * @param {string} word
     * @returns {Object}
     */
    analyze(word) {
        const index = this.getIndex(word);
        const parts = this.split(word);
        const cleanWord = word.replace(/[^a-zA-Z]/g, '');

        return {
            word,
            cleanLength: cleanWord.length,
            orpIndex: index,
            orpChar: parts.orp,
            parts,
            percentage: cleanWord.length > 0 ?
                Math.round((index / cleanWord.length) * 100) : 0
        };
    }
};

// Export for module systems, or attach to window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ORP;
}
