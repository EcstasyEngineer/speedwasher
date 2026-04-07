/**
 * Tone Engine - Binaural, Isochronic, and Hybrid modes
 *
 * Supports multiple named layers with keyframeable parameters.
 * Calling a named layer again smoothly transitions to the new values.
 *
 * Tags (all parameters are key:value):
 *   @binaural [name] carrier:N beat:N db:N fade:N vol:N interleave:N
 *   @isochronic [name] carrier:N pulse:N db:N ear:L|R|LR fade:N vol:N
 *   @hybrid [name] carrier:N beat:N pulse:N db:N fade:N vol:N interleave:N
 *   @<tag> [name] off [fade:N]
 *
 * Keyframing: reuse the same layer name with new values to transition.
 */

const MAX_LAYERS = 8;

const toneWorkletCode = `
class ToneProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Sine wavetable (4096 + guard point)
        this.N = 4096;
        this.table = new Float32Array(this.N + 1);
        for (let i = 0; i <= this.N; i++) {
            this.table[i] = Math.sin((i / this.N) * Math.PI * 2);
        }

        // Per-layer state
        this.layers = new Array(${MAX_LAYERS});
        for (let i = 0; i < ${MAX_LAYERS}; i++) {
            this.layers[i] = {
                active: false,
                phaseL: 0, phaseR: 0,           // carrier phases (wavetable units)
                freqL: 0, freqR: 0,             // current carrier freqs
                targetFreqL: 0, targetFreqR: 0,
                pulsePhase: 0,                   // isochronic envelope phase (radians)
                pulseOffset: 0,                  // R channel envelope offset (0 or PI)
                pulseRate: 0, targetPulseRate: 0,
                gain: 0, targetGain: 0,
                gainStart: 0, gainRampLen: 1, gainRampPos: 1,
                ear: 2,                          // 0=L, 1=R, 2=LR
                freqSmooth: 2                    // transition time in seconds
            };
        }

        // Interleave delay (global, R channel)
        this.delayBuf = new Float32Array(Math.ceil(sampleRate * 0.2));
        this.delayW = 0;
        this.delaySamples = 0;
        this.targetDelay = 0;

        this.port.onmessage = (e) => {
            const d = e.data;
            if (d.layer !== undefined && d.layer >= 0 && d.layer < ${MAX_LAYERS}) {
                const l = this.layers[d.layer];
                l.active = true;
                // snap: set current freq immediately (for new layers)
                if (d.snap) {
                    if (d.freqL !== undefined) { l.freqL = d.freqL; l.targetFreqL = d.freqL; }
                    if (d.freqR !== undefined) { l.freqR = d.freqR; l.targetFreqR = d.freqR; }
                    if (d.pulseRate !== undefined) { l.pulseRate = d.pulseRate; l.targetPulseRate = d.pulseRate; }
                    l.gain = 0;       // new layers start from silence
                    l.gainStart = 0;
                } else {
                    if (d.freqL !== undefined) l.targetFreqL = d.freqL;
                    if (d.freqR !== undefined) l.targetFreqR = d.freqR;
                    if (d.pulseRate !== undefined) l.targetPulseRate = d.pulseRate;
                }
                if (d.pulseOffset !== undefined) l.pulseOffset = d.pulseOffset;
                if (d.ear !== undefined) l.ear = d.ear;
                if (d.freqSmooth !== undefined) l.freqSmooth = d.freqSmooth;
                if (d.gain !== undefined) {
                    l.gainStart = l.gain;
                    l.targetGain = Math.max(0, Math.min(1, d.gain));
                    l.gainRampLen = Math.max(1, (d.fadeTime || 0.01) * sampleRate);
                    l.gainRampPos = 0;
                }
            }
            if (d.interleaveMs !== undefined) {
                this.targetDelay = Math.min(
                    Math.floor(sampleRate * d.interleaveMs / 1000),
                    this.delayBuf.length - 1
                );
            }
        };
    }

    process(inputs, outputs) {
        const out = outputs[0];
        if (!out || !out[0] || !out[1]) return true;

        const L = out[0], R = out[1];
        const table = this.table;
        const N = this.N;
        const scale = N / sampleRate;
        const dSmooth = 1 - Math.exp(-2 / (sampleRate * 0.1));
        const TWO_PI = 6.283185307179586;
        const blockLen = L.length;

        L.fill(0);
        R.fill(0);

        for (let li = 0; li < ${MAX_LAYERS}; li++) {
            const ly = this.layers[li];
            if (!ly.active) continue;
            if (ly.gain === 0 && ly.targetGain === 0) {
                ly.active = false;
                continue;
            }

            const fSmooth = 1 - Math.exp(-5 / (sampleRate * Math.max(0.001, ly.freqSmooth)));

            for (let i = 0; i < blockLen; i++) {
                // Smooth frequency transitions
                ly.freqL += (ly.targetFreqL - ly.freqL) * fSmooth;
                ly.freqR += (ly.targetFreqR - ly.freqR) * fSmooth;
                ly.pulseRate += (ly.targetPulseRate - ly.pulseRate) * fSmooth;

                // Linear gain ramp
                if (ly.gainRampPos < ly.gainRampLen) {
                    ly.gainRampPos++;
                    const t = ly.gainRampPos / ly.gainRampLen;
                    ly.gain = ly.gainStart + (ly.targetGain - ly.gainStart) * t;
                } else {
                    ly.gain = ly.targetGain;
                }

                // Carrier oscillators (wavetable with linear interpolation)
                const iL = ly.phaseL | 0, fL = ly.phaseL - iL;
                const iR = ly.phaseR | 0, fR = ly.phaseR - iR;
                let sL = table[iL] + (table[iL + 1] - table[iL]) * fL;
                let sR = table[iR] + (table[iR + 1] - table[iR]) * fR;

                // Isochronic envelope: raised cosine with optional L/R offset
                if (ly.pulseRate > 0.001) {
                    const envL = 0.5 * (1 - Math.cos(ly.pulsePhase));
                    const envR = 0.5 * (1 - Math.cos(ly.pulsePhase + ly.pulseOffset));
                    sL *= envL;
                    sR *= envR;

                    ly.pulsePhase += TWO_PI * ly.pulseRate / sampleRate;
                    if (ly.pulsePhase >= TWO_PI) ly.pulsePhase -= TWO_PI;
                    else if (ly.pulsePhase < 0) ly.pulsePhase += TWO_PI;
                }

                // Ear routing + gain
                const g = ly.gain;
                if (ly.ear === 0) {
                    L[i] += sL * g;
                } else if (ly.ear === 1) {
                    R[i] += sR * g;
                } else {
                    L[i] += sL * g;
                    R[i] += sR * g;
                }

                // Advance carrier phases
                ly.phaseL += ly.freqL * scale;
                ly.phaseR += ly.freqR * scale;
                if (ly.phaseL >= N) ly.phaseL -= N;
                else if (ly.phaseL < 0) ly.phaseL += N;
                if (ly.phaseR >= N) ly.phaseR -= N;
                else if (ly.phaseR < 0) ly.phaseR += N;
            }
        }

        // Interleave delay on mixed R output
        this.delaySamples += (this.targetDelay - this.delaySamples) * dSmooth;
        if (this.delaySamples > 0.5) {
            const ds = Math.floor(this.delaySamples);
            for (let i = 0; i < blockLen; i++) {
                this.delayBuf[this.delayW] = R[i];
                let rp = this.delayW - ds;
                if (rp < 0) rp += this.delayBuf.length;
                R[i] = this.delayBuf[rp];
                this.delayW = (this.delayW + 1) % this.delayBuf.length;
            }
        }

        return true;
    }
}
registerProcessor('tone-processor', ToneProcessor);
`;

