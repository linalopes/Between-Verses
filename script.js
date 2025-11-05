// Feature flag to control p5 sticker rendering
const USE_P5_STICKERS = false; // When set to true, p5 stickers render again alongside Pixi mesh

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

// PixiJS overlay variables
let pixiApp = null; // PixiJS application instance
let debugMarkers = []; // Debug markers for vertices 14, 15, 26, 27

// PixiJS container layers for organized rendering
let bgContainer, meshesContainer, fgContainer;

// Foreground mask for bottom 30% band
let fgMask;

// Foreground particle system for lilies
let fgParticles = [];
let fgSpawnAccumulator = 0;
let fgPaused = false;
let lilyTex = null;

// Multi-person PixiJS plane management
let planes = [];                    // PIXI.SimplePlane per person
let planeContainers = [];           // PIXI.Container per person for positioning/scaling
let planePosBufs = [];              // Cached aVertexPosition buffer per plane
let planePoseType = [];             // "Prime" | "Jesus" | "Neutral" for each person
let lastVertexPositions = [];       // Per-person cache for smoothing

// Per-person anchor/scale smoothing caches
let anchorPos = [];                 // [{x,y}, ...] per person for position smoothing
let anchorScale = [];               // [number, ...] per person for scale smoothing

// Mesh grid dimensions
const COLS = 6;
const ROWS = 6;

// Plane positioning factor (0 = shoulders, 1 = hips, 0.5 = halfway/torso center)
const TORSO_OFFSET_FACTOR = 0.5; // Adjust to move plane up/down between shoulders and hips

// Foreground mask configuration
const FG_FRACTION = 0.30; // fraction of screen height for foreground band

// Background image opacity
const BG_ALPHA = 0.0; // background image opacity (fully opaque)

// p5 canvas opacity
const P5_ALPHA = 0.8; // p5 canvas opacity (50% transparent)

// Foreground particle system settings
const FG_SETTINGS = {
    spawnRate: 6,           // particles per second
    maxParticles: 40,       // safety cap
    baseScale: 0.25,        // base scale relative to texture
    scaleJitter: 0.35,      // random extra scale
    speedMin: 2,            // px/sec horizontal speed
    speedMax: 10,
    sineAmp: 6,             // vertical sine amplitude (px)
    sineFreq: 1.1,          // sine frequency multiplier
    lifetimeMin: 6.0,       // seconds
    lifetimeMax: 10.0,
    alphaStart: 0.90,
    alphaEnd: 0.0,
    blendMode: PIXI.BLEND_MODES.NORMAL
};

// Jitter reduction constants
const ANCHOR_SMOOTH = 0.15;      // 0..1, higher = more smoothing for container position
const SCALE_SMOOTH = 0.15;       // 0..1, smoothing for container scale
const DEAD_ZONE_PX = 0.4;        // px threshold for anchor X/Y changes
const SCALE_DEAD = 0.002;        // unit threshold for scale changes

// Preloaded textures
let primeTex = null; // generated/Prime_1.png texture
let jesusTex = null; // generated/Jesus_1.png texture
let bgTex = null;
let bgSprite = null; // Background sprite

// Pose-to-mesh vertex mapping
const POSE_VERTEX_MAP = {
    left_shoulder: 14,   // Row 2, Col 2
    right_shoulder: 15,  // Row 2, Col 3
    left_hip: 20,        // Row 4, Col 2
    right_hip: 21        // Row 4, Col 3
};
const SMOOTHING_FACTOR = 0.25; // Lerp factor for jitter reduction

// Mesh blend mode for SimplePlane overlays
const MESH_BLEND_MODE = PIXI.BLEND_MODES.ADD;
// Alternative options to try later: SCREEN, OVERLAY, ADD, MULTIPLY

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
    jesusImage = loadImage('./generated/Jesus.png');
    primeImage = loadImage('./generated/Prime_1.png');

    console.log("Loading local images: Jesus_1.png and Prime_1.png");
}

