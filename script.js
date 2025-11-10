// Feature flag to control p5 sticker rendering
const USE_P5_STICKERS = true; // Enable p5 stickers rendering

// Declare global variables for video capture, body pose detection, and poses
let video;
let bodyPose;
let poses = [];
let connections;
let canvas;
let showVideo = true;
let showTracking = false; // Start with tracking OFF
let showSegmentation = false; // Start with segmentation OFF
let showLine = true; // Start with line ON
let isFullscreen = false;
let originalWidth = 640;
let originalHeight = 480;
let videoWrapper = null; // Cached reference to video-wrapper element
let PINK;
let TURQ;
let LINECOLOR;
let LINE_GLOW;
let LINE_WIDTH;
let FILLCOLOR;

const WS_URL = 'ws://127.0.0.1:5173/ws';

let oscWS = null, wsQueue = [], wsBackoffMs = 500;

function wsConnect() {
    if (oscWS && (oscWS.readyState === 0 || oscWS.readyState === 1)) return;
    try {
        oscWS = new WebSocket(WS_URL);
        oscWS.onopen = () => {
            wsBackoffMs = 500;
            while (wsQueue.length) oscWS.send(wsQueue.shift());
            console.log('[WS] connected');
        };
        oscWS.onclose = () => {
            setTimeout(wsConnect, wsBackoffMs);
            wsBackoffMs = Math.min(wsBackoffMs * 2, 4000);
            console.log('[WS] closed, retrying...');
        };
        oscWS.onerror = (e) => console.warn('[WS] error', e);
        oscWS.onmessage = (e) => { /* optional debug */ };
    } catch (e) {
        console.warn('[WS] connect error', e);
        setTimeout(wsConnect, wsBackoffMs);
    }
}
wsConnect();

function sendOsc(actions) {
    const payload = JSON.stringify({ type: 'osc', actions });
    if (oscWS && oscWS.readyState === 1) oscWS.send(payload);
    else wsQueue.push(payload);
}

// SelfieSegmentation globals for silhouette
let selfieSeg = null;
let segmentation = null; // last result
let gSilhouette;         // p5.Graphics buffer for compositing
let BG_COLOR, SILH_COLOR;
const MIRROR_MASK = true; // keep in sync with bodyPose flipHorizontal

// Per-person state arrays for multi-person support
let personStates = []; // Current state for each person
let personLastStates = []; // Previous state for each person
let personStableStates = []; // Stable state for each person
let personStableCounters = []; // Counter for state stability
let personOverlayImages = []; // Overlay image for each person
const STABLE_FRAMES = 12; // Number of frames to wait before considering a state stable


// Navel anchor blend factor (0 = shoulders, 1 = hips, 0.60 = near navel)
window.NAVEL_BLEND = 0.60; // Adjustable at runtime via devtools

// ===== EMA smoothing (positions + scalar) =====
const SMOOTH_POS   = 0.80;  // 0..1 (higher = smoother, more lag)
const SMOOTH_SCALE = 0.85;  // for scalar values such as shoulderWidth

let smoothStore = {}; // per person: { keyName: {x,y}, _scalars: {name:value} }

// ===== Anti-flicker FSM for pose selection =====
const POSE_DWELL_MS        = 400;  // must see same pose for this long to lock
const STICKER_MIN_SHOW_MS  = 1000; // keep sticker at least this long before releasing
const STICKER_COOLDOWN_MS  = 400;  // after release, ignore immediate re-triggers
const GRACE_MS             = 250;  // tolerate brief drops before unlocking

// FSM state per personId: {phase, candidatePose, candidateSince, lockedPose, lockedSince, cooldownUntil, lastSeen}
let poseFSM = {}; // key = stable person id (use your current track/index)

// Track last locked pose for logging transitions
let lastLockedPoseByPerson = {};

// Layers (zero-based)
const LAYERS = { FLOWER_A: 2, FLOWER_B: 3, BIRD_A: 4, BIRD_B: 5 };

// Birds in order from the folder: 1..7
const BIRDS   = [1,2,3,4,5,6,7];
// Flowers start at 8; continue sequentially
const FLOWERS = [8,9,10,11,12,13,14,15,16,17,18,19];

