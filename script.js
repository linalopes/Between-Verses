// Feature flag to control p5 sticker rendering
const USE_P5_STICKERS = true; // Enable p5 stickers rendering

// Declare global variables for video capture, body pose detection, and poses
let video;
let bodyPose;
let poses = [];
let connections;
let canvas;
let showVideo = true;
let showTracking = true;
let isFullscreen = false;
let originalWidth = 640;
let originalHeight = 480;
let videoWrapper = null; // Cached reference to video-wrapper element

// Per-person state arrays for multi-person support
let personStates = []; // Current state for each person
let personLastStates = []; // Previous state for each person
let personStableStates = []; // Stable state for each person
let personStableCounters = []; // Counter for state stability
let personOverlayImages = []; // Overlay image for each person
const STABLE_FRAMES = 12; // Number of frames to wait before considering a state stable

// Local images for poses
let jesusImage = null; // Jesus_1.png
let primeImage = null; // Prime_1.png

// Navel anchor blend factor (0 = shoulders, 1 = hips, 0.60 = near navel)
window.NAVEL_BLEND = 0.60; // Adjustable at runtime via devtools

/*
===========================================================
SETUP
This section initializes the video capture, canvas, and
starts the body pose detection for Prime and Jesus pose
analysis with multi-person support.
===========================================================
*/

function preload() {
    // Preload the bodyPose model using ml5.js with horizontal flip for mirroring
    bodyPose = ml5.bodyPose({ flipHorizontal: true });

    // Load local images for poses
    jesusImage = loadImage('./generated/Jesus_1.svg');
    primeImage = loadImage('./generated/Prime.png');

    console.log("Loading local images: Jesus_1.png and Prime.png");
}

function setup() {
    // Dynamically create the canvas and attach it to the "video-wrapper" div in the HTML
    videoWrapper = document.getElementById('video-wrapper');
    canvas = createCanvas(640, 480);
    canvas.parent(videoWrapper);

    // Set p5 canvas positioning
    canvas.elt.style.position = 'absolute';
    canvas.elt.style.top = '0';
    canvas.elt.style.left = '0';

    // Initialize video capture and hide the video element (only show the canvas)
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();

    /// Start detecting body poses using the video feed
    bodyPose.detectStart(video, gotPoses);

    // Get skeleton connection information for drawing lines between keypoints
    connections = bodyPose.getSkeleton();

    // Setup control buttons
    setupControls();

    console.log("Setup complete - multi-person pose detection ready");
}

// Resize p5 canvas to specified dimensions
function resizeAllTo(w, h) {
    resizeCanvas(w, h);
    videoWrapper.style.width = w + 'px';
    videoWrapper.style.height = h + 'px';
}

// Ensure p5/state arrays are sized to match poses.length
function resizeStateArrays(numPersons) {
    // Extend arrays if we have more people
    while (personStates.length < numPersons) {
        personStates.push("Neutral");
        personLastStates.push("Neutral");
        personStableStates.push("Neutral");
        personStableCounters.push(0);
        personOverlayImages.push(null);
    }

    // Truncate arrays if we have fewer people
    if (personStates.length > numPersons) {
        personStates = personStates.slice(0, numPersons);
        personLastStates = personLastStates.slice(0, numPersons);
        personStableStates = personStableStates.slice(0, numPersons);
        personStableCounters = personStableCounters.slice(0, numPersons);
        personOverlayImages = personOverlayImages.slice(0, numPersons);
    }
}

/*
===========================================================
DRAWING
This section is responsible for rendering the mirrored video
feed on the canvas, visualizing detected poses, and drawing
skeletons and keypoints for all participants. It also displays
per-person stickers anchored near the navel.
===========================================================
*/

