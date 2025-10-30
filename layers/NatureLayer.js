/**
 * Nature Layer with Integrated Particle System
 * Handles animated nature particles (water lilies, birds, etc.) using PixiJS
 */
class NatureLayer extends LayerInterface {
    constructor(config = {}) {
        super('nature', {
            currentOverlay: null,
            zIndex: 20, // Above building sprites
            alwaysRender: false, // Only render when overlay changes
            ...config
        });

        // PixiJS particle system
        this.pixiApp = null;
        this.pixiContainer = null;
        this.particles = [];
        this.spawnAccumulator = 0;
        this.lastUpdate = performance.now() / 1000;
        this.active = false;
        this.texture = null;
        this.textureLoaded = false;
        this.pixiInitializationPromise = null;
        this.updateLoop = null;

        // Particle settings (will be updated from config)
        this.settings = {
            spawnRate: 4,
            maxParticles: 25,
            baseScale: 0.125,
            scaleJitter: 0.35,
            speedMin: 2,
            speedMax: 8,
            sineAmp: 6,
            sineFreq: 1.1,
            lifetimeMin: 6.0,
            lifetimeMax: 10.0,
            alphaStart: 1.0,
            alphaEnd: 0.0,
            blendMode: 'normal',
            region: 'bottom_third',
            animationType: 'floating'
        };

        // Region boundaries cache
        this.regionBounds = null;
    }

    onInit() {
        console.log('NatureLayer initialized (with integrated particles)');
        this.pixiInitializationPromise = this.initializePixiParticles();
    }

    async initializePixiParticles() {
        if (typeof PIXI === 'undefined' || !PIXI.Application) {
            console.error('PixiJS is not available for NatureLayer particles');
            return;
        }

        try {
            console.log('Initializing PixiJS for NatureLayer particles...');

            this.pixiApp = new PIXI.Application();

            const displayWidth = this.canvas.clientWidth || this.canvas.width;
            const displayHeight = this.canvas.clientHeight || this.canvas.height;

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

            // Position PixiJS canvas
            this.pixiApp.canvas.style.position = 'absolute';
            this.pixiApp.canvas.style.top = '0';
            this.pixiApp.canvas.style.left = '0';
            this.pixiApp.canvas.style.width = '100%';
            this.pixiApp.canvas.style.height = '100%';
            this.pixiApp.canvas.style.pointerEvents = 'none';
            this.pixiApp.canvas.style.zIndex = String(this.config.zIndex || 20);

            // Add to canvas container
            const canvasContainer = this.canvas.parentElement;
            if (canvasContainer) {
                canvasContainer.appendChild(this.pixiApp.canvas);
                console.log('✓ NatureLayer PixiJS canvas added to container');
            } else {
                console.error('Canvas container not found for NatureLayer');
            }

            this.calculateRegionBounds();
            console.log('✓ NatureLayer PixiJS initialized successfully');
        } catch (error) {
            console.error('Failed to initialize PixiJS for NatureLayer:', error);
        }
    }

    async ensurePixiReady() {
        if (this.pixiInitializationPromise) {
            await this.pixiInitializationPromise;
        }
    }

    calculateRegionBounds() {
        if (!this.pixiApp) return;

        const w = this.pixiApp.renderer.width;
        const h = this.pixiApp.renderer.height;

        switch (this.settings.region) {
            case 'bottom_third':
                const yTop = Math.floor(h * 0.67);
                this.regionBounds = { x: 0, y: yTop, width: w, height: h - yTop };
                break;
            case 'top_half':
                this.regionBounds = { x: 0, y: 0, width: w, height: Math.floor(h * 0.5) };
                break;
            case 'full_screen':
            default:
                this.regionBounds = { x: 0, y: 0, width: w, height: h };
                break;
        }
    }

    async loadTexture(texturePath) {
        try {
            if (PIXI.Assets) {
                this.texture = await PIXI.Assets.load(texturePath);
            } else {
                this.texture = PIXI.Texture.from(texturePath);
            }
            this.textureLoaded = true;
            console.log(`✓ Loaded particle texture: ${texturePath}`);
        } catch (error) {
            console.error(`Failed to load particle texture: ${texturePath}`, error);
            this.textureLoaded = false;
        }
    }

    async setOverlay(overlay) {
        console.log('NatureLayer.setOverlay called with:', overlay);
        this.config.currentOverlay = overlay;

        await this.ensurePixiReady();

        // Stop current particles
        this.stop();

        if (overlay && overlay.particles && overlay.particles.enabled) {
            // Update settings from overlay config
            Object.assign(this.settings, overlay.particles);
            this.applyAnimationTypeDefaults();
            this.calculateRegionBounds();

            // Load texture and start particles
            await this.loadTexture(overlay.particles.texture);
            this.start();
        }
    }

