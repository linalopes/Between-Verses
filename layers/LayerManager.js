/**
 * Layer Manager (Optimized)
 * Coordinates rendering between all visual layers with resource pooling and batch operations
 */
class LayerManager {
    constructor(mainCanvas, overlayCanvas) {
        this.mainCanvas = mainCanvas;
        this.mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });

        this.overlayCanvas = overlayCanvas;
        this.overlayCtx = overlayCanvas.getContext('2d');

        this.layers = new Map();
        this.renderOrder = [];
        this.lastRender = 0;

        // Resource pooling for better performance
        this.resourcePool = {
            canvases: [],
            contexts: [],
            maxPoolSize: 5
        };

        // Batch rendering optimization
        this.renderQueue = [];
        this.batchRenderTimeout = null;
    }

    /**
     * Add a layer to the manager
     */
    addLayer(layer) {
        if (!layer || !layer.name) {
            throw new Error('Layer must have a name');
        }

        this.layers.set(layer.name, layer);
        this.updateRenderOrder();

        // Initialize layer with appropriate canvas
        if (layer.name === 'overlay' || layer.name === 'nature') {
            layer.init(this.overlayCanvas, this.overlayCtx);
        } else {
            layer.init(this.mainCanvas, this.mainCtx);
        }

        console.log(`Added layer: ${layer.name} (z-index: ${layer.config.zIndex})`);
    }

    /**
     * Remove a layer from the manager
     */
    removeLayer(layerName) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.destroy();
            this.layers.delete(layerName);
            this.updateRenderOrder();
            console.log(`Removed layer: ${layerName}`);
        }
    }

    /**
     * Get a layer by name
     */
    getLayer(layerName) {
        return this.layers.get(layerName);
    }

    /**
     * Update the rendering order based on z-index
     */
    updateRenderOrder() {
        this.renderOrder = Array.from(this.layers.values())
            .sort((a, b) => a.config.zIndex - b.config.zIndex);
    }

    /**
     * Main render method - orchestrates all layer rendering with batching
     */
    async render(inputData, timestamp = Date.now()) {
        try {
            // Prepare input data for layers
            const layerInputData = this.prepareInputData(inputData);

            // Queue render operations for batching
            this.queueRenderOperations(layerInputData, timestamp);

            // Execute batch render
            await this.executeBatchRender();

            this.lastRender = timestamp;
        } catch (error) {
            console.error('LayerManager render error:', error);
        }
    }

    /**
     * Queue render operations for batch processing
     */
    queueRenderOperations(layerInputData, timestamp) {
        this.renderQueue = [];

        for (const layer of this.renderOrder) {
            if (layer.config.enabled) {
                this.renderQueue.push({ layer, inputData: layerInputData, timestamp });
            }
        }
    }

    /**
     * Execute batch render operations
     */
    async executeBatchRender() {
        const renderPromises = this.renderQueue.map(async ({ layer, inputData, timestamp }) => {
            try {
                return await layer.render(inputData, timestamp);
            } catch (error) {
                console.error(`Error rendering ${layer.name} layer:`, error);
                return false;
            }
        });

        await Promise.all(renderPromises);
        this.renderQueue = [];
    }

    /**
     * Get a pooled canvas resource
     */
    getPooledCanvas(width, height) {
        let canvas = this.resourcePool.canvases.pop();

        if (!canvas) {
            canvas = document.createElement('canvas');
        }

        canvas.width = width;
        canvas.height = height;

        return {
            canvas,
            ctx: canvas.getContext('2d'),
            release: () => this.returnToPool(canvas)
        };
    }

    /**
     * Return canvas to resource pool
     */
    returnToPool(canvas) {
        if (this.resourcePool.canvases.length < this.resourcePool.maxPoolSize) {
            // Clear canvas for reuse
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.resourcePool.canvases.push(canvas);
        }
    }

    /**
     * Prepare input data for layer consumption
     */
    prepareInputData(rawInputData) {
        // Add any common processing or data transformation here
        return {
            ...rawInputData,
            canvasWidth: this.mainCanvas.width,
            canvasHeight: this.mainCanvas.height,
            timestamp: Date.now()
        };
    }


    /**
     * Enable/disable a layer
     */
    setLayerEnabled(layerName, enabled) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.setEnabled(enabled);
            console.log(`${enabled ? 'Enabled' : 'Disabled'} layer: ${layerName}`);
        }
    }

    /**
     * Set layer opacity
     */
    setLayerOpacity(layerName, opacity) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.setOpacity(opacity);
        }
    }

    /**
     * Set layer blend mode
     */
    setLayerBlendMode(layerName, blendMode) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.setBlendMode(blendMode);
        }
    }

    /**
     * Clear all layers
     */
    clear() {
        this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    /**
     * Invalidate all layers (force re-render)
     */
    invalidateAll() {
        for (const layer of this.layers.values()) {
            layer.invalidate();
        }
    }

    /**
     * Invalidate specific layer
     */
    invalidateLayer(layerName) {
        const layer = this.layers.get(layerName);
        if (layer) {
            layer.invalidate();
        }
    }

    /**
     * Get basic layer information
     */
    getStats() {
        return {
            layerCount: this.layers.size,
            enabledLayers: Array.from(this.layers.values()).filter(l => l.config.enabled).length
        };
    }

    /**
     * Get layer configuration
     */
    getLayerConfigs() {
        const configs = {};
        for (const [name, layer] of this.layers.entries()) {
            configs[name] = { ...layer.config };
        }
        return configs;
    }

    /**
     * Batch update multiple layer configurations
     */
    updateLayerConfigs(configs) {
        for (const [layerName, config] of Object.entries(configs)) {
            const layer = this.layers.get(layerName);
            if (layer) {
                layer.updateConfig(config);
            }
        }
        this.updateRenderOrder();
    }

    /**
     * Destroy all layers and clean up resources
     */
    destroy() {
        for (const layer of this.layers.values()) {
            layer.destroy();
        }

        this.layers.clear();
        this.renderOrder = [];

        // Clean up resource pool
        this.resourcePool.canvases = [];
        this.resourcePool.contexts = [];
        this.renderQueue = [];

        if (this.batchRenderTimeout) {
            clearTimeout(this.batchRenderTimeout);
        }

        console.log('LayerManager destroyed with resource cleanup');
    }
}