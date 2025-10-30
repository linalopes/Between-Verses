/**
 * Video Layer
 * Handles camera setup, MediaPipe processing, and video stream management
 */
class VideoLayer extends LayerInterface {
    constructor(config = {}) {
        super('video', {
            zIndex: 0, // Base layer - provides input for other layers
            enabled: true,
            alwaysRender: true,
            ...config
        });

        // Video elements
        this.video = document.getElementById('videoElement');
        this.segmenter = null;
        this.poseDetector = null;
        this.animationId = null;

        // Processing state
        this.poses = [];
        this.lastPoseUpdate = 0;
        this.segmentationResults = null;

        // Settings
        this.settings = {
            videoWidth: 640,
            videoHeight: 480,
            facingMode: 'user',
            modelSelection: 1,
            selfieMode: true,
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        };

        // Event handling
        this.eventListeners = new Map();
    }

    onInit() {
        console.log('VideoLayer initializing...');
        this.init();
    }

    async init() {
        try {
            await this.setupCamera();
            await this.loadMediaPipe();
            this.startProcessing();
            console.log('✓ VideoLayer initialized successfully');
        } catch (error) {
            console.error('VideoLayer initialization error:', error);
            this.emit('error', error);
        }
    }

    onResize(width, height) {
        // If you keep an internal canvas/video, resize them here
        if (this.canvas) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
        }
        this.emit && this.emit('resize', { width, height });
    }

    async setupCamera() {
        console.log('Setting up camera...');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: this.settings.videoWidth },
                height: { ideal: this.settings.videoHeight },
                facingMode: this.settings.facingMode
            }
        });

        this.video.srcObject = stream;

        return new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                // Emit camera ready event with video dimensions
                // Canvas dimensions will be set by the app when it receives this event
                this.emit('camera-ready', {
                    width: this.video.videoWidth,
                    height: this.video.videoHeight
                });

                console.log(`✓ Camera ready: ${this.video.videoWidth}x${this.video.videoHeight}`);
                resolve();
            };
        });
    }

    async loadMediaPipe() {
        console.log('Loading MediaPipe...');

        // Load Selfie Segmentation
        const segScript = document.createElement('script');
        segScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
        segScript.crossOrigin = 'anonymous';
        document.head.appendChild(segScript);

        // Load Pose Detection
        const poseScript = document.createElement('script');
        poseScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';
        poseScript.crossOrigin = 'anonymous';
        document.head.appendChild(poseScript);

        await Promise.all([
            new Promise((resolve) => { segScript.onload = resolve; }),
            new Promise((resolve) => { poseScript.onload = resolve; })
        ]);

        // Initialize Selfie Segmentation
        const segConfig = {
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
            }
        };

        this.segmenter = new window.SelfieSegmentation(segConfig);
        this.segmenter.setOptions({
            modelSelection: this.settings.modelSelection,
            selfieMode: this.settings.selfieMode
        });

        this.segmenter.onResults(this.onSegmentationResults.bind(this));

        // Initialize Pose Detection
        const poseConfig = {
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
            }
        };

        this.poseDetector = new window.Pose(poseConfig);
        this.poseDetector.setOptions({
            modelComplexity: this.settings.modelComplexity,
            smoothLandmarks: this.settings.smoothLandmarks,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: this.settings.minDetectionConfidence,
            minTrackingConfidence: this.settings.minTrackingConfidence,
            selfieMode: this.settings.selfieMode
        });

        this.poseDetector.onResults(this.onPoseResults.bind(this));

        console.log('✓ MediaPipe loaded successfully');
    }

    onSegmentationResults(results) {
        this.segmentationResults = results;

        // Emit segmentation data
        this.emit('segmentation-results', {
            image: results.image,
            segmentationMask: results.segmentationMask,
            width: this.video.videoWidth,
            height: this.video.videoHeight
        });
    }

    onPoseResults(results) {
        this.poses = results.poseLandmarks ? [results] : [];

        // Emit pose data
        this.emit('pose-results', {
            poses: this.poses,
            poseLandmarks: results.poseLandmarks
        });
    }

    startProcessing() {
        console.log('Starting video processing...');

        const processFrame = async () => {
            if (this.video.readyState >= 2) {
                // Send frame to segmentation
                if (this.segmenter) {
                    await this.segmenter.send({ image: this.video });
                }

                // Send frame to pose detector
                if (this.poseDetector) {
                    await this.poseDetector.send({ image: this.video });
                }
            }
            this.animationId = requestAnimationFrame(processFrame);
        };

        processFrame();
    }

    stopProcessing() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
        }

        console.log('✓ Video processing stopped');
    }

    // Event emitter methods
    emit(eventName, data) {
        const listeners = this.eventListeners.get(eventName) || [];
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${eventName}:`, error);
            }
        });
    }

    on(eventName, callback) {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName).push(callback);
    }

    off(eventName, callback) {
        const listeners = this.eventListeners.get(eventName) || [];
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    // VideoLayer doesn't render to canvas directly - it provides data
    async onRender(inputData, timestamp) {
        // Video layer provides input data, doesn't modify pixels
        return true;
    }

    shouldRender(inputData, timestamp) {
        return false; // VideoLayer doesn't render pixels
    }

    // Configuration methods
    setVideoSettings(settings) {
        Object.assign(this.settings, settings);
        console.log('Video settings updated:', this.settings);
    }

    // Cleanup
    destroy() {
        this.stopProcessing();
        this.eventListeners.clear();
        super.destroy();
        console.log('VideoLayer destroyed');
    }
}