    applyAnimationTypeDefaults() {
        switch (this.settings.animationType) {
            case 'floating':
                this.settings.speedMin = 2;
                this.settings.speedMax = 8;
                this.settings.sineAmp = 6;
                this.settings.region = 'bottom_third';
                break;
            case 'flying':
                this.settings.speedMin = 15;
                this.settings.speedMax = 30;
                this.settings.sineAmp = 12;
                this.settings.region = 'full_screen';
                this.settings.lifetimeMin = 8.0;
                this.settings.lifetimeMax = 15.0;
                break;
            case 'falling':
                this.settings.speedMin = 5;
                this.settings.speedMax = 15;
                this.settings.sineAmp = 8;
                this.settings.region = 'full_screen';
                this.settings.gravitySpeed = 20;
                break;
            case 'rising':
                this.settings.speedMin = 1;
                this.settings.speedMax = 5;
                this.settings.sineAmp = 4;
                this.settings.region = 'bottom_third';
                this.settings.riseSpeed = 15;
                break;
        }
    }

    start() {
        if (!this.textureLoaded || !this.pixiApp) {
            console.warn('Cannot start particles: texture not loaded or PixiJS not ready');
            return;
        }

        this.active = true;
        this.lastUpdate = performance.now() / 1000;
        this.startUpdateLoop();
        console.log(`✓ Started particles: ${this.settings.animationType}`);
    }

    stop() {
        this.active = false;
        this.clearAllParticles();
        if (this.updateLoop) {
            cancelAnimationFrame(this.updateLoop);
            this.updateLoop = null;
        }
    }

    startUpdateLoop() {
        if (this.updateLoop) return;

        const update = () => {
            if (this.active) {
                this.updateParticles();
                this.updateLoop = requestAnimationFrame(update);
            } else {
                this.updateLoop = null;
            }
        };

        this.updateLoop = requestAnimationFrame(update);
    }

    updateParticles() {
        if (!this.active || !this.textureLoaded || !this.regionBounds) return;

        const now = performance.now() / 1000;
        const dt = Math.min(now - this.lastUpdate, 0.05);
        this.lastUpdate = now;

        // Spawn new particles
        this.spawnAccumulator += dt * this.settings.spawnRate;
        while (this.spawnAccumulator >= 1 && this.particles.length < this.settings.maxParticles) {
            this.spawnParticle();
            this.spawnAccumulator -= 1;
        }

        // Update existing particles
        this.updateExistingParticles(dt);
    }

    spawnParticle() {
        if (!this.texture) return;

        const sprite = new PIXI.Sprite(this.texture);
        sprite.anchor.set(0.5);
        sprite.alpha = this.settings.alphaStart;

        // Set blend mode
        if (typeof this.settings.blendMode === 'number') {
            sprite.blendMode = this.settings.blendMode;
        } else if (PIXI.BLEND_MODES) {
            sprite.blendMode = PIXI.BLEND_MODES.NORMAL;
        }

        // Random scale
        const scale = this.settings.baseScale * (1 + this.settings.scaleJitter * (Math.random() * 2 - 1));
        sprite.scale.set(scale);

        // Set initial position based on animation type
        this.setInitialPosition(sprite);

        // Create particle data
        sprite.__particleData = this.createParticleData(sprite);

        this.pixiContainer.addChild(sprite);
        this.particles.push(sprite);
    }

    setInitialPosition(sprite) {
        const bounds = this.regionBounds;

        switch (this.settings.animationType) {
            case 'floating':
                sprite.x = Math.random() * bounds.width + bounds.x;
                sprite.y = bounds.y + Math.random() * bounds.height;
                break;
            case 'flying':
                if (Math.random() < 0.5) {
                    sprite.x = -sprite.width;
                } else {
                    sprite.x = bounds.width + sprite.width;
                }
                sprite.y = bounds.y + Math.random() * bounds.height;
                break;
            case 'falling':
                sprite.x = Math.random() * bounds.width + bounds.x;
                sprite.y = bounds.y - sprite.height;
                break;
            case 'rising':
                sprite.x = Math.random() * bounds.width + bounds.x;
                sprite.y = bounds.y + bounds.height + sprite.height;
                break;
        }
    }

    createParticleData(sprite) {
        const data = {
            age: 0,
            life: Utils.lerp(this.settings.lifetimeMin, this.settings.lifetimeMax, Math.random()),
            phase: Math.random() * Math.PI * 2,
            sineAmp: this.settings.sineAmp * (0.7 + Math.random() * 0.6),
            sineFreq: this.settings.sineFreq * (0.8 + Math.random() * 0.4),
            baseY: sprite.y
        };

        switch (this.settings.animationType) {
            case 'floating':
                const dir = Math.random() < 0.5 ? -1 : 1;
                data.speed = Utils.lerp(this.settings.speedMin, this.settings.speedMax, Math.random()) * dir;
                break;
            case 'flying':
                data.speed = Utils.lerp(this.settings.speedMin, this.settings.speedMax, Math.random());
                if (sprite.x < 0) data.speed = Math.abs(data.speed);
                else data.speed = -Math.abs(data.speed);
                data.verticalSpeed = (Math.random() - 0.5) * 10;
                break;
            case 'falling':
                data.speed = (Math.random() - 0.5) * this.settings.speedMax;
                data.gravitySpeed = this.settings.gravitySpeed || 20;
                data.rotation = (Math.random() - 0.5) * 0.02;
                break;
            case 'rising':
                data.speed = (Math.random() - 0.5) * this.settings.speedMax;
                data.riseSpeed = this.settings.riseSpeed || 15;
                break;
        }

        return data;
    }

