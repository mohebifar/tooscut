# Tooscut WASM Crates

GPU-accelerated video compositor modules for the Tooscut video editor, built with Rust and wgpu.

## Crate Structure

```
crates/
├── types/           # Core types (source of truth for TypeScript)
├── keyframe/        # Keyframe animation evaluation
└── compositor/      # GPU rendering with wgpu
```

### `tooscut-types`

Shared types used across all modules. These types are the source of truth for TypeScript definitions using `tsify-next`.

**Key Types:**
- `Color` - RGBA color with hex parsing
- `Transform` - 2D position, scale, rotation with anchor point
- `Effects` - Opacity, brightness, contrast, saturation, hue, blur
- `Crop` - Crop region (top, right, bottom, left)
- `Easing` / `CubicBezier` - Animation easing curves
- `Transition` / `CrossTransition` - Clip transitions
- `Keyframe` / `KeyframeTracks` - Animation keyframes
- `LayerData` - Video/image layer for rendering
- `TextOverlay` - Text layer with styling
- `ShapeOverlay` - Shape layer (rectangle, circle, line)
- `RenderFrame` - Complete frame to render

### `tooscut-keyframe`

Efficient keyframe animation evaluation with temporal coherence caching.

**Features:**
- Linear, step, and bezier interpolation
- Cached index lookup for sequential playback (O(1) for frame-to-frame)
- Binary search fallback for seeking
- Cubic bezier solver using Newton-Raphson

**Usage:**
```typescript
import init, { KeyframeEvaluator } from './wasm/keyframe/keyframe.js';

await init();

const evaluator = new KeyframeEvaluator(JSON.stringify({
  tracks: [{
    property: 'opacity',
    keyframes: [
      { time: 0, value: 0, interpolation: 'linear', easing: { preset: 'linear' } },
      { time: 1, value: 1, interpolation: 'linear', easing: { preset: 'linear' } }
    ]
  }]
}));

const opacity = evaluator.evaluate('opacity', 0.5); // 0.5
```

### `tooscut-compositor`

GPU-accelerated video compositor using WebGPU/WebGL2 via wgpu.

**Features:**
- Multi-layer video composition
- Transform, effects, and crop
- Transition effects (fade, slide, zoom, etc.)
- WebGPU with WebGL2 fallback

**Usage:**
```typescript
import init, { Compositor } from './wasm/compositor/compositor.js';

await init();

const canvas = document.getElementById('canvas');
const compositor = await Compositor.from_canvas(canvas);

// Upload texture
compositor.upload_rgba('video-1', width, height, rgbaData);

// Render frame
compositor.render_layers(JSON.stringify({
  layers: [{
    texture_id: 'video-1',
    transform: { x: 960, y: 540, scale_x: 1, scale_y: 1, rotation: 0, anchor_x: 0.5, anchor_y: 0.5 },
    effects: { opacity: 1, brightness: 1, contrast: 1, saturation: 1, hue_rotate: 0, blur: 0 },
    z_index: 0,
    clip_start_time: 0
  }],
  timeline_time: 0,
  width: 1920,
  height: 1080
}));
```

## Building

### Prerequisites

- Rust toolchain with wasm32-unknown-unknown target
- wasm-pack (`cargo install wasm-pack`)

### Build Commands

```bash
# Build all WASM modules
./build.sh

# Or build individually
wasm-pack build types --target web --out-dir ../public/wasm/types
wasm-pack build keyframe --target web --out-dir ../public/wasm/keyframe
wasm-pack build compositor --target web --out-dir ../public/wasm/compositor

# Run tests
cargo test

# Type check
cargo check --target wasm32-unknown-unknown
```

## Type Generation

TypeScript types are generated from Rust structs using `tsify-next`. The `#[derive(Tsify)]` macro generates TypeScript interfaces that match the Rust structs.

Example Rust:
```rust
#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Transform {
    pub x: f32,
    pub y: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub rotation: f32,
    pub anchor_x: f32,
    pub anchor_y: f32,
}
```

Generated TypeScript:
```typescript
export interface Transform {
    x: number;
    y: number;
    scale_x: number;
    scale_y: number;
    rotation: number;
    anchor_x: number;
    anchor_y: number;
}
```

## GPU Shader

The compositor uses a WGSL shader with the following uniform buffer (128 bytes, aligned for WebGPU):

```wgsl
struct LayerUniforms {
    transform: mat4x4<f32>,      // 64 bytes
    opacity: f32,                 // 4 bytes
    brightness: f32,              // 4 bytes
    contrast: f32,                // 4 bytes
    saturation: f32,              // 4 bytes
    hue_rotate: f32,              // 4 bytes
    transition_type: u32,         // 4 bytes
    transition_progress: f32,     // 4 bytes
    crop_top: f32,                // 4 bytes
    crop_right: f32,              // 4 bytes
    crop_bottom: f32,             // 4 bytes
    crop_left: f32,               // 4 bytes
    blur: f32,                    // 4 bytes
    texture_width: f32,           // 4 bytes
    texture_height: f32,          // 4 bytes
    mirror_edges: f32,            // 4 bytes
    motion_blur: f32,             // 4 bytes
}                                 // Total: 128 bytes
```

## Architecture

```
TypeScript Application
         │
         ▼
┌─────────────────────────────────────────┐
│           WASM Bridge (wasm-bindgen)    │
│  • JSON serialization for complex types │
│  • Direct u8/f32 arrays for textures    │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│              Compositor (wgpu)          │
│  • Texture management                   │
│  • Render pipeline                      │
│  • Layer composition                    │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│            WebGPU / WebGL2              │
└─────────────────────────────────────────┘
```
