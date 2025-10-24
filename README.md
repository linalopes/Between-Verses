# Between Verses

An interactive pose detection experience with a simplified 3-layer rendering system: Background, PixiJS building mesh, and Nature overlays. Features real-time pose detection with MediaPipe integration.

## Overview

The system uses a clean 3-layer architecture:

1. **Background Layer** - Solid background canvas
2. **PixiJS Mesh Layer** - Building mesh that deforms with pose (shows prime.png texture)
3. **Nature Layer** - Pose-responsive nature overlays on top

**Pose Detection:**
- **Prime Tower**: Hands on head → shows building mesh
- **Cristo Redentor**: Arms extended → shows building mesh
- **Mountain/Warrior**: Various poses → triggers nature overlays (mountain.png, mountain.png, pantanal.png)

## ✨ Features

- **3-Layer Architecture**: Clean separation of Background, PixiJS Mesh, and Nature layers
- **Real-time Pose Detection**: MediaPipe integration for accurate body tracking
- **Mesh Deformation**: PixiJS v8 mesh with vertex manipulation based on pose landmarks
- **Building Mesh**: Always-visible building mesh that responds to poses
- **Nature Overlays**: Bottom-third nature scene overlays triggered by specific poses
- **Simplified Controls**: Toggle building mesh and nature overlays independently
- **Fullscreen Mode**: Immersive experience with ESC key to exit
- **Video Toggle**: Hide video feed to show only layers
- **Debug Interface**: Real-time pose state and mesh information display
- **Responsive Design**: Adaptive scaling for different screen sizes

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Rendering**: PixiJS v8 for mesh layer, Canvas2D for other layers
- **Pose Detection**: MediaPipe via CDN integration
- **Styling**: Bootstrap 5 with custom CSS
- **Images**: PNG/SVG files stored in `images/` folder

## 📋 Prerequisites

- Python 3 (for local web server)
- Modern web browser with camera access
- No external API keys required

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/linalopes/expolat-prototype.git
cd expolat-prototype
```

### 2. Start the Web Server
```bash
python3 -m http.server 8000
```

### 3. Open the Application
Navigate to `http://localhost:8000` in your browser and allow camera access.

## 🎯 How to Play

1. **Allow Camera Access**: Grant permission when prompted
2. **Position Yourself**: Stand in front of the camera with good lighting
3. **Strike a Pose**:
   - **Prime Tower**: Place both hands on top of your head, close together
   - **Jesus**: Extend your arms horizontally to the sides
4. **Watch the Magic**: Overlay stickers will appear anchored to your shoulders
5. **Multiple People**: The system supports multiple people with individual stickers
6. **Use Controls**:
   - **Fullscreen**: Click to enter immersive mode
   - **Hide Video**: Toggle to show only pose tracking
   - **Hide Tracking**: Toggle skeleton lines and keypoints for clean interface
   - **ESC Key**: Exit fullscreen mode

## 🎨 Pose Detection Logic

### Prime Tower Pose
- Both wrists are above the nose level
- Wrists are horizontally close together (within 100 pixels)

### Jesus Pose
- Arms are extended (wrist further from shoulder than elbow)
- Arms are spread horizontally (wrists to the sides of shoulders)
- Arms are roughly horizontal (elbow and wrist at similar heights)

## 🏗️ Architecture Overview

### 3-Layer Rendering System
- **Layer 1 - Background**: Solid color background canvas
- **Layer 2 - PixiJS Mesh**: Building mesh with pose-based deformation
- **Layer 3 - Nature**: Bottom-third nature overlays triggered by specific poses

### Pose Detection System
- **MediaPipe Integration**: Real-time pose landmark detection
- **Stability Checking**: 12-frame debouncing for reliable pose recognition
- **Layer Coordination**: Seamless communication between pose detection and rendering layers

## 📁 Project Structure

```
between-verses/
├── index.html              # Landing page
├── app.html                # Main application
├── segmentation.js         # Main application logic
├── experience-config.json  # Pose and texture configuration
├── layers/                 # 3-Layer system components
│   ├── LayerInterface.js   # Layer interface class
│   ├── BackgroundLayer.js  # Layer 1: Background rendering
│   ├── NatureLayer.js      # Layer 3: Nature scene overlays
│   ├── PixiMeshLayer.js    # Layer 2: PixiJS building mesh
│   └── LayerManager.js     # Layer coordination
├── images/                 # Texture and overlay images
│   ├── prime.png           # Building mesh texture
│   ├── prime.svg           # Prime pose icon
│   ├── cristoredentor.png  # Cristo pose icon
│   ├── mountain.png         # Alpine nature overlay
│   ├── mountain.png          # Waterfall nature overlay
│   ├── pantanal.png        # Wetland nature overlay
│   └── neutral.png         # Neutral state texture
├── package.json            # Project configuration
└── README.md               # This file
```

## 🔧 Configuration

### Pose Detection
- **Confidence Threshold**: 0.3 (30%)
- **Canvas Size**: 640x480 (original), scales in fullscreen
- **Keypoint Tracking**: Wrists, elbows, shoulders, nose
- **Stability Frames**: 12 frames for pose confirmation

### Layer Configuration
- **Background**: Solid white background (#ffffff)
- **Building Mesh**: 6x6 grid mesh with prime.png texture
- **Nature Overlays**: Bottom-third overlays with configurable opacity and blend modes

## 🐛 Troubleshooting

### Common Issues

**Camera not working:**
- Ensure HTTPS or localhost
- Check browser permissions
- Try refreshing the page

**Pose detection not accurate:**
- Improve lighting conditions
- Ensure full body is visible
- Stand 2-3 feet from camera
- Make sure both shoulders are visible

**Building mesh not appearing:**
- Check that images exist in `images/` folder
- Verify PixiJS loaded correctly (check console)
- Ensure "Building Mesh" checkbox is enabled

**Nature overlays not working:**
- Check pose detection is working (see debug info)
- Ensure "Nature Overlay" checkbox is enabled
- Verify pose is held steady for stability frames

## 🎮 Controls Reference

| Control | Function |
|---------|----------|
| **Building Mesh** | Toggle PixiJS building mesh visibility |
| **Nature Overlay** | Toggle nature overlays (bottom third) |
| **Pose Skeleton** | Toggle skeleton lines |
| **Pose Landmarks** | Toggle landmark dots |
| **Fullscreen** | Enter/exit fullscreen mode |
| **Hide Video** | Toggle video feed visibility |
| **ESC Key** | Exit fullscreen mode |

## 🔒 Security Notes

- No external API calls or data transmission
- All images are stored locally
- Camera access only used for pose detection
- No personal data is collected or stored

## 🚀 Deployment

For production deployment:

1. Set up a proper web server (not Python's simple server)
2. Enable HTTPS for camera access
3. Ensure all image files are properly served
4. Test with multiple people simultaneously

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with multiple people
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [p5.js](https://p5js.org/) - Creative coding library
- [ml5.js](https://ml5js.org/) - Machine learning for the web
- [Bootstrap](https://getbootstrap.com/) - CSS framework

## 📞 Support

If you encounter any issues or have questions, please:
1. Check the troubleshooting section
2. Review the browser console for errors
3. Open an issue on GitHub

---

**Have fun striking poses with friends! 🎨✨👥**