    updateExistingParticles(dt) {
        const bounds = this.regionBounds;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const sprite = this.particles[i];
            const data = sprite.__particleData;

            data.age += dt;

            // Update position based on animation type
            this.updateParticlePosition(sprite, data, dt);

            // Update alpha (lifetime fade)
            const t = Math.min(data.age / data.life, 1);
            sprite.alpha = Utils.lerp(this.settings.alphaStart, this.settings.alphaEnd, t);

            // Remove expired particles
            if (data.age >= data.life || this.isParticleOutOfBounds(sprite)) {
                this.pixiContainer.removeChild(sprite);
                this.particles.splice(i, 1);
            }
        }
    }

    updateParticlePosition(sprite, data, dt) {
        switch (this.settings.animationType) {
            case 'floating':
                sprite.x += data.speed * dt;
                if (sprite.x < -sprite.width) sprite.x = this.regionBounds.width + sprite.width * 0.5;
                if (sprite.x > this.regionBounds.width + sprite.width) sprite.x = -sprite.width * 0.5;
                data.phase += data.sineFreq * dt;
                sprite.y = data.baseY + Math.sin(data.phase) * data.sineAmp;
                break;
            case 'flying':
                sprite.x += data.speed * dt;
                sprite.y += data.verticalSpeed * dt;
                data.phase += 8 * dt;
                const wingFlap = 1 + Math.sin(data.phase) * 0.1;
                sprite.scale.x = Math.abs(sprite.scale.x) * wingFlap;
                break;
            case 'falling':
                sprite.x += data.speed * dt;
                sprite.y += data.gravitySpeed * dt;
                sprite.rotation += data.rotation * dt;
                data.phase += data.sineFreq * dt;
                sprite.x += Math.sin(data.phase) * data.sineAmp * 0.3 * dt;
                break;
            case 'rising':
                sprite.x += data.speed * dt;
                sprite.y -= data.riseSpeed * dt;
                data.phase += data.sineFreq * dt;
                sprite.x += Math.sin(data.phase) * data.sineAmp * 0.5 * dt;
                break;
        }
    }

    isParticleOutOfBounds(sprite) {
        const margin = Math.max(sprite.width, sprite.height);
        const bounds = this.regionBounds;

        switch (this.settings.animationType) {
            case 'floating':
                return false; // Wrapping prevents out of bounds
            case 'flying':
                return sprite.x < -margin * 2 || sprite.x > bounds.width + margin * 2;
            case 'falling':
                return sprite.y > bounds.y + bounds.height + margin;
            case 'rising':
                return sprite.y < bounds.y - margin;
            default:
                return false;
        }
    }

    clearAllParticles() {
        this.particles.forEach(sprite => {
            if (sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
        });
        this.particles = [];
        this.spawnAccumulator = 0;
    }

    // lerp moved to Utils module

    // LayerInterface interface methods
    async onRender(inputData, timestamp) {
        // Particles are handled by the update loop, not frame-based rendering
        return true;
    }

    shouldRender(inputData, timestamp) {
        return false; // Particles handle their own rendering
    }

    setEnabled(enabled) {
        super.setEnabled(enabled);

        if (!enabled) {
            this.stop();
            if (this.pixiApp && this.pixiApp.canvas) {
                this.pixiApp.canvas.style.display = 'none';
            }
        } else {
            if (this.pixiApp && this.pixiApp.canvas) {
                this.pixiApp.canvas.style.display = 'block';
            }
            if (this.config.currentOverlay && this.config.currentOverlay.particles && this.config.currentOverlay.particles.enabled) {
                this.setOverlay(this.config.currentOverlay);
            }
        }
    }

    onResize(width, height) {
        if (this.pixiApp) {
            const displayWidth = this.canvas.clientWidth || width;
            const displayHeight = this.canvas.clientHeight || height;
            this.pixiApp.renderer.resize(displayWidth, displayHeight);
            this.calculateRegionBounds();
        }
    }

    destroy() {
        super.destroy();
        this.stop();

        if (this.pixiApp) {
            this.pixiApp.destroy(true);
            this.pixiApp = null;
        }

        this.particles = [];
        this.texture = null;
        this.pixiContainer = null;
        this.regionBounds = null;
    }
}