# Between Verses

An interactive installation where poses trigger body-anchored images that follow your movement — blending Brazilian and Swiss landscapes in real time.

## 🎯 Overview

Multi-person simultaneous pose detection with immediate visual feedback and smooth organic outline visualization:

- **Star**: Arms and legs spread wide like a starfish → shows `Cathedral.png`
- **Arms Up**: Both arms raised above head → shows `Prime.png`
- **Side Arms**: Victory/celebration pose (elbows out, wrists up) → shows `Grossmuenster.png`
- **Zigzag**: One arm up, one arm down (asymmetric) → shows `Copan.png`
- **Arms Out**: T-pose with arms extended horizontally → shows `Jesus.png`
- **Rounded**: Hands on hips (elbows out) → shows `Kappell.png`
- **Neutral**: Default relaxed pose → no overlay

Each person gets their own p5.js sticker overlay anchored near the navel, scaled relative to shoulder width. The system uses EMA (Exponential Moving Average) smoothing to reduce jitter in both skeleton tracking and sticker positioning, plus an optional organic outline with customizable glow effect.

## ✨ Features

- **Multi-Person Simultaneous Support**: Independent tracking and overlays per person
- **7 Pose Detection System**: Star, Arms Up, Side Arms, Zigzag, Arms Out, Rounded, and Neutral
- **Real-Time Pose Detection**: ml5.js BodyPose with real-time response (light stabilization via STABLE_FRAMES)
- **SelfieSegmentation Silhouette**: Optional body silhouette visualization using ml5.js BodySegmentation
- **Organic Outline with Glow**: Smooth body outline with optional multi-layer glow effect (customizable via `useGlow` flag)
- **Navel-Anchored Stickers**: Images positioned using shoulders→hips interpolation via `NAVEL_BLEND` factor
- **EMA Smoothing**: Reduces jitter in skeleton lines, outline, and sticker scale (`SMOOTH_POS`, `SMOOTH_SCALE`)
- **CSS Color Integration**: Skeleton lines use `--bs-pink`, keypoint markers use `--bs-turquoise`, outline uses light grey
- **Interactive Controls**: Fullscreen, Hide Video, Toggle Tracking, Toggle Segmentation, Toggle Line
- **Local Assets**: Six pose-specific images from `/generated` folder

## 🛠️ Tech Stack

- **p5.js**: Canvas rendering, video capture, sticker drawing, and organic outline visualization
- **ml5.js**: Real-time body pose detection (BodyPose) and silhouette segmentation (SelfieSegmentation)
- **Bootstrap 5**: UI framework with custom CSS

## 🚀 Getting Started

### 1. Clone and Setup
```bash
git clone https://github.com/linalopes/Between-Verses.git
cd Between-Verses
```

### 2. Start Local Server
```bash
python3 -m http.server 8000
```

### 3. Open Application
Navigate to `http://localhost:8000` and allow camera access.

**Requirements**: Modern browser with camera support. HTTPS not required for localhost.

**Note**: Video capture and pose detection (`video` and `detectStart`) may be gated behind a user gesture due to browser autoplay policies. Click or interact with the page if the camera doesn't start automatically.

## 🔒 Privacy

The webcam runs entirely in your browser; no video is sent to any server.

## 🎮 How It Works

### Pose Detection (Priority Order)
The system detects poses in priority order. The first matching pose is selected:

1. **Star**: Arms extended + spread + raised, legs spread wider than hips (ankle spread > hip width × 1.3)
2. **Arms Up**: Both wrists above nose level, arms extended and symmetric
3. **Side Arms**: Wrists above elbows and shoulders, elbows out (victory pose)
4. **Zigzag**: Asymmetric arms (one up, one down), height difference > shoulder width × 0.8
5. **Arms Out**: Arms extended horizontally (T-pose), wrists at shoulder level ± 60px
6. **Rounded**: Wrists at hip level, positioned inward near hips, elbows out
7. **Neutral**: Default state when no other pose matches

All poses require minimum confidence of 0.3 for critical keypoints (wrists, shoulders, nose).

### Per-Person Pipeline
1. **Detect pose type** per person each frame (7 poses in priority order)
2. **Render visualization layers** (toggleable):
   - **Segmentation**: Body silhouette from SelfieSegmentation (OFF by default)
   - **Line**: Smooth organic outline with optional glow effect (ON by default)
   - **Tracking**: Skeleton lines and keypoint dots (OFF by default)
3. **Calculate anchor position** for sticker:
   - Horizontal: midpoint between shoulders
   - Vertical: interpolated between shoulders and hips using `NAVEL_BLEND` (default 0.60)
   - Falls back to shoulder midpoint if hips aren't detected with confidence ≥ 0.3
4. **Calculate scale**: width = shoulderWidth × 4.5 (EMA-smoothed)
5. **Apply EMA smoothing**: All keypoints and scalar values are smoothed to reduce jitter
6. **Draw sticker**: p5.js image centered on anchor position (only for detected non-neutral poses)

### Identity Stabilization
When two people are present, the system tracks them independently. For more stable identity across frames (optional enhancement), you can sort people left-to-right by shoulder midpoint X position before processing.

## 📁 Project Structure

```
Between-Verses/
├── index.html              # Main application
├── script.js               # p5.js + ml5.js logic with 7-pose detection
├── styles.css              # Custom styling with CSS variables
├── generated/              # Local overlay images (pose-specific)
│   ├── Jesus.png           # Arms Out pose (T-pose)
│   ├── Prime.png           # Arms Up pose
│   ├── Cathedral.png       # Star pose
│   ├── Copan.png           # Zigzag pose
│   ├── Grossmuenster.png   # Side Arms pose
│   └── Kappell.png         # Rounded pose
├── jesus.svg               # Pose instruction icon
├── prime.svg               # Pose instruction icon
├── favicon.png             # Website icon
└── README.md               # This file
```