function setup() {
    // Dynamically create the canvas and attach it to the "video-wrapper" div in the HTML
    videoWrapper = document.getElementById('video-wrapper');
    canvas = createCanvas(640, 480);
    canvas.parent(videoWrapper);

    // Set p5 canvas absolute positioning to align with Pixi overlay
    canvas.elt.style.position = 'absolute';
    canvas.elt.style.top = '0';
    canvas.elt.style.left = '0';
    canvas.elt.style.opacity = P5_ALPHA;
    canvas.elt.style.zIndex = '5';  // Above background (-1) but below meshes (10)

    // Initialize video capture and hide the video element (only show the canvas)
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();

    /// Start detecting body poses using the video feed
    bodyPose.detectStart(video, gotPoses);

    // Get skeleton connection information for drawing lines between keypoints
    connections = bodyPose.getSkeleton();

    // Initialize PixiJS overlay
    initializePixiOverlay();

    // Setup control buttons
    setupControls();

    console.log("Setup complete - multi-person pose detection with PixiJS overlay ready");
}

/*
===========================================================
PIXIJS OVERLAY SETUP
This section initializes the PixiJS application and creates
a random overlay sprite from the generated images pool.
===========================================================
*/

async function initializePixiOverlay() {
    // Create PixiJS application with same dimensions as p5 canvas
    pixiApp = new PIXI.Application({
        width: originalWidth,
        height: originalHeight,
        backgroundAlpha: 0, // Fully transparent background
        antialias: true
    });

    // Add PixiJS canvas to the video wrapper, positioned over p5 canvas
    videoWrapper.appendChild(pixiApp.view);

    // Position PixiJS canvas absolutely over p5 canvas with pixel-perfect sizing
    pixiApp.view.style.position = 'absolute';
    pixiApp.view.style.top = '0';
    pixiApp.view.style.left = '0';
    pixiApp.view.style.width = originalWidth + 'px';
    pixiApp.view.style.height = originalHeight + 'px';
    pixiApp.view.style.pointerEvents = 'none'; // Allow clicks to pass through to p5 canvas

    // Ensure video wrapper has relative positioning for absolute overlay
    videoWrapper.style.position = 'relative';

    // Enable zIndex sorting for layered containers
    pixiApp.stage.sortableChildren = true;

    // Create container layers with zIndex for organized rendering
    bgContainer = new PIXI.Container();
    bgContainer.zIndex = -1;  // Background behind everything

    meshesContainer = new PIXI.Container();
    meshesContainer.zIndex = 10;  // Meshes above p5 canvas

    fgContainer = new PIXI.Container();
    fgContainer.zIndex = 20;  // Lilies on top

    // Add containers to stage in order
    pixiApp.stage.addChild(bgContainer, meshesContainer, fgContainer);

    // Create mask for fgContainer (bottom 30% band)
    fgMask = new PIXI.Graphics();
    fgContainer.mask = fgMask;
    pixiApp.stage.addChild(fgMask);

    // Draw initial mask for bottom 30% of canvas
    const w = pixiApp.renderer.width;
    const h = pixiApp.renderer.height;
    const yTop = Math.floor(h * (1 - FG_FRACTION));
    fgMask.clear().beginFill(0xffffff).drawRect(0, yTop, w, h - yTop).endFill();

    try {
        // Preload all textures once
        primeTex = await PIXI.Assets.load("generated/Prime_1.png");
        jesusTex = await PIXI.Assets.load("generated/Jesus_1.png");
        lilyTex = await PIXI.Assets.load("./front-images/water-lily.png");
        bgTex = await PIXI.Assets.load("./bg-images/Cloud 1.png");

        // Create background sprite from texture
        bgSprite = new PIXI.Sprite(bgTex);
        bgSprite.anchor.set(0.5);
        bgSprite.x = pixiApp.renderer.width / 2;
        bgSprite.y = pixiApp.renderer.height / 2;

        // Background should render normally
        bgSprite.blendMode = PIXI.BLEND_MODES.NORMAL;

        // Set background opacity to 70%
        bgSprite.alpha = BG_ALPHA;

        // Scale to fit canvas while preserving aspect ratio (cover mode)
        const scaleX = pixiApp.renderer.width / bgTex.width;
        const scaleY = pixiApp.renderer.height / bgTex.height;
        const scale = Math.max(scaleX, scaleY);
        bgSprite.scale.set(scale);

        // Add to background container
        bgContainer.addChild(bgSprite);

        // Create debug markers for vertices 14, 15, 26, 27
        // createDebugMarkers();

        // Start foreground particle ticker
        let last = performance.now() / 1000;
        pixiApp.ticker.add(() => {
            const now = performance.now() / 1000;
            const dt = Math.min(now - last, 0.05);
            last = now;
            if (!fgPaused) updateFgParticles(dt);
        });

        console.log("PixiJS overlay initialized with multi-person support, preloaded textures, layered containers, fgContainer mask, and particle system");
    } catch (error) {
        console.error('Error loading PixiJS textures:', error);
    }
}

