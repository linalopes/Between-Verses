/**
 * PixiJS Sprite Layer
 * Handles pose-responsive building sprites with texture switching
 */
class PixiSpriteLayer extends LayerInterface {
    constructor(config = {}) {
        
        super('pixiSprite', {
            zIndex: 15, // Above nature layer but below UI
            alwaysRender: true, // Always render to update sprite positions
            pixiContainer: null,
            debugMode: true,
            poseConfig: null, // Configuration for pose-to-texture mapping
            ...config
        });

        this.pixiApp = null;
        this.sprites = new Map(); // Store sprites for each person
        this.spriteContainers = new Map(); // Store containers for positioning
        this.debugGraphics = null;

        // Animation settings
        this.smoothingFactor = 0.8;
        this.minConfidence = 0.5;
        this.maxFPS = 30;
        this.lastUpdateTime = 0;

        // Sprite configuration
        this.spriteConfig = {
            scaleFactor: 5  // Multiplier for shoulder width (higher = bigger sprites)
        };


        // Pose tracking for texture switching
        this.currentPoseType = null;
        this.lastLoggedPoseType = null;
        this.currentSpriteTextures = new Map();
        this.lastTextureChange = new Map();
        this.lastPoseType = new Map();
        this.poseChangeTime = 0;
        this.lastSpriteTransform = null;
    }

    // Method to update pose configuration from segmentation
    setPoseConfig(poseConfig) {
        this.config.poseConfig = poseConfig;
        
    }

    // Get texture file for a given pose from configuration
    getTextureForPose(poseType) {
        // Check if we have pose configuration
        if (!this.config.poseConfig) {
            console.warn('No pose configuration available, using fallback texture');
            return null;
        }

        // Use imageMappings system
        if (this.config.poseConfig.imageMappings && this.config.poseConfig.imageMappings[poseType]) {
            const mapping = this.config.poseConfig.imageMappings[poseType];
            if (mapping.building) {
                const texturePath = `images/${mapping.building}.png`;
                return texturePath;
            } else {
                return null;
            }
        }

        // Fallback to globalImages default
        if (this.config.poseConfig.globalImages?.defaultBuilding) {
            const fallbackPath = `images/${this.config.poseConfig.globalImages.defaultBuilding}.png`;
            
            return fallbackPath;
        }

        console.warn(`No building texture mapping for pose: ${poseType}`);
        return null;
    }

    onInit() {
        
        this.setupPixiApp();

        // Debug: Set up interval to check if this layer is being called
        // setInterval(() => {
        //     console.log('🔍 PixiSpriteLayer status check:', {
        //         enabled: this.enabled,
        //         renderCallCount: this.renderCallCount || 0,
        //         pixiAppExists: !!this.pixiApp
        //     });
        // }, 3000); // Every 3 seconds
    }

    async setupPixiApp() {
        if (this.pixiApp) {
            
            return;
        }

        try {
            const pixiContainer = document.getElementById('pixiContainer');
            if (!pixiContainer) {
                console.error('PixiJS container not found');
                return;
            }

            // Create PixiJS application (PixiJS v8 requires async initialization)
            this.pixiApp = new PIXI.Application();
            await this.pixiApp.init({
                width: 800,
                height: 600,
                backgroundColor: 0x000000,
                backgroundAlpha: 0,
                premultipliedAlpha: false, // Fix black transparency issue
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
            });

            // Add the PixiJS canvas to the container
            pixiContainer.appendChild(this.pixiApp.canvas);

            // Make sure the canvas is visible and positioned correctly (from working version)
            this.pixiApp.canvas.style.position = 'absolute';
            this.pixiApp.canvas.style.top = '0';
            this.pixiApp.canvas.style.left = '0';
            this.pixiApp.canvas.style.zIndex = String(this.config.zIndex || 15); // Use configured zIndex
            this.pixiApp.canvas.style.pointerEvents = 'none';
            this.pixiApp.canvas.style.opacity = '1.0'; // Ensure full opacity

            

            // Create test sprite
            this.createTestSprite().catch(error => {
                console.error('Failed to create test sprite:', error);
            });
            

            

            // Start render loop
            this.pixiApp.ticker.add(() => {
                // Ensures the stage is rendered every frame
            });
            

        } catch (error) {
            console.error('Failed to create PixiJS application:', error);
            this.pixiApp = null;
        }
    }

