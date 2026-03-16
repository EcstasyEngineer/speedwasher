/**
 * Spiral visual effect for hypnotic enhancement — WebGL implementation
 * Two shader types: SDF Outline Spiral (type:1) and Happy Spiral (type:2)
 * Falls back to Canvas 2D if WebGL is unavailable
 */

class SpiralEffect {
    constructor(canvas) {
        this.canvas = canvas;
        this.isRunning = false;
        this.animationId = null;

        // Spiral parameters — default raspberry/purple/light-blue palette
        this.colors = ['#E30B5C', '#8B5CF6', '#87CEEB'];
        this.opacity = 0.3;
        this.speed = 1;
        this.rotation = 0;
        this.arms = 6;
        this.type = 1;         // 1 = SDF outline, 2 = happy spiral

        // Fade state
        this.targetOpacity = 0;
        this.currentOpacity = 0;
        this.fadeSpeed = 1;

        // WebGL state
        this.gl = null;
        this.programs = {};    // Cached shader programs keyed by type
        this.posBuffer = null;
        this.startTime = performance.now() / 1000;
        this.useWebGL = false;
        this.contextLost = false;

        // Try WebGL first
        this._initWebGL();

        // Fallback to Canvas 2D
        if (!this.useWebGL) {
            this.ctx = canvas.getContext('2d');
        }

        this.resize();
        this._boundResize = () => this.resize();
        window.addEventListener('resize', this._boundResize);

        // Handle WebGL context loss/restore
        if (this.useWebGL) {
            canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                this.contextLost = true;
            });
            canvas.addEventListener('webglcontextrestored', () => {
                this.contextLost = false;
                this._initWebGL();
            });
        }
    }

    // ─── WebGL initialization ───────────────────────────────────────

    _initWebGL() {
        try {
            const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
                     || this.canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
            if (!gl) return;

            this.gl = gl;
            this.useWebGL = true;
            this.programs = {};

            // Fullscreen quad: two triangles
            const verts = new Float32Array([
                -1, -1,  1, -1,  -1, 1,
                -1,  1,  1, -1,   1, 1
            ]);
            this.posBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

            // Pre-compile both shader programs
            this._getProgram(1);
            this._getProgram(2);
        } catch (e) {
            this.useWebGL = false;
        }
    }

    _vertexShaderSrc() {
        return `
attribute vec2 aPosition;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
    }

    _fragmentShaderSrc(type) {
        const header = `
precision highp float;
uniform vec3 iResolution;
uniform float iTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
`;
        if (type === 2) {
            return header + `
void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);

    float r = length(uv);
    float r_inv = 1.0 / (r + 0.01);

    float log_r = log(r + 0.001);
    vec2 dir = uv / (r + 1e-6);
    float spiral_wind = log_r * 1.5 + iTime * 0.4;

    float cw = cos(spiral_wind), sw = sin(spiral_wind);
    vec2 rot = vec2(dir.x * cw - dir.y * sw, dir.x * sw + dir.y * cw);
    float c2 = rot.x * rot.x;
    float c4 = 8.0 * c2 * c2 - 8.0 * c2 + 1.0;

    float angle_wave = c4 * 0.5 + 0.5;
    float depth_wave = sin(log_r * 8.0 - iTime * 1.2) * 0.5 + 0.5;

    float v = mix(angle_wave, depth_wave, 0.4) * (1.0 - smoothstep(0.0, 1.5, r_inv * r));

    float glow_raw = exp(-r * 2.609);
    float glow = glow_raw * glow_raw * glow_raw * 0.5;

    float pulse_wave = sin(r * 12.0 - iTime * 3.5) * 0.5 + 0.5;
    float pulse_env = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.55, 0.75, r));
    float pulse = pulse_wave * pulse_env * 0.45;

    vec3 final_col = uColor1 * (v * 0.5 + glow) + uColor2 * (v * abs(sin(iTime * 0.3)) + pulse * 0.6) + uColor3 * (v * 0.9 + glow * 0.5 + pulse);

    gl_FragColor = vec4(final_col, 1.0);
}`;
        }

        // type 1 (default): SDF Outline Spiral
        return header + `
