# Code Optimization and Modularization Plan

## Current Architecture Analysis

### Strengths
1. **Layer-based architecture** - Good separation of concerns with LayerInterface base class
2. **Configuration-driven** - Poses and settings externalized in JSON
3. **Event-driven communication** - VideoLayer uses events for data flow

### Areas for Improvement

## 1. Performance Optimizations

### High Priority

#### 1.1 Rendering Pipeline
**Issue**: Multiple canvas contexts with `willReadFrequently: true` causing performance overhead
```javascript
// Current: app.js:9, :214
ctx = canvas.getContext('2d', { willReadFrequently: true });
```
**Solution**: Use offscreen canvases and reduce pixel data reads

#### 1.2 Pose Detection Throttling
**Issue**: Pose detection runs every frame without throttling (app.js:252-326)
**Solution**: Implement frame skipping and debouncing
```javascript
// Add pose detection throttle
const POSE_DETECTION_INTERVAL = 100; // ms
if (now - this.lastPoseDetection < POSE_DETECTION_INTERVAL) return;
```

#### 1.3 Texture Caching
**Issue**: Texture cache initialized but underutilized (app.js:64)
**Solution**: Implement proper texture preloading and caching strategy

#### 1.4 Memory Leaks
**Issue**: Event listeners added without cleanup (app.js:98-109)
**Solution**: Implement proper cleanup in destroy methods

### Medium Priority

#### 1.5 Canvas Operations
- Replace multiple `getImageData/putImageData` calls with single pass
- Use `OffscreenCanvas` for background processing
- Batch DOM updates

#### 1.6 Asset Loading
- Implement progressive loading for textures
- Add WebP/AVIF format support with fallbacks
- Use texture atlases for particles

## 2. Modularization Improvements

### 2.1 Separate Concerns

#### Create New Modules:

**PoseDetector.js**
```javascript
class PoseDetector {
  constructor(config) {
    this.detectionMethods = new Map();
    this.throttleMs = config.throttleMs || 100;
  }

  registerPose(name, detectionFn) { }
  detect(landmarks) { }
}
```

**TextureManager.js**
```javascript
class TextureManager {
  constructor() {
    this.cache = new Map();
    this.loaders = new Map();
  }

  async preloadTextures(manifest) { }
  getTexture(path) { }
}
```

**EffectsProcessor.js**
```javascript
class EffectsProcessor {
  constructor() {
    this.effects = new Map();
  }

  registerEffect(name, processor) { }
  async process(imageData, effectName, params) { }
}
```

**ConfigurationManager.js**
```javascript
class ConfigurationManager {
  constructor() {
    this.configs = new Map();
    this.validators = new Map();
  }

  async loadConfig(path) { }
  validate(config) { }
  merge(configs) { }
}
```

### 2.2 Refactor ExperienceApp Class

Split the monolithic ExperienceApp (1558 lines) into:

1. **AppCore.js** - Initialization and lifecycle
2. **UIController.js** - All UI interactions and controls
3. **RenderPipeline.js** - Frame rendering orchestration
4. **StateManager.js** - Application state management

### 2.3 Improve Layer System

**Enhancements:**
- Add layer composition strategies
- Implement layer pooling for dynamic layers
- Add async rendering support
- Create layer presets

## 3. Code Quality Improvements

### 3.1 Remove Dead Code
- Shoulder sticker code (commented but not removed)
- Unused effect methods (app.js:950-1018)
- Legacy pose detection methods

### 3.2 Consistent Error Handling
```javascript
class AppError extends Error {
  constructor(message, code, context) {
    super(message);
    this.code = code;
    this.context = context;
  }
}
```

### 3.3 Type Safety
Add JSDoc types or migrate to TypeScript:
```javascript
/**
 * @typedef {Object} PoseData
 * @property {string} name
 * @property {number} confidence
 * @property {Object} landmarks
 */
```

## 4. Optimization Metrics

### Performance Targets
- 60 FPS for pose detection
- < 16ms per frame render
- < 100ms pose change response
- < 50MB memory footprint

### Measurement Points
1. Frame render time
2. Pose detection latency
3. Texture swap time
4. Memory usage over time

## 5. Implementation Priority

### Phase 1 - Quick Wins (1-2 days)
1. Add pose detection throttling
2. Implement proper event cleanup
3. Remove dead code
4. Add basic performance monitoring

### Phase 2 - Core Refactoring (3-5 days)
1. Extract PoseDetector module
2. Create TextureManager
3. Implement proper caching
4. Optimize render pipeline

### Phase 3 - Architecture (1 week)
1. Split ExperienceApp into modules
2. Enhance layer system
3. Add configuration management
4. Implement error handling

### Phase 4 - Advanced (ongoing)
1. Add WebWorker support
2. Implement WASM optimizations
3. Add adaptive quality
4. Create performance dashboard

## 6. Testing Strategy

### Unit Tests
- Pose detection accuracy
- Texture loading/caching
- Layer rendering

### Integration Tests
- Full render pipeline
- State transitions
- Memory leak detection

### Performance Tests
- FPS benchmarks
- Memory profiling
- Load testing with multiple persons

## 7. Documentation Needs

1. Architecture diagrams
2. API documentation for modules
3. Performance tuning guide
4. Configuration reference

## Summary

The codebase has good foundational architecture with the layer system but needs optimization in rendering performance and better modularization. Priority should be on:

1. **Immediate**: Fix performance bottlenecks (pose throttling, canvas operations)
2. **Short-term**: Extract business logic into focused modules
3. **Long-term**: Implement advanced optimizations and monitoring

Estimated performance improvement: 40-60% reduction in CPU usage, 30% reduction in memory usage.