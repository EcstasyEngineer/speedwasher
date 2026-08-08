/**
 * Haptic Device Protocols
 *
 * Command builders for BLE vibrators, plus name/service-based protocol
 * detection. Each protocol exposes buildCommand(intensity) returning the
 * bytes to write, and optionally init(), buildStopCommand() and a
 * keepaliveInterval.
 *
 * Command formats from buttplug.io (BSD-3-Clause, Nonpolynomial Labs LLC).
 * Coyote (e-stim) protocol from DG-LAB-OPENSOURCE (MIT).
 */

const HapticProtocols = (() => {
    // ─── Lovense ──────────────────────────────────────────────────────
    // Text-based commands over BLE. Yes, really — ASCII strings.
    const lovense = {
        id: 'lovense',
        name: 'Lovense',
        maxIntensity: 20,

        buildCommand(intensity) {
            const level = Math.round(intensity * this.maxIntensity);
            return new TextEncoder().encode(`Vibrate:${level};`);
        },

        buildStopCommand() {
            return new TextEncoder().encode('Vibrate:0;');
        },

        async init() {
            return true;
        }
    };

    // ─── Satisfyer ────────────────────────────────────────────────────
    // Binary. Needs an init byte, then 4 identical bytes per motor.
    const satisfyer = {
        id: 'satisfyer',
        name: 'Satisfyer',
        maxIntensity: 100,
        motorCount: 1,

        buildCommand(intensity, motorCount = 1) {
            const level = Math.round(intensity * this.maxIntensity);
            const bytes = [];
            for (let i = 0; i < motorCount; i++) {
                bytes.push(level, level, level, level);
            }
            return new Uint8Array(bytes);
        },

        buildStopCommand(motorCount = 1) {
            return this.buildCommand(0, motorCount);
        },

        async init(writeChar) {
            try {
                await writeChar.writeValue(new Uint8Array([0x01]));
                return true;
            } catch (e) {
                console.warn('Satisfyer init failed:', e);
                return false;
            }
        },

        keepaliveInterval: 3000
    };

    // ─── We-Vibe ──────────────────────────────────────────────────────
    // 8-byte packets, dual motor packed into one byte (4 bits each).
    const wevibe = {
        id: 'wevibe',
        name: 'We-Vibe',
        maxIntensity: 15,

        buildCommand(intensity, intensityExt = null) {
            const intLevel = Math.round(intensity * this.maxIntensity);
            const extLevel = intensityExt !== null
                ? Math.round(intensityExt * this.maxIntensity)
                : intLevel;

            if (intLevel === 0 && extLevel === 0) {
                return this.buildStopCommand();
            }

            const combinedSpeed = extLevel | (intLevel << 4);

            return new Uint8Array([
                0x0f,           // Command prefix
                0x03,           // Mode
                0x00,           // Reserved
                combinedSpeed,  // Speed (4 bits per motor)
                0x00,           // Reserved
                0x03,           // Mode repeat
                0x00,           // Reserved
                0x00            // Reserved
            ]);
        },

        buildStopCommand() {
            return new Uint8Array([0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        },

        async init(writeChar) {
            try {
                await writeChar.writeValue(new Uint8Array([0x0f, 0x03, 0x00, 0x99, 0x00, 0x03, 0x00, 0x00]));
                await writeChar.writeValue(new Uint8Array([0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
                return true;
            } catch (e) {
                console.warn('We-Vibe init failed:', e);
                return false;
            }
        }
    };

    // ─── Aneros ───────────────────────────────────────────────────────
    const aneros = {
        id: 'aneros',
        name: 'Aneros',
        maxIntensity: 255,

        buildCommand(intensity, motorIndex = 0) {
            const level = Math.round(intensity * this.maxIntensity);
            return new Uint8Array([0xF1 + motorIndex, level]);
        },

        buildStopCommand(motorIndex = 0) {
            return new Uint8Array([0xF1 + motorIndex, 0x00]);
        },

        async init() {
            return true;
        }
    };

    // ─── Kiiroo (v2 vibrator) ─────────────────────────────────────────
    const kiiroo = {
        id: 'kiiroo',
        name: 'Kiiroo',
        maxIntensity: 255,
        motorCount: 3,

        buildCommand(intensity, motorCount = 1) {
            const level = Math.round(intensity * this.maxIntensity);
            return new Uint8Array(new Array(motorCount).fill(level));
        },

        buildStopCommand(motorCount = 1) {
            return new Uint8Array(new Array(motorCount).fill(0));
        },

        async init() {
            return true;
        }
    };

    // ─── Svakom (v1) ──────────────────────────────────────────────────
    const svakom = {
        id: 'svakom',
        name: 'Svakom',
        maxIntensity: 255,

        buildCommand(intensity) {
            const level = Math.round(intensity * this.maxIntensity);
            const multiplier = level === 0 ? 0x00 : 0x01;
            return new Uint8Array([0x55, 0x04, 0x03, 0x00, multiplier, level]);
        },

        buildStopCommand() {
            return new Uint8Array([0x55, 0x04, 0x03, 0x00, 0x00, 0x00]);
        },

        async init() {
            return true;
        },

        keepaliveInterval: 1000
    };

    // ─── Lelo (F1S / F1Sv2) ───────────────────────────────────────────
    // Note: F1S requires a physical button press after connecting before
    // it accepts commands. Hardware limitation, nothing to work around.
    const lelo = {
        id: 'lelo',
        name: 'Lelo',
        maxIntensity: 255,

        buildCommand(intensity, intensity2 = null) {
            const level1 = Math.round(intensity * this.maxIntensity);
            const level2 = intensity2 !== null
                ? Math.round(intensity2 * this.maxIntensity)
                : level1;
            return new Uint8Array([0x01, level1, level2]);
        },

        buildStopCommand() {
            return new Uint8Array([0x01, 0x00, 0x00]);
        },

        async init() {
            return true;
        }
    };

    // ─── Magic Motion (v1) ────────────────────────────────────────────
    const magicmotion = {
        id: 'magicmotion',
        name: 'Magic Motion',
        maxIntensity: 255,

        buildCommand(intensity) {
            const level = Math.round(intensity * this.maxIntensity);
            return new Uint8Array([
                0x0b, 0xff, 0x04, 0x0a, 0x32, 0x32, 0x00, 0x04, 0x08,
                level,
                0x64, 0x00, 0x04, 0x08,
                level
            ]);
        },

        buildStopCommand() {
            return this.buildCommand(0);
        },

        async init() {
            return true;
        }
    };

    // ─── MysteryVibe ──────────────────────────────────────────────────
    const mysteryvibe = {
        id: 'mysteryvibe',
        name: 'MysteryVibe',
        maxIntensity: 255,
        motorCount: 6,

        buildCommand(intensity, motorCount = 6) {
            const level = Math.round(intensity * this.maxIntensity);
            return new Uint8Array(new Array(motorCount).fill(level));
        },

        buildStopCommand(motorCount = 6) {
            return new Uint8Array(new Array(motorCount).fill(0));
        },

        async init() {
            return true;
        }
    };

    // ─── DG-Lab Coyote (e-stim, V2 + V3) ──────────────────────────────
    // Two channels (A/B) with waveform control. Commands must be resent
    // every 100ms or the device drops to zero on its own.

    // V3 UUIDs (standard Bluetooth base UUID format)
    const COYOTE_V3 = {
        CONTROL_SERVICE: '0000180c-0000-1000-8000-00805f9b34fb',
        WRITE_CHAR:      '0000150a-0000-1000-8000-00805f9b34fb',
        NOTIFY_CHAR:     '0000150b-0000-1000-8000-00805f9b34fb',
        BATTERY_SERVICE: '0000180a-0000-1000-8000-00805f9b34fb',
        BATTERY_CHAR:    '00001500-0000-1000-8000-00805f9b34fb'
    };

    // V2 UUIDs (custom format, two service variants)
    const COYOTE_V2 = {
        SERVICE_A: '955a180a-0fe2-f5aa-a094-84b8d4f3e8ad',  // Read-only service
        SERVICE_B: '955a180b-0fe2-f5aa-a094-84b8d4f3e8ad',  // Writable service
        BATTERY:   '955a1500-0fe2-f5aa-a094-84b8d4f3e8ad',
        POWER:     '955a1504-0fe2-f5aa-a094-84b8d4f3e8ad',  // 3 bytes, power levels
        // Labels swapped: physical A = protocol's 1506, physical B = protocol's 1505
        WAVE_A:    '955a1506-0fe2-f5aa-a094-84b8d4f3e8ad',
        WAVE_B:    '955a1505-0fe2-f5aa-a094-84b8d4f3e8ad'
    };

    function isCoyote(deviceName) {
        if (!deviceName) return false;
        const name = deviceName.toLowerCase();
        return name.startsWith('d-lab') ||
               name.startsWith('dg-lab') ||
               name.startsWith('47l') ||
               name.startsWith('coyote') ||
               name.includes('estim');
    }

    /** Encode frequency (10-1000Hz) to protocol byte (0-240) */
    function encodeFrequency(hz) {
        hz = Math.min(1000, Math.max(10, hz));
        if (hz <= 100) return hz;
        if (hz <= 600) return Math.round((hz - 100) / 5) + 100;
        return Math.round((hz - 600) / 10) + 200;
    }

    /** Build B0 command (20 bytes) — main control command */
    function buildB0Command(options = {}) {
        const {
            sequence = 0,           // 0-15, 0 = no feedback requested
            modeA = 0b11,           // 11 = absolute set
            modeB = 0b11,
            intensityA = 0,         // 0-200
            intensityB = 0,
            waveFreqA = [100, 100, 100, 100],   // 4 frequency samples (Hz)
            waveIntA = [50, 50, 50, 50],        // 4 intensity samples (0-100)
            waveFreqB = [100, 100, 100, 100],
            waveIntB = [50, 50, 50, 50]
        } = options;

        const cmd = new Uint8Array(20);
        cmd[0] = 0xB0;
        cmd[1] = (sequence << 4) | (modeB << 2) | modeA;
        cmd[2] = Math.min(200, Math.max(0, intensityA));
        cmd[3] = Math.min(200, Math.max(0, intensityB));

        // Channel A waveform
        for (let i = 0; i < 4; i++) {
            cmd[4 + i] = encodeFrequency(waveFreqA[i]);
            cmd[8 + i] = Math.min(100, Math.max(0, waveIntA[i]));
        }

        // Channel B waveform
        for (let i = 0; i < 4; i++) {
            cmd[12 + i] = encodeFrequency(waveFreqB[i]);
            cmd[16 + i] = Math.min(100, Math.max(0, waveIntB[i]));
        }

        return cmd;
    }

    /** Build BF command (7 bytes) — configuration / soft limits */
    function buildBFCommand(options = {}) {
        const {
            limitA = 200,           // Max intensity for channel A
            limitB = 200,
            freqBalanceA = 160,     // Frequency balance (affects low-freq feel)
            freqBalanceB = 160,
            intBalanceA = 30,       // Intensity balance (affects pulse width)
            intBalanceB = 30
        } = options;

        return new Uint8Array([0xBF, limitA, limitB, freqBalanceA, freqBalanceB, intBalanceA, intBalanceB]);
    }

    const coyote = {
        id: 'coyote',
        name: 'DG-Lab Coyote',
        type: 'estim',
        maxIntensity: 200,

        defaultWaveform: {
            freq: [100, 100, 100, 100],
            intensity: [50, 50, 50, 50]
        },

        _state: {
            intensityA: 0,
            intensityB: 0,
            waveformA: null,
            waveformB: null
        },

        buildCommand(intensity, motorIndex = 0) {
            const level = Math.round(intensity * this.maxIntensity);

            if (motorIndex === 0) {
                this._state.intensityA = level;
            } else {
                this._state.intensityB = level;
            }

            return buildB0Command({
                intensityA: this._state.intensityA,
                intensityB: this._state.intensityB,
                waveFreqA: (this._state.waveformA || this.defaultWaveform).freq,
                waveIntA: (this._state.waveformA || this.defaultWaveform).intensity,
                waveFreqB: (this._state.waveformB || this.defaultWaveform).freq,
                waveIntB: (this._state.waveformB || this.defaultWaveform).intensity
            });
        },

        buildStopCommand() {
            this._state.intensityA = 0;
            this._state.intensityB = 0;
            return buildB0Command({ intensityA: 0, intensityB: 0 });
        },

        async init(writeChar) {
            try {
                this._state = { intensityA: 0, intensityB: 0, waveformA: null, waveformB: null };
                await writeChar.writeValue(buildBFCommand({ limitA: 200, limitB: 200 }));
                return true;
            } catch (e) {
                console.warn('Coyote init failed:', e);
                return false;
            }
        },

        keepaliveInterval: 100,

        uuids: { v3: COYOTE_V3, v2: COYOTE_V2 }
    };

    // ─── Coyote V2 encoding helpers ───────────────────────────────────

    /**
     * Encode V2 power levels (0-2047 per channel).
     * A in high bits (11-21), B in low bits (0-10).
     */
    function encodeV2Power(a, b) {
        a = Math.min(2047, Math.max(0, a));
        b = Math.min(2047, Math.max(0, b));
        const byte0 = b & 0xFF;
        const byte1 = ((b >> 8) & 0x07) | ((a & 0x1F) << 3);
        const byte2 = (a >> 5) & 0x3F;
        return new Uint8Array([byte0, byte1, byte2]);
    }

    /**
     * Encode V2 waveform: X (pulses 0-31), Y (interval 0-1023), Z (width 0-31).
     * Bits 19-15: Z, bits 14-5: Y, bits 4-0: X.
     */
    function encodeV2Wave(x, y, z) {
        x = Math.min(31, Math.max(0, x));
        y = Math.min(1023, Math.max(0, y));
        z = Math.min(31, Math.max(0, z));
        const byte0 = (x & 0x1F) | ((y & 0x07) << 5);
        const byte1 = (y >> 3) & 0x7F;
        const byte2 = z & 0x1F;
        return new Uint8Array([byte0, byte1, byte2]);
    }

    // ─── Coyote connection ────────────────────────────────────────────

    async function connectCoyote(device, server, services) {
        console.log('Coyote: available services:', services.map(s => s.uuid));

        const v3Service = services.find(s => s.uuid === COYOTE_V3.CONTROL_SERVICE);
        if (v3Service) {
            console.log('Coyote V3 detected');
            return connectCoyoteV3(v3Service);
        }

        // V2 — service B first (has the writable chars), then service A
        const v2ServiceB = services.find(s => s.uuid === COYOTE_V2.SERVICE_B);
        const v2ServiceA = services.find(s => s.uuid === COYOTE_V2.SERVICE_A);

        if (v2ServiceB || v2ServiceA) {
            console.log('Coyote V2 detected');
            return connectCoyoteV2(device, services);
        }

        throw new Error('No known Coyote service found on this device.');
    }

    async function connectCoyoteV3(service) {
        const writeChar = await service.getCharacteristic(COYOTE_V3.WRITE_CHAR);

        try {
            const notifyChar = await service.getCharacteristic(COYOTE_V3.NOTIFY_CHAR);
            await notifyChar.startNotifications();
            notifyChar.addEventListener('characteristicvaluechanged', (event) => {
                const data = new Uint8Array(event.target.value.buffer);
                if (data[0] === 0xB1) {
                    console.log(`Coyote V3 feedback: A=${data[2]}, B=${data[3]}`);
                }
            });
        } catch (e) {
            console.warn('Could not set up Coyote V3 notifications:', e);
        }

        try {
            await writeChar.writeValue(buildBFCommand({ limitA: 200, limitB: 200 }));
        } catch (e) {
            console.warn('Coyote V3 init failed:', e);
        }

        coyote._state = { intensityA: 0, intensityB: 0, waveformA: null, waveformB: null };

        return { writeChar, version: 'v3', protocol: coyote };
    }

    async function connectCoyoteV2(device, allServices) {
        // V2 splits characteristics across services — scan both.
        let powerChar = null;
        let waveAChar = null;
        let waveBChar = null;

        const v2Services = allServices.filter(s =>
            s.uuid === COYOTE_V2.SERVICE_A || s.uuid === COYOTE_V2.SERVICE_B
        );

        for (const svc of v2Services) {
            try {
                const chars = await svc.getCharacteristics();
                for (const c of chars) {
                    if (c.uuid === COYOTE_V2.POWER) powerChar = c;
                    if (c.uuid === COYOTE_V2.WAVE_A) waveAChar = c;
                    if (c.uuid === COYOTE_V2.WAVE_B) waveBChar = c;
                }
            } catch (e) {
                console.log(`Could not enumerate ${svc.uuid}:`, e.message);
            }
        }

        if (!powerChar) {
            throw new Error('Coyote V2 power characteristic not found.');
        }

        const v2State = {
            intensityA: 0,
            intensityB: 0,
            interval: 100,  // ms between pulse bursts
            connected: true
        };

        device.addEventListener('gattserverdisconnected', () => {
            console.warn('Coyote V2 disconnected');
            v2State.connected = false;
        });

        // V2 writes to several characteristics per update; a lock plus a
        // single-slot pending value keeps GATT from overlapping operations
        // while still always landing on the newest requested intensity.
        let v2Sending = false;
        let v2Pending = null;

        const v2Protocol = Object.assign({}, coyote, {
            id: 'coyote-v2',
            name: 'DG-Lab Coyote V2',
            maxIntensity: 2047,

            async sendCommand(intensity) {
                if (!v2State.connected) return;

                if (v2Sending) {
                    v2Pending = intensity;
                    return;
                }

                v2Sending = true;
                const level = Math.round(intensity * 1024);  // half of max, for headroom
                v2State.intensityA = level;
                v2State.intensityB = level;

                // X=pulses, Y=interval(ms), Z=width
                const waveCmd = encodeV2Wave(10, 100, 10);

                try {
                    // Waveform must accompany every power update
                    if (waveAChar) await waveAChar.writeValueWithoutResponse(waveCmd);
                    if (waveBChar) await waveBChar.writeValueWithoutResponse(waveCmd);
                    await powerChar.writeValueWithoutResponse(encodeV2Power(level, level));
                } catch (e) {
                    if (e.message && e.message.includes('disconnected')) {
                        console.warn('Coyote V2 disconnected');
                        v2State.connected = false;
                    } else if (!e.message || !e.message.includes('in progress')) {
                        console.error('Coyote V2 send error:', e);
                    }
                } finally {
                    v2Sending = false;
                    if (v2Pending !== null) {
                        const pending = v2Pending;
                        v2Pending = null;
                        this.sendCommand(pending);
                    }
                }
            },

            async stopCommand() {
                while (v2Sending) {
                    await new Promise(r => setTimeout(r, 10));
                }
                v2Pending = null;
                v2Sending = true;

                try {
                    v2State.intensityA = 0;
                    v2State.intensityB = 0;
                    await powerChar.writeValueWithoutResponse(encodeV2Power(0, 0));
                } catch (e) {
                    if (!e.message || !e.message.includes('in progress')) {
                        console.error('Coyote V2 stop error:', e);
                    }
                } finally {
                    v2Sending = false;
                }
            },

            buildCommand(intensity, motorIndex = 0) {
                const level = Math.round(intensity * 1024);
                if (motorIndex === 0) {
                    v2State.intensityA = level;
                } else {
                    v2State.intensityB = level;
                }
                return encodeV2Power(v2State.intensityA, v2State.intensityB);
            },

            buildStopCommand() {
                v2State.intensityA = 0;
                v2State.intensityB = 0;
                return encodeV2Power(0, 0);
            },

            async init() {
                const waveCmd = encodeV2Wave(10, 100, 10);
                try {
                    if (waveAChar) await waveAChar.writeValueWithoutResponse(waveCmd);
                    if (waveBChar) await waveBChar.writeValueWithoutResponse(waveCmd);
                } catch (e) {
                    console.warn('Coyote V2 init failed:', e);
                }
                return true;
            },

            keepaliveInterval: 100
        });

        return { writeChar: powerChar, waveAChar, waveBChar, version: 'v2', protocol: v2Protocol, v2State };
    }

    // ─── Registry ─────────────────────────────────────────────────────
    // Ordered roughly by market share so common devices match first.
    const PROTOCOLS = [
        {
            id: 'satisfyer',
            namePatterns: [/^SF/, /^Satisfyer/i, /^SAT/i],
            serviceUUIDs: ['0000fff0-0000-1000-8000-00805f9b34fb'],
            protocol: satisfyer
        },
        {
            id: 'lovense',
            namePatterns: [/^LVS-/, /^Lush/, /^Hush/, /^Edge/, /^Osci/, /^Domi/, /^Nora/, /^Max/, /^Ambi/, /^Ferri/, /^Diamo/, /^Dolce/, /^Exomoon/, /^Tenera/, /^Flexer/, /^Gravity/, /^Gemini/, /^Lapis/, /^Solace/i],
            serviceUUIDs: [
                '50300001-0024-4bd4-bbd5-a6920e4c5653',
                '53300001-0023-4bd4-bbd5-a6920e4c5653',
                '57300001-0023-4bd4-bbd5-a6920e4c5653',
                '5a300001-0023-4bd4-bbd5-a6920e4c5653',
                '5a300001-0024-4bd4-bbd5-a6920e4c5653',
                '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
            ],
            protocol: lovense
        },
        {
            id: 'wevibe',
            namePatterns: [/^Cougar/, /^Ditto/, /^Gala/, /^Jive/, /^Match/, /^Melt/, /^Moxie/, /^Nova/, /^Pivot/, /^Rave/, /^Sync/, /^Vector/, /^Verge/, /^Wish/, /^We-Vibe/i],
            serviceUUIDs: ['f000bb03-0451-4000-b000-000000000000'],
            protocol: wevibe
        },
        {
            id: 'lelo',
            namePatterns: [/^F1s/, /^LELO/i, /^Sona/, /^Tiani/, /^Hugo/, /^Ida/, /^Ina/, /^Lily/, /^Mona/, /^Ora/, /^Sila/, /^Soraya/i],
            serviceUUIDs: [],
            protocol: lelo
        },
        {
            id: 'kiiroo',
            namePatterns: [/^Onyx/, /^Pearl/, /^Fuse/, /^Titan/, /^Cliona/, /^OhMiBod/i, /^Kiiroo/i],
            serviceUUIDs: [],
            protocol: kiiroo
        },
        {
            id: 'svakom',
            namePatterns: [/^Svakom/i, /^Emma/, /^Ella/, /^Vicky/, /^Alex/, /^Sam/, /^Iker/, /^Tarax/, /^Pulse/i],
            serviceUUIDs: [],
            protocol: svakom
        },
        {
            id: 'magicmotion',
            namePatterns: [/^Magic Motion/i, /^Kegel/, /^Flamingo/, /^Candy/, /^Bunny/, /^Eidolon/i],
            serviceUUIDs: [],
            protocol: magicmotion
        },
        {
            id: 'mysteryvibe',
            namePatterns: [/^Crescendo/, /^Tenuto/, /^Poco/, /^MysteryVibe/i],
            serviceUUIDs: [],
            protocol: mysteryvibe
        },
        {
            id: 'aneros',
            namePatterns: [/^Vivi/i],
            serviceUUIDs: [],
            protocol: aneros
        },
        {
            id: 'coyote',
            namePatterns: [/^D-LAB ESTIM/i, /^47L/],
            serviceUUIDs: ['0000180c-0000-1000-8000-00805f9b34fb'],
            protocol: coyote
        }
    ];

    /**
     * Detect protocol from device name and connected services.
     * @param {string} deviceName
     * @param {BluetoothRemoteGATTService[]} services
     * @returns {object|null} Protocol handler, or null if unrecognised
     */
    function detectProtocol(deviceName, services) {
        const serviceUUIDs = services.map(s => s.uuid.toLowerCase());

        for (const def of PROTOCOLS) {
            if (def.namePatterns.some(pattern => pattern.test(deviceName))) {
                console.log(`Protocol detected by name: ${def.id}`);
                return def.protocol;
            }

            if (def.serviceUUIDs.length > 0 &&
                def.serviceUUIDs.some(uuid => serviceUUIDs.includes(uuid.toLowerCase()))) {
                console.log(`Protocol detected by service UUID: ${def.id}`);
                return def.protocol;
            }
        }

        console.warn(`Unknown device: ${deviceName}, services: ${serviceUUIDs.join(', ')}`);
        return null;
    }

    /** List all supported protocols */
    function listProtocols() {
        return PROTOCOLS.map(p => ({ id: p.id, name: p.protocol.name }));
    }

    return {
        lovense, satisfyer, wevibe, aneros, kiiroo, svakom,
        lelo, magicmotion, mysteryvibe, coyote,
        detectProtocol, listProtocols,
        isCoyote, connectCoyote
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HapticProtocols;
}