function draw() {
    // Clear the canvas
    clear();

    // Calculate scaling factors for fullscreen
    let scaleX = width / originalWidth;
    let scaleY = height / originalHeight;

    // Draw the mirrored video feed on the canvas (only if showVideo is true)
    if (showVideo) {
        push();
        translate(width, 0);
        scale(-1, 1);
        image(video, 0, 0, width, height);
        pop();
    }

    // Resize per-person arrays to match current number of poses
    resizeStateArrays(poses.length);

    // Loop through detected poses to draw skeletons, keypoints, and analyze states
    for (let i = 0; i < poses.length; i++) {
        let pose = poses[i];

        // Draw skeleton connections for the pose (only if tracking is enabled)
        if (showTracking) {
            for (let j = 0; j < connections.length; j++) {
                let pointAIndex = connections[j][0];
                let pointBIndex = connections[j][1];
                let pointA = pose.keypoints[pointAIndex];
                let pointB = pose.keypoints[pointBIndex];

                if (pointA.confidence > 0.1 && pointB.confidence > 0.1) {
                    stroke(255, 0, 0);
                    strokeWeight(2 * min(scaleX, scaleY)); // Scale stroke weight
                    line(pointA.x * scaleX, pointA.y * scaleY, pointB.x * scaleX, pointB.y * scaleY);
                }
            }
        }

        // Analyze the pose state of each person (Prime, Jesus, or Neutral) and get the state
        personStates[i] = analyzeState(pose, i + 1);

        // Draw keypoints for each person (only if tracking is enabled)
        if (showTracking) {
            for (let j = 0; j < pose.keypoints.length; j++) {
                let keypoint = pose.keypoints[j];
                if (keypoint.confidence > 0.1) {
                    fill(0, 255, 0); // Green color for keypoints
                    noStroke();
                    circle(keypoint.x * scaleX, keypoint.y * scaleY, 10 * min(scaleX, scaleY));
                }
            }
        }
    }

    // Process per-person state changes and debounce (for p5 stickers)
    for (let i = 0; i < poses.length; i++) {
        processPersonStateChange(i);
    }

    // Draw per-person stickers anchored near the navel
    if (USE_P5_STICKERS) {
        for (let i = 0; i < poses.length; i++) {
            drawPersonSticker(i, poses[i], scaleX, scaleY);
        }
    }
}

/*
===========================================================
POSE ANALYSIS
This section analyzes the body pose data to determine whether
a participant is in "Prime" pose (hands on head) or "Jesus" pose (open arms).
It uses keypoints like wrists, elbows, shoulders, and nose to calculate the posture
and displays the result on the canvas.
===========================================================
*/

// Analyze the player's pose to determine if they are "Prime" (hands on head) or "Jesus" (open arms)
function analyzeState(pose, personNumber) {
    // Extract keypoints for hands, shoulders, and head
    let leftWrist = pose.keypoints.find((k) => k.name === "left_wrist");
    let rightWrist = pose.keypoints.find((k) => k.name === "right_wrist");
    let leftElbow = pose.keypoints.find((k) => k.name === "left_elbow");
    let rightElbow = pose.keypoints.find((k) => k.name === "right_elbow");
    let leftShoulder = pose.keypoints.find((k) => k.name === "left_shoulder");
    let rightShoulder = pose.keypoints.find((k) => k.name === "right_shoulder");
    let nose = pose.keypoints.find((k) => k.name === "nose");

    // Handle missing keypoints
    if (!leftWrist || !rightWrist || !leftElbow || !rightElbow || !leftShoulder || !rightShoulder || !nose) {
        return "Neutral";
    }

    // Check confidence levels
    if (leftWrist.confidence < 0.3 || rightWrist.confidence < 0.3 || nose.confidence < 0.3) {
        return "Neutral";
    }

    let state = "Neutral";

    // Check for Prime pose: both hands on top of head and close together
    let handsAboveHead = leftWrist.y < nose.y - 20 && rightWrist.y < nose.y - 20;
    let handsCloseTogether = Math.abs(leftWrist.x - rightWrist.x) < 100; // Adjust threshold as needed

    if (handsAboveHead && handsCloseTogether) {
        state = "Prime";
    }
    // Check for Jesus pose: arms extended horizontally (open arms)
    else {
        // Calculate distances for arm extension check
        let leftShoulderToWrist = Math.sqrt(Math.pow(leftWrist.x - leftShoulder.x, 2) + Math.pow(leftWrist.y - leftShoulder.y, 2));
        let leftShoulderToElbow = Math.sqrt(Math.pow(leftElbow.x - leftShoulder.x, 2) + Math.pow(leftElbow.y - leftShoulder.y, 2));
        let rightShoulderToWrist = Math.sqrt(Math.pow(rightWrist.x - rightShoulder.x, 2) + Math.pow(rightWrist.y - rightShoulder.y, 2));
        let rightShoulderToElbow = Math.sqrt(Math.pow(rightElbow.x - rightShoulder.x, 2) + Math.pow(rightElbow.y - rightShoulder.y, 2));

        // Arms are extended if wrist is further from shoulder than elbow
        let leftArmExtended = leftShoulderToWrist > leftShoulderToElbow + 20;
        let rightArmExtended = rightShoulderToWrist > rightShoulderToElbow + 20;

        // Check if arms are spread horizontally (wrist is to the side of shoulder)
        let leftArmSpread = leftWrist.x < leftShoulder.x - 30; // Left wrist is to the left of left shoulder
        let rightArmSpread = rightWrist.x > rightShoulder.x + 30; // Right wrist is to the right of right shoulder

        // Check if arms are roughly horizontal (elbow and wrist at similar height)
        let leftArmHorizontal = Math.abs(leftElbow.y - leftWrist.y) < 40;
        let rightArmHorizontal = Math.abs(rightElbow.y - rightWrist.y) < 40;

        if (leftArmExtended && rightArmExtended && leftArmSpread && rightArmSpread && leftArmHorizontal && rightArmHorizontal) {
            state = "Jesus";
        }
    }

    // Display the state on the canvas
    fill(255);
    let scaleX = width / originalWidth;
    let scaleY = height / originalHeight;
    textSize(20 * min(scaleX, scaleY));
    textAlign(LEFT);
    text(`Person ${personNumber}: ${state}`, 10 * scaleX, height - 20 * personNumber * scaleY);

    return state;
}

