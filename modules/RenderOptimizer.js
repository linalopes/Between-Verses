/**
 * RenderOptimizer Module (Simplified)
 * Essential performance monitoring with minimal overhead
 */
class RenderOptimizer {
    constructor(config = {}) {
        this.config = {
            targetFPS: config.targetFPS || 60,
            adaptiveQuality: config.adaptiveQuality !== false,
            measureInterval: config.measureInterval || 1000
        };

        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.fps = 0;

        // Simplified performance tracking
        this.performance = {
            renderTime: 0
        };

        // Simplified quality levels
        this.quality = {
            current: 'high',
            settings: {
                low: { segmentationQuality: 0.5, particlesEnabled: false },
                high: { segmentationQuality: 0.8, particlesEnabled: true }
            }
        };

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
        return frameTime;
    }

    /**
     * Calculate current FPS
     */
    calculateFPS() {
        this.fps = this.frameCount;
        this.frameCount = 0;
    }

    /**
     * Adjust quality based on performance (simplified)
     */
    adjustQuality() {
        if (this.fps < 30 && this.quality.current === 'high') {
            this.quality.current = 'low';
            console.log(`Quality downgraded to: low (FPS: ${this.fps})`);
        } else if (this.fps > 50 && this.quality.current === 'low') {
            this.quality.current = 'high';
            console.log(`Quality upgraded to: high (FPS: ${this.fps})`);
        }
    }

    /**
     * Get performance report (simplified)
     */
    getPerformanceReport() {
        return {
            fps: this.fps,
            targetFPS: this.config.targetFPS,
            quality: this.quality.current,
            renderTime: this.performance.renderTime.toFixed(2) + 'ms',
            health: this.fps > this.config.targetFPS * 0.9 ? 'good' :
                   this.fps > this.config.targetFPS * 0.6 ? 'fair' : 'poor'
        };
    }

    /**
     * Reset performance metrics
     */
    resetMetrics() {
        this.performance.renderTime = 0;
        this.frameCount = 0;
        this.fps = 0;
    }

    // Complex methods moved to Utils module or removed as unused
}