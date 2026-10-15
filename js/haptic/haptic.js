/**
 * Haptic Engine — script-driven vibration/e-stim over Web Bluetooth
 *
 * Connects directly to a BLE device (no Intiface or bridge server) and
 * exposes a layer-style interface matching the other script effects:
 *
 *   @haptic intensity:0.4 fade:3      set intensity, ramping over 3s
 *   @haptic intensity:0.6 for:2.5     pulse to 0.6 for 2.5s, then back to 0
 *   @haptic off [fade:N]              ramp to zero and idle
 *
 * Intensity is always a 0..1 fraction, scaled per protocol. A ceiling
 * (setCeiling) caps everything a script can ask for, so a script written
 * for someone else's tolerance can't run away with the device.
 *
 * Requires a secure context (HTTPS or localhost) and a Chromium browser;
 * Web Bluetooth is unavailable in Firefox and Safari.
 */

class HapticEngine {
    constructor(options = {}) {
        this.device = null;              // connected device handle
        this.deviceConfig = null;        // lazily fetched filter/service lists
        this.configURL = options.configURL || 'js/haptic/device-config.json';

        this.intensity = 0;              // current commanded intensity (0..1)
        this.ceiling = 1;                // hard cap applied to every request
        this.rampTimer = null;
        this.holdTimer = null;

        // Callbacks
        this.onStatus = options.onStatus || (() => {});
        this.onConnect = options.onConnect || (() => {});
        this.onDisconnect = options.onDisconnect || (() => {});

        this.rampStepMs = 60;            // ramp update interval
    }

    /**
     * Whether Web Bluetooth is usable in this browser/context.
     */
    static isSupported() {
        return typeof navigator !== 'undefined' && !!navigator.bluetooth;
    }

    /**
     * Parse @haptic command arguments.
     * Format: @haptic intensity:N [fade:N] [for:N]
     * Or:     @haptic off [fade:N]
     */
    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = { action: 'on', intensity: 0.3, fade: 0, hold: 0 };

        if (parts[0] === 'off') {
            result.action = 'off';
            for (const p of parts.slice(1)) {
                if (p.startsWith('fade:')) {
                    const v = parseFloat(p.split(':')[1]);
                    if (Number.isFinite(v) && v >= 0) result.fade = v;
                }
            }
            return result;
        }

        for (const p of parts) {
            if (!p.includes(':')) continue;
            const key = p.slice(0, p.indexOf(':'));
            const val = p.slice(p.indexOf(':') + 1);
            const v = parseFloat(val);
            if (!Number.isFinite(v)) continue;

            switch (key) {
                case 'intensity':
                    result.intensity = Math.max(0, Math.min(1, v));
                    break;
                case 'fade':
                    result.fade = Math.max(0, v);
                    break;
                case 'for':
                    result.hold = Math.max(0, v);
                    break;
            }
        }

