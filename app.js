// Configuration constants
const STABLE_TIME = 500; // ms - time to wait for pose stability before texture changes

class ExperienceApp {
    constructor() {
        // Make constants available globally
        window.STABLE_TIME = STABLE_TIME;
        this.canvas = document.getElementById('outputCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Separate overlay canvas for bottom third nature overlay
        this.overlayCanvas = document.getElementById('overlayCanvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        // Layer System
        this.layerManager = new LayerManager(this.canvas, this.overlayCanvas);
        this.backgroundLayer = null;
        this.natureLayer = null;
        this.pixiSpriteLayer = null;
        this.videoLayer = null;

        // Data received from VideoLayer
        this.poses = [];
        this.segmentationResults = null;
        this.lastPoseUpdate = 0;

        this.settings = {
            backgroundMode: 'remove',
            backgroundColor: '#ffffff',
            personEffect: 'texture',
            buildingOverlayEnabled: true,
            confidenceThreshold: 0.7,
            effectIntensity: 0.95
        };

        this.textures = [];
        this.textureConfig = null;
        this.poseMapping = null;
        this.currentTexture = null;
        this.currentCategory = 'nature';
        this.currentPose = 'neutral';
        this.currentOverlay = null;

        // Pose simulation state
        this.isSimulatingPose = false;
        this.currentSimulatedPose = null;
        this.poseDetectionEnabled = true;

        // Multi-person shoulder stickers
        // Shoulder stickers removed for simplified 3-layer system
        this.personStates = []; // Current state for each person
        this.personStableStates = []; // Stable state for each person
        this.personStableCounters = []; // Counter for state stability
        this.personOverlayImages = []; // Overlay image for each person
        this.STABLE_FRAMES = 12; // Number of frames to wait before considering a state stable
        this.STABLE_TIME = 500; // Time in milliseconds to wait before considering a state stable
        // Shoulder sticker properties removed

        // Display controls
        this.videoVisible = true;
        this.skeletonVisible = false;

        // Initialize texture manager for better performance
        this.textureManager = new TextureManager({
            maxCacheSize: 30,
            preloadTimeout: 5000
        });
        this.textureImage = null;

        // Pose detection throttling
        this.lastPoseDetection = 0;
        this.poseDetectionInterval = 100; // ms

        // Event listener cleanup
        this.eventHandlers = [];

        // Performance monitoring
        this.renderOptimizer = new RenderOptimizer({
            targetFPS: 60,
            adaptiveQuality: false // Start with fixed quality
        });

        // Initialize with no overlay - will be set by pose detection
        this.currentOverlay = null;

        this.init();
    }

    // Event handler management
    addEventHandler(element, event, handler) {
        element.addEventListener(event, handler);
        this.eventHandlers.push({ element, event, handler });
    }

    // Cleanup method
    destroy() {
        this.eventHandlers.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventHandlers = [];
    }

    async init() {
        try {
            await this.loadTextureConfig();
            await this.loadPoseMapping();
            this.setupLayers();
            this.setupControls();

            // Hide status element completely - no video labels needed
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.style.display = 'none';
                console.log('✓ Status element hidden');
            } else {
                console.log('ℹ️ No status element found to hide');
            }

            // Set initial overlay
            const natureLayer = this.layerManager.getLayer('nature');
            if (natureLayer) {
                console.log('Setting initial nature overlay:', this.currentOverlay);
                natureLayer.setOverlay(this.currentOverlay);
                console.log('Nature layer enabled state:', natureLayer.config.enabled);
            }

            // Add fullscreen change event listeners
            this.addEventHandler(document, 'fullscreenchange', () => {
                console.log('Fullscreen change event fired:', !!document.fullscreenElement);
                this.onFullscreenChange(!!document.fullscreenElement);
            });
            this.addEventHandler(document, 'webkitfullscreenchange', () => {
                console.log('WebKit fullscreen change event fired:', !!document.webkitFullscreenElement);
                this.onFullscreenChange(!!document.webkitFullscreenElement);
            });
            this.addEventHandler(document, 'mozfullscreenchange', () => {
                console.log('Mozilla fullscreen change event fired:', !!document.mozFullScreenElement);
                this.onFullscreenChange(!!document.mozFullScreenElement);
            });
        } catch (error) {
            console.error('Initialization error:', error);
            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #ff6b6b;">Error: ' + error.message + '</span>';
            }
        }
    }


    setupLayers() {
        // Create and configure video layer (camera + MediaPipe)
        this.videoLayer = new VideoLayer();

        // Set up event listeners for video layer
        this.videoLayer.on('camera-ready', (data) => {
            console.log('Camera ready:', data);
            // Update main canvas dimensions to match video
            this.canvas.width = data.width;
            this.canvas.height = data.height;
            // Update overlay canvas dimensions to match video
            this.overlayCanvas.width = data.width;
            this.overlayCanvas.height = data.height;
        });

        this.videoLayer.on('segmentation-results', (data) => {
            this.segmentationResults = data;
            this.renderFrame();
        });

        this.videoLayer.on('pose-results', (data) => {
            this.poses = data.poses;
            this.detectPose();
        });

        this.videoLayer.on('error', (error) => {
            console.error('VideoLayer error:', error);
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: #ff6b6b;">Video Error: ${error.message}</span>`;
                statusEl.style.display = 'block';
            }
        });

        // Create and configure background layer (mountain cutout effect)
        this.backgroundLayer = new BackgroundLayer({
            mode: 'mountain_cutout',
            confidenceThreshold: this.settings.confidenceThreshold,
            backgroundColor: this.settings.backgroundColor,
            backgroundImage: 'bg-images/mountain.png'
        });

        // Create and configure nature layer
        this.natureLayer = new NatureLayer({
            currentOverlay: this.currentOverlay
        });

        // Create and configure PixiJS sprite layer
        console.log('About to create PixiSpriteLayer, class available:', typeof PixiSpriteLayer);
        if (typeof PixiSpriteLayer === 'undefined') {
            console.error('PixiSpriteLayer class is not defined!');
            return;
        }
        this.pixiSpriteLayer = new PixiSpriteLayer({
            pixiContainer: 'pixiContainer',
            debugMode: true // Debug mode matches default checkbox state
        });

        // Pass configuration to PixiSpriteLayer after it's created
        if (this.poseMapping) {
            this.pixiSpriteLayer.setPoseConfig(this.poseMapping);
        }
        console.log('PixiSpriteLayer created successfully:', !!this.pixiSpriteLayer);

        // Add layers to manager
        this.layerManager.addLayer(this.videoLayer);      // Base layer - provides video input
        this.layerManager.addLayer(this.backgroundLayer);  // Segmentation and mountain backdrop
        this.layerManager.addLayer(this.pixiSpriteLayer);  // Building sprites
        this.layerManager.addLayer(this.natureLayer);      // Nature overlays and particles

