/**
 * Bird Layer with Flight Animation System
 * Handles animated flying birds in the top third of the screen using PixiJS
 * Features pose-responsive bird flocks and realistic flight patterns
 */

class BirdLayer extends LayerInterface {
    constructor(config = {}) {
        
        super('birds', {
            currentPose: null,
            zIndex: 21, // Render above nature layer
            alwaysRender: false, // Only render on pose changes
            enabled: true,
            ...config
        });

        // PixiJS bird animation system
        this.pixiApp = null;
        this.pixiContainer = null;
        this.debugOverlay = null;
        this.debugEnabled = false;
        this.birds = [];
        this.flocks = new Map(); // Multiple flocks for different bird types
        this.spawnAccumulator = 0;
        this.lastUpdate = performance.now() / 1000;
        this.active = false;
        this.pixiInitializationPromise = null;
        this.updateLoop = null;

        // Bird flight settings
        this.settings = {
            spawnRate: 1.5, // Birds per second
            maxBirds: 8, // Total birds on screen
            pixelHeight: 64,
            flightSpeedMin: 30, // Faster than floating particles
            flightSpeedMax: 60,
            lifetimeMin: 8.0, // How long birds stay on screen
            lifetimeMax: 15.0,
            alphaStart: 1.0,
            alphaEnd: 0.0,
            wingFlapFreq: 8, // Wing animation speed
            region: 'top_third', // Flight zone
            enabled: true
        };

        // Available bird types with different characteristics
        this.birdTypes = {
            arara: {
                texture: 'front-images/arara.png',
                speed: 1.2, // Speed multiplier
                scale: 0.6, // Size multiplier
                wingFlap: 1.0 // Wing flap speed multiplier
            },
            bemtevi: {
                texture: 'front-images/bemtevi.png',
                speed: 1.5,
                scale: 0.6,
                wingFlap: 1.3
            },
            cuckoo: {
                texture: 'front-images/cuckoo.png',
                speed: 1.1,
                scale: 0.6,
                wingFlap: 0.9
            },
            robin: {
                texture: 'front-images/robin.png',
                speed: 0.6,
                scale: 0.7,
                wingFlap: 1.4
            },
            swallow: {
                texture: 'front-images/swallow.png',
                speed: 2.0, // Swallows are fast!
                scale: 0.6,
                wingFlap: 2.0
            },
            swallow2: {
                texture: 'front-images/swallow2.png',
                speed: 1.8,
                scale: 0.6,
                wingFlap: 1.8
            },
            tucano: {
                texture: 'front-images/tucano.png',
                speed: 0.9, // Larger birds fly slower
                scale: 0.6,
                wingFlap: 0.8
            }
        };

        // Pose-to-bird mappings (which birds appear for which poses)
        this.poseBirdMappings = {
            star: ['arara', 'tucano'], // Colorful tropical birds
            arms_out: ['robin', 'bemtevi'], // Common friendly birds
            zigzag: ['swallow', 'swallow2'], // Fast agile birds
            side_arms: ['cuckoo', 'robin'], // Woodland birds
            rounded: ['bemtevi', 'cuckoo'], // Calm birds
            arms_up: ['arara', 'swallow'], // Celebratory birds
            neutral: [] // No birds for neutral pose
        };

        // Loaded textures cache
        this.loadedTextures = new Map();

        // Region boundaries cache
        this.regionBounds = null;

        // Optional base URL for assets (can be provided via config)
        this.assetBaseUrl = this.config.assetBaseUrl || '';
    }

    onInit() {

        this.pixiInitializationPromise = this.initializePixiBirds();
    }

