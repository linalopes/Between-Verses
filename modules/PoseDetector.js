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
        this.register('side_arms', (landmarks) => this.detectSideArmsPose(landmarks));
        this.register('rounded', (landmarks) => this.detectRoundedPose(landmarks));
        this.register('arms_up', (landmarks) => this.detectArmsUpPose(landmarks));
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

        // One arm up (wrist above shoulder), one arm down (wrist below shoulder)
        const leftUp = pts.leftWrist.y < pts.leftShoulder.y - 0.08;
        const rightUp = pts.rightWrist.y < pts.rightShoulder.y - 0.08;
        const leftDown = pts.leftWrist.y > pts.leftShoulder.y + 0.05;
        const rightDown = pts.rightWrist.y > pts.rightShoulder.y + 0.05;

        // Must be asymmetric: one up, one down (not both up or both down)
        const asymmetric = (leftUp && rightDown) || (rightUp && leftDown);
        
        // Arms should be extended away from body
        const leftExtended = Math.abs(pts.leftWrist.x - pts.leftShoulder.x) > 0.12;
        const rightExtended = Math.abs(pts.rightWrist.x - pts.rightShoulder.x) > 0.12;

        return asymmetric && leftExtended && rightExtended;
    }

    detectRoundedPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        // Debug logging for rounded pose
        const hipLevel = (pts.leftHip.y + pts.rightHip.y) / 2;
        const shoulderLevel = (pts.leftShoulder.y + pts.rightShoulder.y) / 2;
        
        // More lenient approach: wrists should be below shoulders but above hips
        const waistLevel = shoulderLevel + (hipLevel - shoulderLevel) * 0.3; // 30% down from shoulders
        const hipLevelExtended = hipLevel + 0.1; // Allow slightly below hips
        
        // Wrists should be in the torso area (between shoulders and hips)
        const leftWristInTorso = pts.leftWrist.y > shoulderLevel && pts.leftWrist.y < hipLevelExtended;
        const rightWristInTorso = pts.rightWrist.y > shoulderLevel && pts.rightWrist.y < hipLevelExtended;
        
        // Elbows should be out to the sides (creating the "rounded" shape)
        const leftElbowOut = Math.abs(pts.leftElbow.x - pts.leftShoulder.x) > 0.06; // More lenient
        const rightElbowOut = Math.abs(pts.rightElbow.x - pts.rightShoulder.x) > 0.06;
        
        // Wrists should be closer to center than elbows (hands on hips, not extended out)
        const leftWristInward = Math.abs(pts.leftWrist.x - pts.leftShoulder.x) < Math.abs(pts.leftElbow.x - pts.leftShoulder.x);
        const rightWristInward = Math.abs(pts.rightWrist.x - pts.rightShoulder.x) < Math.abs(pts.rightElbow.x - pts.rightShoulder.x);
        
        // Arms should be bent (not straight) - more lenient range
        const leftAngle = this.calculateAngle(pts.leftWrist, pts.leftElbow, pts.leftShoulder);
        const rightAngle = this.calculateAngle(pts.rightWrist, pts.rightElbow, pts.rightShoulder);
        const armsBent = leftAngle < 160 && rightAngle < 160 && leftAngle > 40 && rightAngle > 40;

        // // Debug logging (remove in production)
        // if (leftWristInTorso && rightWristInTorso) {
        //     console.log('🔍 Rounded pose debug:', {
        //         leftWristInTorso, rightWristInTorso,
        //         leftElbowOut, rightElbowOut,
        //         leftWristInward, rightWristInward,
        //         armsBent,
        //         leftAngle: leftAngle.toFixed(1),
        //         rightAngle: rightAngle.toFixed(1)
        //     });
        // }

        // Primary detection: all conditions
        const primaryDetection = leftWristInTorso && rightWristInTorso && 
                                leftElbowOut && rightElbowOut && 
                                leftWristInward && rightWristInward && armsBent;
        
        // Fallback detection: simpler "hands on hips" - just check if wrists are in torso area and elbows are out
        const fallbackDetection = leftWristInTorso && rightWristInTorso && 
                                 leftElbowOut && rightElbowOut;
        
        return primaryDetection || fallbackDetection;
    }

    detectArmsUpPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        const armsRaised = pts.leftWrist.y < pts.nose.y && pts.rightWrist.y < pts.nose.y;
        const leftAngle = this.calculateAngle(pts.leftWrist, pts.leftElbow, pts.leftShoulder);
        const rightAngle = this.calculateAngle(pts.rightWrist, pts.rightElbow, pts.rightShoulder);

        return armsRaised && leftAngle > 140 && rightAngle > 140;
    }

    detectSideArmsPose(landmarks) {
        const pts = this.getLandmarks(landmarks);
        if (!pts) return false;

        // Side arms: arms angled up at elbows (like a victory/celebration pose)
        // Wrists should be significantly higher than elbows (clear upward angle)
        const leftWristAboveElbow = pts.leftWrist.y < pts.leftElbow.y - 0.08;
        const rightWristAboveElbow = pts.rightWrist.y < pts.rightElbow.y - 0.08;

        // Wrists should be higher than shoulders (angled upward from shoulders)
        const leftWristAboveShoulder = pts.leftWrist.y < pts.leftShoulder.y - 0.05;
        const rightWristAboveShoulder = pts.rightWrist.y < pts.rightShoulder.y - 0.05;

        // Elbows should be extended to the sides (not close to body)
        const leftElbowOut = Math.abs(pts.leftElbow.x - pts.leftShoulder.x) > 0.12;
        const rightElbowOut = Math.abs(pts.rightElbow.x - pts.rightShoulder.x) > 0.12;

        // Elbows should be at or slightly below shoulder level (not too high)
        const leftElbowAtShoulderLevel = pts.leftElbow.y >= pts.leftShoulder.y - 0.05 && pts.leftElbow.y <= pts.leftShoulder.y + 0.08;
        const rightElbowAtShoulderLevel = pts.rightElbow.y >= pts.rightShoulder.y - 0.05 && pts.rightElbow.y <= pts.rightShoulder.y + 0.08;

        // Arms should be clearly angled (not straight up or straight out)
        const leftArmAngle = this.calculateAngle(pts.leftWrist, pts.leftElbow, pts.leftShoulder);
        const rightArmAngle = this.calculateAngle(pts.rightWrist, pts.rightElbow, pts.rightShoulder);
        const armsAngled = leftArmAngle > 110 && leftArmAngle < 150 && rightArmAngle > 110 && rightArmAngle < 150;

        // Both arms should be symmetric (both angled up)
        const symmetric = leftWristAboveElbow && rightWristAboveElbow && 
                         leftWristAboveShoulder && rightWristAboveShoulder;

        return symmetric && leftElbowOut && rightElbowOut && 
               leftElbowAtShoulderLevel && rightElbowAtShoulderLevel && armsAngled;
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