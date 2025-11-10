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
let PINK;
let TURQ;

// SelfieSegmentation globals for silhouette
let selfieSeg = null;
let segmentation = null; // last result
let gSilhouette;         // p5.Graphics buffer for compositing
let BG_COLOR, SILH_COLOR;
const MIRROR_MASK = true; // keep in sync with bodyPose flipHorizontal

// EMA temporal smoothing for mask
const MASK_EMA = 0;   // 0..1 (higher = steadier, more lag)
const FEATHER_PX = 4;    // small blur for soft edges
const HARD_THRESHOLD = false; // if true, binarize after EMA via contrast/brightness

let gMaskRaw;     // latest raw mask (mirrored)
let gMaskSmooth;  // EMA-accumulated mask
let gMaskTmp;     // temp buffer for blending

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

// ===== EMA smoothing (positions + scalar) =====
const SMOOTH_POS   = 0.80;  // 0..1 (higher = smoother, more lag)
const SMOOTH_SCALE = 0.85;  // for scalar values such as shoulderWidth

let smoothStore = {}; // per person: { keyName: {x,y}, _scalars: {name:value} }

/** Exponential moving average for a 2D point. */
function emaPoint(pIdx, keyName, x, y) {
    smoothStore[pIdx] ??= { _scalars: {} };
    const s = (smoothStore[pIdx][keyName] ??= { x, y });
    s.x = SMOOTH_POS * s.x + (1 - SMOOTH_POS) * x;
    s.y = SMOOTH_POS * s.y + (1 - SMOOTH_POS) * y;
    return s;
}

/** Exponential moving average for a scalar. */
function emaScalar(pIdx, name, value) {
    smoothStore[pIdx] ??= { _scalars: {} };
    const prev = smoothStore[pIdx]._scalars[name] ?? value;
    const v = SMOOTH_SCALE * prev + (1 - SMOOTH_SCALE) * value;
    smoothStore[pIdx]._scalars[name] = v;
    return v;
}

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

    // Initialize SelfieSegmentation for silhouette
    selfieSeg = ml5.bodySegmentation('SelfieSegmentation', { maskType: 'person' });

    // Load local images for poses
    jesusImage = loadImage('./generated/Jesus_1.png');
    primeImage = loadImage('./generated/Prime_2.png');

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

    // Initialize PINK color from CSS variable
    const root = getComputedStyle(document.documentElement);
    const cssPink = root.getPropertyValue('--bs-pink').trim(); // e.g. "#EA7DFF"
    PINK = color(cssPink); // p5 can take CSS hex strings

    // Initialize TURQ color from CSS variable
    const cssTurq = root.getPropertyValue('--bs-turquoise').trim(); // e.g. "#08f2db"
    TURQ = color(cssTurq); // p5 accepts CSS hex strings

    // Initialize background and silhouette colors from CSS
    const cssBg = (root.getPropertyValue('--bg') || '#0b0b0b').trim();
    const cssSilh = (root.getPropertyValue('--silhouette') || '#EA7DFF').trim();
    BG_COLOR = color(cssBg);
    SILH_COLOR = color(cssSilh);

    // Create graphics buffers for silhouette compositing (same size as canvas)
    gSilhouette = createGraphics(width, height);
    gMaskRaw = createGraphics(width, height);
    gMaskSmooth = createGraphics(width, height);
    gMaskTmp = createGraphics(width, height);

    /// Start detecting body poses using the video feed
    bodyPose.detectStart(video, gotPoses);

    // Start SelfieSegmentation alongside BodyPose
    if (selfieSeg && typeof selfieSeg.detectStart === 'function') {
        selfieSeg.detectStart(video, (res) => { segmentation = res || null; });
    }

    // Get skeleton connection information for drawing lines between keypoints
    connections = bodyPose.getSkeleton();

    // Setup control buttons
    setupControls();

    console.log("Setup complete - multi-person pose detection ready");
}

// Resize p5 canvas to specified dimensions
function resizeAllTo(w, h) {
    resizeCanvas(w, h);
    // Resize silhouette graphics buffers to match canvas
    if (gSilhouette) {
        gSilhouette.resizeCanvas(w, h);
    }
    if (gMaskRaw) {
        gMaskRaw.resizeCanvas(w, h);
    }
    if (gMaskSmooth) {
        gMaskSmooth.resizeCanvas(w, h);
    }
    if (gMaskTmp) {
        gMaskTmp.resizeCanvas(w, h);
    }
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
Layer order:
1) Solid background
2) Silhouette (always visible, from SelfieSegmentation)
3) Skeleton/keypoints (toggleable via showTracking)
4) Stickers (top layer, anchored near navel)
===========================================================
*/

