/**
 * Hybrid Binaural Engine (binaural2.js)
 *
 * Dual-band binaural with optional isochronic modulation.
 * Matches the Python "bambi" mode from HYPNOCLI.
 *
 * Usage:
 *   @binaural2 [carrier1] [beat1] [carrier2] [beat2] [options]
 *   @binaural2 off
 *
 * Options:
 *   vol:N         - Volume 0-0.8 (default 0.15)
 *   fade:N        - Crossfade time in seconds (default 2)
 *   fadeIn:N      - Initial fade in time (default: same as fade)
 *   iso           - Enable per-band isochronic (each band pulses at its beat rate)
 *   interleave:N  - R channel delay in ms for spatial effect (default 100 when iso)
 *   mix:N         - Band 2 mix level 0-1 (default 0.5)
 *
 * Examples:
 *   @binaural2 312.5 5              - Single band at 312.5Hz with 5Hz beat
 *   @binaural2 312.5 5 61.7 3.25    - Dual band: high 312.5/5Hz, low 61.7/3.25Hz
 *   @binaural2 312.5 5 61.7 3.25 iso - Full bambi mode: dual-band with per-band
 *                                      isochronic pulsing and 100ms R-channel delay
 *   @binaural2 312.5 5 61.7 3.25 iso interleave:50 - Same but 50ms delay
 *   @binaural2 off                  - Fade out and stop
 *
 * How isochronic works (bambi mode):
 *   When 'iso' is enabled, each band pulses at its own beat frequency:
 *   - Band 1 (high): pulsing at beat1 rate (e.g., 5 Hz)
 *   - Band 2 (low): pulsing at beat2 rate (e.g., 3.25 Hz)
 *   The R channel is delayed to create spatial width (like the Python version).
 */

