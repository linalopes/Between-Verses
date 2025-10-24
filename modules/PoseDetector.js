/**
 * PoseDetector Module
 * Efficient pose detection with throttling and caching
 */
class PoseDetector {
    constructor(config = {}) {
        this.config = {
            throttleMs: config.throttleMs || 100,
            stableTime: config.stableTime || 500,
            minConfidence: config.minConfidence || 0.5,
            ...config
        };

        this.detectionMethods = new Map();
        this.lastDetection = 0;
        this.lastPose = 'neutral';
        this.currentPose = 'neutral';
        this.poseStartTime = Date.now();
        this.poseHistory = [];
        this.maxHistorySize = 10;

        this.registerDefaultPoses();
    }

    /**
     * Register default pose detection methods
     */
    registerDefaultPoses() {
        this.register('star', (landmarks) => this.detectStarPose(landmarks));
        this.register('arms_out', (landmarks) => this.detectArmsOutPose(landmarks));
        this.register('zigzag', (landmarks) => this.detectZigzagPose(landmarks));
        this.register('rounded', (landmarks) => this.detectRoundedPose(landmarks));
        this.register('arms_up', (landmarks) => this.detectArmsUpPose(landmarks));
        this.register('mountain', (landmarks) => this.detectMountainPose(landmarks));
        this.register('warrior', (landmarks) => this.detectWarriorPose(landmarks));
    }

    /**
     * Register a pose detection method
     */
    register(poseName, detectionFn) {
        this.detectionMethods.set(poseName, detectionFn);
    }

    /**
     * Main detection method with throttling
     */
    detect(landmarks) {
        const now = Date.now();

        // Throttle detection
        if (now - this.lastDetection < this.config.throttleMs) {
            return this.currentPose;
        }

        this.lastDetection = now;

        // Check all registered poses
        let detectedPose = 'neutral';
        for (const [poseName, detectFn] of this.detectionMethods) {
            if (detectFn(landmarks)) {
                detectedPose = poseName;
                break;
            }
        }

        // Update history for stability check
        this.poseHistory.push(detectedPose);
        if (this.poseHistory.length > this.maxHistorySize) {
            this.poseHistory.shift();
        }

        // Check for stable pose
        if (this.isStablePose(detectedPose)) {
            if (detectedPose !== this.currentPose) {
                this.onPoseChange(this.currentPose, detectedPose);
                this.currentPose = detectedPose;
                this.poseStartTime = now;
            }
        }

        return this.currentPose;
    }

    /**
     * Check if pose is stable
     */
    isStablePose(pose) {
        const requiredCount = Math.min(5, this.poseHistory.length);
        const recentPoses = this.poseHistory.slice(-requiredCount);
        return recentPoses.every(p => p === pose);
    }

    /**
     * Called when pose changes
     */
    onPoseChange(oldPose, newPose) {
        console.log(`Pose changed: ${oldPose} → ${newPose}`);
    }

    /**
     * Utility: Calculate angle between three points
     */
    calculateAngle(point1, point2, point3) {
        const radians = Math.atan2(point3.y - point2.y, point3.x - point2.x) -
                       Math.atan2(point1.y - point2.y, point1.x - point2.x);
        let angle = Math.abs(radians * 180.0 / Math.PI);
        return angle > 180.0 ? 360 - angle : angle;
    }

    /**
     * Get required landmarks with validation
     */
    getLandmarks(landmarks) {
        if (!landmarks || landmarks.length < 33) return null;

        return {
            nose: landmarks[0],
            leftShoulder: landmarks[11],
            rightShoulder: landmarks[12],
            leftElbow: landmarks[13],
            rightElbow: landmarks[14],
            leftWrist: landmarks[15],
            rightWrist: landmarks[16],
            leftHip: landmarks[23],
            rightHip: landmarks[24],
            leftAnkle: landmarks[27],
            rightAnkle: landmarks[28]
        };
    }

    // Optimized pose detection methods
    detectStarPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const armsRaised = pts.leftWrist.y < pts.leftShoulder.y &&
                          pts.rightWrist.y < pts.rightShoulder.y;
        const legSpread = Math.abs(pts.leftAnkle.x - pts.rightAnkle.x) >
                         Math.abs(pts.leftHip.x - pts.rightHip.x) * 1.5;

        return armsRaised && legSpread;
    }

    detectArmsOutPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const leftHorizontal = Math.abs(pts.leftWrist.y - pts.leftShoulder.y) < 0.1;
        const rightHorizontal = Math.abs(pts.rightWrist.y - pts.rightShoulder.y) < 0.1;
        const leftAngle = this.calculateAngle(pts.leftWrist, pts.leftElbow, pts.leftShoulder);
        const rightAngle = this.calculateAngle(pts.rightWrist, pts.rightElbow, pts.rightShoulder);

        return leftHorizontal && rightHorizontal && leftAngle > 160 && rightAngle > 160;
    }

    detectZigzagPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const leftUp = pts.leftWrist.y < pts.leftShoulder.y - 0.1;
        const rightUp = pts.rightWrist.y < pts.rightShoulder.y - 0.1;

        return (leftUp && !rightUp) || (rightUp && !leftUp);
    }

    detectRoundedPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const leftAngle = this.calculateAngle(pts.leftWrist, pts.leftElbow, pts.leftShoulder);
        const rightAngle = this.calculateAngle(pts.rightWrist, pts.rightElbow, pts.rightShoulder);
        const leftElbowOut = Math.abs(pts.leftElbow.x - pts.leftShoulder.x) > 0.1;
        const rightElbowOut = Math.abs(pts.rightElbow.x - pts.rightShoulder.x) > 0.1;

        return leftAngle < 120 && rightAngle < 120 && leftElbowOut && rightElbowOut;
    }

    detectArmsUpPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const armsRaised = pts.leftWrist.y < pts.nose.y && pts.rightWrist.y < pts.nose.y;
        const leftAngle = this.calculateAngle(pts.leftWrist, pts.leftElbow, pts.leftShoulder);
        const rightAngle = this.calculateAngle(pts.rightWrist, pts.rightElbow, pts.rightShoulder);

        return armsRaised && leftAngle > 140 && rightAngle > 140;
    }

    detectMountainPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const leftUp = pts.leftWrist.y < pts.leftShoulder.y - 0.15;
        const rightUp = pts.rightWrist.y < pts.rightShoulder.y - 0.15;
        const handsClose = Math.abs(pts.leftWrist.x - pts.rightWrist.x) < 0.4;

        return leftUp && rightUp && handsClose;
    }

    detectWarriorPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const armsSeparated = Math.abs(pts.leftWrist.x - pts.rightWrist.x) > 0.3;
        const armsLevel = Math.abs(pts.leftWrist.y - pts.leftShoulder.y) < 0.15 &&
                         Math.abs(pts.rightWrist.y - pts.rightShoulder.y) < 0.15;

        return armsSeparated && armsLevel;
    }

    /**
     * Get current pose duration in milliseconds
     */
    getPoseDuration() {
        return Date.now() - this.poseStartTime;
    }

    /**
     * Reset detector state
     */
    reset() {
        this.currentPose = 'neutral';
        this.lastPose = 'neutral';
        this.poseHistory = [];
        this.poseStartTime = Date.now();
    }
}