        console.log('Layer system initialized: Video (input), Background (segmentation), PixiSprite (building), Nature (overlays)');
    }


    async renderFrame() {
        this.renderOptimizer.startFrame();

        if (!this.segmentationResults) return;

        const videoData = this.segmentationResults;

        // Draw base image to canvas
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(videoData.image, 0, 0, this.canvas.width, this.canvas.height);

        // Get image data for layer processing
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;

        // Prepare input data for layers
        let maskData = null;
        if (videoData.segmentationMask) {
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = this.canvas.width;
            maskCanvas.height = this.canvas.height;
            const maskCtx = maskCanvas.getContext('2d');
            maskCtx.drawImage(videoData.segmentationMask, 0, 0, this.canvas.width, this.canvas.height);
            maskData = maskCtx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
        }

        const layerInputData = {
            originalImage: videoData.image,
            pixels: pixels,
            mask: maskData,
            poses: this.poses,
            imageData: imageData,
            currentPose: this.currentPose  // Pass the already-detected pose
        };

        // Use layer system for rendering
        await this.layerManager.render(layerInputData);

        // Put processed image data back to canvas
        this.ctx.putImageData(imageData, 0, 0);

        // Draw shoulder stickers for each person
        // Shoulder stickers removed - using NatureLayer for overlays
        if (false && this.poses && this.poses.length > 0) {
            this.poses.forEach((pose, personIndex) => {
                if (pose.poseLandmarks) {
                    // Shoulder sticker drawing removed
                }
            });
        }

        // Draw pose keypoints if enabled
        if (this.textureConfig?.settings?.showPoseKeypoints) {
            this.drawPoseKeypoints();
        }

        this.ctx.restore();

        const frameTime = this.renderOptimizer.endFrame();

        // Optional: Adjust quality based on performance
        if (frameTime > 33) { // > 30 FPS
            console.warn('Frame time high:', frameTime + 'ms');
        }
    }

    detectPose() {
        const now = Date.now();

        // Throttle pose detection
        if (now - this.lastPoseDetection < this.poseDetectionInterval) {
            return;
        }
        this.lastPoseDetection = now;

        // If pose detection is disabled or we're simulating a pose, don't run actual detection
        if (!this.poseDetectionEnabled || this.isSimulatingPose) {
            return;
        }

        if (!this.poses.length || !this.poses[0].poseLandmarks) {
            return;
        }

        const landmarks = this.poses[0].poseLandmarks;

        // Get key landmark positions (MediaPipe pose landmarks)
        const leftShoulder = landmarks[11];  // LEFT_SHOULDER
        const rightShoulder = landmarks[12]; // RIGHT_SHOULDER
        const leftElbow = landmarks[13];     // LEFT_ELBOW
        const rightElbow = landmarks[14];    // RIGHT_ELBOW
        const leftWrist = landmarks[15];     // LEFT_WRIST
        const rightWrist = landmarks[16];    // RIGHT_WRIST
        const leftHip = landmarks[23];       // LEFT_HIP
        const rightHip = landmarks[24];      // RIGHT_HIP
        const nose = landmarks[0];           // NOSE

        let detectedPose = 'neutral';

        // Get additional landmarks for enhanced pose detection
        const leftAnkle = landmarks[27];     // LEFT_ANKLE
        const rightAnkle = landmarks[28];    // RIGHT_ANKLE

        // Check for Star pose: arms and legs spread wide
        if (this.checkStarPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow, leftHip, rightHip, leftAnkle, rightAnkle)) {
            detectedPose = 'star';
        }
        // Check for Arms Out (T-pose): arms extended horizontally
        else if (this.checkArmsOutPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow)) {
            detectedPose = 'arms_out';
        }
        // Check for Zigzag pose: one arm up diagonally
        else if (this.checkZigzagPose(leftWrist, rightWrist, leftShoulder, rightShoulder)) {
            detectedPose = 'zigzag';
        }
        // Check for Rounded pose: arms curved/rounded
        else if (this.checkRoundedPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow)) {
            detectedPose = 'rounded';
        }
        // Check for Arms Up pose: both arms raised up
        else if (this.checkArmsUpPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow, nose)) {
            detectedPose = 'arms_up';
        }
        // Check for Mountain pose: both hands above head, close together (keep existing)
        else if (this.checkMountainPose(leftWrist, rightWrist, leftShoulder, rightShoulder, nose)) {
            detectedPose = 'mountain';
        }
        // Check for Tree pose: one leg raised, arms up (keep existing)
        else if (this.checkTreePose(leftWrist, rightWrist, leftShoulder, rightShoulder)) {
            detectedPose = 'tree';
        }
        // Check for Warrior pose: wide stance, arms extended (keep existing)
        else if (this.checkWarriorPose(leftWrist, rightWrist, leftShoulder, rightShoulder)) {
            detectedPose = 'warrior';
        }

        // Only update if pose has been stable for a bit
        const poseNow = Date.now();
        if (detectedPose !== this.currentPose) {
            if (poseNow - this.lastPoseUpdate > this.STABLE_TIME) { // 1 second stability
                this.currentPose = detectedPose;
                this.updateTextureForPose(detectedPose).catch(console.error);
                this.updateDebugDisplay(detectedPose); // Update debug display
                this.lastPoseUpdate = poseNow;
            }
        } else {
            this.lastPoseUpdate = poseNow;
        }
    }

    checkMountainPose(leftWrist, rightWrist, leftShoulder, rightShoulder, nose) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return false;

        // Both wrists above shoulders (arms lifted up)
        const leftArmUp = leftWrist.y < leftShoulder.y - 0.15;
        const rightArmUp = rightWrist.y < rightShoulder.y - 0.15;

        // Arms can be wider apart (more relaxed than mountain pose)
        const handsDistance = Math.abs(leftWrist.x - rightWrist.x);
        const armsReasonablyClose = handsDistance < 0.4;

        return leftArmUp && rightArmUp && armsReasonablyClose;
    }

    checkJesusPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return false;

        // Arms stretched horizontally to the sides (more tolerant)
        const leftArmHorizontal = Math.abs(leftWrist.y - leftShoulder.y) < 0.15;
        const rightArmHorizontal = Math.abs(rightWrist.y - rightShoulder.y) < 0.15;

        // Arms fully extended to sides
        const leftArmExtended = leftWrist.x < leftShoulder.x - 0.15;
        const rightArmExtended = rightWrist.x > rightShoulder.x + 0.15;

        // Good arm spread (Cristo Redentor pose)
        const armSpread = Math.abs(leftWrist.x - rightWrist.x);
        const goodSpread = armSpread > 0.4;

        return leftArmHorizontal && rightArmHorizontal && leftArmExtended && rightArmExtended && goodSpread;
    }

    checkTreePose(leftWrist, rightWrist, leftShoulder, rightShoulder) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return false;

        // Both arms raised (simplified tree pose detection)
        const armsRaised = (leftWrist.y < leftShoulder.y - 0.1) && (rightWrist.y < rightShoulder.y - 0.1);
        const armsWide = Math.abs(leftWrist.x - rightWrist.x) > 0.2;

        return armsRaised && armsWide;
    }

    checkWarriorPose(leftWrist, rightWrist, leftShoulder, rightShoulder) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return false;

        // One arm forward, one arm back (simplified)
        const armsSeparated = Math.abs(leftWrist.x - rightWrist.x) > 0.3;
        const armsAtShoulderLevel = Math.abs(leftWrist.y - leftShoulder.y) < 0.15 &&
                                   Math.abs(rightWrist.y - rightShoulder.y) < 0.15;

        return armsSeparated && armsAtShoulderLevel;
    }

    // Helper function to calculate angle between three points
    calculateAngle(point1, point2, point3) {
        const a = { x: point1.x, y: point1.y };
        const b = { x: point2.x, y: point2.y }; // vertex point
        const c = { x: point3.x, y: point3.y };

        const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);

        if (angle > 180.0) {
            angle = 360 - angle;
        }

        return angle;
    }

    checkStarPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow, leftHip, rightHip, leftAnkle, rightAnkle) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftElbow || !rightElbow) return false;
        if (!leftHip || !rightHip || !leftAnkle || !rightAnkle) return false;

        // Check arm angles (should be raised and spread)
        const leftArmAngle = this.calculateAngle(leftWrist, leftElbow, leftShoulder);
        const rightArmAngle = this.calculateAngle(rightWrist, rightElbow, rightShoulder);

        // Check if arms are raised (wrists above shoulders)
        const armsRaised = (leftWrist.y < leftShoulder.y) && (rightWrist.y < rightShoulder.y);

        // Check if legs are spread (ankles wider than hips)
        const legSpread = Math.abs(leftAnkle.x - rightAnkle.x) > Math.abs(leftHip.x - rightHip.x) * 1.5;

        // Arms should be relatively straight and spread
        const armsStraight = (leftArmAngle > 140) && (rightArmAngle > 140);

        return armsRaised && legSpread && armsStraight;
    }

    checkArmsOutPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftElbow || !rightElbow) return false;

        // Arms should be horizontal (wrists at shoulder level)
        const leftArmHorizontal = Math.abs(leftWrist.y - leftShoulder.y) < 0.1;
        const rightArmHorizontal = Math.abs(rightWrist.y - rightShoulder.y) < 0.1;

        // Arms should be straight out
        const leftArmStraight = this.calculateAngle(leftWrist, leftElbow, leftShoulder) > 160;
        const rightArmStraight = this.calculateAngle(rightWrist, rightElbow, rightShoulder) > 160;

        return leftArmHorizontal && rightArmHorizontal && leftArmStraight && rightArmStraight;
    }

    checkZigzagPose(leftWrist, rightWrist, leftShoulder, rightShoulder) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return false;

        // One arm should be raised diagonally
        const leftArmRaised = leftWrist.y < leftShoulder.y - 0.1;
        const rightArmRaised = rightWrist.y < rightShoulder.y - 0.1;

        // Only one arm should be raised
        const oneArmUp = (leftArmRaised && !rightArmRaised) || (rightArmRaised && !leftArmRaised);

        return oneArmUp;
    }

    checkSideArmsPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftElbow || !rightElbow) return false;

        // Similar to T-pose but more specific to side positioning
        const armsLevel = (Math.abs(leftWrist.y - leftShoulder.y) < 0.08) &&
                         (Math.abs(rightWrist.y - rightShoulder.y) < 0.08);

        // Check if arms are extended to sides (not forward/back)
        const leftArmAngle = this.calculateAngle(leftWrist, leftElbow, leftShoulder);
        const rightArmAngle = this.calculateAngle(rightWrist, rightElbow, rightShoulder);

        const armsStraight = leftArmAngle > 150 && rightArmAngle > 150;

        return armsLevel && armsStraight;
    }

    checkRoundedPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftElbow || !rightElbow) return false;

        // Arms should be bent/curved (not straight)
        const leftArmAngle = this.calculateAngle(leftWrist, leftElbow, leftShoulder);
        const rightArmAngle = this.calculateAngle(rightWrist, rightElbow, rightShoulder);

        // Curved arms have smaller angles
        const armsCurved = leftArmAngle < 120 && rightArmAngle < 120;

        // Elbows should be away from body (rounded shape)
        const leftElbowOut = Math.abs(leftElbow.x - leftShoulder.x) > 0.1;
        const rightElbowOut = Math.abs(rightElbow.x - rightShoulder.x) > 0.1;

        return armsCurved && leftElbowOut && rightElbowOut;
    }

    checkArmsUpPose(leftWrist, rightWrist, leftShoulder, rightShoulder, leftElbow, rightElbow, nose) {
        if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftElbow || !rightElbow || !nose) return false;

        // Both arms should be raised above head
        const armsRaised = (leftWrist.y < nose.y) && (rightWrist.y < nose.y);

        // Arms should be relatively straight
        const leftArmAngle = this.calculateAngle(leftWrist, leftElbow, leftShoulder);
        const rightArmAngle = this.calculateAngle(rightWrist, rightElbow, rightShoulder);

        const armsStraight = leftArmAngle > 140 && rightArmAngle > 140;

        return armsRaised && armsStraight;
    }

    async updateTextureForPose(poseName) {
        console.log(`Updating texture for pose: ${poseName}`);
        console.log(`🔧 Debug - poseMapping:`, !!this.poseMapping);
        console.log(`🔧 Debug - poseMapping.poses:`, !!this.poseMapping?.poses);
        console.log(`🔧 Debug - available poses:`, Object.keys(this.poseMapping?.poses || {}));

        if (!this.poseMapping || !this.poseMapping.poses[poseName]) {
            console.warn(`Pose "${poseName}" not found in mapping`);
            console.warn(`🔧 poseMapping state:`, {
                exists: !!this.poseMapping,
                poses: this.poseMapping?.poses ? Object.keys(this.poseMapping.poses) : 'none'
            });
            // For unknown poses, clear overlay
            if (!this.currentOverlay) {
                this.currentOverlay = null;
                const natureLayer = this.layerManager.getLayer('nature');
                if (natureLayer) {
                    natureLayer.setOverlay(null);
                }
            }
            return;
        }

        const pose = this.poseMapping.poses[poseName];
        console.log(`Pose data:`, pose);

        // Update building texture if building overlay is enabled
        if (pose.textures && pose.textures.building && this.settings.buildingOverlayEnabled) {
            const buildingTextures = pose.textures.building;
            let textureFile = null;

            // Handle both old and new format
            if (buildingTextures.variants && Array.isArray(buildingTextures.variants) && buildingTextures.variants.length > 0) {
                // New variant format - randomly select from available options
                const randomIndex = Math.floor(Math.random() * buildingTextures.variants.length);
                textureFile = buildingTextures.variants[randomIndex];
                console.log(`Selected building texture variant ${randomIndex + 1}/${buildingTextures.variants.length}: ${textureFile}`);
            } else if (buildingTextures.primary) {
                // Legacy format support
                textureFile = buildingTextures.primary;
            }

            if (textureFile) {
                const texturePath = `images/${textureFile}`;
                try {
                    await this.textureManager.loadTexture(texturePath);
                    this.currentTexture = texturePath;
                    console.log(`Building texture loaded: ${textureFile}`);
                } catch (error) {
                    console.warn('Failed to load texture:', textureFile, error);
                    this.currentTexture = null;
                }

                // Update debug display
                const buildingName = textureFile.replace('.png', '').replace('.jpg', '');
                this.updateDebugDisplay(null, buildingName, null);
            } else {
                // No texture available (empty variants array)
                this.currentTexture = null;
                console.log('No building texture variants available, clearing texture');
                this.updateDebugDisplay(null, 'none', null);
            }
        } else if (!this.settings.buildingOverlayEnabled) {
            // Clear building textures if building overlay is disabled
            // Building layer removed
            this.currentTexture = null;

            // Update debug display
            this.updateDebugDisplay(null, 'none', null);
            console.log('Building overlay disabled, clearing textures');
        }

        // Update nature layer with variant support
        let selectedNatureOverlay = null;
        if (pose.textures?.nature) {
            const natureTextures = pose.textures.nature;

            // Handle both old and new format
            if (natureTextures.variants && Array.isArray(natureTextures.variants)) {
                // New variant format - randomly select from available options
                const randomIndex = Math.floor(Math.random() * natureTextures.variants.length);
                selectedNatureOverlay = natureTextures.variants[randomIndex];
                console.log(`Selected nature texture variant ${randomIndex + 1}/${natureTextures.variants.length}:`, selectedNatureOverlay);
            } else if (natureTextures.image) {
                // Legacy format support
                selectedNatureOverlay = natureTextures;
            }

            // Add particle configuration if available
            if (natureTextures.particles) {
                if (!selectedNatureOverlay) selectedNatureOverlay = {};
                selectedNatureOverlay.particles = natureTextures.particles;
                console.log('Added particle configuration:', natureTextures.particles);
            }
        }

        this.currentOverlay = selectedNatureOverlay || null;

        // Update debug display for nature
        const natureName = this.currentOverlay?.image ? this.currentOverlay.image.replace('.png', '').replace('.jpg', '') : 'none';
        this.updateDebugDisplay(null, null, natureName);

        const natureLayer = this.layerManager.getLayer('nature');
        if (natureLayer) {
            natureLayer.setOverlay(this.currentOverlay);
            // Force immediate render
            natureLayer.invalidate();
            console.log('Nature layer invalidated, forcing render...');
        }
        console.log(`Current overlay set to:`, this.currentOverlay);

        // Update status to show detected pose
        this.updateStatusForPose(pose, poseName);
    }



    /**
     * Update status display for current pose
     */
    updateStatusForPose(pose, poseName) {
        const statusEl = document.getElementById('status');
        if (!statusEl) return;

        // Remove the top status bar since we have debug info in sidebar
        statusEl.style.display = 'none';
    }

    drawPoseKeypoints() {
        if (!this.poses.length || !this.poses[0].poseLandmarks) return;

        const landmarks = this.poses[0].poseLandmarks;

        this.ctx.fillStyle = '#FF0000';
        this.ctx.strokeStyle = '#00FF00';
        this.ctx.lineWidth = 2;

        // Draw key landmarks for pose detection
        const keyPoints = [0, 11, 12, 13, 14, 15, 16, 23, 24]; // nose, shoulders, elbows, wrists, hips

        keyPoints.forEach(index => {
            const landmark = landmarks[index];
            if (landmark && landmark.visibility > 0.5) {
                const x = landmark.x * this.canvas.width;
                const y = landmark.y * this.canvas.height;

                this.ctx.beginPath();
                this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        });

        // Draw pose connections
        const connections = [
            [11, 13], [13, 15], // Left arm
            [12, 14], [14, 16], // Right arm
            [11, 12],           // Shoulders
            [11, 23], [12, 24], // Torso
            [23, 24]            // Hips
        ];

        connections.forEach(([start, end]) => {
            const startLandmark = landmarks[start];
            const endLandmark = landmarks[end];

            if (startLandmark && endLandmark &&
                startLandmark.visibility > 0.5 && endLandmark.visibility > 0.5) {

                const startX = startLandmark.x * this.canvas.width;
                const startY = startLandmark.y * this.canvas.height;
                const endX = endLandmark.x * this.canvas.width;
                const endY = endLandmark.y * this.canvas.height;

                this.ctx.beginPath();
                this.ctx.moveTo(startX, startY);
                this.ctx.lineTo(endX, endY);
                this.ctx.stroke();
            }
        });
    }

    renderTopLayerOverlay() {
        // Only render if overlay has changed or hasn't been rendered yet
        const currentOverlayKey = this.currentOverlay?.image || 'none';
        if (this.lastRenderedOverlay === currentOverlayKey) {
            return; // Already rendered this overlay
        }

        console.log(`Rendering new overlay: ${currentOverlayKey}`);
        this.lastRenderedOverlay = currentOverlayKey;

        // Clear the overlay canvas first
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

        const overlayHeight = this.textureConfig?.settings?.overlayHeight || 0.33;
        const startY = this.overlayCanvas.height * (1 - overlayHeight);
        const overlayAreaHeight = this.overlayCanvas.height - startY;

        console.log(`Overlay canvas dimensions: ${this.overlayCanvas.width}x${this.overlayCanvas.height}`);
        console.log(`Overlay area: startY=${startY}, height=${overlayAreaHeight}`);

        // Only proceed if we have a current overlay (no hardcoded fallback)
        if (!this.currentOverlay) {
            console.log('No nature overlay configured - skipping overlay rendering');
            return;
        }

        console.log(`Loading nature texture: ${this.currentOverlay.image}`);

        // Create and load the overlay image
        const overlayImg = new Image();
        overlayImg.crossOrigin = 'anonymous';

        overlayImg.onload = () => {
            console.log(`Image loaded successfully: ${overlayImg.width}x${overlayImg.height}`);

            // Clear and render the final overlay
            this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

            this.overlayCtx.save();
            this.overlayCtx.globalCompositeOperation = 'source-over';
            this.overlayCtx.globalAlpha = 0.4;

            // Draw the nature texture
            this.overlayCtx.drawImage(
                overlayImg,
                0, startY,                    // Start at left edge, at 2/3 height
                this.overlayCanvas.width,    // Cover FULL screen width
                overlayAreaHeight            // Cover bottom third height
            );

            this.overlayCtx.restore();
            console.log(`✓ Nature overlay rendered and persisted: ${this.currentOverlay.image}`);
        };

        overlayImg.onerror = (e) => {
            console.error(`Failed to load nature texture: images/${this.currentOverlay.image}`, e);

            // Fallback: render a solid color overlay
            this.overlayCtx.save();
            this.overlayCtx.fillStyle = 'rgba(135, 206, 235, 1.0)'; // Sky blue
            this.overlayCtx.fillRect(0, startY, this.overlayCanvas.width, overlayAreaHeight);
            this.overlayCtx.restore();
            console.log('✓ Fallback color overlay rendered');
        };

        // Try loading the image
        const imagePath = `images/${this.currentOverlay.image}`;
        console.log(`Loading image from: ${imagePath}`);
        overlayImg.src = imagePath;
    }

    renderFallbackOverlay(startY, overlayAreaHeight) {
        this.overlayCtx.save();

        // Use a semi-transparent color overlay as fallback
        // Choose color based on current pose or default to nature green
        let fallbackColor = 'rgba(34, 139, 34, 0.8)'; // Forest green

        if (this.currentPose === 'mountain') {
            fallbackColor = 'rgba(135, 206, 235, 0.8)'; // Sky blue
        } else if (this.currentPose === 'jesus') {
            fallbackColor = 'rgba(0, 150, 200, 0.8)'; // Ocean blue
        } else if (this.currentPose === 'warrior') {
            fallbackColor = 'rgba(255, 165, 0, 0.8)'; // Sunset orange
        }

        this.overlayCtx.fillStyle = fallbackColor;
        this.overlayCtx.globalCompositeOperation = 'normal';
        this.overlayCtx.globalAlpha = 1.0;

        // Fill the bottom third with the fallback color
        this.overlayCtx.fillRect(
            0, startY,                       // Start at left edge, at 2/3 height
            this.overlayCanvas.width,        // Cover FULL screen width
            overlayAreaHeight                // Cover bottom third height
        );

        this.overlayCtx.restore();
    }

    async applyEffects(pixels, mask, imageData, originalImage) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        if (this.settings.backgroundMode === 'blur') {
            this.applyBackgroundBlur(pixels, mask, originalImage);
        } else if (this.settings.backgroundMode === 'remove') {
            this.removeBackground(pixels, mask);
        } else if (this.settings.backgroundMode === 'replace') {
            this.replaceBackground(pixels, mask);
        }

        if (this.settings.personEffect === 'texture' && this.currentTexture) {
            await this.applyTextureToForeground(pixels, mask);
        } else if (this.settings.personEffect === 'color') {
            this.applyColorOverlay(pixels, mask);
        } else if (this.settings.personEffect === 'edge') {
            this.applyEdgeGlow(pixels, mask, imageData);
        }
    }

    applyBackgroundBlur(pixels, mask, originalImage) {
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = this.canvas.width;
        blurCanvas.height = this.canvas.height;
        const blurCtx = blurCanvas.getContext('2d');

        blurCtx.filter = 'blur(15px)';
        blurCtx.drawImage(originalImage, 0, 0, this.canvas.width, this.canvas.height);

        // Add color overlay to blurred background
        blurCtx.globalCompositeOperation = 'multiply';
        blurCtx.fillStyle = 'rgba(100, 150, 200, 0.3)'; // Cool blue tint
        blurCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const blurData = blurCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue < this.settings.confidenceThreshold) {
                pixels[i] = blurData.data[i];
                pixels[i + 1] = blurData.data[i + 1];
                pixels[i + 2] = blurData.data[i + 2];
            }
        }
    }

    removeBackground(pixels, mask) {
        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue < this.settings.confidenceThreshold) {
                pixels[i + 3] = 0;
            }
        }
    }

    replaceBackground(pixels, mask) {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = this.canvas.width;
        bgCanvas.height = this.canvas.height;
        const bgCtx = bgCanvas.getContext('2d');

        bgCtx.drawImage(this.backgroundImage, 0, 0, this.canvas.width, this.canvas.height);
        const bgData = bgCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue < this.settings.confidenceThreshold) {
                const blend = 1 - maskValue;
                pixels[i] = pixels[i] * maskValue + bgData.data[i] * blend;
                pixels[i + 1] = pixels[i + 1] * maskValue + bgData.data[i + 1] * blend;
                pixels[i + 2] = pixels[i + 2] * maskValue + bgData.data[i + 2] * blend;
            }
        }
    }

    async applyTextureToForeground(pixels, mask) {
        await this.applyRegularTexture(pixels, mask);
    }


    async applyRegularTexture(pixels, mask) {
        if (!this.textureImage.complete) return;

        // Calculate the bounding box of the detected contour
        const boundingBox = this.calculateContourBoundingBox(mask);

        if (!boundingBox) {
            // No contour found, fallback to original pattern method
            const textureCanvas = document.createElement('canvas');
            textureCanvas.width = this.canvas.width;
            textureCanvas.height = this.canvas.height;
            const textureCtx = textureCanvas.getContext('2d');

            const pattern = textureCtx.createPattern(this.textureImage, 'repeat');
            textureCtx.fillStyle = pattern;
            textureCtx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
            const textureData = textureCtx.getImageData(0, 0, textureCanvas.width, textureCanvas.height);

            for (let i = 0; i < pixels.length; i += 4) {
                const maskValue = mask[i] / 255;
                if (maskValue > this.settings.confidenceThreshold) {
                    const blend = this.settings.effectIntensity;
                    pixels[i] = pixels[i] * (1 - blend) + textureData.data[i] * blend;
                    pixels[i + 1] = pixels[i + 1] * (1 - blend) + textureData.data[i + 1] * blend;
                    pixels[i + 2] = pixels[i + 2] * (1 - blend) + textureData.data[i + 2] * blend;
                }
            }
            return;
        }

        // Create texture canvas scaled to fit the bounding box
        const textureCanvas = document.createElement('canvas');
        textureCanvas.width = this.canvas.width;
        textureCanvas.height = this.canvas.height;
        const textureCtx = textureCanvas.getContext('2d');

        // Scale the texture to fit within the bounding box
        textureCtx.drawImage(
            this.textureImage,
            boundingBox.minX, boundingBox.minY,           // Destination position
            boundingBox.width, boundingBox.height         // Destination size (scaled)
        );

        const textureData = textureCtx.getImageData(0, 0, textureCanvas.width, textureCanvas.height);

        // Apply the scaled texture only to the person contour
        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue > this.settings.confidenceThreshold) {
                const blend = this.settings.effectIntensity;
                pixels[i] = pixels[i] * (1 - blend) + textureData.data[i] * blend;
                pixels[i + 1] = pixels[i + 1] * (1 - blend) + textureData.data[i + 1] * blend;
                pixels[i + 2] = pixels[i + 2] * (1 - blend) + textureData.data[i + 2] * blend;
            }
        }
    }

    calculateContourBoundingBox(mask) {
        const width = this.canvas.width;
        const height = this.canvas.height;

        let minX = width, minY = height;
        let maxX = 0, maxY = 0;
        let hasContour = false;

        // Scan the mask to find the bounding box of all foreground pixels
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const maskValue = mask[idx] / 255;

                if (maskValue > this.settings.confidenceThreshold) {
                    hasContour = true;
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }

        if (!hasContour) {
            return null; // No contour found
        }

        // Add some padding to prevent edge clipping
        const padding = 5;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(width - 1, maxX + padding);
        maxY = Math.min(height - 1, maxY + padding);

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    applyColorOverlay(pixels, mask) {
        const hue = (Date.now() / 50) % 360;

        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue > this.settings.confidenceThreshold) {
                const rgb = this.hslToRgb(hue / 360, 0.7, 0.5);
                const blend = this.settings.effectIntensity * 0.3;

                pixels[i] = pixels[i] * (1 - blend) + rgb[0] * blend;
                pixels[i + 1] = pixels[i + 1] * (1 - blend) + rgb[1] * blend;
                pixels[i + 2] = pixels[i + 2] * (1 - blend) + rgb[2] * blend;
            }
        }
    }

    applyEdgeGlow(pixels, mask, imageData) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const edgeStrength = this.settings.effectIntensity;

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const maskValue = mask[idx] / 255;

                const neighbors = [
                    mask[((y - 1) * width + x) * 4] / 255,
                    mask[((y + 1) * width + x) * 4] / 255,
                    mask[(y * width + (x - 1)) * 4] / 255,
                    mask[(y * width + (x + 1)) * 4] / 255
                ];

                const isEdge = maskValue > this.settings.confidenceThreshold &&
                    neighbors.some(n => n < this.settings.confidenceThreshold);

                if (isEdge) {
                    pixels[idx] = Math.min(255, pixels[idx] + 100 * edgeStrength);
                    pixels[idx + 1] = Math.min(255, pixels[idx + 1] + 150 * edgeStrength);
                    pixels[idx + 2] = Math.min(255, pixels[idx + 2] + 200 * edgeStrength);
                }
            }
        }
    }

    hslToRgb(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }


    setupControls() {
        // Set background to white by default
        this.settings.backgroundColor = '#ffffff';
        this.backgroundLayer.setBackgroundColor(this.settings.backgroundColor);

        // Building overlay control removed - now handled by pixiMeshes control


        // Settings are now loaded from config, no sliders needed

        // Pose buttons are now directly in the Body Tracking section

        // Pose detection button
        const poseDetectionBtn = document.getElementById('poseDetection');
        if (poseDetectionBtn) {
            // Set initial state
            if (this.poseDetectionEnabled) {
                poseDetectionBtn.classList.add('active');
                poseDetectionBtn.innerHTML = '<span class="tracking-status">●</span> Auto Tracking ON';
            } else {
                poseDetectionBtn.classList.remove('active');
                poseDetectionBtn.innerHTML = '<span class="tracking-status">●</span> Auto Tracking OFF';
            }

            poseDetectionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Toggle the state
                this.poseDetectionEnabled = !this.poseDetectionEnabled;
                console.log('Button clicked! Pose detection enabled:', this.poseDetectionEnabled);

                if (this.poseDetectionEnabled) {
                    poseDetectionBtn.classList.add('active');
                    poseDetectionBtn.innerHTML = '<span class="tracking-status">●</span> Auto Tracking ON';
                    // Clear any simulated pose when re-enabling
                    this.isSimulatingPose = false;
                    this.currentSimulatedPose = null;
                    console.log('Auto tracking re-enabled, clearing simulated pose');
                } else {
                    poseDetectionBtn.classList.remove('active');
                    poseDetectionBtn.innerHTML = '<span class="tracking-status">●</span> Auto Tracking OFF';
                    // Clear poses and stop simulation when manually disabling
                    this.isSimulatingPose = false;
                    this.currentSimulatedPose = null;
                    this.poses = [];  // Clear detected poses
                    this.currentPose = 'neutral';  // Reset to neutral pose
                    console.log('Auto tracking disabled, poses cleared');
                }
            });
        }

        // Shoulder stickers control removed

        // PixiJS meshes checkbox
        const pixiMeshesCheckbox = document.getElementById('pixiMeshes');
        if (pixiMeshesCheckbox) {
            // Set initial state
            pixiMeshesCheckbox.checked = true;

            // Enable the layer initially since checkbox is checked
            if (this.pixiSpriteLayer) {
                console.log('🔧 Enabling PixiJS sprite layer initially...');
                this.pixiSpriteLayer.setEnabled(true);
            }

            pixiMeshesCheckbox.addEventListener('change', () => {
                const isEnabled = pixiMeshesCheckbox.checked;
                console.log('PixiJS sprite layer enabled:', isEnabled);

                // Enable/disable the PixiJS sprite layer
                if (this.pixiSpriteLayer) {
                    this.pixiSpriteLayer.setEnabled(isEnabled);
                }
            });
        }

        // Nature overlay checkbox
        const natureOverlayCheckbox = document.getElementById('natureOverlay');
        if (natureOverlayCheckbox) {
            // Set initial state
            natureOverlayCheckbox.checked = true;

            natureOverlayCheckbox.addEventListener('change', () => {
                const isEnabled = natureOverlayCheckbox.checked;
                console.log('Nature layer enabled:', isEnabled);

                // Force immediate re-render of nature layer
                const natureLayer = this.layerManager.getLayer('nature');
                if (natureLayer) {
                    if (isEnabled) {
                        // Ensure we have a valid overlay
                        if (!this.currentOverlay || !this.currentOverlay.image) {
                            this.currentOverlay = {
                                image: 'mountain.png',
                                opacity: 1.0,
                                blendMode: 'normal'
                            };
                        }
                        console.log('Restoring nature overlay:', this.currentOverlay);
                        natureLayer.setOverlay(this.currentOverlay);
                        natureLayer.setEnabled(true);
                        // Force immediate render
                        natureLayer.invalidate();
                        this.layerManager.render({}, performance.now());
                    } else {
                        natureLayer.setEnabled(false);
                        // Clear the overlay canvas
                        if (this.overlayCanvas) {
                            const overlayCtx = this.overlayCanvas.getContext('2d');
                            overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
                        }
                    }
                }
            });
        }

        // Pose test buttons
        const poseButtons = document.querySelectorAll('.pose-test-button');
        poseButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const poseType = button.getAttribute('data-pose');
                this.simulatePose(poseType);

                // Visual feedback
                poseButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Auto-deactivate after 2 seconds
                setTimeout(() => {
                    button.classList.remove('active');
                }, 2000);
            });
        });

        // Display controls
        this.setupDisplayControls();
    }

    setupDisplayControls() {
        // Fullscreen button
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }


        // Pose skeleton checkbox
        const poseSkeletonCheckbox = document.getElementById('poseSkeleton');
        if (poseSkeletonCheckbox) {
            poseSkeletonCheckbox.addEventListener('change', () => {
                this.toggleSkeletonVisibility(poseSkeletonCheckbox.checked);
            });
        }

        // Pose landmarks checkbox
        const poseLandmarksCheckbox = document.getElementById('poseLandmarks');
        if (poseLandmarksCheckbox) {
            poseLandmarksCheckbox.addEventListener('change', () => {
                this.togglePixiDebug(poseLandmarksCheckbox.checked);
            });
        }

        // Mesh wireframe control removed
    }

    async loadTextureConfig() {
        try {
            console.log('🔧 Loading experience-config.json...');
            const response = await fetch('experience-config.json');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const config = await response.json();
            this.textureConfig = config;
            this.poseMapping = config; // Same config file contains both

            console.log('✅ Config loaded successfully:', {
                posesFound: Object.keys(config.poses || {}),
                configHasPoses: !!config.poses,
                poseMapping: !!this.poseMapping
            });

            // Update PixiSpriteLayer with new configuration
            if (this.pixiSpriteLayer) {
                this.pixiSpriteLayer.setPoseConfig(this.poseMapping);
            }

            // Load settings from config
            if (config.settings) {
                this.settings.confidenceThreshold = config.settings.segmentationQuality || 0.7;
                this.settings.effectIntensity = config.settings.effectIntensity || 0.95;
                this.settings.backgroundColor = config.settings.defaultBackgroundColor || '#1a1a2e';
            }

            // Preload textures
            const texturesToPreload = this.extractTexturePathsFromConfig(this.textureConfig);
            await this.textureManager.preloadTextures(texturesToPreload);
            console.log('✅ Textures preloaded successfully');
        } catch (error) {
            console.error('Failed to load experience config:', error);
            // Fallback to default configuration with proper poses
            this.textureConfig = {
                textures: {
                    nature: [
                        { file: 'matterhorn.jpeg', name: 'Matterhorn', country: 'switzerland' },
                        { file: 'mountain.png', name: 'mountain Falls', country: 'brazil' }
                    ],
                    buildings: []
                },
                poses: {
                    mountain: {
                        name: "Arms Up",
                        textures: {
                            building: { variants: ["prime.png"] }
                        }
                    },
                    jesus: {
                        name: "Arms Sides",
                        textures: {
                            building: { variants: ["cristoredentor.png"] }
                        }
                    },
                    warrior: {
                        name: "Warrior",
                        textures: {
                            building: { variants: ["cristoredentor.png"] }
                        }
                    },
                    neutral: {
                        name: "Neutral",
                        textures: {
                            building: { variants: [] }
                        }
                    }
                },
                settings: {}
            };
            this.poseMapping = this.textureConfig;
        }
    }

    async loadPoseMapping() {
        // No longer needed as it's part of the unified config
        // This method is kept for compatibility but does nothing
    }

    extractTexturePathsFromConfig(config) {
        const paths = [];

        if (config.poses) {
            Object.values(config.poses).forEach(pose => {
                if (pose.textures?.building?.variants) {
                    pose.textures.building.variants.forEach(variant => {
                        paths.push(`images/${variant}`);
                    });
                }
                if (pose.textures?.nature?.variants) {
                    pose.textures.nature.variants.forEach(variant => {
                        if (variant.image) {
                            paths.push(`images/${variant.image}`);
                        }
                    });
                }
            });
        }

        return [...new Set(paths)]; // Remove duplicates
    }

    simulatePose(poseType) {
        if (!this.poseMapping?.poses?.[poseType]) {
            console.warn(`Pose type "${poseType}" not found in configuration`);
            return;
        }

        // Store current pose state
        this.currentSimulatedPose = poseType;
        this.isSimulatingPose = true;

        // Disable automatic tracking when pose is manually selected
        this.poseDetectionEnabled = false;
        const poseDetectionBtn = document.getElementById('poseDetection');
        if (poseDetectionBtn) {
            poseDetectionBtn.classList.remove('active');
            poseDetectionBtn.innerHTML = '<span class="tracking-status">●</span> Auto Tracking OFF';
        }

        // Trigger texture mapping for this pose
        this.applyPoseTextures(poseType);

        console.log(`Simulating pose: ${poseType} - Auto tracking disabled`);
    }

    applyPoseTextures(poseType) {
        // Force update texture for the specified pose type
        this.currentPose = poseType;
        this.updateTextureForPose(poseType).catch(console.error);

        // Immediately update nature layer
        const natureLayer = this.layerManager.getLayer('nature');
        if (natureLayer && this.currentOverlay) {
            natureLayer.setOverlay(this.currentOverlay);
            natureLayer.invalidate();
        }
    }

    // Shoulder sticker methods removed for simplified 3-layer system

    // Display control methods
    toggleFullscreen() {
        const sidebar = document.querySelector('.sidebar');

        console.log('Fullscreen toggle clicked');
        console.log('Current fullscreen element:', document.fullscreenElement);
        console.log('Fullscreen enabled:', document.fullscreenEnabled);

        if (!document.fullscreenElement) {
            // Enter fullscreen
            console.log('Attempting to enter fullscreen...');

            if (document.documentElement.requestFullscreen) {
                console.log('Using standard requestFullscreen');
                document.documentElement.requestFullscreen().then(() => {
                    console.log('Successfully entered fullscreen');
                    // Auto-hide sidebar in fullscreen
                    if (sidebar) {
                        sidebar.style.transform = 'translateX(-100%)';
                    }
                    this.onFullscreenChange(true);
                }).catch(err => {
                    console.error('Failed to enter fullscreen:', err);
                });
            } else if (document.documentElement.webkitRequestFullscreen) {
                console.log('Using webkit requestFullscreen');
                document.documentElement.webkitRequestFullscreen();
                setTimeout(() => {
                    if (sidebar) sidebar.style.transform = 'translateX(-100%)';
                    this.onFullscreenChange(true);
                }, 100);
            } else if (document.documentElement.mozRequestFullScreen) {
                console.log('Using moz requestFullScreen');
                document.documentElement.mozRequestFullScreen();
                setTimeout(() => {
                    if (sidebar) sidebar.style.transform = 'translateX(-100%)';
                    this.onFullscreenChange(true);
                }, 100);
            } else {
                console.warn('Fullscreen API not supported');
                alert('Fullscreen is not supported in this browser');
            }
        } else {
            // Exit fullscreen
            console.log('Attempting to exit fullscreen...');

            if (document.exitFullscreen) {
                document.exitFullscreen().then(() => {
                    console.log('Successfully exited fullscreen');
                    this.onFullscreenChange(false);
                }).catch(err => {
                    console.error('Failed to exit fullscreen:', err);
                });
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
                setTimeout(() => this.onFullscreenChange(false), 100);
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
                setTimeout(() => this.onFullscreenChange(false), 100);
            }
        }
    }

    onFullscreenChange(isFullscreen) {
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const sidebar = document.querySelector('.sidebar');

        if (isFullscreen) {
            // Update button text and hide sidebar
            if (fullscreenBtn) fullscreenBtn.innerHTML = '📱 Exit Fullscreen';
            if (sidebar) sidebar.style.transform = 'translateX(-100%)';

            // Scale canvas to fit screen
            this.scaleCanvasForFullscreen();
        } else {
            // Restore normal view
            if (fullscreenBtn) fullscreenBtn.innerHTML = '📺 Fullscreen';
            if (sidebar) sidebar.style.transform = 'translateX(0)';

            // Restore original canvas size
            this.restoreCanvasSize();
        }
    }

    scaleCanvasForFullscreen() {
        const canvas = this.canvas;
        const overlayCanvas = this.overlayCanvas;
        const videoContainer = document.querySelector('.video-container');

        // Store original styles
        this.originalCanvasStyles = {
            canvas: {
                width: canvas.style.width,
                height: canvas.style.height,
                position: canvas.style.position,
                top: canvas.style.top,
                left: canvas.style.left,
                transform: canvas.style.transform,
                zIndex: canvas.style.zIndex
            },
            overlay: {
                width: overlayCanvas.style.width,
                height: overlayCanvas.style.height,
                position: overlayCanvas.style.position,
                top: overlayCanvas.style.top,
                left: overlayCanvas.style.left,
                transform: overlayCanvas.style.transform,
                zIndex: overlayCanvas.style.zIndex
            },
            container: {
                position: videoContainer?.style.position,
                width: videoContainer?.style.width,
                height: videoContainer?.style.height,
                top: videoContainer?.style.top,
                left: videoContainer?.style.left,
                transform: videoContainer?.style.transform,
                zIndex: videoContainer?.style.zIndex
            }
        };

        // Scale to screen size while maintaining aspect ratio
        const scaleX = window.innerWidth / canvas.width;
        const scaleY = window.innerHeight / canvas.height;
        const scale = Math.min(scaleX, scaleY);

        const scaledWidth = canvas.width * scale;
        const scaledHeight = canvas.height * scale;

        // Position video container for fullscreen
        if (videoContainer) {
            videoContainer.style.position = 'fixed';
            videoContainer.style.top = '50%';
            videoContainer.style.left = '50%';
            videoContainer.style.transform = 'translate(-50%, -50%)';
            videoContainer.style.width = `${scaledWidth}px`;
            videoContainer.style.height = `${scaledHeight}px`;
            videoContainer.style.zIndex = '1000';
        }

        // Scale canvases
        canvas.style.width = `${scaledWidth}px`;
        canvas.style.height = `${scaledHeight}px`;
        overlayCanvas.style.width = `${scaledWidth}px`;
        overlayCanvas.style.height = `${scaledHeight}px`;
    }

    restoreCanvasSize() {
        const canvas = this.canvas;
        const overlayCanvas = this.overlayCanvas;
        const videoContainer = document.querySelector('.video-container');

        // Restore original styles if they were stored
        if (this.originalCanvasStyles) {
            // Restore canvas styles
            Object.assign(canvas.style, this.originalCanvasStyles.canvas);
            Object.assign(overlayCanvas.style, this.originalCanvasStyles.overlay);

            // Restore container styles
            if (videoContainer && this.originalCanvasStyles.container) {
                Object.assign(videoContainer.style, this.originalCanvasStyles.container);
            }

            this.originalCanvasStyles = null;
        } else {
            // Fallback: clear inline styles
            canvas.style.width = '';
            canvas.style.height = '';
            canvas.style.position = '';
            canvas.style.top = '';
            canvas.style.left = '';
            canvas.style.transform = '';
            canvas.style.zIndex = '';

            overlayCanvas.style.width = '';
            overlayCanvas.style.height = '';
            overlayCanvas.style.position = '';
            overlayCanvas.style.top = '';
            overlayCanvas.style.left = '';
            overlayCanvas.style.transform = '';
            overlayCanvas.style.zIndex = '';

            if (videoContainer) {
                videoContainer.style.position = '';
                videoContainer.style.width = '';
                videoContainer.style.height = '';
                videoContainer.style.top = '';
                videoContainer.style.left = '';
                videoContainer.style.transform = '';
                videoContainer.style.zIndex = '';
            }
        }
    }


    toggleSkeletonVisibility(isVisible) {
        // Set skeleton visibility in config
        if (this.textureConfig?.settings) {
            this.textureConfig.settings.showPoseKeypoints = isVisible;
        } else {
            this.skeletonVisible = isVisible;
        }
    }

    togglePixiDebug(isEnabled) {
        if (this.pixiSpriteLayer) {
            this.pixiSpriteLayer.setDebugMode(isEnabled);
            console.log('PixiJS Debug mode:', isEnabled ? 'ON' : 'OFF');
        }
    }

    toggleMeshWireframe(isEnabled) {
        console.log('🔧 toggleMeshWireframe called with:', isEnabled);
        if (this.pixiSpriteLayer) {
            console.log('🔧 Calling setWireframeMode on pixiSpriteLayer');
            this.pixiSpriteLayer.setWireframeMode(isEnabled);
            console.log('Mesh Wireframe mode:', isEnabled ? 'ON' : 'OFF');
        } else {
            console.log('🔴 pixiSpriteLayer not found!');
        }
    }


    stop() {
        if (this.videoLayer) {
            this.videoLayer.stopProcessing();
        }
        if (this.layerManager) {
            this.layerManager.destroy();
        }
    }

    updateDebugDisplay(poseType = null, building = null, nature = null) {
        const debugPose = document.getElementById('debugPose');
        const debugBuilding = document.getElementById('debugBuilding');
        const debugNature = document.getElementById('debugNature');

        if (debugPose && poseType !== null) {
            debugPose.textContent = poseType || 'none';
        }

        if (debugBuilding && building !== null) {
            debugBuilding.textContent = building || 'none';
        }

        if (debugNature && nature !== null) {
            debugNature.textContent = nature || 'none';
        }
    }

    updatePerformanceDisplay() {
        const report = this.renderOptimizer.getPerformanceReport();
        const perfDisplay = document.getElementById('performanceDebug');
        if (perfDisplay) {
            perfDisplay.textContent = `FPS: ${report.fps} | Render: ${report.metrics.renderTime}`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Loading optimized ExperienceApp (all optimizations integrated)');
    window.experienceApp = new ExperienceApp();

    // Add debugging tools to window
    window.debugPerformance = () => {
        if (window.experienceApp.renderOptimizer) {
            console.table(window.experienceApp.renderOptimizer.getPerformanceReport());
        }
    };

    window.debugTextures = () => {
        if (window.experienceApp.textureManager) {
            console.log(window.experienceApp.textureManager.getStats());
            console.log(window.experienceApp.textureManager.estimateMemoryUsage());
        }
    };
});