/**
 * Tone Engine - Binaural, Isochronic, and Hybrid modes
 *
 * Supports multiple named layers with keyframeable parameters.
 * Calling a named layer again smoothly transitions to the new values.
 *
 * Tags:
 *   @binaural [name] <carrier> <beat> [amplitude_db] [fade:N] [vol:N] [interleave:N]
 *   @isochronic [name] <carrier> <pulse_rate> [amplitude_db] [L|R|LR] [fade:N] [vol:N]
 *   @hybrid [name] <carrier> <beat> <pulse_rate> [amplitude_db] [fade:N] [vol:N] [interleave:N]
 *   @<tag> [name] off [fade:N]
 *
 * Parameter order matches hypnocli:
 *   binaural:   carrier, beat, amplitude_db
 *   isochronic: carrier, pulse_rate, amplitude_db, ear
 *   hybrid:     carrier, beat, pulse_rate, amplitude_db
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
                if (ly.phaseR >= N) ly.phaseR -= N;
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
    constructor() {
        this.ctx = null;
        this.node = null;
        this.layers = new Map();   // name -> { index, mode, carrier, beat, pulse, ampDb, ear, vol, gain, fade }
        this.nextIndex = 0;
        this.freeIndices = [];
        this.masterVol = 0.15;
        this.isPlaying = false;
    }

    async init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const blob = new Blob([toneWorkletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this.ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.node = new AudioWorkletNode(this.ctx, 'tone-processor', {
            outputChannelCount: [2]
        });
        this.node.connect(this.ctx.destination);
    }

    _allocIndex() {
        return this.freeIndices.length > 0 ? this.freeIndices.pop() : this.nextIndex++;
    }

    _freeIndex(idx) {
        this.freeIndices.push(idx);
    }

    dbToLinear(db) {
        return Math.pow(10, db / 20);
    }

    async applyCommand(mode, params) {
        await this.init();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        if (params.action === 'off') {
            if (params.name) {
                this.stopLayer(params.name, params.fade);
            } else {
                this.stopAll(params.fade);
            }
            return;
        }

        // Update master vol if explicitly set
        if (params.vol !== undefined) this.masterVol = params.vol;

        // Get or create layer
        let layer = this.layers.get(params.name);
        let isNew = false;
        if (!layer) {
            const idx = this._allocIndex();
            if (idx >= MAX_LAYERS) {
                console.warn('Max tone layers reached (' + MAX_LAYERS + ')');
                return;
            }
            layer = { index: idx };
            this.layers.set(params.name, layer);
            isNew = true;
        }

        // Compute L/R frequencies based on mode
        let freqL, freqR, pulseRate, pulseOffset;
        switch (mode) {
            case 'binaural':
                freqL = params.carrier - params.beat / 2;
                freqR = params.carrier + params.beat / 2;
                pulseRate = 0;
                pulseOffset = 0;
                break;
            case 'isochronic':
                freqL = params.carrier;
                freqR = params.carrier;
                pulseRate = params.pulse;
                pulseOffset = 0;  // same envelope both ears
                break;
            case 'hybrid':
                freqL = params.carrier - params.beat / 2;
                freqR = params.carrier + params.beat / 2;
                pulseRate = params.pulse;
                pulseOffset = Math.PI;  // 180 degree L/R offset
                break;
        }

        // Compute gain: vol * db_to_linear(ampDb), capped at 0.8
        const vol = params.vol !== undefined ? params.vol : this.masterVol;
        const gain = Math.min(0.8, vol * this.dbToLinear(params.ampDb));

        // Send to worklet
        // New layers: snap freq immediately, only fade gain
        // Existing layers: smooth freq transition (keyframing)
        const msg = {
            layer: layer.index,
            freqL, freqR,
            pulseRate, pulseOffset,
            gain,
            fadeTime: params.fade,
            freqSmooth: params.fade,
            snap: isNew,
            ear: params.ear === 'L' ? 0 : params.ear === 'R' ? 1 : 2
        };

        if (params.interleave !== undefined) {
            msg.interleaveMs = Math.max(0, Math.min(200, params.interleave));
        }

        this.node.port.postMessage(msg);

        // Store state for pause/resume
        layer.mode = mode;
        layer.carrier = params.carrier;
        layer.beat = params.beat || 0;
        layer.pulse = params.pulse || 0;
        layer.ampDb = params.ampDb;
        layer.ear = params.ear || 'LR';
        layer.vol = vol;
        layer.gain = gain;
        layer.fade = params.fade;

        this.isPlaying = true;
    }

    stopLayer(name, fade = 2) {
        const layer = this.layers.get(name);
        if (!layer || !this.node) return;
        this.node.port.postMessage({ layer: layer.index, gain: 0, fadeTime: fade });
        this._freeIndex(layer.index);
        this.layers.delete(name);
        if (this.layers.size === 0) this.isPlaying = false;
    }

    stopAll(fade = 2) {
        if (!this.node) return;
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

    /**
     * Parse command args for any of the three modes.
     *
     * @param {string} mode - 'binaural', 'isochronic', or 'hybrid'
     * @param {string} args - Everything after "@tag "
     * @returns {object} Parsed params
     */
    static parseCommand(mode, args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            name: null,      // null = stop-all when action is 'off'
            carrier: 200,
            beat: 0,
            pulse: 0,
            ampDb: 0,
            ear: 'LR',
            fade: 2,
            vol: undefined,
            interleave: undefined
        };

        let pi = 0;  // current index into parts

        // Check for name: starts with a letter, isn't 'off' or an ear code
        if (parts[0] && /^[a-zA-Z]/.test(parts[0]) &&
            parts[0] !== 'off' && !['L','R','LR'].includes(parts[0].toUpperCase())) {
            result.name = parts[0];
            pi = 1;
        }

        // Check for 'off'
        if (parts[pi] === 'off') {
            result.action = 'off';
            for (let i = pi + 1; i < parts.length; i++) {
                if (parts[i].startsWith('fade:')) {
                    result.fade = parseFloat(parts[i].split(':')[1]) || 2;
                }
            }
            return result;
        }

        // If no name was given for an 'on' command, default to '_default'
        if (result.name === null) result.name = '_default';

        // Parse positional numerics + options
        let numIdx = 0;
        for (let i = pi; i < parts.length; i++) {
            const p = parts[i];

            if (p.startsWith('fade:')) {
                result.fade = parseFloat(p.split(':')[1]) || 2;
            } else if (p.startsWith('vol:')) {
                const v = parseFloat(p.split(':')[1]);
                result.vol = Number.isFinite(v) ? Math.min(0.8, Math.max(0, v)) : undefined;
            } else if (p.startsWith('interleave:')) {
                const v = parseFloat(p.split(':')[1]);
                result.interleave = Number.isFinite(v) ? Math.max(0, Math.min(200, v)) : undefined;
            } else if (['L', 'R', 'LR'].includes(p.toUpperCase())) {
                result.ear = p.toUpperCase();
            } else {
                const v = parseFloat(p);
                if (!isNaN(v)) {
                    switch (mode) {
                        case 'binaural':
                            // carrier, beat, amplitude_db
                            if (numIdx === 0) result.carrier = v;
                            else if (numIdx === 1) result.beat = v;
                            else if (numIdx === 2) result.ampDb = v;
                            break;
                        case 'isochronic':
                            // carrier, pulse_rate, amplitude_db
                            if (numIdx === 0) result.carrier = v;
                            else if (numIdx === 1) result.pulse = v;
                            else if (numIdx === 2) result.ampDb = v;
                            break;
                        case 'hybrid':
                            // carrier, beat, pulse_rate, amplitude_db
                            if (numIdx === 0) result.carrier = v;
                            else if (numIdx === 1) result.beat = v;
                            else if (numIdx === 2) result.pulse = v;
                            else if (numIdx === 3) result.ampDb = v;
                            break;
                    }
                    numIdx++;
                }
            }
        }

        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BinauralEngine;
}
