/**
 * Optimized Experience App
 * Refactored with modular architecture and performance improvements
 */

// Import modules (add script tags to HTML)
// <script src="modules/PoseDetector.js"></script>
// <script src="modules/TextureManager.js"></script>
// <script src="modules/RenderOptimizer.js"></script>

class ExperienceAppOptimized {
    constructor() {
        // Performance optimizer
        this.optimizer = new RenderOptimizer({
            targetFPS: 60,
            adaptiveQuality: true
        });

        // Texture manager
        this.textureManager = new TextureManager({
            maxCacheSize: 30
        });

        // Pose detector
        this.poseDetector = new PoseDetector({
            throttleMs: 100,
            stableTime: 500
        });

        // Canvas setup
        this.setupCanvases();

        // Layer system
        this.layerManager = null;
        this.layers = {};

        // State management
        this.state = {
            currentPose: 'neutral',
            currentTexture: null,
            currentOverlay: null,
            isFullscreen: false,
            videoReady: false
        };

        // Configuration
        this.config = {
            backgroundMode: 'remove',
            backgroundColor: '#ffffff',
            personEffect: 'texture',
            buildingOverlayEnabled: true
        };

        // Animation frame management
        this.animationId = null;
        this.isRunning = false;

        // Event handlers map for cleanup
        this.eventHandlers = new Map();

        this.init();
    }

    /**
     * Setup canvases with optimization
     */
    setupCanvases() {
        this.canvas = document.getElementById('outputCanvas');
        this.overlayCanvas = document.getElementById('overlayCanvas');

        // Use regular context without willReadFrequently for better performance
        this.ctx = this.canvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        // Create offscreen canvas for heavy operations
        const { canvas, ctx } = this.optimizer.getOffscreenCanvas(800, 600);
        this.offscreenCanvas = canvas;
        this.offscreenCtx = ctx;
    }