// Resize both p5 canvas and PixiJS overlay to specified dimensions
function resizeAllTo(w, h) {
    resizeCanvas(w, h);                  // p5
    canvas.elt.style.opacity = P5_ALPHA; // Maintain p5 canvas opacity
    canvas.elt.style.zIndex = '5';       // Maintain p5 canvas z-index
    videoWrapper.style.width = w + 'px';
    videoWrapper.style.height = h + 'px';
    if (pixiApp) {
        pixiApp.renderer.resize(w, h);
        pixiApp.view.style.width = w + 'px';
        pixiApp.view.style.height = h + 'px';
        updateFgMask();                   // also rescale bgSprite inside it
    }
}

// Update foreground mask when canvas is resized
function updateFgMask() {
    if (!pixiApp || !fgMask) return;

    const w = pixiApp.renderer.width;
    const h = pixiApp.renderer.height;
    const yTop = Math.floor(h * (1 - FG_FRACTION));
    fgMask.clear().beginFill(0xffffff).drawRect(0, yTop, w, h - yTop).endFill();

    // Update background sprite size and position
    if (bgSprite && bgTex) {
        bgSprite.x = w / 2;
        bgSprite.y = h / 2;
        const scaleX = w / bgTex.width;
        const scaleY = h / bgTex.height;
        const scale = Math.max(scaleX, scaleY);
        bgSprite.scale.set(scale);
    }
}

// Spawn a new lily particle in the foreground container
function spawnFgParticle() {
    if (!lilyTex || fgParticles.length >= FG_SETTINGS.maxParticles) return;

    const w = pixiApp.renderer.width;
    const h = pixiApp.renderer.height;
    const yBandTop = Math.floor(h * (1 - FG_FRACTION));
    const yBandH = h - yBandTop;

    const spr = new PIXI.Sprite(lilyTex);
    spr.anchor.set(0.5);
    spr.alpha = FG_SETTINGS.alphaStart;
    spr.blendMode = FG_SETTINGS.blendMode;

    // Randomize initial horizontal placement
    spr.x = Math.random() * w;

    // Random scale (uniform), based on baseScale
    const s = FG_SETTINGS.baseScale * (1 + FG_SETTINGS.scaleJitter * (Math.random() * 2 - 1));
    spr.scale.set(s);

    // Compute half-height and sine amplitude margin for safe spawning
    const half = spr.height * 0.5;
    const amp = FG_SETTINGS.sineAmp;

    // Define minY so the sprite never crosses above the band
    const minY = yBandTop + half + amp;

    // Allow downward slack (can go below screen)
    const downSlack = yBandH + amp;

    // Set Y position with downward freedom
    spr.y = minY + Math.random() * downSlack;

    // Random horizontal direction & speed
    const dir = Math.random() < 0.5 ? -1 : 1;
    const speed = smoothLerp(FG_SETTINGS.speedMin, FG_SETTINGS.speedMax, Math.random()) * dir;

    // Lifetime seconds
    const life = smoothLerp(FG_SETTINGS.lifetimeMin, FG_SETTINGS.lifetimeMax, Math.random());

    // Per-particle state
    spr.__p = {
        age: 0,
        life,
        speed,
        phase: Math.random() * Math.PI * 2, // sine seed
        sineAmp: FG_SETTINGS.sineAmp * (0.7 + Math.random()*0.6),
        sineFreq: FG_SETTINGS.sineFreq * (0.8 + Math.random()*0.4),
        baseY: spr.y
    };

    fgContainer.addChild(spr);
    fgParticles.push(spr);
}