const POSE_TO_BUNDLE = {
    star: [
        { layer: LAYERS.FLOWER_A, media: FLOWERS[0] },
        { layer: LAYERS.FLOWER_B, media: FLOWERS[1] },
        { layer: LAYERS.BIRD_A,   media: BIRDS[0]   },
        { layer: LAYERS.BIRD_B,   media: BIRDS[1]   },
    ],
    arms_out: [
        { layer: LAYERS.FLOWER_A, media: FLOWERS[2] },
        { layer: LAYERS.FLOWER_B, media: FLOWERS[3] },
        { layer: LAYERS.BIRD_A,   media: BIRDS[2]   },
        { layer: LAYERS.BIRD_B,   media: BIRDS[3]   },
    ],
    zigzag: [
        { layer: LAYERS.FLOWER_A, media: FLOWERS[4] },
        { layer: LAYERS.FLOWER_B, media: FLOWERS[5] },
        { layer: LAYERS.BIRD_A,   media: BIRDS[4]   },
        { layer: LAYERS.BIRD_B,   media: BIRDS[5]   },
    ],
    side_arms: [
        { layer: LAYERS.FLOWER_A, media: FLOWERS[6] },
        { layer: LAYERS.FLOWER_B, media: FLOWERS[7] },
        { layer: LAYERS.BIRD_A,   media: BIRDS[1]   },
        { layer: LAYERS.BIRD_B,   media: BIRDS[2]   },
    ],
    rounded: [
        { layer: LAYERS.FLOWER_A, media: FLOWERS[8]  },
        { layer: LAYERS.FLOWER_B, media: FLOWERS[9]  },
        { layer: LAYERS.BIRD_A,   media: BIRDS[3]    },
        { layer: LAYERS.BIRD_B,   media: BIRDS[4]    },
    ],
    arms_up: [
        { layer: LAYERS.FLOWER_A, media: FLOWERS[10] },
        { layer: LAYERS.FLOWER_B, media: FLOWERS[11] },
        { layer: LAYERS.BIRD_A,   media: BIRDS[5]    },
        { layer: LAYERS.BIRD_B,   media: BIRDS[6]    },
    ],
};

const GLOBAL_DEBOUNCE_MS = 600;
let lastBundleKey = '';
let lastSentAt = 0;

function keyOfBundle(bundle) {
    return bundle.slice().sort((a, b) => a.layer - b.layer).map(a => `${a.layer}:${a.media}`).join('|');
}

function maybeSendBundle(bundle) {
    const now = performance.now();
    if (now - lastSentAt < GLOBAL_DEBOUNCE_MS) return;
    const k = keyOfBundle(bundle);
    if (k === lastBundleKey) return;
    sendOsc(bundle);
    lastBundleKey = k;
    lastSentAt = now;
    console.log('[OSC] sent bundle', k);
}

function nowMs() {
    return millis ? millis() : (performance.now ? performance.now() : Date.now());
}

// === Sticker animation config ===
const IN_MS = 440;          // enter duration
const OUT_MS = 220;         // exit duration
const S_IN_START = 0.58;    // pop-in starts a bit smaller
const S_IN_END   = 1.00;    // settles at 1.0
const S_OUT_END  = 0.76;    // shrink slightly on exit

// Per-person sticker animation state
// stickerAnim[pid] = { phase:'hidden'|'in'|'steady'|'out', t0, dur, from, to, scale, currentPose, currentImage }
let stickerAnim = {};

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutQuad(u) { return 1 - (1 - u) * (1 - u); }
function easeInQuad(u) { return u * u; }
function nowMsAnim() { return nowMs(); }
// Persistent tracking: store last frame's poses for matching
let lastFramePoses = [];

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

/** FSM update for anti-flicker pose selection */
function fsmUpdate(personId, detectedPose /* string or null */, /*optional*/ detectedInfo = {}) {
    // detectedInfo can contain: {conf: number, margin: number}, both optional.
    const t = nowMs();

    const s = poseFSM[personId] ?? (poseFSM[personId] = {
        phase: 'idle', candidatePose: null, candidateSince: 0,
        lockedPose: null,  lockedSince: 0, cooldownUntil: 0, lastSeen: t
    });

    s.lastSeen = t;

    // Helper checks (use if you have confidences; otherwise they default to true)
    const confOK   = (detectedInfo.conf   == null) ? true : (detectedInfo.conf   >= 0);
    const marginOK = (detectedInfo.margin == null) ? true : (detectedInfo.margin >= 0);

    switch (s.phase) {
        case 'idle': {
            if (detectedPose && confOK && marginOK && t >= s.cooldownUntil) {
                s.phase = 'candidate';
                s.candidatePose = detectedPose;
                s.candidateSince = t;
            }
            break;
        }
        case 'candidate': {
            if (!detectedPose) {
                // lost signal — grace back to idle
                if (t - s.candidateSince > GRACE_MS) {
                    s.phase = 'idle';
                    s.candidatePose = null;
                }
                break;
            }
            if (detectedPose !== s.candidatePose) {
                // switched candidate → restart dwell
                s.candidatePose = detectedPose;
                s.candidateSince = t;
                break;
            }
            // same candidate; check dwell time + quality gate
            if ((t - s.candidateSince) >= POSE_DWELL_MS && confOK && marginOK) {
                s.phase = 'locked';
                s.lockedPose = s.candidatePose;
                s.lockedSince = t;
            }
            break;
        }
        case 'locked': {
            // Hold minimum show time
            const minShowReached = (t - s.lockedSince) >= STICKER_MIN_SHOW_MS;

            // If we still detect same pose OR min show not reached, keep locked
            if (detectedPose === s.lockedPose || !minShowReached) break;

            // If pose vanished or changed and min show reached, allow unlock with a brief grace
            const changed = (!detectedPose) || (detectedPose !== s.lockedPose);
            if (changed && (t - s.lockedSince) >= (STICKER_MIN_SHOW_MS + GRACE_MS)) {
                s.phase = 'cooldown';
                s.candidatePose = null;
                s.candidateSince = 0;
                s.cooldownUntil = t + STICKER_COOLDOWN_MS;
                // clear locked; consumer will notice null and hide sticker
                s.lockedPose = null;
            }
            break;
        }
        case 'cooldown': {
            if (t >= s.cooldownUntil) {
                s.phase = 'idle';
            }
            break;
        }
    }

    // Return the current "locked" pose the renderer should use (or null)
    return s.lockedPose;
}

