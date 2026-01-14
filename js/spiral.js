/**
 * Spiral visual effect for hypnotic enhancement
 */

class SpiralEffect {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isRunning = false;
        this.animationId = null;

        // Spiral parameters
        this.color = '#8B5CF6';  // Purple default
        this.opacity = 0.3;
        this.speed = 1;          // Rotations per second
        this.rotation = 0;

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
     * @param {string} color - Hex color
     * @param {number} opacity - Target opacity (0-1)
     * @param {number} speed - Rotations per second
     * @param {number} fade - Fade in duration in seconds
     */
    start(color = '#8B5CF6', opacity = 0.3, speed = 1, fade = 1) {
        this.color = color;
        this.targetOpacity = opacity;
        this.speed = speed;
        this.fadeSpeed = fade;

        if (!this.isRunning) {
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
        this.fadeSpeed = fade;
        // Animation loop will stop itself when opacity reaches 0
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

        // Draw spiral arms
        const arms = 2;
        const turns = 6;

        for (let arm = 0; arm < arms; arm++) {
            const armOffset = (arm / arms) * Math.PI * 2;

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

            ctx.strokeStyle = this.color;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Parse @spiral command
     * @param {string} args - Command arguments
     * @returns {Object} - Parsed parameters
     */
    static parseCommand(args) {
        const parts = args.trim().split(/\s+/);
        const result = {
            action: 'on',
            color: '#8B5CF6',
            opacity: 0.3,
            speed: 1,
            fade: 1
        };

        if (parts[0] === 'off') {
            result.action = 'off';
            // Check for fade parameter
            for (let i = 1; i < parts.length; i++) {
                if (parts[i].startsWith('fade:')) {
                    result.fade = parseFloat(parts[i].split(':')[1]) || 1;
                }
            }
        } else {
            if (parts[0] === 'on') parts.shift();

            for (const part of parts) {
                if (part.startsWith('#')) {
                    result.color = part;
                } else if (part.startsWith('fade:')) {
                    result.fade = parseFloat(part.split(':')[1]) || 1;
                } else {
                    const num = parseFloat(part);
                    if (!isNaN(num)) {
                        if (num <= 1) {
                            result.opacity = num;
                        } else {
                            result.speed = num;
                        }
                    }
                }
            }
        }

        return result;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpiralEffect;
}