class BinauralEngine {
    // Named presets — each is an array of {carrier, beat, pulse} for 3 layers
    static PRESETS = {
        reactor: [
            { carrier: 60,  beat: 2,   pulse: 4 },
            { carrier: 95,  beat: 3,   pulse: 5 },
            { carrier: 190, beat: 4.5, pulse: 6 }
        ],
        warm: [
            { carrier: 55,  beat: 1.5, pulse: 4.5 },
            { carrier: 82,  beat: 2.5, pulse: 5.5 },
            { carrier: 158, beat: 3,   pulse: 6.5 }
        ],
        still: [
            { carrier: 52,  beat: 1.5, pulse: 3.5 },
            { carrier: 78,  beat: 2,   pulse: 5 },
            { carrier: 155, beat: 2.5, pulse: 6 }
        ],
        dark: [
            { carrier: 50,  beat: 2,   pulse: 3 },
            { carrier: 74,  beat: 2.5, pulse: 4 },
            { carrier: 142, beat: 2.5, pulse: 5 }
        ]
    };

    static LAYER_NAMES = ['_low', '_mid', '_high'];
    static DEFAULT_VOL = 0.15;

    constructor() {
        this.ctx = null;
        this.node = null;
        this.layers = new Map();   // name -> { index, mode, carrier, beat, pulse, ear, vol, gain, fade }
        this.nextIndex = 0;
        this.freeIndices = [];
        this.isPlaying = false;
        this._initPromise = null;
        this._generation = 0;
    }