## 🔧 Configuration

### Key Constants

#### Pose Detection
- **Confidence threshold**: 0.3 (minimum keypoint confidence for wrists, shoulders, nose)
- **Arm extension ratio**: 1.6 (arm length vs forearm length)
- **Spread factor**: 0.3 × shoulder width (minimum distance for arms spread)
- **Symmetry threshold**: 60px (wrist height difference for symmetric poses)
- **Asymmetry factor**: 0.8 × shoulder width (wrist height difference for zigzag)

#### Sticker Positioning
- **`NAVEL_BLEND`**: 0.60 (0 = shoulders, 1 = hips, 0.60 = near navel)
  - Adjustable at runtime via `window.NAVEL_BLEND` in browser console
  - Suggested range: 0.55–0.65
- **Width factor**: 4.5 (sticker width = shoulderWidth × 4.5)

#### EMA Smoothing
- **`SMOOTH_POS`**: 0.80 (0..1, higher = smoother skeleton/outline, more lag)
  - Applied to all keypoint positions for skeleton lines, markers, and organic outline
- **`SMOOTH_SCALE`**: 0.85 (0..1, higher = smoother sticker size, more lag)
  - Applied to shoulder width calculation for sticker scaling

#### State Management
- **`STABLE_FRAMES`**: 12 (frames to wait before considering pose state stable)

#### Visual Rendering
- **Line/Outline Glow**: Controlled via `useGlow` parameter in `drawOrganicOutline()` (default: `true`)
  - `useGlow = true`: Multi-layer glow effect (4 layers with varying opacity and width)
  - `useGlow = false`: Simple solid line
  - To change: Edit line 239 in `script.js` to pass `false` as 4th parameter
- **Default Visibility**: Line ON, Tracking OFF, Segmentation OFF


## 🎮 Controls

| Control | Function | Default State |
|---------|----------|---------------|
| **Fullscreen** | Expands video, tracking, and stickers to fill the screen | Normal view |
| **Hide Video** | Toggle video feed visibility | Video visible |
| **Show/Hide Tracking** | Toggle skeleton lines and keypoint dots | OFF (hidden) |
| **Show/Hide Segmentation** | Toggle body silhouette overlay | OFF (hidden) |
| **Show/Hide Line** | Toggle organic body outline with optional glow | ON (visible) |
| **ESC Key** | Exit fullscreen mode | - |

## 🐛 Troubleshooting

### Jitter/Instability
- Increase `SMOOTH_POS` (0.80 → 0.85) for smoother skeleton tracking
- Increase `SMOOTH_SCALE` (0.85 → 0.90) for smoother sticker size changes
- Improve lighting and camera positioning
- Ensure full body visibility (stand 2-3 meet from camera)

### Camera Issues
- **Autoplay blocked**: Click or interact with the page to start camera
- Check browser permissions (allow camera access when prompted)
- Use localhost or HTTPS for camera access
- Ensure good lighting and full body visibility

### Pose Detection Problems
- Verify both shoulders are visible with good confidence (>0.3)
- Check pose criteria (in priority order):
  1. **Star**: Full body must be visible including ankles; legs spread wide
  2. **Arms Up**: Wrists clearly above nose level, arms extended
  3. **Side Arms**: Victory pose - elbows bent outward, wrists above shoulders
  4. **Zigzag**: One arm clearly up, one clearly down (asymmetric)
  5. **Arms Out**: T-pose - arms horizontal at shoulder level
  6. **Rounded**: Hands positioned near hips, elbows bent outward
- Poses are detected in priority order - first match wins
- Ensure stable pose holding (12-frame stabilization via STABLE_FRAMES)
- If hips aren't detected, sticker will fall back to shoulder midpoint
- View detected state at bottom of screen ("Person 1: [pose_name]")

### Sticker Positioning
- Adjust `window.NAVEL_BLEND` in browser console:
  ```javascript
  window.NAVEL_BLEND = 0.55;  // Move sticker higher (closer to shoulders)
  window.NAVEL_BLEND = 0.65;  // Move sticker lower (closer to hips)
  ```
- Verify shoulder keypoints have confidence ≥ 0.3
- Check that images exist in `/generated` folder:
  - `Jesus.png` (Arms Out), `Prime.png` (Arms Up), `Cathedral.png` (Star)
  - `Copan.png` (Zigzag), `Grossmuenster.png` (Side Arms), `Kappell.png` (Rounded)

### Line/Outline Visualization
- **Line not showing**: Click "Show Line" button to enable organic outline
- **Glow too subtle/intense**:
  - Edit `useGlow` parameter in `drawOrganicOutline()` call (script.js:239)
  - Adjust alpha values in glow layers (script.js:380-401)
- **Line color**: Change `LINECOLOR` initialization (script.js:118)
- **Line too thick/thin**: Adjust `baseWeight` multiplier (script.js:374)

### Identity Stabilization (Multi-Person)
If people swap positions frequently:
- Optional: Sort people left-to-right by shoulder midpoint X position before processing
- This ensures consistent personIndex assignment across frames

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [p5.js](https://p5js.org/) - Creative coding library
- [ml5.js](https://ml5js.org/) - Machine learning for the web
- [Bootstrap](https://getbootstrap.com/) - CSS framework

---

**Experience the future of interactive pose tracking with organic visualization and multi-pose detection! 🎨✨👥**