/*
===========================================================
MULTI-PERSON STATE MANAGEMENT
This section handles per-person state arrays, debouncing,
and image selection for multiple people.
===========================================================
*/

// Resize per-person arrays to match the current number of poses
function resizePersonArrays(numPersons) {
    // Extend arrays if we have more people
    while (personStates.length < numPersons) {
        personStates.push("Neutral");
        personLastStates.push("Neutral");
        personStableStates.push("Neutral");
        personStableCounters.push(0);
        personOverlayImages.push(null);
    }

    // Truncate arrays if we have fewer people
    if (personStates.length > numPersons) {
        personStates = personStates.slice(0, numPersons);
        personLastStates = personLastStates.slice(0, numPersons);
        personStableStates = personStableStates.slice(0, numPersons);
        personStableCounters = personStableCounters.slice(0, numPersons);
        personOverlayImages = personOverlayImages.slice(0, numPersons);
    }
}

// Process state change for a specific person with debouncing
function processPersonStateChange(personIndex) {
    if (personIndex >= personStates.length) return;

    let currentState = personStates[personIndex];
    let stableState = personStableStates[personIndex];

    // Check if state changed
    if (currentState !== stableState) {
        personStableCounters[personIndex]++;
        if (personStableCounters[personIndex] >= STABLE_FRAMES) {
            // State is stable, commit the change
            personStableStates[personIndex] = currentState;
            personStableCounters[personIndex] = 0;

            // Update overlay image based on new stable state
            personOverlayImages[personIndex] = selectImageFor(currentState);

            console.log(`Person ${personIndex + 1} state changed to: ${currentState}`);
        }
    } else {
        // State is stable, reset counter
        personStableCounters[personIndex] = 0;
    }
}

// Select appropriate image for a given state
function selectImageFor(state) {
    if (state === "Jesus") {
        return jesusImage;
    } else if (state === "Prime") {
        return primeImage;
    } else {
        return null; // Neutral state
    }
}

/*
===========================================================
STICKER RENDERING
This section handles drawing per-person stickers
anchored near the navel by blending shoulders→hips.
===========================================================
*/

