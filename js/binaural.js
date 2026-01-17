/**
 * Binaural Beats Engine
 *
 * Stereo oscillator with optional dual-band and spatial interleave.
 *
 * Usage:
 *   @binaural [carrier] [beat] [options]              - Single band
 *   @binaural [carrier1] [beat1] [carrier2] [beat2] [options]  - Dual band
 *   @binaural off
 *
 * Options:
 *   vol:N         - Volume 0-0.8 (default 0.15)
 *   fade:N        - Crossfade time in seconds (default 2)
 *   fadeIn:N      - Initial fade in time (default: same as fade)
 *   interleave:N  - R channel delay in ms for spatial width (default 0)
 *   mix:N         - Band 2 mix level 0-1 (default 0.5)
 */

const workletCode = `
class BinauralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Wavetable (shared for all oscillators)
        this.tableSize = 4096;
        this.table = new Float32Array(this.tableSize + 1);
        for (let i = 0; i <= this.tableSize; i++) {
            this.table[i] = Math.sin((i / this.tableSize) * Math.PI * 2);
        }

        // Band 1 (primary)
        this.phase1L = 0;
        this.phase1R = 0;
        this.freq1L = 295;
        this.freq1R = 305;
        this.targetFreq1L = 295;
        this.targetFreq1R = 305;

        // Band 2 (optional secondary)
        this.phase2L = 0;
        this.phase2R = 0;
        this.freq2L = 60;
        this.freq2R = 63.25;
        this.targetFreq2L = 60;
        this.targetFreq2R = 63.25;
        this.band2Enabled = false;
        this.band2Mix = 0.5;
        this.targetBand2Mix = 0.5;

        // Interleave delay for R channel (spatial width)
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

            // Interleave delay
            if (d.interleaveMs !== undefined) {
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

    process(inputs, outputs) {
        const out = outputs[0];
        if (!out || !out[0] || !out[1]) return true;

        const L = out[0], R = out[1];
        const table = this.table;
        const N = this.tableSize;
        const scale = N / sampleRate;

        // Frequency smoothing coefficient
        const fSmooth = 1 - Math.exp(-5 / (sampleRate * Math.max(0.001, this.freqSmooth)));
        // Slower smoothing for mix and delay
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

            // Band 1 oscillators
            const i1L = this.phase1L | 0, f1L = this.phase1L - i1L;
            const i1R = this.phase1R | 0, f1R = this.phase1R - i1R;
            const s1L = table[i1L] + (table[i1L + 1] - table[i1L]) * f1L;
            const s1R = table[i1R] + (table[i1R + 1] - table[i1R]) * f1R;

            // Band 2 oscillators (if enabled)
            let s2L = 0, s2R = 0;
            if (this.band2Enabled) {
                const i2L = this.phase2L | 0, f2L = this.phase2L - i2L;
                const i2R = this.phase2R | 0, f2R = this.phase2R - i2R;
                s2L = table[i2L] + (table[i2L + 1] - table[i2L]) * f2L;
                s2R = table[i2R] + (table[i2R + 1] - table[i2R]) * f2R;
            }

            // Mix bands
            let mixL = s1L + s2L * this.band2Mix;
            let mixR = s1R + s2R * this.band2Mix;

            // Normalize to prevent clipping when both bands active
            if (this.band2Enabled && this.band2Mix > 0) {
                const normFactor = 1 / (1 + this.band2Mix);
                mixL *= normFactor;
                mixR *= normFactor;
            }

            // Apply interleave delay to R channel
            if (this.delaySamples > 0) {
                this.delayBuffer[this.delayWritePos] = mixR;
                const delaySamplesInt = Math.floor(this.delaySamples);
                let readPos = this.delayWritePos - delaySamplesInt;
                if (readPos < 0) readPos += this.delayBuffer.length;
                mixR = this.delayBuffer[readPos];
                this.delayWritePos = (this.delayWritePos + 1) % this.delayBuffer.length;
            }

            // Apply gain
            L[i] = mixL * this.gain;
            R[i] = mixR * this.gain;

            // Advance phases
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
        }
        return true;
    }
}
registerProcessor('binaural-processor', BinauralProcessor);
`;

class BinauralEngine {
    constructor() {
        this.ctx = null;
        this.node = null;
        this.isPlaying = false;
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this.ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.node = new AudioWorkletNode(this.ctx, 'binaural-processor', {
            outputChannelCount: [2]
        });
        this.node.connect(this.ctx.destination);
    }

    async start(carrier1 = 300, beat1 = 10, carrier2 = null, beat2 = null, options = {}) {
        const {
            fade = 2,
            fadeIn = null,
            volume = 0.15,
            band2Mix = 0.5,
            interleave = 0
        } = options;

        await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        const gainFade = this.isPlaying ? fade : (fadeIn !== null ? fadeIn : fade);
        const band2Enabled = carrier2 !== null && beat2 !== null;

        const msg = {
            freq1L: carrier1 - beat1 / 2,
            freq1R: carrier1 + beat1 / 2,
            band2Enabled: band2Enabled,
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

    setInterleave(ms) {
        if (!this.node) return;
        this.node.port.postMessage({ interleaveMs: Math.max(0, Math.min(200, ms)) });
    }

    setBand2Mix(mix) {
        if (!this.node) return;
        this.node.port.postMessage({ band2Mix: Math.max(0, Math.min(1, mix)) });
    }

    fadeTo(volume, seconds = 2) {
        if (!this.node) return;
        this.node.port.postMessage({
            gain: Math.min(0.8, Math.max(0, volume)),
            gainSmooth: seconds
        });
    }

    stop(fade = 2) {
        if (!this.node) return;
        this.node.port.postMessage({ gain: 0, gainSmooth: fade });
        this.isPlaying = false;
    }

    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            carrier1: 300,
            beat1: 10,
            carrier2: null,
            beat2: null,
            fade: 2,
            fadeIn: null,
            volume: 0.15,
            interleave: 0,
            band2Mix: 0.5
        };

        if (parts[0] === 'off') {
            result.action = 'off';
            return result;
        }

        let numericIndex = 0;

        for (const p of parts) {
            if (p.startsWith('fadeIn:')) {
                result.fadeIn = parseFloat(p.split(':')[1]) || 2;
            } else if (p.startsWith('fade:')) {
                result.fade = parseFloat(p.split(':')[1]) || 2;
            } else if (p.startsWith('vol:')) {
                const v = parseFloat(p.split(':')[1]);
                result.volume = Math.min(0.8, Number.isFinite(v) ? v : 0.15);
            } else if (p.startsWith('interleave:')) {
                const v = parseFloat(p.split(':')[1]);
                result.interleave = Math.max(0, Math.min(200, Number.isFinite(v) ? v : 0));
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

        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinauralEngine;
}