// Update all foreground particles
function updateFgParticles(dt) {
    const w = pixiApp.renderer.width;
    const h = pixiApp.renderer.height;
    const yBandTop = Math.floor(h * (1 - FG_FRACTION));

    // Spawn at rate (particles/sec)
    fgSpawnAccumulator += dt * FG_SETTINGS.spawnRate;
    while (fgSpawnAccumulator >= 1) {
        spawnFgParticle();
        fgSpawnAccumulator -= 1;
    }

    // Update & recycle
    for (let i = fgParticles.length - 1; i >= 0; i--) {
        const spr = fgParticles[i];
        const p = spr.__p;

        p.age += dt;

        // Horizontal move + wrap
        spr.x += p.speed * dt;
        if (spr.x < -spr.width) spr.x = w + spr.width * 0.5;
        if (spr.x > w + spr.width) spr.x = -spr.width * 0.5;

        // Gentle sine drift around baseY with clamping
        p.phase += p.sineFreq * dt;
        spr.y = p.baseY + Math.sin(p.phase) * p.sineAmp;

        // Clamp Y only at the top - allow downward movement
        const half = spr.height * 0.5;
        const topLimit = yBandTop + half;
        if (spr.y < topLimit) spr.y = topLimit;

        // Lifetime alpha fade (ease-in-out-ish)
        const t = Math.min(p.age / p.life, 1);
        spr.alpha = smoothLerp(FG_SETTINGS.alphaStart, FG_SETTINGS.alphaEnd, t);

        // Recycle when dead
        if (p.age >= p.life) {
            fgContainer.removeChild(spr);
            fgParticles.splice(i, 1);
        }
    }
}

// Reset mesh vertices for a specific plane to fill the current canvas area
function resetMesh(plane, width, height) {
    if (!plane || !pixiApp) return;

    // Get the position buffer for vertex coordinates
    const posBuffer = plane.geometry.getBuffer('aVertexPosition');
    const positions = posBuffer.data; // Float32Array [x0,y0, x1,y1, ...]

    // Fill positions row-major to cover the entire canvas
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const vertexIndex = (row * COLS + col) * 2; // Each vertex has x,y coordinates

            // Calculate normalized position (0 to 1)
            const x = col / (COLS - 1);
            const y = row / (ROWS - 1);

            // Map to canvas coordinates
            positions[vertexIndex] = x * width;     // x coordinate
            positions[vertexIndex + 1] = y * height; // y coordinate
        }
    }

    // Update the buffer to apply changes
    posBuffer.update();

    console.log(`Mesh reset: ${COLS}x${ROWS} grid covering ${width}x${height} canvas`);
}

