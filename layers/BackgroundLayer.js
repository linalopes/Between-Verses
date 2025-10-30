/**
 * Background Layer
 * Handles background effects: blur, remove, replace, none
 */
class BackgroundLayer extends LayerInterface {
    constructor(config = {}) {
        super('background', {
            mode: 'mountain_cutout', // 'blur', 'remove', 'replace', 'none', 'mountain_cutout'
            blurStrength: 15,
            backgroundImage: null, // Will be set from globalImages
            backgroundColor: '#000000',
            confidenceThreshold: 0.5, // Lower threshold for better person detection
            personTint: { r: 255, g: 255, b: 255, a: 0.1 }, // Subtle white tint for person
            personOpacity: 0.2, // Overall opacity of the person layer (0.0-1.0)
            zIndex: 1,
            ...config
        });

        this.backgroundImage = new Image();
        this.blurCache = new Map();
        this.mountainBackdrop = new Image();
        this.poseConfig = null;

        // Mountain backdrop will be loaded when pose config is set
        // this.loadMountainBackdrop(); // Don't load until we have config
    }

    onInit() {
        console.log('BackgroundLayer initialized');
    }

    setPoseConfig(poseConfig) {
        this.poseConfig = poseConfig;
        this.loadMountainBackdrop();
    }

    loadMountainBackdrop() {
        // Get background image from globalImages or use default
        let backgroundPath = 'bg-images/mountain.png'; // fallback
        
        if (this.poseConfig?.globalImages?.background) {
            backgroundPath = `bg-images/${this.poseConfig.globalImages.background}.png`;
        }

        console.log('🔄 Loading mountain backdrop from:', backgroundPath);

        this.mountainBackdrop.onload = () => {
            console.log('✅ Mountain backdrop loaded:', this.mountainBackdrop.width, 'x', this.mountainBackdrop.height);
            this.invalidate(); // Trigger re-render when image loads
        };
        this.mountainBackdrop.onerror = (e) => {
            console.error('❌ Failed to load mountain backdrop:', backgroundPath, e);
        };
        this.mountainBackdrop.src = backgroundPath;
    }

    async onRender(inputData, timestamp) {
        const { originalImage, mask, pixels, imageData } = inputData;

        if (!originalImage || !mask || !pixels) {
            return false;
        }

        // Store canvas dimensions from imageData
        this.canvasWidth = imageData ? imageData.width : this.canvas.width;
        this.canvasHeight = imageData ? imageData.height : this.canvas.height;

        switch (this.config.mode) {
            case 'blur':
                this.applyBackgroundBlur(pixels, mask, originalImage);
                break;
            case 'remove':
                this.removeBackground(pixels, mask);
                break;
            case 'replace':
                this.replaceBackground(pixels, mask);
                break;
            case 'mountain_cutout':
                this.applyMountainCutout(pixels, mask);
                break;
            case 'none':
                // No background processing
                break;
            default:
                console.warn(`Unknown background mode: ${this.config.mode}`);
                return false;
        }

        return true;
    }

    shouldRender(inputData, timestamp) {
        // Always render when input data changes
        return true;
    }

    applyMountainCutout(pixels, mask) {
        if (!this.mountainBackdrop.complete || !this.mountainBackdrop.src) {
            console.warn('Mountain backdrop not loaded yet, loading now...');
            this.loadMountainBackdrop();
            return false;
        }

        const isFullscreen = !!document.fullscreenElement;
        if (isFullscreen) {
            console.log('🔍 BackgroundLayer debug (FULLSCREEN):');
            console.log('  Canvas dimensions:', this.canvasWidth, 'x', this.canvasHeight);
            console.log('  Mountain backdrop:', this.mountainBackdrop.width, 'x', this.mountainBackdrop.height);
            console.log('  Person opacity:', this.config.personOpacity);
            console.log('  Confidence threshold:', this.config.confidenceThreshold);
        }

        // First, replace the background with the mountain image
        this.drawMountainBackground(pixels, mask);

        // Then apply white tint to the person
        this.applyPersonTint(pixels, mask);

        return true;
    }