/** Update sticker animation state based on FSM locked pose */
function updateStickerAnim(personId, lockedPose) {
    const t = nowMsAnim();

    let A = stickerAnim[personId];

    if (!A) A = stickerAnim[personId] = { phase: 'hidden', t0: 0, dur: 0, from: 1, to: 1, scale: 1, currentPose: null, currentImage: null };

    // ENTER: got a pose locked
    if (lockedPose && lockedPose !== 'neutral') {
        if (A.phase === 'hidden' || A.phase === 'out' || A.currentPose !== lockedPose) {
            A.currentPose = lockedPose;
            A.currentImage = selectImageFor(lockedPose);
            A.phase = 'in';
            A.t0 = t;
            A.dur = IN_MS;
            A.from = S_IN_START;
            A.to = S_IN_END;
        }
    } else {
        // EXIT: no locked pose -> animate out if currently visible/steady/in
        if (A.phase === 'in' || A.phase === 'steady') {
            A.phase = 'out';
            A.t0 = t;
            A.dur = OUT_MS;
            A.from = A.scale || 1.0;
            A.to = S_OUT_END;
        }
    }

    // Advance animation
    if (A.phase === 'in') {
        const u = clamp01((t - A.t0) / A.dur);
        A.scale = lerp(A.from, A.to, easeOutQuad(u));
        if (u >= 1) {
            A.phase = 'steady';
            A.scale = 1.0;
        }
    } else if (A.phase === 'out') {
        const u = clamp01((t - A.t0) / A.dur);
        A.scale = lerp(A.from, A.to, easeInQuad(u));
        if (u >= 1) {
            A.phase = 'hidden';
            A.scale = 1.0;
            A.currentImage = null; // hide for real after exit
            A.currentPose = null;
        }
    } else if (A.phase === 'steady') {
        A.scale = 1.0;
    }

    return A;
}

/*
===========================================================
SETUP
This section initializes the video capture, canvas, and
starts the body pose detection for 7 poses (star, arms_out,
zigzag, side_arms, rounded, arms_up, neutral) with multi-person support.
===========================================================
*/

function preload() {
    // Preload the bodyPose model using ml5.js with horizontal flip for mirroring
    bodyPose = ml5.bodyPose({ flipHorizontal: true });

    // Initialize SelfieSegmentation for silhouette
    selfieSeg = ml5.bodySegmentation('SelfieSegmentation', { maskType: 'person' });

    // Load local images for poses (mapped to arms_out and arms_up)
    arms_outImage = loadImage('./generated/Jesus.png');
    arms_upImage = loadImage('./generated/Prime.png');
    starImage = loadImage('./generated/Cathedral.png');
    zigzagImage = loadImage('./generated/Copan.png');
    side_armsImage = loadImage('./generated/Grossmuenster.png');
    roundedImage = loadImage('./generated/Kappell.png');

    console.log("Loading pose images");
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

    // Initialize organic line settings
    LINECOLOR = color(255, 255, 128);
    FILLCOLOR = color(255, 255, 128); // pale yellow
    LINE_GLOW = true; // enable glow effect
    LINE_WIDTH = 4; // base width in pixels

    // Initialize background and silhouette colors from CSS
    const cssBg = (root.getPropertyValue('--bg') || '#0b0b0b').trim();
    const cssSilh = (root.getPropertyValue('--silhouette') || '#EA7DFF').trim();
    BG_COLOR = color(cssBg);
    SILH_COLOR = color(cssSilh);

    // Create graphics buffer for silhouette compositing (same size as canvas)
    gSilhouette = createGraphics(width, height);

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
    // Resize silhouette graphics buffer to match canvas
    if (gSilhouette) {
        gSilhouette.resizeCanvas(w, h);
    }
    videoWrapper.style.width = w + 'px';
    videoWrapper.style.height = h + 'px';
}

