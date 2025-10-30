/**
 * RenderOptimizer Module
 * Optimizations for canvas rendering and performance monitoring
 */
class RenderOptimizer {
    constructor(config = {}) {
        this.config = {
            targetFPS: config.targetFPS || 60,
            adaptiveQuality: config.adaptiveQuality !== false,
            measureInterval: config.measureInterval || 1000,
            ...config
        };

        this.frameTime = 1000 / this.config.targetFPS;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;

        this.performance = {
            renderTime: 0,
            poseTime: 0,
            effectTime: 0,
            frameDrops: 0
        };

        this.quality = {
            current: 'high',
            levels: ['low', 'medium', 'high'],
            settings: {
                low: {
                    segmentationQuality: 0.5,
                    effectIntensity: 0.7,
                    particlesEnabled: false,
                    skipFrames: 2
                },
                medium: {
                    segmentationQuality: 0.65,
                    effectIntensity: 0.85,
                    particlesEnabled: true,
                    skipFrames: 1
                },
                high: {
                    segmentationQuality: 0.8,
                    effectIntensity: 0.95,
                    particlesEnabled: true,
                    skipFrames: 0
                }
            }
        };

        this.offscreenCanvas = null;
        this.offscreenCtx = null;
        this.frameSkipCounter = 0;

        this.initPerformanceMonitoring();
    }

    /**
     * Initialize performance monitoring
     */
    initPerformanceMonitoring() {
        if (typeof performance === 'undefined') return;

        setInterval(() => {
            this.calculateFPS();
            if (this.config.adaptiveQuality) {
                this.adjustQuality();
            }
        }, this.config.measureInterval);
    }

    /**
     * Start frame timing
     */
    startFrame() {
        this.lastFrameTime = performance.now();
    }

    /**
     * End frame timing and update metrics
     */
    endFrame() {
        const frameTime = performance.now() - this.lastFrameTime;
        this.performance.renderTime = frameTime;
        this.frameCount++;

        if (frameTime > this.frameTime * 1.5) {
            this.performance.frameDrops++;
        }

        return frameTime;
    }

    /**
     * Measure specific operation
     */
    measure(name, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;

        if (this.performance[name + 'Time'] !== undefined) {
            this.performance[name + 'Time'] = duration;
        }

        return result;
    }

    /**
     * Async measure
     */
    async measureAsync(name, fn) {
        const start = performance.now();
        const result = await fn();
        const duration = performance.now() - start;

        if (this.performance[name + 'Time'] !== undefined) {
            this.performance[name + 'Time'] = duration;
        }

        return result;
    }

    /**
     * Calculate current FPS
     */
    calculateFPS() {
        this.fps = this.frameCount;
        this.frameCount = 0;
    }

    /**
     * Should skip this frame based on quality settings
     */
    shouldSkipFrame() {
        const settings = this.quality.settings[this.quality.current];
        if (settings.skipFrames === 0) return false;

        this.frameSkipCounter++;
        if (this.frameSkipCounter > settings.skipFrames) {
            this.frameSkipCounter = 0;
            return false;
        }

        return true;
    }

    /**
     * Adjust quality based on performance
     */
    adjustQuality() {
        const currentLevel = this.quality.levels.indexOf(this.quality.current);

        if (this.fps < 30 && currentLevel > 0) {
            // Downgrade quality
            this.quality.current = this.quality.levels[currentLevel - 1];
            console.log(`Quality downgraded to: ${this.quality.current} (FPS: ${this.fps})`);
        } else if (this.fps > 55 && currentLevel < this.quality.levels.length - 1) {
            // Upgrade quality
            this.quality.current = this.quality.levels[currentLevel + 1];
            console.log(`Quality upgraded to: ${this.quality.current} (FPS: ${this.fps})`);
        }
    }

    /**
     * Get current quality settings
     */
    getQualitySettings() {
        return this.quality.settings[this.quality.current];
    }

    /**
     * Create or get offscreen canvas
     */
    getOffscreenCanvas(width, height) {
        if (!this.offscreenCanvas ||
            this.offscreenCanvas.width !== width ||
            this.offscreenCanvas.height !== height) {

            if (typeof OffscreenCanvas !== 'undefined') {
                this.offscreenCanvas = new OffscreenCanvas(width, height);
                this.offscreenCtx = this.offscreenCanvas.getContext('2d');
            } else {
                this.offscreenCanvas = document.createElement('canvas');
                this.offscreenCanvas.width = width;
                this.offscreenCanvas.height = height;
                this.offscreenCtx = this.offscreenCanvas.getContext('2d');
            }
        }

        return {
            canvas: this.offscreenCanvas,
            ctx: this.offscreenCtx
        };
    }

    /**
     * Batch canvas operations
     */
    batchOperations(ctx, operations) {
        ctx.save();

        for (const op of operations) {
            switch (op.type) {
                case 'drawImage':
                    ctx.drawImage(...op.args);
                    break;
                case 'fillRect':
                    ctx.fillStyle = op.style;
                    ctx.fillRect(...op.args);
                    break;
                case 'strokeRect':
                    ctx.strokeStyle = op.style;
                    ctx.lineWidth = op.lineWidth || 1;
                    ctx.strokeRect(...op.args);
                    break;
                case 'clear':
                    ctx.clearRect(...op.args);
                    break;
            }
        }

        ctx.restore();
    }

    /**
     * Optimize image data processing
     */
    processImageDataOptimized(imageData, processor) {
        const pixels = imageData.data;
        const length = pixels.length;

        // Process in chunks to avoid blocking
        const chunkSize = 40000; // 10000 pixels * 4 channels
        let offset = 0;

        const processChunk = () => {
            const end = Math.min(offset + chunkSize, length);

            for (let i = offset; i < end; i += 4) {
                processor(pixels, i);
            }

            offset = end;

            if (offset < length) {
                requestAnimationFrame(processChunk);
            }
        };

        processChunk();
    }

    /**
     * Get performance report
     */
    getPerformanceReport() {
        return {
            fps: this.fps,
            targetFPS: this.config.targetFPS,
            quality: this.quality.current,
            metrics: {
                renderTime: this.performance.renderTime.toFixed(2) + 'ms',
                poseTime: this.performance.poseTime.toFixed(2) + 'ms',
                effectTime: this.performance.effectTime.toFixed(2) + 'ms',
                frameDrops: this.performance.frameDrops
            },
            health: this.fps > this.config.targetFPS * 0.9 ? 'good' :
                   this.fps > this.config.targetFPS * 0.6 ? 'fair' : 'poor'
        };
    }

    /**
     * Reset performance metrics
     */
    resetMetrics() {
        this.performance = {
            renderTime: 0,
            poseTime: 0,
            effectTime: 0,
            frameDrops: 0
        };
        this.frameCount = 0;
        this.fps = 0;
    }

    // Debounce and throttle functions moved to Utils module
}