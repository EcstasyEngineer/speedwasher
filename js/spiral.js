/**
 * Spiral visual effect for hypnotic enhancement
 * Supports up to 3 colors with cycling spiral arms
 */

class SpiralEffect {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isRunning = false;
        this.animationId = null;

        // Spiral parameters — default pink/blue/magenta palette
        this.colors = ['#c471ed', '#12c2e9', '#f64f59'];
        this.opacity = 0.3;
        this.speed = 1;          // Rotations per second
        this.rotation = 0;
        this.arms = 6;           // Number of spiral arms

        // Fade state
        this.targetOpacity = 0;
        this.currentOpacity = 0;
        this.fadeSpeed = 1;      // Seconds for fade

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Start the spiral with given parameters
     * @param {string|string[]} color - Hex color(s). Single string or array of 1-3 colors.
     * @param {number} opacity - Target opacity (0-1)
     * @param {number} speed - Rotations per second
     * @param {number} fade - Fade in duration in seconds
     */
    start(color = null, opacity = 0.3, speed = 1, fade = 1) {
        if (color !== null) {
            if (Array.isArray(color)) {
                // 1-3 colors provided: propagate last color upward
                this.colors = [
                    color[0] || this.colors[0],
                    color[1] || color[0] || this.colors[1],
                    color[2] || color[1] || color[0] || this.colors[2]
                ];
            } else {
                // Single color: apply to all arms (backwards compatible)
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

    animate() {
        if (!this.isRunning) return;

        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Update rotation
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
            this.ctx.clearRect(0, 0, this.width, this.height);
            return;
        }

        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height / 2;
        const maxRadius = Math.max(this.width, this.height) * 0.7;

        ctx.clearRect(0, 0, this.width, this.height);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);

        // Draw spiral arms — each arm gets a color cycling through the palette
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

        // Inner glow — uses the first color
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius * 0.15);
        gradient.addColorStop(0, this.colors[0] + '40');
        gradient.addColorStop(1, 'transparent');
        ctx.globalAlpha = 1;
        ctx.fillStyle = gradient;
        ctx.fillRect(-maxRadius, -maxRadius, maxRadius * 2, maxRadius * 2);

        ctx.restore();
    }

    /**
     * Parse @spiral command
     * Backwards compatible: `@spiral color:#8B5CF6 opacity:0.3 speed:0.5 fade:2`
     * Multi-color: `@spiral color1:#c471ed color2:#12c2e9 color3:#f64f59 opacity:0.3`
     * Or: `@spiral #c471ed opacity:0.3` (single color, backwards compatible)
     * No color specified: uses default pink/blue/magenta palette
     */
    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            colors: null,  // null = use defaults
            opacity: 0.3,
            speed: 1,
            fade: 1
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
                    // Bare hex color — backwards compatible single color
                    color1 = part;
                } else if (part.includes(':')) {
                    const [key, val] = part.split(':');
                    const v = parseFloat(val);

                    switch (key) {
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

            // Build color array with propagation:
            // If only color1: [c1, c1, c1]
            // If color1 + color2: [c1, c2, c2]
            // If all three: [c1, c2, c3]
            // If none: null (use defaults)
            if (color1) {
                result.colors = [
                    color1,
                    color2 || color1,
                    color3 || color2 || color1
                ];
            }
        }

        // Backwards compatibility: also expose .color for callers expecting single color
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