// Ensure p5/state arrays are sized to match poses.length
function resizeStateArrays(numPersons) {
    // Extend arrays if we have more people
    while (personStates.length < numPersons) {
        personStates.push("neutral");
        personLastStates.push("neutral");
        personStableStates.push("neutral");
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

    // 2) Silhouette (toggleable via showSegmentation)
    if (showSegmentation && segmentation && segmentation.mask) {
        gSilhouette.clear();
        // Fill entire buffer with silhouette color
        gSilhouette.noStroke();
        gSilhouette.fill(SILH_COLOR);
        gSilhouette.rect(0, 0, gSilhouette.width, gSilhouette.height);

        // Clip with mask: keep only person region
        const ctx = gSilhouette.drawingContext;
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'destination-in';

        // Mirror mask to match BodyPose flipHorizontal
        if (MIRROR_MASK) {
            gSilhouette.push();
            gSilhouette.translate(gSilhouette.width, 0);
            gSilhouette.scale(-1, 1);
            gSilhouette.image(segmentation.mask, 0, 0, gSilhouette.width, gSilhouette.height);
            gSilhouette.pop();
        } else {
            gSilhouette.image(segmentation.mask, 0, 0, gSilhouette.width, gSilhouette.height);
        }

        ctx.globalCompositeOperation = prevOp;

        // Paint the colored silhouette onto main canvas
        image(gSilhouette, 0, 0, width, height);
    }

    // Resize per-person arrays to match current number of poses
    resizeStateArrays(poses.length);

    // Loop through detected poses to draw skeletons/lines, keypoints, and analyze states
    for (let i = 0; i < poses.length; i++) {
        let pose = poses[i];

        // Draw line outline (independent toggle)
        if (showLine) {
            drawOrganicOutline(pose, i, scaleX, scaleY);
        }

        // Draw skeleton tracking visualization (only if tracking is enabled)
        if (showTracking) {
            // Show traditional skeleton connections
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

        // Analyze the pose state of each person
        const detectedPose = analyzeState(pose, i + 1);
        personStates[i] = detectedPose; // Keep for display/logging

        // Route through FSM for anti-flicker stabilization
        const detectedInfo = {}; // Can add {conf, margin} here if available
        const pid = i; // Use index as person ID (or use stable identity if available)
        const lockedPose = fsmUpdate(pid, detectedPose, detectedInfo);

        // Log transitions for tuning
        if (lockedPose !== lastLockedPoseByPerson[pid]) {
            if (lockedPose) {
                console.log(`Person ${pid + 1} locked pose:`, lockedPose);
                if (lockedPose !== 'neutral') {
                    const bundle = POSE_TO_BUNDLE[lockedPose];
                    if (bundle) maybeSendBundle(bundle);
                }
            }
            lastLockedPoseByPerson[pid] = lockedPose;
        }

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

    // Update stickers based on FSM locked poses with animation
    for (let i = 0; i < poses.length; i++) {
        const pid = i;
        const s = poseFSM[pid];
        const lockedPose = s ? s.lockedPose : null;
        const A = updateStickerAnim(pid, lockedPose);
        personOverlayImages[i] = A.currentImage; // stays non-null during OUT until hidden
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
ORGANIC OUTLINE DRAWING
This section draws a smooth, organic outline around the body
using detected keypoints to help people locate themselves.
===========================================================
*/

/** Draw a smooth organic outline around the body */
function drawOrganicOutline(pose, personIndex, scaleX, scaleY, useGlow = LINE_GLOW, lineWidth = LINE_WIDTH, lineColor = LINECOLOR) {
    // Get key body outline points
    const nose = pose.keypoints.find(k => k.name === "nose");
    const leftShoulder = pose.keypoints.find(k => k.name === "left_shoulder");
    const rightShoulder = pose.keypoints.find(k => k.name === "right_shoulder");
    const leftElbow = pose.keypoints.find(k => k.name === "left_elbow");
    const rightElbow = pose.keypoints.find(k => k.name === "right_elbow");
    const leftWrist = pose.keypoints.find(k => k.name === "left_wrist");
    const rightWrist = pose.keypoints.find(k => k.name === "right_wrist");
    const leftHip = pose.keypoints.find(k => k.name === "left_hip");
    const rightHip = pose.keypoints.find(k => k.name === "right_hip");
    const leftKnee = pose.keypoints.find(k => k.name === "left_knee");
    const rightKnee = pose.keypoints.find(k => k.name === "right_knee");
    const leftAnkle = pose.keypoints.find(k => k.name === "left_ankle");
    const rightAnkle = pose.keypoints.find(k => k.name === "right_ankle");
    const leftEar = pose.keypoints.find(k => k.name === "left_ear");
    const rightEar = pose.keypoints.find(k => k.name === "right_ear");

    // Build array of outline points going around the body clockwise
    const outlinePoints = [];

    // Helper to add smoothed point if confident
    const addPoint = (kp, name) => {
        if (kp && kp.confidence > 0.2) {
            const smoothed = emaPoint(personIndex, name, kp.x, kp.y);
            outlinePoints.push({ x: smoothed.x * scaleX, y: smoothed.y * scaleY });
        }
    };

    // Start from head/top and go clockwise around the body
    addPoint(nose, "nose");
    addPoint(rightEar, "right_ear");
    addPoint(rightShoulder, "right_shoulder");
    addPoint(rightElbow, "right_elbow");
    addPoint(rightWrist, "right_wrist");
    addPoint(rightHip, "right_hip");
    addPoint(rightKnee, "right_knee");
    addPoint(rightAnkle, "right_ankle");

    // Bottom/feet area - if we have both ankles, connect them
    addPoint(leftAnkle, "left_ankle");

    // Up the left side
    addPoint(leftKnee, "left_knee");
    addPoint(leftHip, "left_hip");
    addPoint(leftWrist, "left_wrist");
    addPoint(leftElbow, "left_elbow");
    addPoint(leftShoulder, "left_shoulder");
    addPoint(leftEar, "left_ear");

    // Only draw if we have enough points
    if (outlinePoints.length < 4) return;

    // Helper function to draw the curve
    const drawCurve = () => {
        beginShape();
        // Use curveVertex for smooth curves
        // Repeat first points at beginning and end for smooth closure
        curveVertex(outlinePoints[outlinePoints.length - 1].x, outlinePoints[outlinePoints.length - 1].y);
        for (let point of outlinePoints) {
            curveVertex(point.x, point.y);
        }
        // Close the curve smoothly
        curveVertex(outlinePoints[0].x, outlinePoints[0].y);
        curveVertex(outlinePoints[1].x, outlinePoints[1].y);
        endShape();
    };

    noFill();
    //fill(FILLCOLOR);
    const baseWeight = lineWidth * min(scaleX, scaleY);

    if (useGlow) {
        // Draw glow effect with multiple layers
        let glowColor = color(lineColor);

        // Outer glow (widest, most transparent)
        glowColor.setAlpha(40);
        stroke(glowColor);
        strokeWeight(baseWeight * 3);
        drawCurve();

        // Middle glow
        glowColor.setAlpha(80);
        stroke(glowColor);
        strokeWeight(baseWeight * 2);
        drawCurve();

        // Inner glow
        glowColor.setAlpha(120);
        stroke(glowColor);
        strokeWeight(baseWeight * 1.3);
        drawCurve();

        // Core line (full opacity)
        glowColor.setAlpha(200);
        stroke(glowColor);
        strokeWeight(baseWeight);
        drawCurve();
    } else {
        // Simple line without glow
        stroke(lineColor);
        strokeWeight(baseWeight);
        drawCurve();
    }
}

/*
===========================================================
POSE ANALYSIS
This section analyzes the body pose data to determine which
of the 7 poses a participant is performing: star, arms_out,
zigzag, side_arms, rounded, arms_up, or neutral.
===========================================================
*/

// Analyze the player's pose to determine which of the 7 poses they're in
function analyzeState(pose, personNumber) {
    // Extract all necessary keypoints
    let leftWrist = pose.keypoints.find((k) => k.name === "left_wrist");
    let rightWrist = pose.keypoints.find((k) => k.name === "right_wrist");
    let leftElbow = pose.keypoints.find((k) => k.name === "left_elbow");
    let rightElbow = pose.keypoints.find((k) => k.name === "right_elbow");
    let leftShoulder = pose.keypoints.find((k) => k.name === "left_shoulder");
    let rightShoulder = pose.keypoints.find((k) => k.name === "right_shoulder");
    let leftHip = pose.keypoints.find((k) => k.name === "left_hip");
    let rightHip = pose.keypoints.find((k) => k.name === "right_hip");
    let leftKnee = pose.keypoints.find((k) => k.name === "left_knee");
    let rightKnee = pose.keypoints.find((k) => k.name === "right_knee");
    let leftAnkle = pose.keypoints.find((k) => k.name === "left_ankle");
    let rightAnkle = pose.keypoints.find((k) => k.name === "right_ankle");
    let nose = pose.keypoints.find((k) => k.name === "nose");

    // Handle missing critical keypoints
    if (!leftWrist || !rightWrist || !leftElbow || !rightElbow || !leftShoulder || !rightShoulder || !nose) {
        return "neutral";
    }

    // Check minimum confidence levels
    if (leftWrist.confidence < 0.3 || rightWrist.confidence < 0.3 ||
        leftShoulder.confidence < 0.3 || rightShoulder.confidence < 0.3) {
        return "neutral";
    }

    // Calculate useful metrics
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;

    // Arm extension checks
    const leftArmLength = Math.sqrt(Math.pow(leftWrist.x - leftShoulder.x, 2) + Math.pow(leftWrist.y - leftShoulder.y, 2));
    const rightArmLength = Math.sqrt(Math.pow(rightWrist.x - rightShoulder.x, 2) + Math.pow(rightWrist.y - rightShoulder.y, 2));
    const leftForearmLength = Math.sqrt(Math.pow(leftWrist.x - leftElbow.x, 2) + Math.pow(leftWrist.y - leftElbow.y, 2));
    const rightForearmLength = Math.sqrt(Math.pow(rightWrist.x - rightElbow.x, 2) + Math.pow(rightWrist.y - rightElbow.y, 2));

    // Helper: Check if arms are extended (relatively straight)
    const leftArmExtended = leftArmLength > leftForearmLength * 1.6;
    const rightArmExtended = rightArmLength > rightForearmLength * 1.6;

    // Helper: Check if arms are spread wide
    const leftArmSpread = leftWrist.x < leftShoulder.x - shoulderWidth * 0.3;
    const rightArmSpread = rightWrist.x > rightShoulder.x + shoulderWidth * 0.3;

    // Helper: Check if wrists are at similar height (symmetric)
    const wristsSymmetric = Math.abs(leftWrist.y - rightWrist.y) < 60;

    // POSE DETECTION (in priority order)

    // 1. STAR: Arms and legs spread wide, arms raised
    if (leftHip && rightHip && leftAnkle && rightAnkle) {
        const hipWidth = Math.abs(leftHip.x - rightHip.x);
        const ankleSpread = Math.abs(leftAnkle.x - rightAnkle.x);
        const legsSpread = ankleSpread > hipWidth * 1.3;
        const armsRaised = leftWrist.y < shoulderMidY && rightWrist.y < shoulderMidY;

        if (leftArmExtended && rightArmExtended && leftArmSpread && rightArmSpread &&
            armsRaised && legsSpread && wristsSymmetric) {
            displayState(personNumber, "star");
            return "star";
        }
    }

    // 2. ARMS UP: Both arms raised above head
    const bothArmsUp = leftWrist.y < nose.y - 30 && rightWrist.y < nose.y - 30;
    if (bothArmsUp && leftArmExtended && rightArmExtended && wristsSymmetric) {
        displayState(personNumber, "arms_up");
        return "arms_up";
    }

    // 3. SIDE ARMS: Victory/celebration pose (elbows out, wrists above elbows and shoulders)
    const leftWristAboveElbow = leftWrist.y < leftElbow.y - 20;
    const rightWristAboveElbow = rightWrist.y < rightElbow.y - 20;
    const leftWristAboveShoulder = leftWrist.y < leftShoulder.y;
    const rightWristAboveShoulder = rightWrist.y < rightShoulder.y;
    const leftElbowOut = Math.abs(leftElbow.x - leftShoulder.x) > shoulderWidth * 0.3;
    const rightElbowOut = Math.abs(rightElbow.x - rightShoulder.x) > shoulderWidth * 0.3;

    if (leftWristAboveElbow && rightWristAboveElbow &&
        leftWristAboveShoulder && rightWristAboveShoulder &&
        leftElbowOut && rightElbowOut && wristsSymmetric) {
        displayState(personNumber, "side_arms");
        return "side_arms";
    }

    // 4. ZIGZAG: One arm up, one arm down (asymmetric)
    const wristHeightDiff = Math.abs(leftWrist.y - rightWrist.y);
    const asymmetric = wristHeightDiff > shoulderWidth * 0.8;
    const oneArmUp = (leftWrist.y < shoulderMidY - 40) || (rightWrist.y < shoulderMidY - 40);
    const oneArmDown = (leftWrist.y > shoulderMidY + 40) || (rightWrist.y > shoulderMidY + 40);

    if (asymmetric && oneArmUp && oneArmDown && leftArmExtended && rightArmExtended) {
        displayState(personNumber, "zigzag");
        return "zigzag";
    }

    // 5. ARMS OUT: T-pose (arms extended horizontally)
    const leftArmHorizontal = Math.abs(leftWrist.y - leftShoulder.y) < 60;
    const rightArmHorizontal = Math.abs(rightWrist.y - rightShoulder.y) < 60;

    if (leftArmExtended && rightArmExtended && leftArmSpread && rightArmSpread &&
        leftArmHorizontal && rightArmHorizontal && wristsSymmetric) {
        displayState(personNumber, "arms_out");
        return "arms_out";
    }

    // 6. ROUNDED: Hands on hips (robust for low camera angles, flexible vertical positioning)
    if (leftHip && rightHip) {
        // Calculate body proportions for angle-independent detection
        const torsoHeight = Math.abs(shoulderMidY - ((leftHip.y + rightHip.y) / 2));
        const hipMidY = (leftHip.y + rightHip.y) / 2;

        // Flexible vertical range: from mid-torso down to below hips
        // Allows hands on waist, hips, or upper thighs
        const leftWristInRange = leftWrist.y > shoulderMidY - torsoHeight * 0.2 &&
                                  leftWrist.y < hipMidY + torsoHeight * 0.6;
        const rightWristInRange = rightWrist.y > shoulderMidY - torsoHeight * 0.2 &&
                                   rightWrist.y < hipMidY + torsoHeight * 0.6;

        // Distance from wrist to hip (3D-like distance, angle-independent)
        const leftWristToHipDist = Math.sqrt(
            Math.pow(leftWrist.x - leftHip.x, 2) +
            Math.pow(leftWrist.y - leftHip.y, 2)
        );
        const rightWristToHipDist = Math.sqrt(
            Math.pow(rightWrist.x - rightHip.x, 2) +
            Math.pow(rightWrist.y - rightHip.y, 2)
        );

        // Wrists should be reasonably close to hips (relaxed threshold)
        const leftWristNearHip = leftWristToHipDist < shoulderWidth * 1.0;
        const rightWristNearHip = rightWristToHipDist < shoulderWidth * 1.0;

        // Elbows should be outward from wrists (creates the characteristic shape)
        const leftElbowOutward = leftElbow.x < leftWrist.x - shoulderWidth * 0.1;
        const rightElbowOutward = rightElbow.x > rightWrist.x + shoulderWidth * 0.1;

        // Forearms should be relatively short (bent arms, not extended)
        const leftForearmShort = leftForearmLength < shoulderWidth * 1.4;
        const rightForearmShort = rightForearmLength < shoulderWidth * 1.4;

        if (leftWristInRange && rightWristInRange &&
            leftWristNearHip && rightWristNearHip &&
            leftElbowOutward && rightElbowOutward &&
            leftForearmShort && rightForearmShort) {
            displayState(personNumber, "rounded");
            return "rounded";
        }
    }

    // 7. NEUTRAL: Default fallback
    displayState(personNumber, "neutral");
    return "neutral";
}

// Helper function to display the detected state
function displayState(personNumber, state) {
    fill(255);
    let scaleX = width / originalWidth;
    let scaleY = height / originalHeight;
    textSize(20 * min(scaleX, scaleY));
    textAlign(LEFT);
    text(`Person ${personNumber}: ${state}`, 10 * scaleX, height - 20 * personNumber * scaleY);
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
        personStates.push("neutral");
        personLastStates.push("neutral");
        personStableStates.push("neutral");
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
    // Map new pose names to available images
    // Note: Currently only have Jesus and Prime images loaded
    switch (state) {
        case "arms_out":
            return arms_outImage;
        case "arms_up":
            return arms_upImage;
        case "star":
            return starImage;
        case "zigzag":
            return zigzagImage;
        case "side_arms":
            return side_armsImage;
        case "rounded":
            return roundedImage;
        case "neutral":
        default:
            return null; // No image for these poses yet
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

    // Apply animation scale
    const animScale = (stickerAnim[personIndex]?.scale ?? 1.0);
    w *= animScale;
    h *= animScale;

    cx *= scaleX; cy *= scaleY; w *= scaleX; h *= scaleY;
    image(overlayImage, cx - w/2, cy - h/2, w, h);
}

/**
 * Calculate similarity score between two poses based on keypoint distances
 * Returns a lower score for more similar poses (distance-based)
 */
function calculatePoseSimilarity(pose1, pose2) {
    let totalDistance = 0;
    let numComparisons = 0;

    // Compare key body points that are usually visible and stable
    const keyPointNames = ["nose", "left_shoulder", "right_shoulder", "left_hip", "right_hip"];

    for (let name of keyPointNames) {
        const kp1 = pose1.keypoints.find(k => k.name === name);
        const kp2 = pose2.keypoints.find(k => k.name === name);

        // Only compare if both keypoints exist and are confident
        if (kp1 && kp2 && kp1.confidence > 0.3 && kp2.confidence > 0.3) {
            const dx = kp1.x - kp2.x;
            const dy = kp1.y - kp2.y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
            numComparisons++;
        }
    }

    // Return average distance (lower = more similar)
    return numComparisons > 0 ? totalDistance / numComparisons : Infinity;
}

/**
 * Match current frame poses to previous frame poses for stable tracking
 * Uses Hungarian algorithm concept: match each current pose to closest previous pose
 */
function matchPosesToPreviousFrame(currentPoses, previousPoses) {
    if (!previousPoses || previousPoses.length === 0) {
        return currentPoses; // First frame, no matching needed
    }

    if (currentPoses.length === 0) {
        return currentPoses;
    }

    // Build a cost matrix: [current][previous] = similarity score
    const costMatrix = [];
    for (let i = 0; i < currentPoses.length; i++) {
        costMatrix[i] = [];
        for (let j = 0; j < previousPoses.length; j++) {
            costMatrix[i][j] = calculatePoseSimilarity(currentPoses[i], previousPoses[j]);
        }
    }

    // Simple greedy matching (good enough for 2-3 people)
    const matched = new Array(currentPoses.length);
    const usedPrevious = new Set();

    // For each previous person slot, find the best matching current pose
    for (let prevIdx = 0; prevIdx < previousPoses.length; prevIdx++) {
        let bestCurrentIdx = -1;
        let bestScore = Infinity;

        for (let currIdx = 0; currIdx < currentPoses.length; currIdx++) {
            if (matched[currIdx] !== undefined) continue; // Already matched

            const score = costMatrix[currIdx][prevIdx];
            if (score < bestScore) {
                bestScore = score;
                bestCurrentIdx = currIdx;
            }
        }

        // Only match if distance is reasonable (not too far apart)
        if (bestCurrentIdx !== -1 && bestScore < 200) {
            matched[bestCurrentIdx] = prevIdx;
            usedPrevious.add(prevIdx);
        }
    }

    // Create reordered array maintaining previous frame indices
    const reordered = new Array(Math.max(currentPoses.length, previousPoses.length));

    // Place matched poses in their previous positions
    for (let currIdx = 0; currIdx < currentPoses.length; currIdx++) {
        if (matched[currIdx] !== undefined) {
            reordered[matched[currIdx]] = currentPoses[currIdx];
        }
    }

    // Place unmatched poses in remaining slots
    let nextSlot = 0;
    for (let currIdx = 0; currIdx < currentPoses.length; currIdx++) {
        if (matched[currIdx] === undefined) {
            // Find next empty slot
            while (reordered[nextSlot] !== undefined) nextSlot++;
            reordered[nextSlot] = currentPoses[currIdx];
        }
    }

    // Filter out undefined slots and return
    return reordered.filter(p => p !== undefined);
}

// Callback function to handle detected poses
function gotPoses(results) {
    if (!results || results.length === 0) {
        poses = results;
        lastFramePoses = [];
        return;
    }

    // Match poses to previous frame for stable tracking
    const matchedPoses = matchPosesToPreviousFrame(results, lastFramePoses);

    // Store for next frame
    lastFramePoses = matchedPoses.slice(); // Copy array
    poses = matchedPoses;
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
    const segmentationToggleBtn = document.getElementById('segmentation-toggle-btn');
    const lineToggleBtn = document.getElementById('line-toggle-btn');

    // Fullscreen functionality
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Video toggle functionality
    videoToggleBtn.addEventListener('click', toggleVideo);

    // Hide tracking toggle functionality
    hideTrackingBtn.addEventListener('click', toggleTracking);

    // Segmentation toggle functionality
    segmentationToggleBtn.addEventListener('click', toggleSegmentation);

    // Line toggle functionality
    lineToggleBtn.addEventListener('click', toggleLine);

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

// Toggle segmentation visibility
function toggleSegmentation() {
    const segmentationToggleBtn = document.getElementById('segmentation-toggle-btn');

    showSegmentation = !showSegmentation;
    segmentationToggleBtn.textContent = showSegmentation ? 'Hide Segmentation' : 'Show Segmentation';

    // Update button styling
    if (showSegmentation) {
        segmentationToggleBtn.classList.remove('btn-disabled');
        segmentationToggleBtn.classList.add('btn-1');
    } else {
        segmentationToggleBtn.classList.remove('btn-1');
        segmentationToggleBtn.classList.add('btn-disabled');
    }
}

// Toggle line outline (alternative to skeleton)
function toggleLine() {
    const lineToggleBtn = document.getElementById('line-toggle-btn');

    showLine = !showLine;
    lineToggleBtn.textContent = showLine ? 'Hide Line' : 'Show Line';

    // Update button styling
    if (showLine) {
        lineToggleBtn.classList.remove('btn-disabled');
        lineToggleBtn.classList.add('btn-1');
    } else {
        lineToggleBtn.classList.remove('btn-1');
        lineToggleBtn.classList.add('btn-disabled');
    }
}