    getMaskValue(pixelIndex, mask) {
        // Get mask value at pixel index
        // Mask is RGBA format from canvas.getImageData()
        // MediaPipe mask is typically in the red channel or all channels
        if (!mask) return 0;

        // Try red channel first (MediaPipe format)
        const maskValue = mask[pixelIndex] / 255;
        return maskValue;
    }

    drawMountainBackground(pixels, mask) {
        // Create a temporary canvas to get mountain image data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvasWidth;
        tempCanvas.height = this.canvasHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw mountain scaled to fill canvas (cover mode)
        const scaleX = this.canvasWidth / this.mountainBackdrop.width;
        const scaleY = this.canvasHeight / this.mountainBackdrop.height;
        const scale = Math.max(scaleX, scaleY);

        const scaledWidth = this.mountainBackdrop.width * scale;
        const scaledHeight = this.mountainBackdrop.height * scale;

        const offsetX = (this.canvasWidth - scaledWidth) / 2;
        const offsetY = (this.canvasHeight - scaledHeight) / 2;

        tempCtx.drawImage(
            this.mountainBackdrop,
            offsetX, offsetY,
            scaledWidth, scaledHeight
        );

        // Get mountain image data
        const mountainData = tempCtx.getImageData(0, 0, this.canvasWidth, this.canvasHeight).data;

        // Debug: Count person vs background pixels
        const isFullscreen = !!document.fullscreenElement;
        let personPixels = 0;
        let backgroundPixels = 0;

        // Replace background pixels with mountain pixels
        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = this.getMaskValue(i, mask);

            // If this pixel is background (not person), replace with mountain
            if (maskValue < this.config.confidenceThreshold) {
                pixels[i] = mountainData[i];         // R
                pixels[i + 1] = mountainData[i + 1]; // G
                pixels[i + 2] = mountainData[i + 2]; // B
                pixels[i + 3] = 255;                 // A (fully opaque)
                backgroundPixels++;
            } else {
                personPixels++;
            }
        }