    async onRender(inputData, timestamp) {
        try {

        // Use the pose already detected by segmentation.js
        if (inputData.currentPose) {
            const poseType = inputData.currentPose;

            // Only log pose changes
            if (this.lastLoggedPoseType !== poseType) {
                const ts = new Date().toLocaleTimeString();
                console.log(`📍 [${ts}] PixiSpriteLayer received pose: "${this.lastLoggedPoseType}" → "${poseType}"`);
                this.lastLoggedPoseType = poseType;
                
            }

            // Apply pose effects (sprite scaling/positioning and texture switching)
            this.applyPoseEffects('test', poseType, timestamp);
        }

        if (!this.pixiApp) {
            
            await this.setupPixiApp();
            if (!this.pixiApp) {
                
                return false;
            }
            
        }

        // If sprites are empty, try to create test sprite
        if (this.sprites.size === 0) {
            
            this.createTestSprite().catch(error => {
                console.error('Failed to create test sprite:', error);
            });
        }

        // Update PixiJS application size to match canvas if needed
        this.updatePixiSize();

        // Process pose data for sprite positioning
        // The landmark data is in inputData.poses[0].poseLandmarks
        if (inputData.poses && inputData.poses.length > 0 && inputData.poses[0].poseLandmarks) {
            this.updateSpriteFromLandmarks('test', inputData.poses[0].poseLandmarks);
        }

            return true;

        } catch (error) {
            console.error('❌ PixiSpriteLayer.onRender error:', error);
            console.error('Error stack:', error.stack);
            // Return true to keep the render loop going even if there's an error
            return true;
        }
    }

    onResize(width, height) {
        console.log('PixiSpriteLayer onResize:', width, 'x', height);

        if (this.pixiApp && this.pixiApp.renderer) {
            // Resize the PixiJS renderer
            this.pixiApp.renderer.resize(width, height);

            // Update canvas styling - use viewport units in fullscreen
            if (this.pixiApp.canvas) {
                const isFullscreen = !!document.fullscreenElement;
                if (isFullscreen) {
                    this.pixiApp.canvas.style.width = '100vw';
                    this.pixiApp.canvas.style.height = '100vh';
                } else {
                    this.pixiApp.canvas.style.width = width + 'px';
                    this.pixiApp.canvas.style.height = height + 'px';
                }
            }

            console.log('✓ PixiSpriteLayer PixiJS resized to:', width, 'x', height);
        }
    }

    updatePixiSize() {
        if (!this.pixiApp) return;

        // Get container size to match
        const pixiContainer = document.getElementById('pixiContainer');
        if (!pixiContainer) return;

        const containerWidth = pixiContainer.clientWidth;
        const containerHeight = pixiContainer.clientHeight;

        // Only resize if container has valid dimensions and they don't match current renderer size
        if (containerWidth > 0 && containerHeight > 0 &&
            (this.pixiApp.renderer.width !== containerWidth || this.pixiApp.renderer.height !== containerHeight)) {
            this.pixiApp.renderer.resize(containerWidth, containerHeight);
            console.log('PixiSpriteLayer auto-resized to container:', containerWidth, 'x', containerHeight);
        }
    }

    updateSpritesFromPoses(poses, timestamp) {
        if (!poses || poses.length === 0) {
            return;
        }

        if (!this.pixiApp) {
            console.log('PixiJS app not ready in updateSpritesFromPoses, attempting setup...');
            return;
        }

        // Check if sprites exist, if not create them
        if (this.sprites.size === 0) {
            
            this.createTestSprite().catch(error => {
                console.error('Failed to create test sprite:', error);
            });
            return; // Skip this frame, let sprite creation complete
        }

        // Update test sprite based on first person's pose
        const pose = poses[0];
        if (pose && pose.poseLandmarks) {
            // Update sprite position based on landmarks
            this.updateSpriteFromLandmarks('test', pose.poseLandmarks);
        }
    }

    applyPoseEffects(spriteId, poseType, timestamp) {
        const sprite = this.sprites.get(spriteId);
        if (!sprite) return;

        // Log pose changes
        if (!this.currentPoseType || this.currentPoseType !== poseType) {
           // console.log(`Pose changed: ${this.currentPoseType} → ${poseType}`);
            this.currentPoseType = poseType;
        }

        // Always check texture switching (not just on pose change)
        // This ensures the stability timer can complete
        this.updateSpriteTextureForPose(spriteId, poseType);

        // Apply pose-responsive scaling and positioning
        this.updateSpriteSizeAndPosition(sprite, poseType, timestamp);
    }