    async init() {
        if (this.ctx) return;
        if (this._initPromise) return this._initPromise;
        this._initPromise = this._doInit();
        return this._initPromise;
    }

    async _doInit() {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        try {
            const blob = new Blob([toneWorkletCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            this.node = new AudioWorkletNode(ctx, 'tone-processor', {
                outputChannelCount: [2]
            });
            this.node.connect(ctx.destination);
            this.ctx = ctx;
        } catch (e) {
            ctx.close().catch(() => {});
            this._initPromise = null;
            throw e;
        }
    }

    _allocIndex() {
        if (this.freeIndices.length > 0) return this.freeIndices.pop();
        if (this.nextIndex >= MAX_LAYERS) return -1;
        return this.nextIndex++;
    }

    _freeIndex(idx) {
        this.freeIndices.push(idx);
    }

    /**
     * Apply a single layer command (low-level).
     * All presets resolve down to this.
     */
    async applyLayer(name, params) {
        await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        let layer = this.layers.get(name);
        let isNew = false;
        if (!layer) {
            const idx = this._allocIndex();
            if (idx < 0) {
                console.warn('Max tone layers reached (' + MAX_LAYERS + ')');
                return;
            }
            layer = { index: idx };
            this.layers.set(name, layer);
            isNew = true;
        }

        // Hybrid mode: binaural beat + isochronic pulse with L/R offset
        const freqL = Math.max(0, params.carrier - params.beat / 2);
        const freqR = Math.max(0, params.carrier + params.beat / 2);
        const pulseRate = Math.max(0, params.pulse);
        const gain = Math.min(0.8, params.vol !== undefined ? params.vol : BinauralEngine.DEFAULT_VOL);

        const msg = {
            layer: layer.index,
            freqL, freqR,
            pulseRate, pulseOffset: Math.PI,
            gain,
            fadeTime: params.fade,
            freqSmooth: params.fade,
            snap: isNew,
            ear: 2  // both ears
        };

        this.node.port.postMessage(msg);

        layer.carrier = params.carrier;
        layer.beat = params.beat || 0;
        layer.pulse = params.pulse || 0;
        layer.vol = gain;
        layer.gain = gain;
        layer.fade = params.fade;

        this.isPlaying = true;
    }

    /**
     * Apply a preset or custom layers from a parsed @binaural command.
     */
    async applyPreset(parsed) {
        if (parsed.action === 'off') {
            this.stopAll(parsed.fade);
            return;
        }

        const specs = parsed.layers; // array of {carrier, beat, pulse, vol?}
        const maxLayers = Math.max(specs.length, 3);
        const names = [];
        for (let i = 0; i < maxLayers; i++) names.push('_layer' + i);

        // Stop layers beyond new count
        for (let i = specs.length; i < maxLayers; i++) {
            if (this.layers.has(names[i])) {
                this.stopLayer(names[i], parsed.fade);
            }
        }

        for (let i = 0; i < specs.length; i++) {
            await this.applyLayer(names[i], {
                carrier: specs[i].carrier,
                beat: specs[i].beat,
                pulse: specs[i].pulse,
                vol: specs[i].vol,
                fade: parsed.fade
            });
        }
    }

    /**
     * Parse @binaural command args.
     *
     * Forms:
     *   @binaural fade:8                              → default reactor preset
     *   @binaural type:warm fade:8                    → named preset
     *   @binaural layers:60/2/4,95/3.5/5,190/4.5/6 fade:8  → custom
     *   @binaural off fade:8                          → stop all
     */
    static parsePresetCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = { action: 'on', type: 'reactor', layers: null, fade: 8 };

        // Check for 'off'
        if (parts[0] === 'off') {
            result.action = 'off';
            for (const p of parts.slice(1)) {
                if (p.startsWith('fade:')) {
                    const v = parseFloat(p.split(':')[1]);
                    if (Number.isFinite(v)) result.fade = v;
                }
            }
            return result;
        }

        for (const p of parts) {
            if (!p.includes(':')) continue;
            const [key, val] = [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)];
            switch (key) {
                case 'type':
                    result.type = val;
                    break;
                case 'fade': {
                    const v = parseFloat(val);
                    if (Number.isFinite(v)) result.fade = v;
                    break;
                }
                case 'layers':
                    result.layers = val.split(',').map(spec => {
                        const nums = spec.split('/').map(Number);
                        return {
                            carrier: nums[0] || 100,
                            beat: nums[1] || 3,
                            pulse: nums[2] || 5,
                            vol: nums[3] !== undefined ? (nums[3] / 10) * 0.3 : undefined
                        };
                    });
                    break;
            }
        }

        // Resolve preset if no custom layers
        if (!result.layers) {
            const preset = BinauralEngine.PRESETS[result.type] || BinauralEngine.PRESETS.reactor;
            result.layers = preset.map(l => ({ ...l }));
        }

        return result;
    }

