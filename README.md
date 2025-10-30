# Between Verses

An interactive pose-driven visual experience. It combines camera input, MediaPipe-based pose detection, and a layered renderer: Background (Canvas2D), PixiJS buildings, Nature particles/overlays, and PixiJS birds.

## Overview

- Live camera feed is drawn to the base canvas.
- MediaPipe detects a pose name (e.g., star, arms_out).
- The app maps poses to images/particles/birds, then updates each layer.
- PixiJS layers render via their own canvases stacked over the base.

## Architecture

- `app.js`: Bootstraps the app, config, pose detection, layers, and UI.
- `layers/LayerManager.js`: Manages order and rendering of layers.
- Layers (implement `LayerInterface`):
  - `BackgroundLayer.js`: Composites camera/background on the base canvas.
  - `PixiSpriteLayer.js`: Renders building sprites/meshes with Pixi v8.
  - `NatureLayer.js`: Renders nature particles in a region (usually bottom third).
  - `BirdLayer.js`: Renders bird sprites flying across the top third.

All Pixi layers create an absolutely positioned `<canvas>` and add it to the app’s overlay container. Layer z-order is controlled by the constructor `zIndex`.

## Data flow

1. MediaPipe → pose landmarks → `PoseDetector` → logical pose name.
2. `ExperienceApp.updateTextureForPose(name)` selects assets from `experience-config.json`.
3. Layers are notified:
   - PixiSpriteLayer gets building texture/config.
   - NatureLayer gets overlay + particle texture/config.
   - BirdLayer receives the pose to choose species and start spawning.

## Configuration and assets

- `experience-config.json`: central pose → assets mapping.
  - building textures → `images/`
  - background images → `bg-images/`
  - particle/bird textures → `front-images/`
- The app preloads referenced assets and passes the chosen ones to layers.

## Layer specifics (what to modify)

BackgroundLayer
- Mostly static; sets clear color and draws the camera feed.

PixiSpriteLayer
- Togglable via UI; used for building visuals.
- Set pose config via `setPoseConfig()` from `experience-config.json`.

NatureLayer
- Region: defaults depend on `animationType` (e.g., floating → bottom third).
- Particle sizing:
  - `settings.pixelHeight` sets average on-screen height (in pixels).
  - Final scale = `pixelHeight / textureHeight * baseScale * jitter`.
  - If `pixelHeight` is unset, uses `baseScale` + `scaleJitter`.

BirdLayer
- Region: top third of the Pixi screen.
- Pose → species: `poseBirdMappings`.
- Species config: `{ texture, speed, scale, wingFlap }` in `birdTypes`.
- Bird sizing:
  - `settings.pixelHeight` sets average on-screen height (in pixels).
  - Final scale = `pixelHeight / textureHeight * species.scale`.
- Spawning: slightly offscreen left/right, flies across the region.

## Controls and debug

- Auto Tracking: toggles pose detection.
- Building Mesh (Pixi): toggle PixiSpriteLayer.
- Nature Overlay: toggle nature particles overlay.
- Pose Skeleton / Landmarks: toggle tracking visualization.
- Bird Region Overlay: shows cyan (canvas) and magenta (top-third region); programmatic API: `birdLayer.setDebugEnabled(bool)`.
- Fullscreen: scales UI/canvases to screen.

## Common edits (cheat sheet)

- Change birds for a pose: `BirdLayer.poseBirdMappings`.
- Change bird image/relative size: `BirdLayer.birdTypes[...].texture/scale`.
- Change all bird sizes: `BirdLayer.settings.pixelHeight`.
- Change flower/particle size: `NatureLayer.settings.pixelHeight` (plus `baseScale/jitter` as needed).
- Change speeds: `BirdLayer.settings.flightSpeedMin/Max` and species `speed`.
- Reorder layers: pass `zIndex` when constructing layers in `app.js`.

## Project structure (relevant parts)

```
expolat-prototype/
├── app.html, app.js
├── experience-config.json
├── layers/
│   ├── LayerInterface.js
│   ├── LayerManager.js
│   ├── BackgroundLayer.js
│   ├── PixiSpriteLayer.js
│   ├── NatureLayer.js
│   └── BirdLayer.js
├── images/        # buildings/mesh
├── bg-images/     # backgrounds
└── front-images/  # nature particles + birds
```

## Setup

```bash
python3 -m http.server 8000
# open http://localhost:8000/app.html
```
Allow camera access.

## Troubleshooting

Birds not visible
- Enable “Bird Region Overlay” to verify region/canvas.
- Check console for texture load logs and 404s.
- Temporarily increase `flightSpeedMin/Max` to ensure offscreen spawns enter.

Nature particles not visible
- Ensure the pose’s overlay contains `particles.enabled: true` and a valid `texture`.

Canvas misalignment
- Cyan outline should match visible Pixi canvas. Ensure `onResize` is called and no CSS clipping occurs.

## License

MIT

## Debugging visuals (cyan/magenta)

- BirdLayer draws a debug overlay on its Pixi stage:
  - Cyan: full Pixi canvas
  - Magenta: active bird region (top third)
  - Green: canvas center crosshair
- Toggle in UI: “Bird Region Overlay” checkbox, just below the tracking/pose landmark controls.
- Programmatic toggle: `birdLayer.setDebugEnabled(true|false)`.

## Controls (UI)

- Auto Tracking ON/OFF
- PixiJS meshes ON/OFF
- BirdLayer ON/OFF
- Nature Overlay ON/OFF
- Pose Skeleton / Landmarks
- Bird Region Overlay (debug)
- Fullscreen

## Common changes and where to make them

- Change which birds appear for a pose: `BirdLayer.poseBirdMappings`
- Change a bird’s image: `BirdLayer.birdTypes[species].texture`
- Change bird size globally: `BirdLayer.settings.pixelHeight`
- Change bird size per species: `BirdLayer.birdTypes[species].scale`
- Change bird speeds: `BirdLayer.settings.flightSpeedMin/Max` and `birdTypes[...].speed`
- Change nature particle for a pose: `experience-config.json → imageMappings → <pose>.particle`
- Move Pixi canvases above/below others: pass `zIndex` in layer constructor

## Asset paths

- Buildings/meshes: `images/`
- Background images: `bg-images/`
- Birds/nature particles: `front-images/`

Ensure these folders are served by your dev server. If you use a CDN/base path, set `assetBaseUrl` in `BirdLayer` config.

## Troubleshooting

- Birds don’t appear
  - Check console: textures should log as loaded
  - Enable “Bird Region Overlay” to confirm region is on-screen
  - Temporarily raise `flightSpeedMin/Max` so offscreen spawns enter quickly
  - Verify `front-images/*.png` are accessible (no 404)

- Canvas looks misaligned
  - Cyan overlay outlines full Pixi canvas; if it doesn’t match what you see, verify the app calls `birdLayer.onResize(w,h)` on resize and that `overlayCanvas`/video container CSS isn’t clipping.

- Nature particles not visible
  - Confirm the overlay for the current pose contains `particles.enabled: true` and a valid `texture` path

## Setup

```bash
python3 -m http.server 8000
# Open http://localhost:8000/app.html
```

Allow camera access when prompted.

## Notes

- No external APIs; all assets are local
- MediaPipe runs in-browser; pose data is not sent elsewhere

## License

MIT
