/**
 * Binaural Beats Engine
 *
 * Simple stereo oscillator with white noise dither for Bluetooth compatibility.
 */

const workletCode = `
class BinauralProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Wavetable
        this.tableSize = 4096;
        this.table = new Float32Array(this.tableSize + 1);
        for (let i = 0; i <= this.tableSize; i++) {
            this.table[i] = Math.sin((i / this.tableSize) * Math.PI * 2);
        }

        this.phaseL = 0;
        this.phaseR = 0;
        this.freqL = 295;
        this.freqR = 305;
        this.gain = 0;
        this.targetFreqL = 295;
        this.targetFreqR = 305;
        this.targetGain = 0;
        this.freqSmooth = 0.01;  // seconds

        // Linear gain ramp
        this.gainStart = 0;
        this.gainEnd = 0;
        this.gainRampSamples = 0;
        this.gainRampProgress = 0;

        this.port.onmessage = (e) => {
            const d = e.data;
            if (d.freqL !== undefined) this.targetFreqL = d.freqL;
            if (d.freqR !== undefined) this.targetFreqR = d.freqR;
            if (d.freqSmooth !== undefined) this.freqSmooth = d.freqSmooth;

            // Linear ramp for gain
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

        // Exponential smoothing for frequency (good for avoiding clicks)
        const fSmooth = 1 - Math.exp(-5 / (sampleRate * Math.max(0.001, this.freqSmooth)));

        for (let i = 0; i < L.length; i++) {
            // Smooth frequency changes (exponential)
            this.freqL += (this.targetFreqL - this.freqL) * fSmooth;
            this.freqR += (this.targetFreqR - this.freqR) * fSmooth;

            // Linear ramp for gain
            if (this.gainRampProgress < this.gainRampSamples) {
                this.gainRampProgress++;
                const t = this.gainRampProgress / this.gainRampSamples;
                this.gain = this.gainStart + (this.gainEnd - this.gainStart) * t;
            } else {
                this.gain = this.gainEnd;
            }

            // Interpolated lookup
            const iL = this.phaseL | 0, fL = this.phaseL - iL;
            const iR = this.phaseR | 0, fR = this.phaseR - iR;

            const sL = table[iL] + (table[iL + 1] - table[iL]) * fL;
            const sR = table[iR] + (table[iR + 1] - table[iR]) * fR;

            L[i] = sL * this.gain;
            R[i] = sR * this.gain;

            // Advance phase
            this.phaseL += this.freqL * scale;
            this.phaseR += this.freqR * scale;
            if (this.phaseL >= N) this.phaseL -= N;
            if (this.phaseR >= N) this.phaseR -= N;
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
        this.useOscillators = false;  // Fallback mode for iOS
        this.oscL = null;
        this.oscR = null;
        this.gainNode = null;
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Try AudioWorklet first, fall back to OscillatorNode for iOS compatibility
        try {
            // Use data URL instead of blob URL for better iOS compatibility
            const dataUrl = 'data:application/javascript;base64,' + btoa(workletCode);
            await this.ctx.audioWorklet.addModule(dataUrl);
            this.node = new AudioWorkletNode(this.ctx, 'binaural-processor', {
                outputChannelCount: [2]
            });
            this.node.connect(this.ctx.destination);
        } catch (e) {
            console.log('AudioWorklet not supported, using oscillator fallback');
            this.useOscillators = true;
            this._initOscillators();
        }
    }

    _initOscillators() {
        // Fallback: use native OscillatorNodes (works everywhere including iOS)
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0;

        // Create stereo output via channel merger
        this.merger = this.ctx.createChannelMerger(2);

        this.oscL = this.ctx.createOscillator();
        this.oscR = this.ctx.createOscillator();
        this.oscL.type = 'sine';
        this.oscR.type = 'sine';
        this.oscL.frequency.value = 295;
        this.oscR.frequency.value = 305;

        // Left osc -> left channel, Right osc -> right channel
        const gainL = this.ctx.createGain();
        const gainR = this.ctx.createGain();
        this.oscL.connect(gainL);
        this.oscR.connect(gainR);
        gainL.connect(this.merger, 0, 0);
        gainR.connect(this.merger, 0, 1);

        this.merger.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);

        this.oscL.start();
        this.oscR.start();
    }

    async start(carrier = 300, beat = 10, fade = 2, fadeIn = null, volume = 0.3) {
        await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        const freqL = carrier - beat / 2;
        const freqR = carrier + beat / 2;
        const gainFade = this.isPlaying ? fade : (fadeIn !== null ? fadeIn : fade);
        const targetGain = Math.min(0.8, volume);

        if (this.useOscillators) {
            // Oscillator fallback mode
            const now = this.ctx.currentTime;
            this.oscL.frequency.setTargetAtTime(freqL, now, fade * 0.3);
            this.oscR.frequency.setTargetAtTime(freqR, now, fade * 0.3);
            this.gainNode.gain.setTargetAtTime(targetGain, now, gainFade * 0.3);
        } else {
            this.node.port.postMessage({
                freqL, freqR,
                gain: targetGain,
                freqSmooth: fade,
                gainSmooth: gainFade
            });
        }
        this.isPlaying = true;
    }

    setFrequencies(carrier, beat, seconds = 2) {
        const freqL = carrier - beat / 2;
        const freqR = carrier + beat / 2;

        if (this.useOscillators) {
            if (!this.oscL) return;
            const now = this.ctx.currentTime;
            this.oscL.frequency.setTargetAtTime(freqL, now, seconds * 0.3);
            this.oscR.frequency.setTargetAtTime(freqR, now, seconds * 0.3);
        } else {
            if (!this.node) return;
            this.node.port.postMessage({ freqL, freqR, freqSmooth: seconds });
        }
    }

    fadeTo(volume, seconds = 2) {
        const targetGain = Math.min(0.8, Math.max(0, volume));

        if (this.useOscillators) {
            if (!this.gainNode) return;
            this.gainNode.gain.setTargetAtTime(targetGain, this.ctx.currentTime, seconds * 0.3);
        } else {
            if (!this.node) return;
            this.node.port.postMessage({ gain: targetGain, gainSmooth: seconds });
        }
    }

    stop(fade = 2) {
        if (this.useOscillators) {
            if (!this.gainNode) return;
            this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, fade * 0.3);
        } else {
            if (!this.node) return;
            this.node.port.postMessage({ gain: 0, gainSmooth: fade });
        }
        this.isPlaying = false;
    }

    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = { action: 'on', carrier: 300, beat: 10, fade: 2, fadeIn: null, volume: 0.15 };
        if (parts[0] === 'off') {
            result.action = 'off';
            return result;
        }
        let n = 0;
        for (const p of parts) {
            if (p.startsWith('fadeIn:')) result.fadeIn = parseFloat(p.split(':')[1]) || 2;
            else if (p.startsWith('fade:')) result.fade = parseFloat(p.split(':')[1]) || 2;
            else if (p.startsWith('vol:')) {
                const v = parseFloat(p.split(':')[1]);
                result.volume = Math.min(0.8, Number.isFinite(v) ? v : 0.15);
            }
            else {
                const v = parseFloat(p);
                if (!isNaN(v)) {
                    if (n === 0) { result.carrier = v; n++; }
                    else if (n === 1) { result.beat = v; n++; }
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