        return result;
    }

    /**
     * Cap every intensity a script can request (0..1).
     * Applies immediately to whatever is currently running.
     */
    setCeiling(ceiling) {
        this.ceiling = Math.max(0, Math.min(1, ceiling));
        if (this.intensity > this.ceiling) {
            this.send(this.ceiling);
        }
    }

    get isConnected() {
        return !!this.device;
    }

    /**
     * Fetch the BLE device filter list (large, so only on first connect).
     */
    async loadDeviceConfig() {
        if (this.deviceConfig) return this.deviceConfig;
        const res = await fetch(this.configURL);
        if (!res.ok) throw new Error(`Could not load device list (${res.status})`);
        this.deviceConfig = await res.json();
        return this.deviceConfig;
    }

    /**
     * Prompt for a device and connect. Must be called from a user gesture.
     */
    async connect() {
        if (!HapticEngine.isSupported()) {
            throw new Error('Web Bluetooth is not available in this browser');
        }

        const config = await this.loadDeviceConfig();

        const bleDevice = await navigator.bluetooth.requestDevice({
            filters: config.filters,
            optionalServices: config.services
        });

        // GATT connection is flaky on first attempt for several devices
        let server, services;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                server = await bleDevice.gatt.connect();
                await new Promise(r => setTimeout(r, 300));  // let it stabilise
                services = await server.getPrimaryServices();
                break;
            } catch (e) {
                console.warn(`Haptic connection attempt ${attempt} failed:`, e.message);
                if (attempt === 3) throw e;
                await new Promise(r => setTimeout(r, 500));
            }
        }

        let protocol, writeChar;
        // Some characteristics only accept writeWithoutResponse
        let useWriteWithoutResponse = false;

        if (HapticProtocols.isCoyote(bleDevice.name)) {
            const result = await HapticProtocols.connectCoyote(bleDevice, server, services);
            writeChar = result.writeChar;
            protocol = result.protocol;
            useWriteWithoutResponse = result.version === 'v2';
            console.log(`Haptic protocol: ${protocol.name} (${result.version}) for ${bleDevice.name}`);
        } else {
            protocol = HapticProtocols.detectProtocol(bleDevice.name, services) || HapticProtocols.lovense;
            console.log(`Haptic protocol: ${protocol.name} for ${bleDevice.name}`);

            // Skip the generic access/attribute services
            const targetService = services.find(s =>
                !s.uuid.startsWith('00001800') && !s.uuid.startsWith('00001801')
            ) || services[0];

            const chars = await targetService.getCharacteristics();
            writeChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);

            if (!writeChar) throw new Error('No writable characteristic found');
        }

        if (protocol.init) {
            await protocol.init(writeChar);
        }

        this.device = {
            name: bleDevice.name,
            ble: bleDevice,
            server,
            protocol,
            writeChar,
            useWriteWithoutResponse,
            keepaliveTimer: null,
            lastCommand: null
        };

        bleDevice.addEventListener('gattserverdisconnected', () => {
            this.handleDisconnect();
        });

        this.startKeepalive();
        this.onConnect(bleDevice.name);
        return bleDevice.name;
    }

    /**
     * Ramp to zero, drop the connection, and clear state.
     */
    async disconnect() {
        if (!this.device) return;
        const dev = this.device;
        try {
            await this.send(0);
        } catch (e) {
            // Device may already be gone — nothing useful to do
        }
        this.stopKeepalive();
        this.device = null;
        if (dev.server && dev.server.connected) {
            dev.server.disconnect();
        }
        this.onDisconnect();
    }

    handleDisconnect() {
        this.clearTimers();
        this.stopKeepalive();
        this.device = null;
        this.intensity = 0;
        this.onDisconnect();
        this.onStatus('Device disconnected');
    }

    async writeToChar(data) {
        const dev = this.device;
        if (!dev) return;
        if (dev.useWriteWithoutResponse || !dev.writeChar.properties.write) {
            await dev.writeChar.writeValueWithoutResponse(data);
        } else {
            await dev.writeChar.writeValue(data);
        }
    }

    /**
     * Send an absolute intensity (0..1), clamped to the ceiling.
     * Safe to call with no device connected — it just records the value.
     */
    async send(intensity) {
        const level = Math.max(0, Math.min(this.ceiling, intensity));
        this.intensity = level;

        const dev = this.device;
        if (!dev) return;

        try {
            if (dev.protocol.sendCommand) {
                await dev.protocol.sendCommand(level);
                dev.lastCommand = dev.protocol.buildCommand(level);
            } else {
                const cmd = level === 0 && dev.protocol.buildStopCommand
                    ? dev.protocol.buildStopCommand()
                    : dev.protocol.buildCommand(level);
                dev.lastCommand = cmd;
                await this.writeToChar(cmd);
            }
        } catch (e) {
            console.warn('Haptic send failed:', e.message);
        }
    }

    /**
     * Some protocols drop to zero unless commands keep arriving.
     */
    startKeepalive() {
        const dev = this.device;
        if (!dev || !dev.protocol.keepaliveInterval || dev.keepaliveTimer) return;

        dev.keepaliveTimer = setInterval(async () => {
            if (!this.device || this.intensity <= 0) return;
            try {
                if (dev.protocol.sendCommand) {
                    await dev.protocol.sendCommand(this.intensity);
                } else if (dev.lastCommand) {
                    await this.writeToChar(dev.lastCommand);
                }
            } catch (e) {
                console.warn('Haptic keepalive failed:', e.message);
            }
        }, dev.protocol.keepaliveInterval);
    }

    stopKeepalive() {
        const dev = this.device;
        if (dev && dev.keepaliveTimer) {
            clearInterval(dev.keepaliveTimer);
            dev.keepaliveTimer = null;
        }
    }

    clearTimers() {
        if (this.rampTimer) {
            clearInterval(this.rampTimer);
            this.rampTimer = null;
        }
        if (this.holdTimer) {
            clearTimeout(this.holdTimer);
            this.holdTimer = null;
        }
    }

    /**
     * Ramp from the current intensity to a target over `fade` seconds.
     * fade of 0 jumps immediately.
     */
    ramp(target, fade = 0) {
        this.clearTimers();

        const to = Math.max(0, Math.min(this.ceiling, target));

        if (fade <= 0) {
            this.send(to);
            return;
        }

        const from = this.intensity;
        const steps = Math.max(1, Math.round((fade * 1000) / this.rampStepMs));
        let step = 0;

        this.rampTimer = setInterval(() => {
            step++;
            const value = from + (to - from) * (step / steps);
            this.send(value);
            if (step >= steps) {
                clearInterval(this.rampTimer);
                this.rampTimer = null;
            }
        }, this.rampStepMs);
    }

    /**
     * Apply a parsed @haptic command.
     */
    apply(params) {
        if (params.action === 'off') {
            this.stop(params.fade);
            return;
        }

        this.ramp(params.intensity, params.fade);

        // `for:N` — hold, then release back to zero
        if (params.hold > 0) {
            const holdMs = params.hold * 1000 + params.fade * 1000;
            this.holdTimer = setTimeout(() => {
                this.holdTimer = null;
                this.ramp(0, params.fade);
            }, holdMs);
        }
    }

    /**
     * Ramp to zero without disconnecting.
     */
    stop(fade = 0) {
        this.ramp(0, fade);
    }

    /**
     * Cut output immediately — used on pause, script end, and page unload.
     */
    panic() {
        this.clearTimers();
        this.send(0);
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HapticEngine;
}