// Reset mesh vertices in local texture coordinates (not full-canvas)
function resetMeshLocal(plane) {
    if (!plane || !plane.texture) return;

    const posBuffer = plane.geometry.getBuffer('aVertexPosition');
    const positions = posBuffer.data;
    const texture = plane.texture;

    // Layout vertices in the plane's LOCAL space using the texture size
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const vertexIndex = (row * COLS + col) * 2;
            const x = (col / (COLS - 1)) * texture.width;
            const y = (row / (ROWS - 1)) * texture.height;
            positions[vertexIndex] = x;
            positions[vertexIndex + 1] = y;
        }
    }
    posBuffer.update();

    console.log(`Mesh reset local: ${COLS}x${ROWS} grid covering ${texture.width}x${texture.height} texture`);
}

// Ensure Pixi-related arrays are sized to match poses.length
function resizePixiPersonArrays(numPersons) {
    // Extend arrays if we have more people
    while (planes.length < numPersons) {
        planes.push(null);
        planeContainers.push(null);
        planePosBufs.push(null);
        planePoseType.push("Neutral");
        lastVertexPositions.push({});
        anchorPos.push({ x: 0, y: 0 });
        anchorScale.push(1);
    }

    // Truncate arrays if we have fewer people
    if (planes.length > numPersons) {
        // Remove extra planes and containers from stage
        for (let i = numPersons; i < planes.length; i++) {
            if (planeContainers[i] && planeContainers[i].parent) {
                planeContainers[i].parent.removeChild(planeContainers[i]);
            }
        }
        planes = planes.slice(0, numPersons);
        planeContainers = planeContainers.slice(0, numPersons);
        planePosBufs = planePosBufs.slice(0, numPersons);
        planePoseType = planePoseType.slice(0, numPersons);
        lastVertexPositions = lastVertexPositions.slice(0, numPersons);
        anchorPos = anchorPos.slice(0, numPersons);
        anchorScale = anchorScale.slice(0, numPersons);
    }
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

// Create a plane for a specific person if it doesn't exist
function ensurePlaneForPerson(personIndex) {
    if (!planes[personIndex]) {
        // Create container for positioning and scaling
        planeContainers[personIndex] = new PIXI.Container();
        meshesContainer.addChild(planeContainers[personIndex]);

        // Create plane with default texture (will be switched based on pose)
        planes[personIndex] = new PIXI.SimplePlane(primeTex, COLS, ROWS);
        planes[personIndex].alpha = 1;
        planes[personIndex].blendMode = MESH_BLEND_MODE;

        // Add plane to container
        planeContainers[personIndex].addChild(planes[personIndex]);

        // Center the plane in the container (local coordinates)
        planes[personIndex].position.set(-primeTex.width/2, -primeTex.height/2);

        // Cache position buffer for performance
        planePosBufs[personIndex] = planes[personIndex].geometry.getBuffer('aVertexPosition');

        // Initialize mesh vertices in local texture coordinates
        resetMeshLocal(planes[personIndex]);

        console.log(`Created plane for person ${personIndex + 1}`);
    }

    // Ensure lastVertexPositions[personIndex] exists
    if (!lastVertexPositions[personIndex]) {
        lastVertexPositions[personIndex] = {};
    }

    // Initialize last vertex positions cache for the four tracked vertices if not already done
    if (planePosBufs[personIndex]) {
        const trackedVertices = [POSE_VERTEX_MAP.left_shoulder, POSE_VERTEX_MAP.right_shoulder,
                                POSE_VERTEX_MAP.left_hip, POSE_VERTEX_MAP.right_hip];

        trackedVertices.forEach(vertexIndex => {
            if (!lastVertexPositions[personIndex][vertexIndex]) {
                const positions = planePosBufs[personIndex].data;
                const bufferIndex = vertexIndex * 2;
                lastVertexPositions[personIndex][vertexIndex] = {
                    x: positions[bufferIndex],
                    y: positions[bufferIndex + 1]
                };
            }
        });
    }
}

// Create debug markers for specific vertices (14, 15, 26, 27)
function createDebugMarkers() {
    if (!pixiApp) return;

    // Clear any existing markers
    debugMarkers.forEach(marker => {
        if (marker.parent) {
            marker.parent.removeChild(marker);
        }
    });
    debugMarkers = [];

    // Create markers for vertices 14, 15, 26, 27
    const debugVertices = [14, 15, 26, 27];

    debugVertices.forEach((vertexIndex, i) => {
        // Create a small red circle for each debug vertex
        const marker = new PIXI.Graphics();
        marker.beginFill(0xFF0000, 0.8); // Red color with some transparency
        marker.drawCircle(0, 0, 4); // Small circle with radius 4
        marker.endFill();

        // Add label text
        const label = new PIXI.Text(`P${vertexIndex}`, {
            fontSize: 10,
            fill: 0xFFFFFF,
            stroke: 0x000000,
            strokeThickness: 1
        });
        label.anchor.set(0.5);
        label.y = -8; // Position above the circle
        marker.addChild(label);

        // Add to stage
        pixiApp.stage.addChild(marker);
        debugMarkers.push(marker);

        console.log(`Created debug marker for vertex ${vertexIndex}`);
    });
}

// Update debug marker positions based on first visible plane's mesh vertices
function updateDebugMarkers() {
    // Find the first visible plane for debug markers
    let activePlane = null;
    for (let i = 0; i < planes.length; i++) {
        if (planes[i] && planes[i].visible) {
            activePlane = planes[i];
            break;
        }
    }

    if (!activePlane || debugMarkers.length === 0) return;

    // Get the position buffer from the first visible plane
    const posBuffer = activePlane.geometry.getBuffer('aVertexPosition');
    const positions = posBuffer.data;

    // Update positions for vertices 14, 15, 26, 27
    const debugVertices = [14, 15, 26, 27];

    debugVertices.forEach((vertexIndex, i) => {
        if (debugMarkers[i]) {
            const x = positions[vertexIndex * 2];
            const y = positions[vertexIndex * 2 + 1];

            // Convert local coordinates to global coordinates
            const globalPos = activePlane.toGlobal(new PIXI.Point(x, y));

            debugMarkers[i].x = globalPos.x;
            debugMarkers[i].y = globalPos.y;
        }
    });
}

// Linear interpolation function for smoothing (renamed to avoid p5 conflict)
function smoothLerp(a, b, t) {
    return a + (b - a) * t;
}

// Update PixiJS mesh vertices for a specific person based on body pose keypoints
function updatePixiWarpFromPose(personIndex, pose, scaleX, scaleY) {
    if (!planes[personIndex] || !pose) return;

    // Extract required keypoints by name
    const leftShoulder = pose.keypoints.find((k) => k.name === "left_shoulder");
    const rightShoulder = pose.keypoints.find((k) => k.name === "right_shoulder");
    const leftHip = pose.keypoints.find((k) => k.name === "left_hip");
    const rightHip = pose.keypoints.find((k) => k.name === "right_hip");

    // Confidence check: skip if any keypoint is missing or has low confidence
    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return;
    if (leftShoulder.confidence < 0.3 || rightShoulder.confidence < 0.3 ||
        leftHip.confidence < 0.3 || rightHip.confidence < 0.3) return;

    // Get the position buffer for this person's plane
    const posBuffer = planePosBufs[personIndex];
    const positions = posBuffer.data;

    // Define the four keypoints we're tracking
    const keypoints = [
        { keypoint: leftShoulder, vertexIndex: POSE_VERTEX_MAP.left_shoulder },
        { keypoint: rightShoulder, vertexIndex: POSE_VERTEX_MAP.right_shoulder },
        { keypoint: leftHip, vertexIndex: POSE_VERTEX_MAP.left_hip },
        { keypoint: rightHip, vertexIndex: POSE_VERTEX_MAP.right_hip }
    ];

    // Update each vertex position
    keypoints.forEach(({ keypoint, vertexIndex }) => {
        // Convert from p5 space to screen space using scale factors
        const sx = keypoint.x * scaleX;
        const sy = keypoint.y * scaleY;

        // Convert from screen coordinates to plane local coordinates
        const localPos = planes[personIndex].toLocal(new PIXI.Point(sx, sy));

        // Apply dead-zone and smoothing to reduce jitter
        let targetX = localPos.x;
        let targetY = localPos.y;

        if (lastVertexPositions[personIndex][vertexIndex]) {
            const last = lastVertexPositions[personIndex][vertexIndex];

            // Apply dead-zone for tiny changes
            if (Math.abs(targetX - last.x) < DEAD_ZONE_PX) targetX = last.x;
            if (Math.abs(targetY - last.y) < DEAD_ZONE_PX) targetY = last.y;

            // Smooth the movement to reduce jitter
            targetX = smoothLerp(last.x, targetX, SMOOTHING_FACTOR);
            targetY = smoothLerp(last.y, targetY, SMOOTHING_FACTOR);
        }

        // Write smoothed position to buffer (each vertex has x,y coordinates)
        const bufferIndex = vertexIndex * 2;
        positions[bufferIndex] = targetX;     // x coordinate
        positions[bufferIndex + 1] = targetY; // y coordinate

        // Update cache for next frame
        lastVertexPositions[personIndex][vertexIndex] = { x: targetX, y: targetY };
    });

    // Update the buffer once after all four assignments
    posBuffer.update();
}

/*
===========================================================
DRAWING
This section is responsible for rendering the mirrored video
feed on the canvas, visualizing detected poses, and drawing
skeletons and keypoints for all participants. It also displays
per-person stickers anchored to shoulders.
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
    resizePixiPersonArrays(poses.length);

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

    // Process each person's pose and update PixiJS planes immediately
    for (let i = 0; i < poses.length; i++) {
        let pose = poses[i];
        let poseType = personStates[i]; // Get the analyzed pose state

        // Extract keypoints for confidence check
        const leftShoulder = pose.keypoints.find((k) => k.name === "left_shoulder");
        const rightShoulder = pose.keypoints.find((k) => k.name === "right_shoulder");
        const leftHip = pose.keypoints.find((k) => k.name === "left_hip");
        const rightHip = pose.keypoints.find((k) => k.name === "right_hip");

        // Check if we have valid keypoints with good confidence
        const hasValidKeypoints = leftShoulder && rightShoulder && leftHip && rightHip &&
                                 leftShoulder.confidence >= 0.3 && rightShoulder.confidence >= 0.3 &&
                                 leftHip.confidence >= 0.3 && rightHip.confidence >= 0.3;

        if (poseType === "Neutral" || !hasValidKeypoints) {
            // Hide plane for neutral pose or low confidence
            if (planeContainers[i]) {
                planeContainers[i].visible = false;
            }
        } else {
            // Show plane and set appropriate texture
            ensurePlaneForPerson(i);

            // Switch texture based on pose type (no random selection)
            const newTexture = (poseType === "Prime") ? primeTex : jesusTex;
            if (planes[i].texture !== newTexture) {
                planes[i].texture = newTexture;
                resetMeshLocal(planes[i]); // Reset mesh for new texture
            }

            planeContainers[i].visible = true;
            planePoseType[i] = poseType;

            // Compute per-person anchor and scale each frame (torso offset positioning)
            const cx = ((leftShoulder.x + rightShoulder.x) / 2) * scaleX;
            const cyShoulder = ((leftShoulder.y + rightShoulder.y) / 2) * scaleY;
            const cyHip = ((leftHip.y + rightHip.y) / 2) * scaleY;
            const cyNavel = cyShoulder + TORSO_OFFSET_FACTOR * (cyHip - cyShoulder);
            const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x) * scaleX;

            // Use the same factor as stickers (5.5) to set the plane width in screen pixels
            const targetWidth = shoulderWidth * 5.5;
            const scaleFactor = targetWidth / planes[i].texture.width;

            // Apply smoothing and dead-zone to reduce jitter
            const rawX = cx;
            const rawY = cyNavel;
            const rawScale = scaleFactor;

            // Dead-zone for position
            const prevX = anchorPos[i].x;
            const prevY = anchorPos[i].y;
            const dx = Math.abs(rawX - prevX);
            const dy = Math.abs(rawY - prevY);
            const targetX = (dx < DEAD_ZONE_PX) ? prevX : rawX;
            const targetY = (dy < DEAD_ZONE_PX) ? prevY : rawY;

            // Dead-zone for scale
            const prevS = anchorScale[i];
            const ds = Math.abs(rawScale - prevS);
            const targetS = (ds < SCALE_DEAD) ? prevS : rawScale;

            // Smoothing (lerp) for position/scale
            const smoothX = smoothLerp(prevX, targetX, ANCHOR_SMOOTH);
            const smoothY = smoothLerp(prevY, targetY, ANCHOR_SMOOTH);
            const smoothS = smoothLerp(prevS, targetS, SCALE_SMOOTH);

            // Write back caches
            anchorPos[i].x = smoothX;
            anchorPos[i].y = smoothY;
            anchorScale[i] = smoothS;

            // Apply smoothed transform to the container (anchored at navel)
            planeContainers[i].position.set(smoothX, smoothY);
            planeContainers[i].scale.set(smoothS);

            // Update mesh warp for this person
            updatePixiWarpFromPose(i, pose, scaleX, scaleY);
        }
    }

    // Process per-person state changes and debounce (for p5 stickers)
    for (let i = 0; i < poses.length; i++) {
        processPersonStateChange(i);
    }

    // Draw per-person stickers anchored to shoulders (only if no Pixi planes are visible)
    let anyPixiPlaneVisible = false;
    for (let i = 0; i < planeContainers.length; i++) {
        if (planeContainers[i] && planeContainers[i].visible) {
            anyPixiPlaneVisible = true;
            break;
        }
    }

    // Only draw p5 stickers if no Pixi planes are visible (avoid double imagery)
    // Stickers are currently disabled via USE_P5_STICKERS = false
    if (USE_P5_STICKERS && !anyPixiPlaneVisible) {
        for (let i = 0; i < poses.length; i++) {
            drawPersonSticker(i, poses[i], scaleX, scaleY);
        }
    }

    // Update debug markers for PixiJS mesh vertices
    updateDebugMarkers();
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
anchored to shoulder positions.
===========================================================
*/

// Draw sticker for a specific person anchored to their shoulders
function drawPersonSticker(personIndex, pose, scaleX, scaleY) {
    if (personIndex >= personOverlayImages.length) return;

    let overlayImage = personOverlayImages[personIndex];
    if (!overlayImage) return; // No image to draw

    // Get shoulder keypoints
    let leftShoulder = pose.keypoints.find((k) => k.name === "left_shoulder");
    let rightShoulder = pose.keypoints.find((k) => k.name === "right_shoulder");

    // Safety check for shoulder keypoints
    if (!leftShoulder || !rightShoulder) return;
    if (leftShoulder.confidence < 0.3 || rightShoulder.confidence < 0.3) return;

    // Calculate anchor point (midpoint between shoulders)
    let cx = (leftShoulder.x + rightShoulder.x) / 2;
    let cy = (leftShoulder.y + rightShoulder.y) / 2;

    // Calculate shoulder width for scaling
    let shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

    // Scale the sticker relative to shoulder width
    let w = 4.5 * shoulderWidth;
    let h = w * (overlayImage.height / overlayImage.width);

    // Apply scaling factors for fullscreen
    cx *= scaleX;
    cy *= scaleY;
    w *= scaleX;
    h *= scaleY;

    // Draw the sticker centered at the shoulder midpoint
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