        if (isFullscreen) {
            const totalPixels = personPixels + backgroundPixels;
            const personPercent = ((personPixels / totalPixels) * 100).toFixed(1);
            console.log(`  Person pixels: ${personPixels} (${personPercent}%) Background: ${backgroundPixels}`);
        }
    }

    applyPersonTint(pixels, mask) {
        const { r, g, b, a } = this.config.personTint;
        const personOpacity = this.config.personOpacity;

        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = this.getMaskValue(i, mask);

            // If this pixel is person (foreground)
            if (maskValue >= this.config.confidenceThreshold) {
                // Keep the original video pixels mostly intact for person visibility
                // Only apply a very subtle tint to preserve the "white ghost" effect

                // Apply subtle white tint for ghost effect
                const tintAlpha = a * maskValue;
                pixels[i] = pixels[i] * (1 - tintAlpha) + r * tintAlpha;         // R
                pixels[i + 1] = pixels[i + 1] * (1 - tintAlpha) + g * tintAlpha; // G
                pixels[i + 2] = pixels[i + 2] * (1 - tintAlpha) + b * tintAlpha; // B

                // Apply overall person opacity by blending with mountain background for ghost effect
                if (personOpacity < 1.0) {
                    // Get corresponding mountain pixel
                    const mountainPixel = this.getMountainPixel(i);
                    const opacity = personOpacity * maskValue;

                    pixels[i] = pixels[i] * opacity + mountainPixel.r * (1 - opacity);         // R
                    pixels[i + 1] = pixels[i + 1] * opacity + mountainPixel.g * (1 - opacity); // G
                    pixels[i + 2] = pixels[i + 2] * opacity + mountainPixel.b * (1 - opacity); // B
                }
            }
        }
    }

    getMountainPixel(pixelIndex) {
        // Get the mountain pixel data for this position
        if (!this.mountainData) {
            // Cache mountain data for efficiency
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvasWidth;
            tempCanvas.height = this.canvasHeight;
            const tempCtx = tempCanvas.getContext('2d');

            const scaleX = this.canvasWidth / this.mountainBackdrop.width;
            const scaleY = this.canvasHeight / this.mountainBackdrop.height;
            const scale = Math.max(scaleX, scaleY);

            const scaledWidth = this.mountainBackdrop.width * scale;
            const scaledHeight = this.mountainBackdrop.height * scale;
            const offsetX = (this.canvasWidth - scaledWidth) / 2;
            const offsetY = (this.canvasHeight - scaledHeight) / 2;

            tempCtx.drawImage(this.mountainBackdrop, offsetX, offsetY, scaledWidth, scaledHeight);
            this.mountainData = tempCtx.getImageData(0, 0, this.canvasWidth, this.canvasHeight).data;
        }

        return {
            r: this.mountainData[pixelIndex],
            g: this.mountainData[pixelIndex + 1],
            b: this.mountainData[pixelIndex + 2]
        };
    }

    getMaskValue(pixelIndex, mask) {
        if (!mask) return 0;
        return mask[pixelIndex] / 255;
    }

    applyBackgroundBlur(pixels, mask, originalImage) {
        const cacheKey = `blur_${this.config.blurStrength}_${this.canvas.width}x${this.canvas.height}`;

        let blurCanvas = this.getCached(cacheKey, () => {
            const canvas = document.createElement('canvas');
            canvas.width = this.canvas.width;
            canvas.height = this.canvas.height;
            const ctx = canvas.getContext('2d');

            // Apply blur filter
            ctx.filter = `blur(${this.config.blurStrength}px)`;
            ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

            return canvas;
        });

        const blurCtx = blurCanvas.getContext('2d');
        const blurData = blurCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue < this.config.confidenceThreshold) {
                pixels[i] = blurData.data[i];
                pixels[i + 1] = blurData.data[i + 1];
                pixels[i + 2] = blurData.data[i + 2];
            }
        }
    }

    removeBackground(pixels, mask) {
        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue < this.config.confidenceThreshold) {
                pixels[i + 3] = 0; // Set alpha to 0 (transparent)
            }
        }
    }

    replaceBackground(pixels, mask) {
        // Parse the background color
        const color = Utils.hexToRgb(this.config.backgroundColor);

        for (let i = 0; i < pixels.length; i += 4) {
            const maskValue = mask[i] / 255;
            if (maskValue < this.config.confidenceThreshold) {
                const blend = 1 - maskValue;
                pixels[i] = pixels[i] * maskValue + color.r * blend;
                pixels[i + 1] = pixels[i + 1] * maskValue + color.g * blend;
                pixels[i + 2] = pixels[i + 2] * maskValue + color.b * blend;
            }
        }
    }

    // hexToRgb moved to Utils module

    // Configuration methods
    setMode(mode) {
        this.config.mode = mode;
        this.invalidate();
    }

    setBackgroundColor(color) {
        this.config.backgroundColor = color;
        this.invalidate();
    }

    setBlurStrength(strength) {
        this.config.blurStrength = strength;
        this.blurCache.clear(); // Clear blur cache when strength changes
        this.invalidate();
    }

    setConfidenceThreshold(threshold) {
        this.config.confidenceThreshold = threshold;
        this.invalidate();
    }

    setBackgroundImage(imagePath) {
        this.backgroundImage.onload = () => {
            this.invalidate();
        };

        this.backgroundImage.onerror = (e) => {
            console.error('Failed to load background image:', imagePath, e);
        };

        this.backgroundImage.src = imagePath;
    }

    destroy() {
        super.destroy();
        this.blurCache.clear();
        this.backgroundImage = null;
    }
}