const hybridWorkletCode = `
class HybridBinauralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Wavetable (shared for all oscillators)
        this.tableSize = 4096;
        this.table = new Float32Array(this.tableSize + 1);
        for (let i = 0; i <= this.tableSize; i++) {
            this.table[i] = Math.sin((i / this.tableSize) * Math.PI * 2);
        }

        // Band 1 (high) - phases and frequencies
        this.phase1L = 0;
        this.phase1R = 0;
        this.freq1L = 310;
        this.freq1R = 315;
        this.targetFreq1L = 310;
        this.targetFreq1R = 315;

        // Band 2 (low) - phases and frequencies
        this.phase2L = 0;
        this.phase2R = 0;
        this.freq2L = 60;
        this.freq2R = 63.25;
        this.targetFreq2L = 60;
        this.targetFreq2R = 63.25;

        // Band 2 enabled and mix level
        this.band2Enabled = false;
        this.band2Mix = 0.5;
        this.targetBand2Mix = 0.5;

        // Isochronic modulation (per-band envelopes like Python bambi mode)
        this.isoPhase1 = 0;  // High band envelope phase
        this.isoPhase2 = 0;  // Low band envelope phase
        this.isoEnabled = false;  // When true, each band pulses at its beat rate

        // Interleave delay for R channel (creates spatial staggering)
        this.interleaveMs = 0;
        this.targetInterleaveMs = 0;
        this.delayBuffer = new Float32Array(Math.ceil(sampleRate * 0.2));  // Max 200ms
        this.delayWritePos = 0;
        this.delaySamples = 0;
        this.targetDelaySamples = 0;

        // Gain control
        this.gain = 0;
        this.gainStart = 0;
        this.gainEnd = 0;
        this.gainRampSamples = 0;
        this.gainRampProgress = 0;

        // Smoothing
        this.freqSmooth = 0.01;

        this.port.onmessage = (e) => {
            const d = e.data;

            // Band 1 frequencies
            if (d.freq1L !== undefined) this.targetFreq1L = d.freq1L;
            if (d.freq1R !== undefined) this.targetFreq1R = d.freq1R;

            // Band 2 frequencies
            if (d.freq2L !== undefined) this.targetFreq2L = d.freq2L;
            if (d.freq2R !== undefined) this.targetFreq2R = d.freq2R;
            if (d.band2Enabled !== undefined) this.band2Enabled = d.band2Enabled;
            if (d.band2Mix !== undefined) this.targetBand2Mix = d.band2Mix;

            // Isochronic on/off (per-band pulsing at each beat rate)
            if (d.isoEnabled !== undefined) this.isoEnabled = d.isoEnabled;

            // Interleave delay for R channel
            if (d.interleaveMs !== undefined) {
                this.targetInterleaveMs = d.interleaveMs;
                this.targetDelaySamples = Math.floor(sampleRate * d.interleaveMs / 1000);
            }

            // Smoothing
            if (d.freqSmooth !== undefined) this.freqSmooth = d.freqSmooth;

            // Gain with linear ramp
            if (d.gain !== undefined) {
                this.gainStart = this.gain;
                this.gainEnd = Math.max(0, Math.min(1, d.gain));
                this.gainRampSamples = (d.gainSmooth || 0.01) * sampleRate;
                this.gainRampProgress = 0;
            }
        };
    }

    // Raised cosine envelope for isochronic modulation (0 to 1)
    isochronicEnvelope(phase) {
        return 0.5 * (1 + Math.cos(phase + Math.PI));
    }

    process(inputs, outputs) {
        const out = outputs[0];
        if (!out || !out[0] || !out[1]) return true;

        const L = out[0], R = out[1];
        const table = this.table;
        const N = this.tableSize;
        const scale = N / sampleRate;

        // Frequency smoothing coefficient
        const fSmooth = 1 - Math.exp(-5 / (sampleRate * Math.max(0.001, this.freqSmooth)));
        // Slower smoothing for mix and iso rate
        const slowSmooth = 1 - Math.exp(-2 / (sampleRate * 0.1));

        for (let i = 0; i < L.length; i++) {
            // Smooth frequency changes
            this.freq1L += (this.targetFreq1L - this.freq1L) * fSmooth;
            this.freq1R += (this.targetFreq1R - this.freq1R) * fSmooth;
            this.freq2L += (this.targetFreq2L - this.freq2L) * fSmooth;
            this.freq2R += (this.targetFreq2R - this.freq2R) * fSmooth;

            // Smooth mix and delay
            this.band2Mix += (this.targetBand2Mix - this.band2Mix) * slowSmooth;
            this.delaySamples += (this.targetDelaySamples - this.delaySamples) * slowSmooth;

            // Linear gain ramp
            if (this.gainRampProgress < this.gainRampSamples) {
                this.gainRampProgress++;
                const t = this.gainRampProgress / this.gainRampSamples;
                this.gain = this.gainStart + (this.gainEnd - this.gainStart) * t;
            } else {
                this.gain = this.gainEnd;
            }

            // Calculate beat frequencies for isochronic envelopes
            const beat1 = this.freq1R - this.freq1L;  // High band beat rate
            const beat2 = this.freq2R - this.freq2L;  // Low band beat rate

            // Band 1 oscillators (interpolated wavetable lookup)
            const i1L = this.phase1L | 0, f1L = this.phase1L - i1L;
            const i1R = this.phase1R | 0, f1R = this.phase1R - i1R;
            let s1L = table[i1L] + (table[i1L + 1] - table[i1L]) * f1L;
            let s1R = table[i1R] + (table[i1R + 1] - table[i1R]) * f1R;

            // Apply band 1 isochronic envelope (same envelope for both L/R)
            if (this.isoEnabled) {
                const iso1 = this.isochronicEnvelope(this.isoPhase1);
                s1L *= iso1;
                s1R *= iso1;
            }

            // Band 2 oscillators
            let s2L = 0, s2R = 0;
            if (this.band2Enabled) {
                const i2L = this.phase2L | 0, f2L = this.phase2L - i2L;
                const i2R = this.phase2R | 0, f2R = this.phase2R - i2R;
                s2L = table[i2L] + (table[i2L + 1] - table[i2L]) * f2L;
                s2R = table[i2R] + (table[i2R + 1] - table[i2R]) * f2R;

                // Apply band 2 isochronic envelope (same envelope for both L/R)
                if (this.isoEnabled) {
                    const iso2 = this.isochronicEnvelope(this.isoPhase2);
                    s2L *= iso2;
                    s2R *= iso2;
                }
            }

            // Mix bands: band1 at full, band2 at mix level
            let mixL = s1L + s2L * this.band2Mix;
            let mixR = s1R + s2R * this.band2Mix;

            // Normalize mix to prevent clipping when both bands active
            if (this.band2Enabled && this.band2Mix > 0) {
                const normFactor = 1 / (1 + this.band2Mix);
                mixL *= normFactor;
                mixR *= normFactor;
            }

            // Apply interleave delay to R channel (spatial staggering like Python bambi)
            if (this.delaySamples > 0) {
                // Write current R sample to delay buffer
                this.delayBuffer[this.delayWritePos] = mixR;
                // Read delayed sample
                const delaySamplesInt = Math.floor(this.delaySamples);
                let readPos = this.delayWritePos - delaySamplesInt;
                if (readPos < 0) readPos += this.delayBuffer.length;
                mixR = this.delayBuffer[readPos];
                // Advance write position
                this.delayWritePos = (this.delayWritePos + 1) % this.delayBuffer.length;
            }

            // Apply gain
            L[i] = mixL * this.gain;
            R[i] = mixR * this.gain;

            // Advance carrier phases
            this.phase1L += this.freq1L * scale;
            this.phase1R += this.freq1R * scale;
            if (this.phase1L >= N) this.phase1L -= N;
            if (this.phase1R >= N) this.phase1R -= N;

            if (this.band2Enabled) {
                this.phase2L += this.freq2L * scale;
                this.phase2R += this.freq2R * scale;
                if (this.phase2L >= N) this.phase2L -= N;
                if (this.phase2R >= N) this.phase2R -= N;
            }

            // Advance isochronic envelope phases (each band pulses at its beat rate)
            if (this.isoEnabled) {
                this.isoPhase1 += (2 * Math.PI * beat1) / sampleRate;
                if (this.isoPhase1 >= 2 * Math.PI) this.isoPhase1 -= 2 * Math.PI;

                if (this.band2Enabled) {
                    this.isoPhase2 += (2 * Math.PI * beat2) / sampleRate;
                    if (this.isoPhase2 >= 2 * Math.PI) this.isoPhase2 -= 2 * Math.PI;
                }
            }
        }
        return true;
    }
}
registerProcessor('hybrid-binaural-processor', HybridBinauralProcessor);
`;