    updateSpriteSizeAndPosition(sprite, poseType, timestamp) {
        // Base scaling factors for different poses
        let scaleX = 1.0;
        let scaleY = 1.0;

        switch (poseType) {
            case 'jesus':
            case 'warrior':
                // Arms extended: wider sprite for outstretched arms
                scaleX = 1.4;
                scaleY = 1.1;
                // Subtle breathing animation
                const extendedBreath = 1.0 + Math.sin(timestamp * 0.003) * 0.02;
                scaleY *= extendedBreath;
                break;

            case 'mountain':
            case 'tree':
                // Arms up: taller sprite for raised arms
                scaleX = 0.9;
                scaleY = 1.3;
                // Slight upward stretch animation
                const upwardStretch = 1.0 + Math.sin(timestamp * 0.004) * 0.03;
                scaleY *= upwardStretch;
                break;

            default:
                // Neutral pose: natural proportions
                scaleX = 1.0;
                scaleY = 1.0;
                // Gentle breathing
                const neutralBreath = 1.0 + Math.sin(timestamp * 0.002) * 0.015;
                scaleY *= neutralBreath;
                break;
        }

        // Apply scaling
        sprite.scale.set(scaleX, scaleY);
    }

    updateSpriteTextureForPose(spriteId, poseType) {
        const timestamp = new Date().toLocaleTimeString();

        // Initialize tracking objects if needed
        if (!this.currentSpriteTextures) this.currentSpriteTextures = new Map();
        if (!this.lastTextureChange) this.lastTextureChange = new Map();
        if (!this.lastPoseType) this.lastPoseType = new Map();

        const now = Date.now();
        const lastChange = this.lastTextureChange.get(spriteId) || 0;
        const timeSinceLastChange = now - lastChange;

        // If pose changed, start stability timer
        if (this.lastPoseType.get(spriteId) !== poseType) {
           // console.log(`⏱️ [${timestamp}] Pose change detected: "${this.lastPoseType.get(spriteId)}" → "${poseType}" - Starting 500ms stability timer`);
            this.lastPoseType.set(spriteId, poseType);
            this.poseChangeTime = now;
            return; // Wait for pose to stabilize
        }

        // Check if pose has been stable for at least 500ms (1 second)
        const poseStableTime = now - (this.poseChangeTime || 0);
        if (poseStableTime < window.STABLE_TIME) {
            // Log every 200ms to show progress
            if (Math.floor(poseStableTime / 200) !== Math.floor((poseStableTime - 16) / 200)) {
               // console.log(`⏳ [${timestamp}] Pose "${poseType}" stable for ${Math.floor(poseStableTime)}ms / 500ms`);
            }
            return; // Pose not stable yet
        }

        // Prevent too rapid switching
        if (timeSinceLastChange < window.STABLE_TIME) {
            return; // Don't switch too frequently
        }

        // Get texture from configuration
        const targetTexture = this.getTextureForPose(poseType);
        const sprite = this.sprites.get(spriteId);

        // Handle sprite visibility based on texture availability
        if (sprite) {
            if (targetTexture) {
                // Check if we need to change texture
                const currentTexturePath = this.currentSpriteTextures.get(spriteId);
                if (currentTexturePath !== targetTexture) {
                    

                    this.currentSpriteTextures.set(spriteId, targetTexture);
                    this.lastTextureChange.set(spriteId, now);

                    // Load and apply new texture immediately
                    PIXI.Assets.load(targetTexture).then(newTexture => {
                        if (sprite instanceof PIXI.Sprite) {
                            sprite.texture = newTexture;
                            // Size is controlled by landmark-based scaling
                            sprite.visible = true;
                            sprite.alpha = 1.0;
                            
                        }
                    }).catch(error => {
                        console.warn('Failed to load texture:', targetTexture, error);
                        // Keep sprite visible with old texture if new one fails
                        sprite.visible = true;
                        sprite.alpha = 1.0;
                    });
                } else {
                    // Same texture, just ensure sprite is visible with full alpha
                    sprite.visible = true;
                    sprite.alpha = 1.0;
                }
            } else {
                // No texture configured (e.g., neutral pose) - hide the sprite
                sprite.visible = false;
                sprite.alpha = 0.0;
                // Hide sprite for unconfigured poses
            }
        }
    }