/** Draw sticker anchored near the navel by blending shoulders→hips */
function drawPersonSticker(personIndex, pose, scaleX, scaleY) {
    if (personIndex >= personOverlayImages.length) return;

    const overlayImage = personOverlayImages[personIndex];
    if (!overlayImage) return;

    // Keypoints
    const leftShoulder = pose.keypoints.find(k => k.name === "left_shoulder");
    const rightShoulder = pose.keypoints.find(k => k.name === "right_shoulder");
    const leftHip = pose.keypoints.find(k => k.name === "left_hip");
    const rightHip = pose.keypoints.find(k => k.name === "right_hip");

    // Shoulders must be confident
    if (!leftShoulder || !rightShoulder) return;
    if (leftShoulder.confidence < 0.3 || rightShoulder.confidence < 0.3) return;

    // Midpoints
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

    const hipsOK = leftHip && rightHip && leftHip.confidence >= 0.3 && rightHip.confidence >= 0.3;
    const hipMidX = hipsOK ? (leftHip.x + rightHip.x) / 2 : shoulderMidX;
    const hipMidY = hipsOK ? (leftHip.y + rightHip.y) / 2 : shoulderMidY;

    // Blend factor toward the navel (0 shoulders → 1 hips)
    const NAVEL_BLEND = (typeof window !== "undefined" && window.NAVEL_BLEND != null)
        ? window.NAVEL_BLEND
        : 0.60; // adjust 0.55–0.65 if needed

    let cx = shoulderMidX + (hipMidX - shoulderMidX) * NAVEL_BLEND;
    let cy = shoulderMidY + (hipMidY - shoulderMidY) * NAVEL_BLEND;

    // Scale relative to shoulder width (keep your current ratio; adjust if needed)
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    let w = 4.5 * shoulderWidth; // tweak if sticker is too big/small
    let h = w * (overlayImage.height / overlayImage.width);

    // Apply fullscreen scaling
    cx *= scaleX; cy *= scaleY;
    w *= scaleX;  h *= scaleY;

    // Draw centered on anchor
    image(overlayImage, cx - w / 2, cy - h / 2, w, h);
}

// Callback function to handle detected poses
function gotPoses(results) {
    poses = results;
}

/*
===========================================================
CONTROLS
This section handles the control buttons for fullscreen
and video toggle functionality.
===========================================================
*/

// Setup control button event listeners
function setupControls() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const videoToggleBtn = document.getElementById('video-toggle-btn');
    const hideTrackingBtn = document.getElementById('generate-images-btn'); // Reusing the same button ID

    // Fullscreen functionality
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Video toggle functionality
    videoToggleBtn.addEventListener('click', toggleVideo);

    // Hide tracking toggle functionality
    hideTrackingBtn.addEventListener('click', toggleTracking);

    // Listen for ESC key to exit fullscreen
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && document.fullscreenElement) {
            exitFullscreen();
        }
    });

    // Listen for fullscreen change events to update our state
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement === videoWrapper) {
            // ENTER fullscreen
            isFullscreen = true;
            resizeAllTo(window.innerWidth, window.innerHeight);
        } else {
            // EXIT fullscreen
            isFullscreen = false;
            resizeAllTo(originalWidth, originalHeight);
        }
    });
}

// Toggle fullscreen mode for the canvas
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Enter fullscreen
        videoWrapper.requestFullscreen().then(() => {
            isFullscreen = true;
            resizeAllTo(window.innerWidth, window.innerHeight);
        }).catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        // Exit fullscreen
        exitFullscreen();
    }
}

// Exit fullscreen mode
function exitFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
            console.error('Error attempting to exit fullscreen:', err);
        });
    }
}

// Toggle video display
function toggleVideo() {
    const videoToggleBtn = document.getElementById('video-toggle-btn');

    showVideo = !showVideo;
    videoToggleBtn.textContent = showVideo ? 'Hide Video' : 'Show Video';
}

// Toggle tracking visibility (skeleton lines and keypoints)
function toggleTracking() {
    const hideTrackingBtn = document.getElementById('generate-images-btn');

    showTracking = !showTracking;
    hideTrackingBtn.textContent = showTracking ? 'Hide Tracking' : 'Show Tracking';

    // Update button styling
    if (showTracking) {
        hideTrackingBtn.classList.remove('btn-disabled');
        hideTrackingBtn.classList.add('btn-1');
    } else {
        hideTrackingBtn.classList.remove('btn-1');
        hideTrackingBtn.classList.add('btn-disabled');
    }
}