function draw() {
    // Clear the canvas
    clear();

    // Calculate scaling factors for fullscreen
    let scaleX = width / originalWidth;
    let scaleY = height / originalHeight;

    // 1) Solid background (replaces video background)
    background(BG_COLOR);

    // === 2) Silhouette (always ON) with EMA-smoothed mask ===
    if (segmentation && segmentation.mask) {
        // -- A) Build the RAW (mirrored) mask frame
        gMaskRaw.clear();
        if (MIRROR_MASK) {
            gMaskRaw.push();
            gMaskRaw.translate(gMaskRaw.width, 0);
            gMaskRaw.scale(-1, 1);
            gMaskRaw.image(segmentation.mask, 0, 0, gMaskRaw.width, gMaskRaw.height);
            gMaskRaw.pop();
        } else {
            gMaskRaw.image(segmentation.mask, 0, 0, gMaskRaw.width, gMaskRaw.height);
        }

        // -- B) EMA: gMaskSmooth = a * gMaskSmooth + (1-a) * gMaskRaw
        gMaskTmp.clear();
        // draw previous smooth with alpha = a
        gMaskTmp.push();
        gMaskTmp.drawingContext.globalAlpha = MASK_EMA;
        gMaskTmp.image(gMaskSmooth, 0, 0, gMaskTmp.width, gMaskTmp.height);
        gMaskTmp.pop();
        // blend in new raw with alpha = (1-a)
        gMaskTmp.push();
        gMaskTmp.drawingContext.globalAlpha = (1 - MASK_EMA);
        gMaskTmp.image(gMaskRaw, 0, 0, gMaskTmp.width, gMaskTmp.height);
        gMaskTmp.pop();
        // commit
        gMaskSmooth.clear();
        gMaskSmooth.image(gMaskTmp, 0, 0, gMaskSmooth.width, gMaskSmooth.height);

        // -- C) Optional feather / hard threshold
        const ctxS = gMaskSmooth.drawingContext;
        if (FEATHER_PX > 0) {
            ctxS.filter = `blur(${FEATHER_PX}px)`;
            // copy to itself through tmp to apply blur
            gMaskTmp.clear();
            gMaskTmp.image(gMaskSmooth, 0, 0, gMaskTmp.width, gMaskTmp.height);
            ctxS.filter = 'none';
            gMaskSmooth.clear();
            gMaskSmooth.image(gMaskTmp, 0, 0, gMaskSmooth.width, gMaskSmooth.height);
        }
        if (HARD_THRESHOLD) {
            // crank contrast to binarize; tweak brightness if needed (~0.5 cutoff)
            ctxS.filter = 'grayscale(1) contrast(1000%) brightness(120%)';
            gMaskTmp.clear();
            gMaskTmp.image(gMaskSmooth, 0, 0, gMaskTmp.width, gMaskTmp.height);
            ctxS.filter = 'none';
            gMaskSmooth.clear();
            gMaskSmooth.image(gMaskTmp, 0, 0, gMaskSmooth.width, gMaskSmooth.height);
        }

        // -- D) Paint colored silhouette onto main canvas using smoothed mask
        gSilhouette.clear();
        gSilhouette.noStroke();
        gSilhouette.fill(SILH_COLOR);
        gSilhouette.rect(0, 0, gSilhouette.width, gSilhouette.height);

        const ctx = gSilhouette.drawingContext;
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'destination-in';
        gSilhouette.image(gMaskSmooth, 0, 0, gSilhouette.width, gSilhouette.height);
        ctx.globalCompositeOperation = prevOp;

        image(gSilhouette, 0, 0, width, height);
    } else {
        // No new mask this frame: keep last gMaskSmooth (do nothing -> graceful hold)
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
                    // Apply EMA smoothing to keypoints
                    const A_s = emaPoint(i, `kp${pointAIndex}`, pointA.x, pointA.y);
                    const B_s = emaPoint(i, `kp${pointBIndex}`, pointB.x, pointB.y);

                    stroke(PINK);
                    strokeWeight(2 * min(scaleX, scaleY)); // Scale stroke weight
                    line(A_s.x * scaleX, A_s.y * scaleY, B_s.x * scaleX, B_s.y * scaleY);
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
                    // Apply EMA smoothing to keypoint
                    const keyName = `kp${j}`;
                    const P_s = emaPoint(i, keyName, keypoint.x, keypoint.y);

                    fill(TURQ);
                    noStroke();
                    circle(P_s.x * scaleX, P_s.y * scaleY, 10 * min(scaleX, scaleY));
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
    const ls = pose.keypoints.find(k => k.name === "left_shoulder");
    const rs = pose.keypoints.find(k => k.name === "right_shoulder");
    const lh = pose.keypoints.find(k => k.name === "left_hip");
    const rh = pose.keypoints.find(k => k.name === "right_hip");

    // Shoulders must be confident
    if (!ls || !rs) return;
    if (ls.confidence < 0.3 || rs.confidence < 0.3) return;

    // EMA on shoulders
    const LS = emaPoint(personIndex, "left_shoulder", ls.x, ls.y);
    const RS = emaPoint(personIndex, "right_shoulder", rs.x, rs.y);

    // Midpoints
    const shoulderMidX = (LS.x + RS.x) / 2;
    const shoulderMidY = (LS.y + RS.y) / 2;

    // (Optional) If your anchor blends shoulders→hips, also smooth hips before using them
    let hipMidX = shoulderMidX, hipMidY = shoulderMidY;
    if (lh && rh && lh.confidence >= 0.3 && rh.confidence >= 0.3) {
        const LH = emaPoint(personIndex, "left_hip", lh.x, lh.y);
        const RH = emaPoint(personIndex, "right_hip", rh.x, rh.y);
        hipMidX = (LH.x + RH.x) / 2;
        hipMidY = (LH.y + RH.y) / 2;
    }

    // Blend (keep your existing NAVEL_BLEND if present)
    const NAVEL_BLEND = (typeof window !== "undefined" && window.NAVEL_BLEND != null) ? window.NAVEL_BLEND : 0.60;
    let cx = shoulderMidX + (hipMidX - shoulderMidX) * NAVEL_BLEND;
    let cy = shoulderMidY + (hipMidY - shoulderMidY) * NAVEL_BLEND;

    // EMA on scalar size (shoulder width)
    const rawShoulderWidth = Math.abs(LS.x - RS.x);
    const shoulderWidth = emaScalar(personIndex, "shoulderWidth", rawShoulderWidth);

    // Size and draw
    let w = 4.5 * shoulderWidth;
    let h = w * (overlayImage.height / overlayImage.width);
    cx *= scaleX; cy *= scaleY; w *= scaleX; h *= scaleY;
    image(overlayImage, cx - w/2, cy - h/2, w, h);
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