class HybridBinauralEngine {
    constructor() {
        this.ctx = null;
        this.node = null;
        this.isPlaying = false;
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Use data URL instead of blob URL for iOS Safari compatibility
        const dataUrl = 'data:application/javascript;base64,' + btoa(hybridWorkletCode);
        await this.ctx.audioWorklet.addModule(dataUrl);
        this.node = new AudioWorkletNode(this.ctx, 'hybrid-binaural-processor', {
            outputChannelCount: [2]
        });
        this.node.connect(this.ctx.destination);
    }

    /**
     * Start or update hybrid binaural
     * @param {number} carrier1 - Band 1 carrier frequency (Hz)
     * @param {number} beat1 - Band 1 beat frequency (Hz)
     * @param {number|null} carrier2 - Band 2 carrier frequency (Hz), null to disable
     * @param {number|null} beat2 - Band 2 beat frequency (Hz)
     * @param {object} options - { fade, fadeIn, volume, iso, band2Mix, interleave }
     */
    async start(carrier1 = 312.5, beat1 = 5, carrier2 = null, beat2 = null, options = {}) {
        const {
            fade = 2,
            fadeIn = null,
            volume = 0.15,
            iso = false,          // Per-band isochronic (each band pulses at its beat rate)
            band2Mix = 0.5,
            interleave = 0        // R channel delay in ms (default 0, Python uses 100)
        } = options;

        await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        const gainFade = this.isPlaying ? fade : (fadeIn !== null ? fadeIn : fade);
        const band2Enabled = carrier2 !== null && beat2 !== null;

        const msg = {
            freq1L: carrier1 - beat1 / 2,
            freq1R: carrier1 + beat1 / 2,
            band2Enabled: band2Enabled,
            isoEnabled: iso,
            interleaveMs: interleave,
            band2Mix: band2Mix,
            gain: Math.min(0.8, volume),
            freqSmooth: fade,
            gainSmooth: gainFade
        };

        if (band2Enabled) {
            msg.freq2L = carrier2 - beat2 / 2;
            msg.freq2R = carrier2 + beat2 / 2;
        }

        this.node.port.postMessage(msg);
        this.isPlaying = true;
    }

