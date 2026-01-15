/**
 * White Noise Generator
 *
 * Ambient noise layer - doubles as Bluetooth codec helper.
 * Usage: @noise 0.1 fade:3   (10% volume, 3s fade)
 *        @noise off fade:2
 */

const noiseWorkletCode = `
class NoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.gain = 0;
        this.targetGain = 0;
        this.smooth = 0.01;  // seconds

        this.port.onmessage = (e) => {
            const d = e.data;
            if (d.gain !== undefined) this.targetGain = Math.max(0, Math.min(1, d.gain));
            if (d.smooth !== undefined) this.smooth = d.smooth;
        };
    }

    process(inputs, outputs) {
        const out = outputs[0];
        if (!out || !out[0]) return true;

        const L = out[0];
        const R = out[1] || L;
        const coef = 1 - Math.exp(-5 / (sampleRate * Math.max(0.001, this.smooth)));

        for (let i = 0; i < L.length; i++) {
            this.gain += (this.targetGain - this.gain) * coef;
            L[i] = (Math.random() * 2 - 1) * this.gain;
            R[i] = (Math.random() * 2 - 1) * this.gain;
        }
        return true;
    }
}
registerProcessor('noise-processor', NoiseProcessor);
`;

class NoiseEngine {
    constructor() {
        this.ctx = null;
        this.node = null;
        this.isPlaying = false;
    }

    async init(audioContext) {
        if (this.node) return;

        // Use shared context if provided, else create own
        this.ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();

        const blob = new Blob([noiseWorkletCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await this.ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        this.node = new AudioWorkletNode(this.ctx, 'noise-processor', {
            outputChannelCount: [2]
        });
        this.node.connect(this.ctx.destination);
    }

    async start(volume = 0.1, fade = 2, audioContext = null) {
        await this.init(audioContext);
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.node.port.postMessage({
            gain: Math.min(0.5, volume),
            smooth: fade
        });
        this.isPlaying = true;
    }

    fadeTo(volume, seconds = 2) {
        if (!this.node) return;
        this.node.port.postMessage({
            gain: Math.min(0.5, Math.max(0, volume)),
            smooth: seconds
        });
    }

    stop(fade = 2) {
        if (!this.node) return;
        this.node.port.postMessage({ gain: 0, smooth: fade });
        this.isPlaying = false;
    }

    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = { action: 'on', volume: 0.015, fade: 2 };

        if (parts[0] === 'off') {
            result.action = 'off';
            for (const p of parts) {
                if (p.startsWith('fade:')) result.fade = parseFloat(p.split(':')[1]) || 2;
            }
            return result;
        }

        for (const p of parts) {
            if (p.startsWith('fade:')) result.fade = parseFloat(p.split(':')[1]) || 2;
            else {
                const v = parseFloat(p);
                if (!isNaN(v)) result.volume = v;
            }
        }
        return result;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NoiseEngine;
}