    onResize(width, height) {
        console.log('BirdLayer onResize:', width, 'x', height);

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

            console.log('✓ BirdLayer PixiJS resized to:', width, 'x', height);
        }
    }

    async initializePixiBirds() {
        if (typeof PIXI === 'undefined' || !PIXI.Application) {
            console.error('PixiJS is not available for BirdLayer');
            return;
        }

        try {
            

            this.pixiApp = new PIXI.Application();

            // Get size from the main canvas or use window size as fallback
            const displayWidth = this.canvas?.clientWidth || this.canvas?.width || window.innerWidth;
            const displayHeight = this.canvas?.clientHeight || this.canvas?.height || window.innerHeight;

            

            await this.pixiApp.init({
                width: displayWidth,
                height: displayHeight,
                backgroundColor: 0x000000,
                backgroundAlpha: 0,
                premultipliedAlpha: false,
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true
            });

            this.pixiContainer = new PIXI.Container();
            this.pixiApp.stage.addChild(this.pixiContainer);

            // Debug overlay for visualizing bounds/regions
            this.debugOverlay = new PIXI.Graphics();
            this.pixiApp.stage.addChild(this.debugOverlay);
            this.pixiApp.stage.sortableChildren = true;
            this.debugOverlay.visible = this.debugEnabled;

            // (Removed debug rectangle used for initial verification)

            // Position PixiJS canvas - inherit positioning from pixiContainer
            this.pixiApp.canvas.style.position = 'absolute';
            this.pixiApp.canvas.style.top = '0';
            this.pixiApp.canvas.style.left = '0';
            this.pixiApp.canvas.style.width = '100%';
            this.pixiApp.canvas.style.height = '100%';
            this.pixiApp.canvas.style.pointerEvents = 'none';
            this.pixiApp.canvas.style.zIndex = String(this.config.zIndex || 20);

            // Add to canvas container - same approach as NatureLayer
            const canvasContainer = this.canvas.parentElement;
            if (canvasContainer) {
                canvasContainer.appendChild(this.pixiApp.canvas);
                
            } else {
                console.error('Canvas container not found for BirdLayer');
            }

            this.calculateRegionBounds();
            this.drawDebugBounds();
            
        } catch (error) {
            console.error('Failed to initialize PixiJS for BirdLayer:', error);
        }
    }

    async ensurePixiReady() {
        if (this.pixiInitializationPromise) {
            await this.pixiInitializationPromise;
        }
    }

    calculateRegionBounds() {
        if (!this.pixiApp) return;

        // Use Pixi screen (logical coordinate space) for region dimensions
        const w = this.pixiApp.screen?.width || this.pixiApp.renderer.width;
        const h = this.pixiApp.screen?.height || this.pixiApp.renderer.height;

        // Top third of screen for bird flight
        this.regionBounds = {
            x: 0,
            y: 0,
            width: w,
            height: Math.floor(h * 0.33)
        };

        
    }

    drawDebugBounds() {
        if (!this.pixiApp || !this.debugOverlay) return;
        this.debugOverlay.visible = !!this.debugEnabled;
        if (!this.debugEnabled) {
            this.debugOverlay.clear();
            return;
        }
        const w = this.pixiApp.screen?.width || this.pixiApp.renderer.width;
        const h = this.pixiApp.screen?.height || this.pixiApp.renderer.height;
        const r = this.regionBounds || { x: 0, y: 0, width: w, height: h };

        const g = this.debugOverlay;
        g.clear();

        // Full canvas faint fill and outline
        g.rect(0, 0, w, h).fill({ color: 0x0088ff, alpha: 0.04 });
        g.rect(0, 0, w, h).stroke({ color: 0x00ffff, width: 2 });

        // Region (top third) outline
        g.rect(r.x, r.y, r.width, r.height).stroke({ color: 0xff00ff, width: 2 });

        // Center crosshair
        g.moveTo(w / 2 - 10, h / 2).lineTo(w / 2 + 10, h / 2).stroke({ color: 0x00ff00, width: 1 });
        g.moveTo(w / 2, h / 2 - 10).lineTo(w / 2, h / 2 + 10).stroke({ color: 0x00ff00, width: 1 });
    }

    setDebugEnabled(enabled) {
        this.debugEnabled = !!enabled;
        this.drawDebugBounds();
    }

    async loadBirdTexture(birdType) {
        if (this.loadedTextures.has(birdType)) {
            return this.loadedTextures.get(birdType);
        }

        try {
            const texturePath = this.birdTypes[birdType].texture;
            const primaryUrl = this.assetBaseUrl ? `${this.assetBaseUrl}${texturePath}` : texturePath;
            const altUrl = primaryUrl.startsWith('./') || primaryUrl.startsWith('/') ? primaryUrl : `./${primaryUrl}`;

            let texture = null;

            // Try via PIXI.Assets first (primary URL)
            if (PIXI.Assets) {
                try {
                    texture = await PIXI.Assets.load(primaryUrl);
                } catch (errPrimary) {
            
                    try {
                        texture = await PIXI.Assets.load(altUrl);
                    } catch (errAlt) {
                        
                    }
                }
            }

            // Fallback: manual image preload then create texture
            if (!texture) {
                const finalUrl = primaryUrl;
                texture = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        try {
                            const tex = PIXI.Texture.from(img);
                            resolve(tex);
                        } catch (e) {
                            reject(e);
                        }
                    };
                    img.onerror = (e) => reject(new Error(`Image failed to load: ${finalUrl}`));
                    img.src = finalUrl;
                });
            }

            if (texture) {
                this.loadedTextures.set(birdType, texture);
                
                return texture;
            } else {
                console.error(`Failed to create texture for bird type: ${birdType}`);
                return null;
            }
        } catch (error) {
            console.error(`Failed to load bird texture: ${birdType}`, error);
            return null;
        }
    }

    async setPose(pose) {
        
        if (!pose || pose === this.currentPose) return;

        await this.ensurePixiReady();

        const birdsForPose = this.poseBirdMappings[pose] || [];
        

        if (birdsForPose.length === 0 || !this.settings.enabled) {
            this.stop();
            
            return;
        }

        // Load textures for these bird types
        for (const birdType of birdsForPose) {
            await this.loadBirdTexture(birdType);
        }

        this.currentPose = pose;
        this.config.currentPose = pose;
        this.activeBirdTypes = [...birdsForPose];

        // Reset and start
        this.clearAllBirds();
        this.start();
        
    }

    start(activeBirdTypes) {
        const types = activeBirdTypes ?? this.activeBirdTypes ?? [];
        if (!this.pixiApp || types.length === 0) {
            console.warn('Cannot start birds: PixiJS not ready or no bird types specified');
            return;
        }

        this.active = true;
        this.activeBirdTypes = types;
        this.lastUpdate = performance.now() / 1000;
        this.startUpdateLoop();
        
    }

    stop() {
        this.active = false;
        this.clearAllBirds();
        if (this.updateLoop) {
            cancelAnimationFrame(this.updateLoop);
            this.updateLoop = null;
        }
        
    }

    startUpdateLoop() {
        if (this.updateLoop) return;

        const update = () => {
            if (this.active) {
                this.updateBirds();
                this.updateLoop = requestAnimationFrame(update);
            } else {
                this.updateLoop = null;
            }
        };

        this.updateLoop = requestAnimationFrame(update);
    }

    updateBirds() {
        if (!this.active || !this.regionBounds || !this.activeBirdTypes?.length) return;

        const now = performance.now() / 1000;
        const dt = Math.min(now - this.lastUpdate, 0.05);
        this.lastUpdate = now;

        // Spawn new birds
        this.spawnAccumulator += dt * this.settings.spawnRate;
        while (this.spawnAccumulator >= 1 && this.birds.length < this.settings.maxBirds) {
            this.spawnBird();
            this.spawnAccumulator -= 1;
        }

        // Update existing birds
        this.updateExistingBirds(dt);
    }

    spawnBird() {
        if (!this.activeBirdTypes?.length) {
            
            return;
        }

        // Randomly select bird type from active types
        const birdType = this.activeBirdTypes[Math.floor(Math.random() * this.activeBirdTypes.length)];
        const texture = this.loadedTextures.get(birdType);

        if (!texture) {
            console.log(`🔍 No texture loaded for bird type: ${birdType}`);
            return;
        }

        
        const birdConfig = this.birdTypes[birdType];
        const sprite = new PIXI.Sprite(texture);

        sprite.anchor.set(0.5);
        sprite.alpha = this.settings.alphaStart;

        // Set blend mode (guard for environments where BLEND_MODES may be undefined)
        if (PIXI && PIXI.BLEND_MODES && typeof PIXI.BLEND_MODES.NORMAL !== 'undefined') {
            sprite.blendMode = PIXI.BLEND_MODES.NORMAL;
        }

        // Compute scale from desired on-screen height and texture's natural height
        const naturalHeight = sprite.texture?.orig?.height || sprite.texture?.height || sprite.height;
        const baseHeight = Math.max(1, naturalHeight);
        let scale = (this.settings.pixelHeight / baseHeight) * (birdConfig.scale || 1);
        sprite.scale.set(scale);

        // Set initial position (enter from left or right)
        this.setInitialBirdPosition(sprite);

        // Create bird data
        sprite.__birdData = this.createBirdData(sprite, birdType, birdConfig);

        this.pixiContainer.addChild(sprite);
        this.birds.push(sprite);

        
    }

    setInitialBirdPosition(sprite) {
        // Enter from left or right within the flight region, slightly offscreen but within a small margin
        const offscreenMargin = Math.min(Math.max(sprite.width * 0.5, 20), 80);
        if (Math.random() < 0.5) {
            sprite.x = this.regionBounds.x - offscreenMargin;
            sprite.scale.x = Math.abs(sprite.scale.x); // Face right
        } else {
            sprite.x = this.regionBounds.x + this.regionBounds.width + offscreenMargin;
            sprite.scale.x = -Math.abs(sprite.scale.x); // Face left
        }
        sprite.y = this.regionBounds.y + Math.random() * this.regionBounds.height;
    }

    createBirdData(sprite, birdType, birdConfig) {
        const data = {
            type: birdType,
            age: 0,
            life: Utils.lerp(this.settings.lifetimeMin, this.settings.lifetimeMax, Math.random()),
            wingPhase: Math.random() * Math.PI * 2,
            wingFlapSpeed: this.settings.wingFlapFreq * birdConfig.wingFlap,

            // Flight direction and speed
            direction: sprite.scale.x > 0 ? 1 : -1, // 1 = right, -1 = left
            speed: Utils.lerp(this.settings.flightSpeedMin, this.settings.flightSpeedMax, Math.random()) * birdConfig.speed,

            // Vertical movement for natural flight
            verticalPhase: Math.random() * Math.PI * 2,
            verticalAmplitude: 20 + Math.random() * 30,
            verticalFreq: 0.5 + Math.random() * 0.5,

            baseY: sprite.y
        };

        return data;
    }

    updateExistingBirds(dt) {
        const bounds = this.regionBounds;

        for (let i = this.birds.length - 1; i >= 0; i--) {
            const sprite = this.birds[i];
            const data = sprite.__birdData;

            data.age += dt;

            // Update bird movement
            this.updateBirdPosition(sprite, data, dt);

            // Update wing flapping animation
            this.updateWingFlapping(sprite, data, dt);

            // Update alpha (fade out at end of life)
            const t = Math.min(data.age / data.life, 1);
            sprite.alpha = Utils.lerp(this.settings.alphaStart, this.settings.alphaEnd, t);

            // Remove birds that are out of bounds or expired
            if (data.age >= data.life || this.isBirdOutOfBounds(sprite)) {
                this.pixiContainer.removeChild(sprite);
                this.birds.splice(i, 1);
            }
        }
    }

    updateBirdPosition(sprite, data, dt) {
        // Horizontal flight
        sprite.x += data.direction * data.speed * dt;

        // Vertical bobbing for natural flight
        data.verticalPhase += data.verticalFreq * dt;
        sprite.y = data.baseY + Math.sin(data.verticalPhase) * data.verticalAmplitude;
    }

    updateWingFlapping(sprite, data, dt) {
        // Wing flapping creates subtle scale animation
        data.wingPhase += data.wingFlapSpeed * dt;
        const wingFlap = 1 + Math.sin(data.wingPhase) * 0.1;

        // Maintain direction while applying wing animation
        const direction = sprite.scale.x > 0 ? 1 : -1;
        sprite.scale.x = Math.abs(sprite.scale.x) * wingFlap * direction;
    }

    isBirdOutOfBounds(sprite) {
        const bounds = this.regionBounds;
        const sizeMargin = Math.max(sprite.width, sprite.height) * 0.6 + 20; // proportional margin
        const leftLimit = bounds.x - sizeMargin;
        const rightLimit = bounds.x + bounds.width + sizeMargin;
        return sprite.x < leftLimit || sprite.x > rightLimit;
    }

    clearAllBirds() {
        this.birds.forEach(sprite => {
            if (sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
        });
        this.birds = [];
        this.spawnAccumulator = 0;
    }

    // LayerInterface methods
    async onRender(inputData, timestamp) {
        // Birds are handled by the update loop, not frame-based rendering
        return true;
    }

    shouldRender(inputData, timestamp) {
        return false; // Birds handle their own rendering
    }

    setEnabled(enabled) {
        super.setEnabled(enabled);
        this.settings.enabled = enabled;

        const pixiReady = this.pixiApp && this.pixiApp.renderer;

        if (!enabled) {
            this.stop();
            if (pixiReady && this.pixiApp.canvas) {
                this.pixiApp.canvas.style.display = 'none';
            }
        } else {
            if (pixiReady && this.pixiApp.canvas) {
                this.pixiApp.canvas.style.display = 'block';
            } else if (this.pixiInitializationPromise) {
                // Defer canvas style change until Pixi is initialized
                this.pixiInitializationPromise.then(() => {
                    if (this.pixiApp && this.pixiApp.canvas) {
                        this.pixiApp.canvas.style.display = 'block';
                    }
                });
            }
            // Restart birds if we have a current pose
            if (this.config.currentPose) {
                this.setPose(this.config.currentPose);
            }
        }
    }

    

    destroy() {
        super.destroy();
        this.stop();

        if (this.pixiApp) {
            this.pixiApp.destroy(true);
            this.pixiApp = null;
        }

        this.birds = [];
        this.loadedTextures.clear();
        this.pixiContainer = null;
        this.regionBounds = null;
        this.flocks.clear();
    }
}