# Between Verses

An interactive installation where poses trigger body-anchored images that follow your movement — blending Brazilian and Swiss landscapes in real time.

## 🎯 Overview

Two-person simultaneous pose detection with immediate visual feedback:

- **Prime Tower Pose**: Both hands on top of your head, close together → shows `Prime_1.png`
- **Jesus Pose**: Arms extended horizontally to the sides → shows `Jesus_1.png`

Each person gets their own p5.js sticker overlay anchored near the navel, scaled relative to shoulder width. The system uses EMA (Exponential Moving Average) smoothing to reduce jitter in both skeleton tracking and sticker positioning.

## ✨ Features

- **Two-Person Simultaneous Support**: Independent tracking and overlays per person
- **Real-Time Pose Detection**: ml5.js BodyPose with real-time response (light stabilization via STABLE_FRAMES)
- **Navel-Anchored Stickers**: Images positioned using shoulders→hips interpolation via `NAVEL_BLEND` factor
- **EMA Smoothing**: Reduces jitter in skeleton lines and sticker scale (`SMOOTH_POS`, `SMOOTH_SCALE`)
- **CSS Color Integration**: Skeleton lines use `--bs-pink`, keypoint markers use `--bs-turquoise`
- **Interactive Controls**: Fullscreen, Hide Video, Hide Tracking
- **Local Assets**: Images from `/generated` folder (**Prime_1.png**, **Jesus_1.png**)

## 🛠️ Tech Stack

- **p5.js**: Canvas rendering, video capture, and sticker drawing
- **ml5.js**: Real-time body pose detection
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

### Pose Detection
- **Prime Tower**: Wrists above nose level, horizontally close together (within 100px)
- **Jesus**: Arms extended horizontally (wrist further from shoulder than elbow, spread to sides)

### Per-Person Pipeline
1. **Detect pose type** per person each frame
2. **Calculate anchor position**:
   - Horizontal: midpoint between shoulders
   - Vertical: interpolated between shoulders and hips using `NAVEL_BLEND` (default 0.60)
   - Falls back to shoulder midpoint if hips aren't detected with confidence ≥ 0.3
3. **Calculate scale**: width = shoulderWidth × 4.5 (EMA-smoothed)
4. **Apply EMA smoothing**: All keypoints and scalar values are smoothed to reduce jitter
5. **Draw sticker**: p5.js image centered on anchor position

### Identity Stabilization
When two people are present, the system tracks them independently. For more stable identity across frames (optional enhancement), you can sort people left-to-right by shoulder midpoint X position before processing.

## 📁 Project Structure

```
Between-Verses/
├── index.html              # Main application
├── script.js               # p5.js + ml5.js logic
├── styles.css              # Custom styling with CSS variables
├── generated/              # Local overlay images
│   ├── Jesus_1.png         # Jesus pose image
│   ├── Jesus_1.svg         # Jesus pose SVG
│   ├── Prime_1.png         # Prime Tower pose image
│   └── Prime_1.svg         # Prime Tower pose SVG
├── jesus.svg               # Jesus pose instruction icon
├── prime.svg               # Prime Tower pose instruction icon
├── favicon.png             # Website icon
└── README.md               # This file
```

## 🔧 Configuration

### Key Constants

#### Pose Detection
- **Confidence threshold**: 0.3 (minimum keypoint confidence)
- **Prime pose threshold**: 100px (horizontal distance between wrists)
- **Jesus pose spread threshold**: 30px (wrist distance from shoulder)

#### Sticker Positioning
- **`NAVEL_BLEND`**: 0.60 (0 = shoulders, 1 = hips, 0.60 = near navel)
  - Adjustable at runtime via `window.NAVEL_BLEND` in browser console
  - Suggested range: 0.55–0.65
- **Width factor**: 4.5 (sticker width = shoulderWidth × 4.5)

#### EMA Smoothing
- **`SMOOTH_POS`**: 0.80 (0..1, higher = smoother skeleton, more lag)
  - Applied to all keypoint positions for skeleton lines and markers
- **`SMOOTH_SCALE`**: 0.85 (0..1, higher = smoother sticker size, more lag)
  - Applied to shoulder width calculation for sticker scaling

#### State Management
- **`STABLE_FRAMES`**: 12 (frames to wait before considering pose state stable)


## 🎮 Controls

| Control | Function |
|---------|----------|
| **Fullscreen** | Expands video, tracking, and stickers to fill the screen |
| **Hide Video** | Toggle video feed visibility |
| **Hide Tracking** | Toggle skeleton lines and keypoints |
| **ESC Key** | Exit fullscreen mode |

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
- Check pose criteria:
  - **Prime**: Hands on head, close together (within 100px horizontally)
  - **Jesus**: Arms extended horizontally to the sides
- Ensure stable pose holding (system responds immediately, no debouncing)
- If hips aren't detected, sticker will fall back to shoulder midpoint

### Sticker Positioning
- Adjust `window.NAVEL_BLEND` in browser console:
  ```javascript
  window.NAVEL_BLEND = 0.55;  // Move sticker higher (closer to shoulders)
  window.NAVEL_BLEND = 0.65;  // Move sticker lower (closer to hips)
  ```
- Verify shoulder keypoints have confidence ≥ 0.3
- Check that images exist in `/generated` folder (Prime_1.png, Jesus_1.png)

### Identity Stabilization (Two People)
If two people swap positions frequently:
- Optional: Sort people left-to-right by shoulder midpoint X position before processing
- This ensures consistent personIndex assignment across frames

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [p5.js](https://p5js.org/) - Creative coding library
- [ml5.js](https://ml5js.org/) - Machine learning for the web
- [Bootstrap](https://getbootstrap.com/) - CSS framework

---

**Experience the future of interactive pose tracking! 🎨✨👥**