    updateSpriteFromLandmarks(spriteId, landmarks) {

        const sprite = this.sprites.get(spriteId);

        if (!sprite) {
            if (!this.spriteMissingLogged) {
                console.log('❌ Sprite not found for', spriteId);
                console.log('Available sprites:', Array.from(this.sprites.keys()));
                this.spriteMissingLogged = true;
            }
            return;
        }

        this.spriteMissingLogged = false;

        // Position sprite based on pose landmarks
        try {
            // Get key landmarks
            const leftShoulder = this.landmarkToPixi(landmarks[11]);
            const rightShoulder = this.landmarkToPixi(landmarks[12]);

            // Check if landmarks exist
            if (!leftShoulder || !rightShoulder) {
                return;
            }

            // Calculate position based on shoulders
            const centerX = (leftShoulder.x + rightShoulder.x) / 2;
            const centerY = (leftShoulder.y + rightShoulder.y) / 2;
            const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);

            // Scale sprite to match shoulder width using configurable factor
            const targetSpriteWidth = shoulderWidth * this.spriteConfig.scaleFactor;
            const minWidth = 80;  // Minimum size for visibility
            const maxWidth = 1000; // Maximum size to prevent huge sprites (increased for larger sprites)
            const clampedWidth = Math.max(minWidth, Math.min(maxWidth, targetSpriteWidth));

            // Debug logging for scaling
            // console.log(`🔍 Sprite scaling debug:`, {
            //     shoulderWidth: Math.round(shoulderWidth),
            //     scaleFactor: this.spriteConfig.scaleFactor,
            //     targetWidth: Math.round(targetSpriteWidth),
            //     clampedWidth: Math.round(clampedWidth),
            //     minWidth, maxWidth
            // });


            // Apply smoothing for stable positioning
            if (!this.lastSpriteTransform) {
                this.lastSpriteTransform = {
                    x: centerX,
                    y: centerY,
                    width: clampedWidth
                };
            }

            const smoothX = Utils.lerp(this.lastSpriteTransform.x, centerX, 0.3);
            const smoothY = Utils.lerp(this.lastSpriteTransform.y, centerY, 0.3);
            const smoothWidth = Utils.lerp(this.lastSpriteTransform.width, clampedWidth, 0.3);


            // Position sprite at calculated center (works with anchor 0.5, 0.5)
            sprite.position.set(smoothX, smoothY);

            // Scale sprite to shoulder width while maintaining aspect ratio
            sprite.width = smoothWidth;
            // Keep original aspect ratio
            const aspectRatio = sprite.texture.height / sprite.texture.width;
            sprite.height = smoothWidth * aspectRatio;

            // Only show sprite if it has a valid texture (not just the white placeholder)
            // The texture switching logic in updateSpriteTextureForPose will control visibility
            // sprite.visible = true; // Removed - let texture logic control visibility
            sprite.alpha = 0.8; // Semi-transparent to see if it's moving

            // Add visual debug indicators at landmark positions
            this.addDebugLandmarkIndicators(leftShoulder, rightShoulder, centerX, centerY, landmarks);

            this.lastSpriteTransform = { x: smoothX, y: smoothY, width: smoothWidth };

        } catch (error) {
            console.error('Error updating sprite from landmarks:', error);
        }
    }

    landmarkToPixi(landmark) {
        if (!landmark || landmark.visibility < this.minConfidence) {
            return null;
        }

        // Convert MediaPipe coordinates to PixiJS coordinates
        const pixiX = landmark.x * this.pixiApp.renderer.width;
        const pixiY = landmark.y * this.pixiApp.renderer.height;

        return new PIXI.Point(pixiX, pixiY);
    }

    // lerp moved to Utils module

    addDebugLandmarkIndicators(leftShoulder, rightShoulder, centerX, centerY, allLandmarks = null) {
        // Clear previous debug indicators
        if (this.debugLandmarks) {
            this.pixiApp.stage.removeChild(this.debugLandmarks);
        }

        // Only show landmarks if debug mode is enabled
        if (!this.debugMode) {
            return;
        }

        // Create new debug graphics
        this.debugLandmarks = new PIXI.Graphics();

        if (this.debugMode && allLandmarks) {
            // Show all pose landmarks when in debug mode
            this.renderAllPoseLandmarks(allLandmarks);
        } else {
            // Show only key landmarks (shoulders + center)
            // Draw left shoulder indicator (blue circle)
            this.debugLandmarks.circle(leftShoulder.x, leftShoulder.y, 10).fill(0x0000FF);

            // Draw right shoulder indicator (green circle)
            this.debugLandmarks.circle(rightShoulder.x, rightShoulder.y, 10).fill(0x00FF00);

            // Draw center point indicator (yellow circle)
            this.debugLandmarks.circle(centerX, centerY, 15).fill(0xFFFF00);

            // Draw line between shoulders
            this.debugLandmarks.moveTo(leftShoulder.x, leftShoulder.y)
                .lineTo(rightShoulder.x, rightShoulder.y)
                .stroke({width: 2, color: 0xFF00FF});
        }

        // Add to stage
        this.pixiApp.stage.addChild(this.debugLandmarks);
    }

    renderAllPoseLandmarks(landmarks) {
        // MediaPipe Pose landmark connections (simplified version)
        const connections = [
            // Face
            [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
            // Body
            [9, 10], // Mouth
            [11, 12], // Shoulders
            [11, 13], [13, 15], // Left arm
            [12, 14], [14, 16], // Right arm
            [11, 23], [12, 24], // Shoulder to hip
            [23, 24], // Hips
            [23, 25], [25, 27], [27, 29], [27, 31], // Left leg
            [24, 26], [26, 28], [28, 30], [28, 32], // Right leg
        ];

        // Colors for different body parts
        const landmarkColors = {
            // Face landmarks (0-10)
            face: 0xFFFFFF,
            // Body landmarks (11-24)
            body: 0x00FF00,
            // Arm landmarks (13-16)
            arms: 0x0000FF,
            // Leg landmarks (25-32)
            legs: 0xFF0000
        };

        // Draw all landmarks as circles
        landmarks.forEach((landmark, index) => {
            const pixiPoint = this.landmarkToPixi(landmark);
            if (pixiPoint) {
                let color = landmarkColors.face; // Default
                if (index >= 25) color = landmarkColors.legs;
                else if (index >= 13 && index <= 16) color = landmarkColors.arms;
                else if (index >= 11) color = landmarkColors.body;

                // Draw landmark point
                this.debugLandmarks.circle(pixiPoint.x, pixiPoint.y, 6).fill(color);

                // Special highlighting for key landmarks
                if (index === 11 || index === 12) { // Shoulders
                    this.debugLandmarks.circle(pixiPoint.x, pixiPoint.y, 12).stroke({width: 2, color: 0xFFFF00});
                }
            }
        });

        // Draw connections between landmarks
        connections.forEach(([startIdx, endIdx]) => {
            const start = this.landmarkToPixi(landmarks[startIdx]);
            const end = this.landmarkToPixi(landmarks[endIdx]);

            if (start && end) {
                this.debugLandmarks.moveTo(start.x, start.y)
                    .lineTo(end.x, end.y)
                    .stroke({width: 2, color: 0xFFFFFF, alpha: 0.6});
            }
        });
    }

    async createTestSprite() {
        try {
            //console.log('🔧 Creating building sprite...');

            // Create sprite with a transparent texture (no visible placeholder)
            const emptyTexture = PIXI.Texture.EMPTY; // Use built-in transparent texture as placeholder
            const sprite = new PIXI.Sprite(emptyTexture);

            // Set anchor to center so sprite scales and positions from its center
            sprite.anchor.set(0.5, 0.5);

            // Start with center position for better debugging
            sprite.x = 400; // Center-ish position
            sprite.y = 300;
            // Size will be set by landmark-based scaling

            // Start visible with full alpha for immediate visibility
            sprite.visible = true;
            sprite.alpha = 1.0;
            sprite.renderable = true;
            sprite.cullable = false; // Prevent culling

            // Add to stage
            this.pixiApp.stage.addChild(sprite);
            // Force render immediately after adding sprite
            this.pixiApp.renderer.render(this.pixiApp.stage);

            // Store sprite for future manipulation
            this.sprites.set('test', sprite);

            console.log('✓ Test sprite created (initially invisible until texture is set)');

        } catch (error) {
            console.error('Failed to create test sprite:', error);
        }
    }

    setDebugMode(enabled) {
        console.log('PixiSpriteLayer.setDebugMode called:', enabled);
        // Debug mode functionality for landmarks visualization
        this.debugMode = enabled;
    }

    setWireframeMode(enabled) {
        console.log('PixiSpriteLayer.setWireframeMode called:', enabled);
        // Wireframe mode not applicable for sprites, but method needed for compatibility
    }

    setEnabled(enabled) {
        // Call parent method to set the flag
        super.setEnabled(enabled);

        // Control individual sprite visibility (not the whole stage)
        for (const sprite of this.sprites.values()) {
            sprite.visible = enabled;
        }

        // Don't hide landmarks - they are controlled by the Pose Landmarks checkbox
        // Landmarks should remain visible even when sprites are hidden
    }


    destroy() {
        if (this.pixiApp) {
            this.pixiApp.destroy(true);
            this.pixiApp = null;
        }
        this.sprites.clear();
        this.spriteContainers?.clear();
        super.destroy();
        console.log('PixiSpriteLayer destroyed');
    }
}