    /**
     * Update frequencies without changing other parameters
     */
    setFrequencies(carrier1, beat1, carrier2 = null, beat2 = null, seconds = 2) {
        if (!this.node) return;

        const msg = {
            freq1L: carrier1 - beat1 / 2,
            freq1R: carrier1 + beat1 / 2,
            freqSmooth: seconds
        };

        if (carrier2 !== null && beat2 !== null) {
            msg.freq2L = carrier2 - beat2 / 2;
            msg.freq2R = carrier2 + beat2 / 2;
            msg.band2Enabled = true;
        }

        this.node.port.postMessage(msg);
    }

    /**
     * Enable/disable per-band isochronic modulation
     */
    setIsoEnabled(enabled) {
        if (!this.node) return;
        this.node.port.postMessage({ isoEnabled: enabled });
    }

    /**
     * Set R channel interleave delay in ms
     */
    setInterleave(ms) {
        if (!this.node) return;
        this.node.port.postMessage({ interleaveMs: Math.max(0, Math.min(200, ms)) });
    }

    /**
     * Set band 2 mix level
     */
    setBand2Mix(mix) {
        if (!this.node) return;
        this.node.port.postMessage({ band2Mix: Math.max(0, Math.min(1, mix)) });
    }

    /**
     * Fade volume
     */
    fadeTo(volume, seconds = 2) {
        if (!this.node) return;
        this.node.port.postMessage({
            gain: Math.min(0.8, Math.max(0, volume)),
            gainSmooth: seconds
        });
    }

    /**
     * Stop with fade out
     */
    stop(fade = 2) {
        if (!this.node) return;
        this.node.port.postMessage({ gain: 0, gainSmooth: fade });
        this.isPlaying = false;
    }

    /**
     * Parse command string for hybrid binaural
     * Format: [carrier1] [beat1] [carrier2] [beat2] [options...]
     * Options: vol:N, fade:N, fadeIn:N, iso, interleave:N, mix:N
     *
     * The 'iso' flag enables per-band isochronic modulation:
     * - Band 1 pulses at beat1 rate
     * - Band 2 pulses at beat2 rate
     * This matches the Python "bambi" mode behavior.
     *
     * interleave:N delays the R channel by N milliseconds (default 100 when iso enabled)
     */
    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            carrier1: 312.5,
            beat1: 5,
            carrier2: null,
            beat2: null,
            fade: 2,
            fadeIn: null,
            volume: 0.15,
            iso: false,
            interleave: 0,
            band2Mix: 0.5
        };

        if (parts[0] === 'off') {
            result.action = 'off';
            return result;
        }

        let numericIndex = 0;
        let interleaveExplicit = false;

        for (const p of parts) {
            if (p.startsWith('fadeIn:')) {
                result.fadeIn = parseFloat(p.split(':')[1]) || 2;
            } else if (p.startsWith('fade:')) {
                result.fade = parseFloat(p.split(':')[1]) || 2;
            } else if (p.startsWith('vol:')) {
                const v = parseFloat(p.split(':')[1]);
                result.volume = Math.min(0.8, Number.isFinite(v) ? v : 0.15);
            } else if (p === 'iso') {
                // Enable per-band isochronic modulation
                result.iso = true;
            } else if (p.startsWith('interleave:')) {
                const v = parseFloat(p.split(':')[1]);
                result.interleave = Math.max(0, Math.min(200, Number.isFinite(v) ? v : 100));
                interleaveExplicit = true;
            } else if (p.startsWith('mix:')) {
                const m = parseFloat(p.split(':')[1]);
                result.band2Mix = Math.min(1, Math.max(0, Number.isFinite(m) ? m : 0.5));
            } else {
                const v = parseFloat(p);
                if (!isNaN(v)) {
                    switch (numericIndex) {
                        case 0: result.carrier1 = v; break;
                        case 1: result.beat1 = v; break;
                        case 2: result.carrier2 = v; break;
                        case 3: result.beat2 = v; break;
                    }
                    numericIndex++;
                }
            }
        }

        // fadeIn defaults to fade if not specified
        if (result.fadeIn === null) result.fadeIn = result.fade;

        // If iso enabled but no explicit interleave, use default 100ms (like Python bambi)
        if (result.iso && !interleaveExplicit) {
            result.interleave = 100;
        }

        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = HybridBinauralEngine;
}