    /**
     * Initialize application
     */
    async init() {
        try {
            // Load configuration
            await this.loadConfiguration();

            // Preload critical textures
            await this.preloadAssets();

            // Setup layers
            this.setupLayers();

            // Setup UI controls
            this.setupControls();

            // Register event handlers
            this.registerEventHandlers();

            // Start render loop
            this.startRenderLoop();

            console.log('✓ Application initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            this.handleError(error);
        }
    }

    /**
     * Load configuration files
     */
    async loadConfiguration() {
        try {
            const response = await fetch('experience-config.json');
            const config = await response.json();

            this.experienceConfig = config;
            this.poseMapping = config.poses;

            // Apply settings
            if (config.settings) {
                this.applySettings(config.settings);
            }

            console.log('✓ Configuration loaded');
        } catch (error) {
            console.error('Failed to load configuration:', error);
            // Use default configuration
            this.experienceConfig = this.getDefaultConfig();
        }
    }

    /**
     * Preload critical assets
     */
    async preloadAssets() {
        const texturesToPreload = [];

        // Collect all texture paths from configuration
        if (this.poseMapping) {
            for (const pose of Object.values(this.poseMapping)) {
                if (pose.textures?.building?.variants) {
                    pose.textures.building.variants.forEach(variant => {
                        texturesToPreload.push(`images/${variant}`);
                    });
                }
                if (pose.textures?.nature?.variants) {
                    pose.textures.nature.variants.forEach(variant => {
                        if (variant.image) {
                            texturesToPreload.push(`images/${variant.image}`);
                        }
                    });
                }
            }
        }

        // Preload textures
        const results = await this.textureManager.preloadTextures(texturesToPreload);
        console.log(`✓ Preloaded ${results.loaded}/${results.total} textures`);
    }

    /**
     * Setup layer system
     */
    setupLayers() {
        this.layerManager = new LayerManager(this.canvas, this.overlayCanvas);

        // Create layers
        this.layers.video = new VideoLayer();
        this.layers.background = new BackgroundLayer({
            mode: 'mountain_cutout',
            backgroundColor: this.config.backgroundColor
        });
        this.layers.pixiSprite = new PixiSpriteLayer({
            debugMode: false
        });
        this.layers.nature = new NatureLayer();

        // Configure layers
        if (this.poseMapping) {
            this.layers.pixiSprite.setPoseConfig({ poses: this.poseMapping });
        }

        // Add layers to manager
        Object.values(this.layers).forEach(layer => {
            this.layerManager.addLayer(layer);
        });

        // Setup video layer events
        this.setupVideoLayerEvents();

        console.log('✓ Layer system initialized');
    }

    /**
     * Setup video layer event handlers
     */
    setupVideoLayerEvents() {
        const videoLayer = this.layers.video;

        videoLayer.on('camera-ready', (data) => {
            this.handleCameraReady(data);
        });

        videoLayer.on('segmentation-results', (data) => {
            this.handleSegmentationResults(data);
        });

        videoLayer.on('pose-results', (data) => {
            this.handlePoseResults(data);
        });

        videoLayer.on('error', (error) => {
            this.handleVideoError(error);
        });
    }

    /**
     * Handle camera ready event
     */
    handleCameraReady(data) {
        this.state.videoReady = true;

        // Update canvas dimensions
        this.canvas.width = data.width;
        this.canvas.height = data.height;
        this.overlayCanvas.width = data.width;
        this.overlayCanvas.height = data.height;

        console.log('✓ Camera ready:', data);
    }

    /**
     * Handle segmentation results (optimized)
     */
    handleSegmentationResults(data) {
        if (!this.state.videoReady) return;

        // Skip frames based on quality settings
        if (this.optimizer.shouldSkipFrame()) return;

        // Store for rendering
        this.segmentationData = data;

        // Trigger render (handled by animation loop)
    }

    /**
     * Handle pose results (optimized)
     */
    handlePoseResults(data) {
        if (!data.poses?.length) return;

        // Use optimized pose detector
        const detectedPose = this.poseDetector.detect(data.poses[0].poseLandmarks);

        if (detectedPose !== this.state.currentPose) {
            this.handlePoseChange(this.state.currentPose, detectedPose);
            this.state.currentPose = detectedPose;
        }
    }

    /**
     * Handle pose change
     */
    handlePoseChange(oldPose, newPose) {
        console.log(`Pose changed: ${oldPose} → ${newPose}`);

        // Update textures based on new pose
        this.updateTexturesForPose(newPose);

        // Notify layers
        if (this.layers.pixiSprite) {
            this.layers.pixiSprite.currentPoseType = newPose;
        }
    }

    /**
     * Update textures for pose
     */
    async updateTexturesForPose(poseName) {
        const pose = this.poseMapping?.[poseName];
        if (!pose) return;

        // Update building texture
        if (pose.textures?.building?.variants?.length > 0) {
            const variant = pose.textures.building.variants[0];
            const texturePath = `images/${variant}`;

            // Load texture if not cached
            if (!this.textureManager.hasTexture(texturePath)) {
                await this.textureManager.loadTexture(texturePath);
            }

            this.state.currentTexture = texturePath;
        }

        // Update nature overlay
        if (pose.textures?.nature?.variants?.length > 0) {
            const variant = pose.textures.nature.variants[0];
            this.state.currentOverlay = variant;

            if (this.layers.nature) {
                this.layers.nature.setOverlay(variant);
            }
        }
    }

    /**
     * Main render loop (optimized)
     */
    startRenderLoop() {
        if (this.isRunning) return;

        this.isRunning = true;

        const render = () => {
            if (!this.isRunning) return;

            this.optimizer.startFrame();

            // Render frame if we have data
            if (this.segmentationData) {
                this.renderFrame();
            }

            const frameTime = this.optimizer.endFrame();

            // Schedule next frame
            this.animationId = requestAnimationFrame(render);
        };

        render();
    }

    /**
     * Optimized render frame
     */
    renderFrame() {
        if (!this.segmentationData) return;

        const data = this.segmentationData;

        // Prepare layer input data
        const inputData = {
            originalImage: data.image,
            segmentationMask: data.segmentationMask,
            poses: this.poseDetector.currentPose,
            currentPose: this.state.currentPose,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
        };

        // Use layer manager to render
        this.layerManager.render(inputData);

        // Update performance overlay if enabled
        if (this.showPerformance) {
            this.updatePerformanceOverlay();
        }
    }

    /**
     * Update performance overlay
     */
    updatePerformanceOverlay() {
        const report = this.optimizer.getPerformanceReport();

        // Update UI with performance metrics
        const perfElement = document.getElementById('performanceMetrics');
        if (perfElement) {
            perfElement.innerHTML = `
                FPS: ${report.fps} |
                Quality: ${report.quality} |
                Render: ${report.metrics.renderTime}
            `;
        }
    }

    /**
     * Setup UI controls
     */
    setupControls() {
        // Pose detection toggle
        this.setupControl('poseDetection', 'click', (e) => {
            this.togglePoseDetection();
        });

        // Pose test buttons
        document.querySelectorAll('.pose-test-button').forEach(button => {
            this.setupControl(button, 'click', () => {
                const poseType = button.getAttribute('data-pose');
                this.simulatePose(poseType);
            });
        });

        // Fullscreen button
        this.setupControl('fullscreenBtn', 'click', () => {
            this.toggleFullscreen();
        });

        // Performance toggle
        this.setupControl('performanceToggle', 'click', () => {
            this.showPerformance = !this.showPerformance;
        });
    }

    /**
     * Setup individual control with cleanup tracking
     */
    setupControl(elementOrId, event, handler) {
        const element = typeof elementOrId === 'string' ?
            document.getElementById(elementOrId) : elementOrId;

        if (!element) return;

        // Remove old handler if exists
        const key = `${element.id || element.className}_${event}`;
        if (this.eventHandlers.has(key)) {
            const oldHandler = this.eventHandlers.get(key);
            element.removeEventListener(event, oldHandler);
        }

        // Add new handler
        element.addEventListener(event, handler);
        this.eventHandlers.set(key, handler);
    }

    /**
     * Register global event handlers
     */
    registerEventHandlers() {
        // Fullscreen change events
        const fullscreenHandler = () => {
            this.handleFullscreenChange(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', fullscreenHandler);
        this.eventHandlers.set('fullscreen', fullscreenHandler);

        // Visibility change for performance
        const visibilityHandler = () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        };

        document.addEventListener('visibilitychange', visibilityHandler);
        this.eventHandlers.set('visibility', visibilityHandler);
    }

    /**
     * Cleanup and destroy
     */
    destroy() {
        // Stop render loop
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Clean up event handlers
        for (const [key, handler] of this.eventHandlers) {
            if (key === 'fullscreen') {
                document.removeEventListener('fullscreenchange', handler);
            } else if (key === 'visibility') {
                document.removeEventListener('visibilitychange', handler);
            }
        }

        // Destroy layers
        if (this.layerManager) {
            this.layerManager.destroy();
        }

        // Clear texture cache
        this.textureManager.clearAll();

        console.log('✓ Application destroyed');
    }

    /**
     * Pause rendering
     */
    pause() {
        this.isRunning = false;
        console.log('Application paused');
    }

    /**
     * Resume rendering
     */
    resume() {
        if (!this.isRunning) {
            this.startRenderLoop();
            console.log('Application resumed');
        }
    }

    // Utility methods

    togglePoseDetection() {
        // Implementation
    }

    simulatePose(poseType) {
        this.handlePoseChange(this.state.currentPose, poseType);
    }

    toggleFullscreen() {
        // Implementation
    }

    handleFullscreenChange(isFullscreen) {
        this.state.isFullscreen = isFullscreen;
        // Update UI accordingly
    }

    handleError(error) {
        console.error('Application error:', error);
        // Show user-friendly error message
    }

    handleVideoError(error) {
        console.error('Video error:', error);
        // Handle video-specific errors
    }

    applySettings(settings) {
        // Apply configuration settings
    }

    getDefaultConfig() {
        return {
            poses: {},
            settings: {}
        };
    }
}

// Export for use by the HTML initialization script
// No automatic initialization here - controlled by app.html