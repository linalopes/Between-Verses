/**
 * TextureManager Module
 * Efficient texture loading, caching, and management
 */
class TextureManager {
    constructor(config = {}) {
        this.config = {
            maxCacheSize: config.maxCacheSize || 50,
            preloadTimeout: config.preloadTimeout || 5000,
            retryAttempts: config.retryAttempts || 3,
            ...config
        };

        this.cache = new Map();
        this.loadingQueue = new Map();
        this.failedLoads = new Set();
        this.stats = {
            hits: 0,
            misses: 0,
            loads: 0,
            failures: 0
        };
    }

    /**
     * Preload multiple textures
     */
    async preloadTextures(texturePaths) {
        const promises = texturePaths.map(path => this.loadTexture(path));
        const results = await Promise.allSettled(promises);

        const loaded = results.filter(r => r.status === 'fulfilled').length;
        console.log(`Preloaded ${loaded}/${texturePaths.length} textures`);

        return {
            total: texturePaths.length,
            loaded,
            failed: texturePaths.length - loaded
        };
    }

    /**
     * Load a single texture with caching
     */
    async loadTexture(path, forceReload = false) {
        // Check cache first
        if (!forceReload && this.cache.has(path)) {
            this.stats.hits++;
            return this.cache.get(path);
        }

        // Check if already loading
        if (this.loadingQueue.has(path)) {
            return this.loadingQueue.get(path);
        }

        // Check if previously failed
        if (this.failedLoads.has(path) && !forceReload) {
            throw new Error(`Texture previously failed to load: ${path}`);
        }

        this.stats.misses++;

        // Create loading promise
        const loadPromise = this.loadTextureInternal(path);
        this.loadingQueue.set(path, loadPromise);

        try {
            const texture = await loadPromise;
            this.cache.set(path, texture);
            this.enforceMaxCacheSize();
            this.stats.loads++;
            return texture;
        } catch (error) {
            this.failedLoads.add(path);
            this.stats.failures++;
            throw error;
        } finally {
            this.loadingQueue.delete(path);
        }
    }

    /**
     * Internal texture loading with retry logic
     */
    async loadTextureInternal(path) {
        let lastError;

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                const texture = await this.loadImage(path);
                return texture;
            } catch (error) {
                lastError = error;
                console.warn(`Failed to load ${path} (attempt ${attempt}/${this.config.retryAttempts})`);

                if (attempt < this.config.retryAttempts) {
                    await this.delay(100 * attempt); // Exponential backoff
                }
            }
        }

        throw lastError;
    }

    /**
     * Load an image with timeout
     */
    loadImage(path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            const timeout = setTimeout(() => {
                reject(new Error(`Texture load timeout: ${path}`));
            }, this.config.preloadTimeout);

            img.onload = () => {
                clearTimeout(timeout);
                resolve(img);
            };

            img.onerror = (e) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to load texture: ${path}`));
            };

            img.src = path;
        });
    }

    /**
     * Get texture from cache
     */
    getTexture(path) {
        if (this.cache.has(path)) {
            this.stats.hits++;
            return this.cache.get(path);
        }

        this.stats.misses++;
        return null;
    }

    /**
     * Check if texture is cached
     */
    hasTexture(path) {
        return this.cache.has(path);
    }

    /**
     * Create texture from canvas
     */
    createFromCanvas(key, canvas) {
        const texture = {
            type: 'canvas',
            width: canvas.width,
            height: canvas.height,
            data: canvas
        };

        this.cache.set(key, texture);
        this.enforceMaxCacheSize();

        return texture;
    }

    /**
     * Create pattern texture
     */
    createPattern(ctx, texturePath, repetition = 'repeat') {
        const texture = this.getTexture(texturePath);
        if (!texture) return null;

        return ctx.createPattern(texture, repetition);
    }

    /**
     * Clear specific texture from cache
     */
    clearTexture(path) {
        return this.cache.delete(path);
    }

    /**
     * Clear all cached textures
     */
    clearAll() {
        this.cache.clear();
        this.loadingQueue.clear();
        this.failedLoads.clear();
        this.resetStats();
    }

    /**
     * Enforce maximum cache size
     */
    enforceMaxCacheSize() {
        if (this.cache.size > this.config.maxCacheSize) {
            const toRemove = this.cache.size - this.config.maxCacheSize;
            const keys = Array.from(this.cache.keys());

            for (let i = 0; i < toRemove; i++) {
                this.cache.delete(keys[i]);
            }
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            loads: 0,
            failures: 0
        };
    }

    /**
     * Utility: delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get all cached texture paths
     */
    getCachedPaths() {
        return Array.from(this.cache.keys());
    }

    /**
     * Estimate memory usage
     */
    estimateMemoryUsage() {
        let totalBytes = 0;

        for (const [path, texture] of this.cache) {
            if (texture instanceof HTMLImageElement) {
                // Estimate: 4 bytes per pixel (RGBA)
                totalBytes += texture.width * texture.height * 4;
            } else if (texture.data instanceof HTMLCanvasElement) {
                totalBytes += texture.width * texture.height * 4;
            }
        }

        return {
            bytes: totalBytes,
            megabytes: (totalBytes / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Prune least recently used textures
     */
    pruneLRU(keepCount) {
        if (this.cache.size <= keepCount) return;

        const keys = Array.from(this.cache.keys());
        const toRemove = keys.slice(0, this.cache.size - keepCount);

        for (const key of toRemove) {
            this.cache.delete(key);
        }

        console.log(`Pruned ${toRemove.length} textures from cache`);
    }
}