    stopLayer(name, fade = 2) {
        const layer = this.layers.get(name);
        if (!layer || !this.node) return;
        this.node.port.postMessage({ layer: layer.index, gain: 0, fadeTime: fade });
        const idx = layer.index;
        this.layers.delete(name);
        if (this.layers.size === 0) this.isPlaying = false;
        // Delay freeing the index until the worklet fade completes.
        // Guard with generation so stopAll() invalidates pending frees.
        const gen = this._generation;
        setTimeout(() => {
            if (this._generation === gen) this._freeIndex(idx);
        }, fade * 1000 + 100);
    }

    stopAll(fade = 2) {
        if (!this.node) return;
        this._generation++;  // invalidate pending stopLayer frees
        for (const [, layer] of this.layers) {
            this.node.port.postMessage({ layer: layer.index, gain: 0, fadeTime: fade });
        }
        this.layers.clear();
        this.nextIndex = 0;
        this.freeIndices = [];
        this.isPlaying = false;
    }

    // Alias for app.js compatibility
    stop(fade = 2) {
        this.stopAll(fade);
    }

    // Pause: fade all layers to 0 but keep them in the map
    pauseAll(fade = 0.5) {
        if (!this.node) return;
        for (const [, layer] of this.layers) {
            this.node.port.postMessage({ layer: layer.index, gain: 0, fadeTime: fade });
        }
        this.isPlaying = false;
    }

    // Resume: restore all layers to their stored gain
    resumeAll(fade = 0.5) {
        if (!this.node) return;
        for (const [, layer] of this.layers) {
            if (layer.gain > 0) {
                this.node.port.postMessage({
                    layer: layer.index,
                    gain: layer.gain,
                    fadeTime: fade
                });
            }
        }
        if (this.layers.size > 0) this.isPlaying = true;
    }

    hasActiveLayers() {
        return this.layers.size > 0;
    }

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinauralEngine;
}