float sdSpiral(vec2 p, float arms, float tightness, float t) {
    float r = length(p);
    if(r < 0.001) r = 0.001;
    float theta = atan(p.y, p.x);
    float logr = log(r);
    float phase = (theta / 6.28318 * arms + logr * tightness - t);
    float dist = abs(fract(phase + 0.5) - 0.5) * 6.28318 / arms;
    return dist * r;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);

    float t1 = iTime * 0.3;
    float t2 = iTime * 0.39;
    float t3 = iTime * 0.51;

    float r = length(uv);
    float logr = log(r + 0.1);

    float d1 = sdSpiral(uv, 4.0, 1.8, t1);
    float d2 = sdSpiral(uv, 3.0, 1.5, t2);
    float d3 = sdSpiral(uv, 5.0, 2.1, t3);

    float glow1 = exp(-d1 * 25.0);
    float glow2 = exp(-d2 * 30.0);
    float glow3 = exp(-d3 * 20.0);

    float outline1 = smoothstep(0.025, 0.008, d1);
    float outline2 = smoothstep(0.02, 0.006, d2);
    float outline3 = smoothstep(0.03, 0.01, d3);

    float center_fade = smoothstep(0.0, 0.1, r);
    glow1 *= center_fade;
    glow2 *= center_fade;
    glow3 *= center_fade;
    outline1 *= center_fade;
    outline2 *= center_fade;
    outline3 *= center_fade;

    float ripple = abs(sin(logr * 3.0 + t1 * 2.0));
    ripple = abs(ripple - 0.5) * 2.0;
    ripple *= exp(-length(uv) * 0.5);

    float v1 = pow(glow1 + outline1 * 0.6, 0.65);
    float v2 = pow(glow2 + outline2 * 0.5, 0.7);
    float v3 = pow(glow3 + outline3 * 0.4, 0.6);

    vec3 final_col = uColor1 * v1 * 0.7 + uColor2 * v2 * 0.6 + uColor3 * v3 * 0.5;
    final_col += vec3(ripple * 0.3);

    float depth = exp(-length(uv) * 1.5);
    final_col *= (0.7 + 0.3 * depth);

    float luma = dot(final_col, vec3(0.299, 0.587, 0.114));
    final_col = mix(vec3(luma), final_col, 1.25);
    final_col = max(final_col, 0.0);
    final_col = pow(final_col, vec3(0.95));

    gl_FragColor = vec4(final_col, 1.0);
}`;
    }

    _compileShader(gl, src, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    _getProgram(type) {
        if (this.programs[type]) return this.programs[type];

        const gl = this.gl;
        const vs = this._compileShader(gl, this._vertexShaderSrc(), gl.VERTEX_SHADER);
        const fs = this._compileShader(gl, this._fragmentShaderSrc(type), gl.FRAGMENT_SHADER);
        if (!vs || !fs) return null;

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(prog));
            gl.deleteProgram(prog);
            return null;
        }

        // Cache uniform and attribute locations
        const info = {
            program: prog,
            aPosition: gl.getAttribLocation(prog, 'aPosition'),
            uResolution: gl.getUniformLocation(prog, 'iResolution'),
            uTime: gl.getUniformLocation(prog, 'iTime'),
            uColor1: gl.getUniformLocation(prog, 'uColor1'),
            uColor2: gl.getUniformLocation(prog, 'uColor2'),
            uColor3: gl.getUniformLocation(prog, 'uColor3')
        };

        // Clean up individual shaders (linked into program)
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.programs[type] = info;
        return info;
    }

    // ─── Color conversion ───────────────────────────────────────────

    _hexToVec3(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        return [r, g, b];
    }

    // ─── Resize ─────────────────────────────────────────────────────

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.width = rect.width;
        this.height = rect.height;

        if (this.useWebGL && this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        } else if (this.ctx) {
            this.ctx.scale(dpr, dpr);
        }
    }

    // ─── Public API (unchanged) ─────────────────────────────────────

    /**
     * Start the spiral with given parameters
     * @param {string|string[]} color - Hex color(s). Single string or array of 1-3 colors.
     * @param {number} opacity - Target opacity (0-1)
     * @param {number} speed - Rotations per second
     * @param {number} fade - Fade in duration in seconds
     * @param {number} type - Shader type (1=SDF outline, 2=happy spiral)
     */
    start(color = null, opacity = 0.3, speed = 1, fade = 1, type = null) {
        if (type !== null) {
            this.type = type;
        }

        if (color !== null) {
            if (Array.isArray(color)) {
                this.colors = [
                    color[0] || this.colors[0],
                    color[1] || color[0] || this.colors[1],
                    color[2] || color[1] || color[0] || this.colors[2]
                ];
            } else {
                this.colors = [color, color, color];
            }
        }
        this.targetOpacity = opacity;
        this.speed = speed;
        this.fadeSpeed = Math.max(0.001, fade);

        if (!this.isRunning) {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            this.isRunning = true;
            this.lastTime = performance.now();
            this.startTime = performance.now() / 1000;
            this.animate();
        }
    }

    /**
     * Stop the spiral with fade out
     * @param {number} fade - Fade out duration in seconds
     */
    stop(fade = 1) {
        this.targetOpacity = 0;
        this.fadeSpeed = Math.max(0.001, fade);
    }

    // ─── Animation loop ─────────────────────────────────────────────

    animate() {
        if (!this.isRunning) return;

        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Update rotation (used by Canvas 2D fallback)
        this.rotation += this.speed * delta * Math.PI * 2;

        // Update opacity fade
        if (this.currentOpacity !== this.targetOpacity) {
            const fadeStep = delta / this.fadeSpeed;
            if (this.currentOpacity < this.targetOpacity) {
                this.currentOpacity = Math.min(this.targetOpacity, this.currentOpacity + fadeStep);
            } else {
                this.currentOpacity = Math.max(this.targetOpacity, this.currentOpacity - fadeStep);
            }
            this.canvas.style.opacity = this.currentOpacity;
        }

        // Stop if faded out
        if (this.currentOpacity === 0 && this.targetOpacity === 0) {
            this.isRunning = false;
            if (this.useWebGL && this.gl && !this.contextLost) {
                this.gl.clearColor(0, 0, 0, 0);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            } else if (this.ctx) {
                this.ctx.clearRect(0, 0, this.width, this.height);
            }
            return;
        }

        if (this.useWebGL && !this.contextLost) {
            this._drawWebGL();
        } else if (this.ctx) {
            this._drawCanvas2D();
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    // ─── WebGL draw ─────────────────────────────────────────────────

    _drawWebGL() {
        const gl = this.gl;
        const prog = this._getProgram(this.type);
        if (!prog) return;

        gl.useProgram(prog.program);

        // Bind fullscreen quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
        gl.enableVertexAttribArray(prog.aPosition);
        gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 0, 0);

        // Set uniforms
        const iTime = (performance.now() / 1000 - this.startTime) * this.speed;
        gl.uniform3f(prog.uResolution, this.canvas.width, this.canvas.height, 1.0);
        gl.uniform1f(prog.uTime, iTime);

        const c1 = this._hexToVec3(this.colors[0]);
        const c2 = this._hexToVec3(this.colors[1]);
        const c3 = this._hexToVec3(this.colors[2]);
        gl.uniform3f(prog.uColor1, c1[0], c1[1], c1[2]);
        gl.uniform3f(prog.uColor2, c2[0], c2[1], c2[2]);
        gl.uniform3f(prog.uColor3, c3[0], c3[1], c3[2]);

        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ─── Canvas 2D fallback ─────────────────────────────────────────

    _drawCanvas2D() {
        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height / 2;
        const maxRadius = Math.max(this.width, this.height) * 0.7;

        ctx.clearRect(0, 0, this.width, this.height);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);

        const arms = this.arms;
        const turns = 6;
        const colorCount = this.colors.length;

        for (let arm = 0; arm < arms; arm++) {
            const armOffset = (arm / arms) * Math.PI * 2;
            const armColor = this.colors[arm % colorCount];

            ctx.beginPath();
            for (let i = 0; i <= turns * 100; i++) {
                const t = i / 100;
                const angle = t * Math.PI * 2 + armOffset;
                const radius = (t / turns) * maxRadius;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.strokeStyle = armColor;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.rotation * 0.5 + arm);
            ctx.stroke();
        }

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius * 0.15);
        gradient.addColorStop(0, this.colors[0] + '40');
        gradient.addColorStop(1, 'transparent');
        ctx.globalAlpha = 1;
        ctx.fillStyle = gradient;
        ctx.fillRect(-maxRadius, -maxRadius, maxRadius * 2, maxRadius * 2);

        ctx.restore();
    }

    // ─── Command parser ─────────────────────────────────────────────

    /**
     * Parse @spiral command
     * `@spiral type:1 color1:#ff0000 color2:#00ff00 color3:#0000ff`
     * `@spiral type:2` — happy spiral with default colors
     * `@spiral color:#8B5CF6` — type:1 (default) with single color propagated
     * `@spiral off` — fade out (unchanged)
     */
    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            colors: null,
            opacity: 0.3,
            speed: 1,
            fade: 1,
            type: null       // null = use current/default (1)
        };

        if (parts[0] === 'off') {
            result.action = 'off';
            for (let i = 1; i < parts.length; i++) {
                if (parts[i].startsWith('fade:')) {
                    const v = parseFloat(parts[i].split(':')[1]);
                    result.fade = Number.isFinite(v) ? v : 1;
                }
            }
        } else {
            if (parts[0] === 'on') parts.shift();

            let color1 = null, color2 = null, color3 = null;

            for (const part of parts) {
                if (part.startsWith('#') && !part.includes(':')) {
                    color1 = part;
                } else if (part.includes(':')) {
                    const [key, val] = part.split(':');
                    const v = parseFloat(val);

                    switch (key) {
                        case 'type':
                            if (Number.isFinite(v) && (v === 1 || v === 2)) result.type = v;
                            break;
                        case 'color':
                        case 'color1':
                            color1 = val.startsWith('#') ? val : '#' + val;
                            break;
                        case 'color2':
                            color2 = val.startsWith('#') ? val : '#' + val;
                            break;
                        case 'color3':
                            color3 = val.startsWith('#') ? val : '#' + val;
                            break;
                        case 'opacity':
                            if (Number.isFinite(v)) result.opacity = Math.max(0, Math.min(1, v));
                            break;
                        case 'speed':
                            if (Number.isFinite(v)) result.speed = v;
                            break;
                        case 'fade':
                            if (Number.isFinite(v)) result.fade = v;
                            break;
                    }
                }
            }

            if (color1) {
                result.colors = [
                    color1,
                    color2 || color1,
                    color3 || color2 || color1
                ];
            }
        }

        // Backwards compatibility
        if (result.colors) {
            result.color = result.colors[0];
        }

        return result;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpiralEffect;
}
