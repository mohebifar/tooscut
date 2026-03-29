# Render Engine Design Decisions

This document captures all architectural and design decisions made for the `@tooscut/render-engine` package. It serves as a reference for understanding why certain choices were made and how components interact.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Track System](#track-system)
- [Clip System](#clip-system)
- [Z-Order and Layering](#z-order-and-layering)
- [Cross Transitions](#cross-transitions)
- [Keyframe Evaluation](#keyframe-evaluation)
- [Compositor (WASM)](#compositor-wasm)
- [Text Rendering](#text-rendering)
- [Unified Transitions](#unified-transitions)
- [Shape Rendering](#shape-rendering)
- [Audio Engine (WASM)](#audio-engine-wasm)
- [Performance Optimizations](#performance-optimizations)
- [Testing Strategy](#testing-strategy)

---

## Architecture Overview

### Stateless Design

The render engine is designed to be **stateless** to support parallel rendering across multiple web workers. Each frame can be rendered independently without maintaining state between frames.

**Rationale:**

- Enables parallel export rendering (multiple workers rendering different frames)
- Simplifies worker communication (no state synchronization needed)
- Makes debugging easier (each frame is deterministic)

### Data Flow

```
Timeline State (Zustand)
        │
        ▼
┌─────────────────────────┐
│  getVisibleClips()      │  ← Binary search O(log n + k)
│  Pre-filter by time     │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  buildRenderFrame()     │  ← Evaluate keyframes, build layers
│  - Keyframe evaluation  │
│  - Track → z-index      │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│  Compositor (WASM)      │  ← GPU rendering via WebGPU
│  renderFrame()          │
└─────────────────────────┘
```

### Package Structure

```
@tooscut/render-engine/
├── src/
│   ├── index.ts              # Package entry point
│   ├── types.ts              # Core type definitions
│   ├── keyframe-evaluator.ts # Pure TS keyframe evaluation
│   ├── compositor.ts         # WASM compositor wrapper
│   ├── frame-builder.ts      # Frame building utilities
│   ├── clip-operations.ts    # Edit-time clip/track operations
│   └── testing/              # Testing utilities
├── wasm/
│   └── compositor/           # WASM binaries and .d.ts
└── docs/
    └── DESIGN.md             # This file
```

---

## Track System

### Track Pairs

Tracks are **always created and deleted in pairs**: one video track and one audio track.

```typescript
interface EditableTrack {
  id: string;
  index: number; // Determines z-order for video tracks
  type: "video" | "audio";
  name: string;
  pairedTrackId: string; // Links video ↔ audio
  muted: boolean;
  locked: boolean;
  volume: number;
}
```

**Rationale:**

- Video files typically contain both video and audio streams
- When a user adds "Track 2", they expect both visual and audio content to work
- Paired tracks simplify operations like mute/lock (affects both)

### Track Operations

| Operation            | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `addTrackPair()`     | Creates video + audio tracks, shifts existing indices |
| `removeTrackPair()`  | Removes both tracks AND all clips on them             |
| `reorderTrackPair()` | Moves track pair to new index                         |
| `muteTrackPair()`    | Mutes/unmutes both tracks                             |
| `lockTrackPair()`    | Locks/unlocks both tracks                             |

### Track Index

- Track index is **0-based** and **contiguous**
- Higher index = renders on top (for video tracks)
- Audio tracks share the same index as their paired video track
- When a track is removed, indices are shifted to remain contiguous

---

## Clip System

### Clip Structure

```typescript
interface TimelineClip {
  id: string;
  assetId: string; // Reference to media asset
  trackId: string; // Which track this clip belongs to
  startTime: number; // Timeline position (seconds)
  duration: number; // Clip duration on timeline
  inPoint: number; // Start point within source media
  transform?: Partial<Transform>;
  effects?: Partial<Effects>;
  crop?: Crop;
  keyframes?: KeyframeTracks;
  transitionIn?: ActiveTransition;
  transitionOut?: ActiveTransition;
  crossTransition?: ActiveCrossTransition;
}
```

**Note:** Clips do NOT store `zIndex`. Z-order is derived from the track's index.

### Linked Clips

Video and audio clips from the same source can be **linked**:

```typescript
interface EditableClip {
  // ...
  linkedClipId?: string; // Reference to paired clip
}
```

**Linked behavior:**

- Moving one moves both
- Splitting one splits both (and re-links the pieces)
- Deleting one deletes both
- Trimming one trims both

### Sorted Clips Invariant

Clips are **always sorted by `startTime`** in ascending order. This enables:

- O(log n) binary search for visibility queries
- O(log n + k) to find all visible clips (k = number visible)

**Operations maintain sorted order:**

- `addClip()` uses binary search insertion
- `moveClip()` re-sorts after position change
- `addClips()` uses concat + sort for bulk operations

---

## Z-Order and Layering

### Track-Based Z-Order

Z-order is determined **solely by track index**:

```
Track 3 (index 2) ─────────────────── TOP (renders last)
Track 2 (index 1) ───────────────────
Track 1 (index 0) ─────────────────── BOTTOM (renders first)
```

**Rationale:**

- Matches user mental model (tracks visually stacked in timeline UI)
- No need to manually manage z-index on clips
- Simpler implementation (track index = z-index)

### No Overlapping Clips on Same Track

**Rule:** Two clips on the same track cannot exist at the same time.

**Exception:** During a cross transition, the outgoing and incoming clips overlap for the transition duration.

**Validation:**

- `canPlaceClip()` - Checks if clip placement would cause illegal overlap
- `findOverlappingClips()` - Finds illegal overlaps (excludes cross transition pairs)

---

## Cross Transitions

### Definition

A cross transition blends between two clips on the **same track**:

```typescript
interface CrossTransitionRef {
  id: string;
  outgoingClipId: string; // Clip ending
  incomingClipId: string; // Clip starting
  duration: number; // Overlap duration
}
```

### Overlap Rules

During a cross transition:

1. Both clips are visible at the current time
2. Both clips are rendered (outgoing below, incoming above)
3. The transition effect blends between them

**Visibility logic:**

```typescript
getVisibleClipsWithTransitions(clips, crossTransitions, time);
```

This function includes both clips of an active transition, even if one wouldn't be "visible" by simple time bounds.

---

## Keyframe Evaluation

### Pure TypeScript Implementation

Keyframe evaluation is implemented in **pure TypeScript** (no WASM).

**Rationale:**

- Supports custom curves and bezier spline editor (planned feature)
- Easier to debug and extend
- No WASM initialization overhead for keyframe-heavy operations

### Temporal Coherence Caching

The `KeyframeEvaluator` caches the last evaluated index per track:

```typescript
class KeyframeEvaluator {
  private cache = new Map<string, number>(); // track property → last index
}
```

**Optimization:**

- During sequential playback, the next keyframe is usually adjacent
- O(1) lookup when playing forward (just check next keyframe)
- Cache is cleared on seek

### Cubic Bezier Evaluation

Custom easing curves use cubic bezier with Newton-Raphson iteration:

```typescript
function evaluateCubicBezier(bezier: CubicBezier, t: number): number {
  // Newton-Raphson iteration to find u where bezierX(u) = t
  // Then return bezierY(u)
}
```

**Presets available:**

- `ease`, `ease-in`, `ease-out`, `ease-in-out`
- `linear` (no bezier needed)
- Custom bezier via `createCustomBezierKeyframe()`

---

## Compositor (WASM)

### Core Principle: All Rendering in Rust/WASM

**IMPORTANT:** All rendering and compositing happens in Rust/WASM. No rendering on the JavaScript side.

This includes:

- Video frame compositing
- Text and glyph rendering
- Shape rendering (rectangles, circles, lines)
- Effects and transitions
- Blending and alpha compositing

JavaScript is only responsible for:

- UI (timeline, panels, controls)
- State management (Zustand)
- Preparing data structures to send to WASM
- Uploading textures and fonts to WASM

### WebGPU-Based Rendering

The compositor uses Rust + wgpu compiled to WASM for GPU-accelerated rendering.

**Capabilities:**

- Layer compositing with transforms (position, scale, rotation)
- Effects (opacity, brightness, contrast, saturation, hue, blur)
- Cropping
- Transitions (in/out/cross)
- Text rendering (see Text Rendering section)
- Shape rendering (see Shape Rendering section)

### Data Transfer

Data is sent to the compositor as pre-evaluated `RenderFrame`:

```typescript
interface RenderFrame {
  media_layers: MediaLayerData[]; // Video/image layers
  text_layers: TextLayerData[]; // Text overlays
  shape_layers: ShapeLayerData[]; // Shapes (rectangle, ellipse, polygon)
  line_layers: LineLayerData[]; // Lines with endpoints
  timeline_time: number;
  width: number;
  height: number;
}
```

All layer types share the same transition fields (`transition_in`, `transition_out`).

**Rationale for pre-evaluation:**

- Keyframes are evaluated in JS before sending to WASM
- Compositor receives final transform/effects values
- Reduces WASM complexity and data transfer

### Texture Management

```typescript
compositor.uploadRgba(id, width, height, data); // Upload texture
compositor.uploadBitmap(bitmap, id); // Upload ImageBitmap
compositor.clearTexture(id); // Release texture
```

**ImageBitmap transfer:**

- Use `Comlink.transfer()` for zero-copy transfer to workers
- Textures are cached by ID until explicitly cleared

---

## Text Rendering

### Technology Stack (Rust/WASM)

Text rendering is implemented entirely in Rust:

- **glyphon 0.8** - GPU-accelerated text rendering crate (compatible with wgpu 24)
- **cosmic-text 0.12** - Text layout and shaping (included via glyphon)
- **rustybuzz** - HarfBuzz-compatible text shaping for complex scripts
- **wgpu 24** - GPU rendering via WebGPU

**No Canvas 2D** - All text rasterization happens on the GPU.

### Embedded Fonts

The compositor includes embedded fonts for multilingual support:

| Font             | Size  | Coverage                         |
| ---------------- | ----- | -------------------------------- |
| DejaVu Sans      | 757KB | Latin, Cyrillic, Greek (default) |
| Noto Sans        | 2MB   | Extended Latin, Cyrillic         |
| Noto Sans Arabic | 142KB | Arabic, Persian, Urdu            |
| Noto Sans SC     | 298KB | Simplified Chinese               |

**Font Fallback:** DejaVu Sans is set as the default sans-serif family for WASM environments where system fonts are not available.

### Pipeline

```
TextLayerData (TypeScript)
    ↓
RenderFrame.text_layers
    ↓
Compositor.render_frame()
    ↓
[Rust/WASM]
├─ Main Pass: Text background (rounded rectangles via SDF)
└─ Text Pass: Glyph rendering (glyphon)
    ├─ cosmic-text Buffer (layout + shaping)
    ├─ glyphon TextAtlas (glyph caching)
    ├─ glyphon SwashCache (rasterization)
    └─ glyphon TextRenderer (GPU rendering)
```

### Render Pass Architecture

Text rendering uses **two render passes**:

1. **Main Pass** (with media, shapes, lines): Renders text background boxes using the shape pipeline
2. **Text Pass** (LoadOp::Load): Renders glyphs via glyphon, preserving existing content

This separation is required because glyphon manages its own render pass internally.

### Custom Font Loading

Custom fonts can be loaded dynamically from TTF/OTF files:

```typescript
// Load a custom font
const fontData = await fetch("/fonts/Roboto-Bold.ttf").then((r) => r.arrayBuffer());
compositor.loadFont("Roboto", new Uint8Array(fontData));

// Check if font is loaded
if (compositor.isFontLoaded("Roboto")) {
  console.log("Roboto font ready");
}

// Use in text layer
const textLayer: TextLayerData = {
  style: {
    fontFamily: "Roboto", // Must match the font's internal family name
    fontWeight: 700,
    fontSize: 48,
    // ...
  },
  // ...
};
```

**Important:** The `fontFamily` parameter must match the font's internal family name (stored in the font file metadata). When the font is loaded, the actual family name is logged to help identify it.

**Font Resolution:**

1. If `fontFamily` matches a loaded custom font, that font is used
2. If not found, cosmic-text falls back through the embedded font chain
3. DejaVu Sans is the ultimate fallback (default sans-serif)

### RTL and Complex Script Support

Text shaping uses `Shaping::Advanced` which enables:

- **Bidirectional text** - Correct LTR/RTL mixing (e.g., "Hello درود World")
- **Arabic script** - Proper letter joining and contextual forms
- **Persian script** - Full RTL support with correct glyph shaping
- **Chinese (CJK)** - Ideographic character support via Noto Sans SC

**Technical details:**

- cosmic-text uses rustybuzz (HarfBuzz-compatible) for text shaping
- Layout runs have an `rtl` flag for proper positioning
- Font fallback chain: DejaVu Sans → Noto Sans → Noto Sans Arabic → Noto Sans SC

### Features

- **Rich text styling** - Per-word colors, weights, backgrounds
- **Karaoke effects** - Highlight specific words with different styles
- **RTL/complex scripts** - Arabic, Persian, Hebrew via HarfBuzz
- **CJK support** - Chinese characters via embedded Noto Sans SC
- **Background boxes** - Rounded rectangle backgrounds via SDF shaders
- **Transitions** - Same transition effects as video layers
- **Keyframe animation** - Position, scale, opacity can be animated

### Limitations

- **Italic fonts** - Italic styling requires loading an italic font variant explicitly
- **Font embedding size** - ~3.2MB total for embedded fonts (can be reduced with subsets)

### Data Structures

**TypeScript:**

```typescript
interface TextClip {
  type: "text";
  text: string;
  style: TextStyle;
  box: { x: number; y: number; width: number; height: number };
  highlightStyle?: HighlightStyle;
  wordTimings?: TextWordTiming[];
}

interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor?: string;
  backgroundPadding?: number;
  backgroundBorderRadius?: number;
  italic: boolean;
  textAlign: "left" | "center" | "right";
}
```

**Rust:**

```rust
pub struct TextOverlay {
    pub id: String,
    pub text: String,
    pub box_position: (f32, f32),  // percentage
    pub box_size: (f32, f32),      // percentage
    pub style: TextStyle,
    pub opacity: f32,
    pub highlight_style: Option<HighlightStyle>,
    pub highlighted_word_indices: Option<Vec<usize>>,
}
```

---

## Unified Transitions

### Transition System

All visual clip types (video, image, text, shape, line) share the **same transition system**. This ensures consistent behavior and zero code duplication.

**Supported Transition Types:**

- **Opacity:** Fade, Dissolve
- **Directional Wipes:** WipeLeft, WipeRight, WipeUp, WipeDown
- **Directional Slides:** SlideLeft, SlideRight, SlideUp, SlideDown
- **Scale:** ZoomIn, ZoomOut
- **Rotation:** RotateCw, RotateCcw
- **Flip:** FlipH, FlipV

### Transition Application

Each layer type has optional `transition_in` and `transition_out` fields:

```typescript
interface ActiveTransition {
  transition: Transition;
  progress: number; // 0.0 to 1.0
}

// Used by ALL layer types:
interface MediaLayerData {
  // ...
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
}

interface TextLayerData {
  // ...
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
}

interface ShapeLayerData {
  // ...
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
}

interface LineLayerData {
  // ...
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
}
```

### Cross Transitions

Cross transitions apply between two overlapping clips on the same track:

```typescript
interface ActiveCrossTransition {
  cross_transition: CrossTransition;
  progress: number;
  is_outgoing: boolean; // true for outgoing clip, false for incoming
}
```

Only supported on `MediaLayerData` since text/shapes are typically not cross-dissolved.

---

## Shape Rendering

### Primitive Shape Types

Shapes are defined as primitives that can represent multiple visual forms:

| Type          | Description             | Special Properties                                               |
| ------------- | ----------------------- | ---------------------------------------------------------------- |
| **Rectangle** | 4-sided shape           | `corner_radius` for rounded corners. Square = equal width/height |
| **Ellipse**   | Oval shape              | Circle = equal width/height                                      |
| **Polygon**   | N-sided regular polygon | `sides` (3 = triangle, 5 = pentagon, 6 = hexagon, etc.)          |

**Rationale:** Fewer primitive types means simpler compositor code. Squares are just rectangles; circles are just ellipses.

### Lines as Separate Type

Lines are **not shapes** - they have different properties:

```typescript
// Shapes use bounding box (x, y, width, height)
interface ShapeBox {
  x: number; // % of canvas
  y: number;
  width: number;
  height: number;
}

// Lines use endpoints
interface LineBox {
  x1: number; // % of canvas
  y1: number;
  x2: number;
  y2: number;
}
```

### Line Endpoints

Lines support various head styles at start and end:

- **None** - No head
- **Arrow** - Arrow head
- **Circle** - Circle head
- **Square** - Square head
- **Diamond** - Diamond head

### Stroke Styles

Both shapes and lines support stroke patterns:

- **Solid** - Continuous line
- **Dashed** - Dash pattern
- **Dotted** - Dot pattern

### GPU-Accelerated Rendering

Shapes are rendered via SDF (Signed Distance Function) shaders in WASM:

- **SDF Rectangles** - Smooth corner radius at any scale
- **SDF Ellipses** - Perfect ellipses/circles
- **SDF Polygons** - Regular n-gons
- **SDF Lines** - Proper line thickness and anti-aliasing

### Rendering Order

The compositor interleaves all layer types by z-index:

```rust
for z_idx in sorted_z_indices {
    // Render media layers at z_idx
    // Render shape layers at z_idx
    // Render line layers at z_idx
    // Render text layers at z_idx
}
```

This ensures proper layering regardless of layer type.

---

## Audio Engine (WASM)

### Architecture

Audio mixing runs entirely in a WASM `AudioEngine` inside an `AudioWorkletProcessor`. This keeps audio rendering off the main thread and provides sample-accurate playback.

```
BrowserAudioEngine (main thread)
    │
    │  postMessage (streaming chunks)
    ▼
AudioWorkletProcessor (audio thread)
    │
    │  calls into WASM
    ▼
AudioEngine (Rust/WASM)
    ├── AudioMixer
    │   ├── sources: HashMap<String, AudioClipSource>
    │   ├── clips: Vec<AudioClip>
    │   ├── tracks: Vec<AudioTrack>
    │   └── cross_transitions: Vec<CrossTransition>
    └── render() → interleaved stereo f32
```

The worklet calls `engine.render(output, numFrames)` every ~128 samples. The mixer iterates active clips, reads from their sources with linear interpolation, applies per-clip gain/fades, cross-transition crossfades, track volume/pan/mute/solo, and master volume.

### Audio Source Modes

The WASM `AudioClipSource` supports three modes:

| Mode          | API                                  | Memory             | Use Case                   |
| ------------- | ------------------------------------ | ------------------ | -------------------------- |
| **Bulk**      | `new()` / `upload_audio()`           | Full file          | Legacy fallback            |
| **Streaming** | `new_streaming()` / `append_chunk()` | Grows unbounded    | N/A (replaced by windowed) |
| **Windowed**  | `new_windowed()` / `update_buffer()` | Fixed budget (30s) | Preview playback + export  |

**Windowed mode** is the primary mode for both preview and export. It stores PCM in time-indexed segments with a fixed memory budget. The engine returns silence for regions not yet buffered (`get_sample()` returns `(0.0, 0.0)`), and auto-evicts the segment furthest from the last read position when the budget is exceeded.

**Preview flow (real-time decode-ahead):**

```
1. BrowserAudioEngine creates windowed source (30s budget)
2. AudioWorklet sends time-update messages (~10Hz) with playhead position
3. Main thread computes needed source regions per clip (inPoint, speed)
4. Decodes ranges via MediaBunny sink.samples(from, to)
5. Sends PCM to worklet via "update-source-buffer"
6. WASM auto-evicts old segments as playhead advances
```

**Export flow (windowed decode + render):**

```
1. Audio worker creates windowed source (30s budget)
2. For each 10s timeline window:
   a. Compute needed source regions from clip data
   b. Decode via MediaBunny sink.samples(from, to)
   c. Feed to WASM via update_source_buffer()
   d. Render window, stream 1-second chunks to main thread
3. WASM auto-evicts — peak memory ~11MB/source regardless of duration
```

### URL Source Selection

Local files in the editor use `blob:` URLs (from File System Access API). These don't support HTTP Range requests, so MediaBunny's `UrlSource` cannot be used directly.

| URL scheme | MediaBunny source           | Reason                                          |
| ---------- | --------------------------- | ----------------------------------------------- |
| `blob:`    | `BlobSource` (fetch → Blob) | No Range request support                        |
| `http(s):` | `UrlSource`                 | Supports Range requests for efficient streaming |

### Fallback Path

If MediaBunny fails (unsupported format, no audio track, etc.), the engine falls back to `decodeAudioData()` and uploads audio in bulk via the existing `upload-audio` message. This ensures compatibility with any format the browser's built-in decoder supports.

### Worklet Message Protocol

| Message                   | Direction | Purpose                                      |
| ------------------------- | --------- | -------------------------------------------- |
| `init`                    | → worklet | Send WASM binary, initialize engine          |
| `upload-audio`            | → worklet | Bulk upload (fallback path)                  |
| `create-streaming-source` | → worklet | Create empty source with pre-allocation hint |
| `append-audio-chunk`      | → worklet | Append interleaved PCM chunk (Transferable)  |
| `finalize-audio`          | → worklet | Mark source complete, release excess memory  |
| `remove-audio`            | → worklet | Delete source                                |
| `set-timeline`            | → worklet | Update clips/tracks/transitions (JSON)       |
| `set-playing`             | → worklet | Start/stop playback                          |
| `seek`                    | → worklet | Seek to time                                 |
| `set-master-volume`       | → worklet | Set master volume                            |
| `time-update`             | ← worklet | Current playback time (~10Hz)                |
| `ready`                   | ← worklet | WASM initialized                             |

Thread safety is guaranteed: the worklet processes messages between `process()` calls on the same thread.

### Key Files

| File                                  | Role                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| `crates/audio-engine/src/source.rs`   | `AudioClipSource` — PCM storage, interpolation, streaming |
| `crates/audio-engine/src/mixer.rs`    | `AudioMixer` — multi-track mixing, gain, transitions      |
| `crates/audio-engine/src/lib.rs`      | `AudioEngine` — WASM bindings (`#[wasm_bindgen]`)         |
| `src/worklet/audio-engine.worklet.ts` | `AudioWorkletProcessor` — message dispatch, render loop   |
| `src/audio-engine.ts`                 | `BrowserAudioEngine` — browser API, MediaBunny streaming  |

---

## Export Pipeline

### Architecture

Export streams rendered frames directly to disk via the File System Access API, avoiding the need to hold the entire video in memory.

```
┌─ Worker Thread ─────────────────────────────────────────────┐
│  VideoFrameLoader (MediaBunny decode)                       │
│        ↓                                                    │
│  Compositor (WASM/WebGPU) → renderFrame()                   │
│        ↓                                                    │
│  transferToImageBitmap() → VideoFrame                       │
│        ↓ (Comlink transfer, zero-copy)                      │
└─────────────────────────────────────────────────────────────┘
          ↓
┌─ Main Thread ───────────────────────────────────────────────┐
│  VideoEncoder (hardware H.264) → EncodedVideoChunk          │
│        ↓                                                    │
│  EncodedVideoPacketSource → MediaBunny Output               │
│        ↓                                                    │
│  StreamTarget(FileSystemWritableFileStream) → disk           │
└─────────────────────────────────────────────────────────────┘

┌─ Audio Worker ──────────────────────────────────────────────┐
│  MediaBunny decode → WASM AudioEngine (windowed) → render   │
│        ↓ (postMessage, 1-second chunks)                     │
└─────────────────────────────────────────────────────────────┘
          ↓
┌─ Main Thread ───────────────────────────────────────────────┐
│  AudioSampleSource → MediaBunny Output (same as video)      │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**Streaming to disk via FileSystemWritableFileStream:**
The `FileSystemWritableFileStream` is passed directly to MediaBunny's `StreamTarget`. Its sink natively handles `{type: 'write', data, position}` — the same format MediaBunny writes internally. No intermediary `WritableStream`, no chunking, no buffering.

**Fragmented MP4 (`fastStart: "fragmented"`):**
Fragments are written incrementally as rendering progresses. No large metadata rewrite at finalize time (unlike regular MP4 which writes the moov atom at the end or seeks to prepend it).

**`transferToImageBitmap()` for VideoFrame creation:**
The compositor renders to an OffscreenCanvas backed by WebGPU. `new VideoFrame(canvas)` captures a reference to the swap chain texture's shared image mailbox — not a copy. When the compositor renders the next frame, `get_current_texture()` recycles that texture, invalidating the mailbox. The main thread's encoder then reads a destroyed texture (`glCopySubTexture: unknown source image mailbox`). `transferToImageBitmap()` detaches the canvas content into an independent GPU bitmap, breaking the reference to the swap chain.

**Concurrent audio + video:**
Audio rendering runs in a dedicated worker concurrently with video frame rendering. Both feed into the same MediaBunny `Output` via separate track sources. The muxer handles interleaving by timestamp.

**Backpressure management:**

- `VideoEncoder` queue capped at 4 frames (`MAX_VIDEO_ENCODER_QUEUE_SIZE`). The render loop waits on `dequeue` events when the queue is full.
- Encoded chunk queue capped at 8 packets (`MAX_ENCODED_CHUNK_QUEUE_SIZE`). Drain is pumped from the encoder output callback.

**Immediate bitmap closure in batch rendering:**
In the worker's batch render path, each `ImageBitmap` is closed immediately after `compositor.uploadBitmap()` — not accumulated until batch end. This prevents duplicate GPU memory (bitmap + compositor texture) from accumulating across the batch.

### Windowed Audio Export

The audio export worker uses the same windowed source mechanism as preview playback (`create_windowed_source` / `update_source_buffer`), keeping only ~30 seconds of decoded PCM per source in WASM memory.

For each 10-second timeline window:

1. Compute which source regions active clips need (accounting for `inPoint` and `speed`)
2. Decode those ranges via MediaBunny's `AudioSampleSink.samples(from, to)`
3. Feed to WASM via `update_source_buffer()` — the engine auto-evicts old data
4. Render the window in 1-second chunks, stream to main thread

This bounds peak audio memory to ~11MB per source regardless of video duration.

---

## Performance Optimizations

### 1. Binary Search for Visibility

```typescript
getVisibleClips(clips, time); // O(log n + k)
```

Instead of O(n) filtering, binary search finds the first potentially visible clip, then scans forward.

### 2. Pre-Filtering Before Worker Transfer

```typescript
// Main thread
const visibleClips = getVisibleClips(allClips, currentTime);

// Only visible clips sent to worker
worker.renderFrame(visibleClips, ...);
```

For a 2-hour timeline with 500 clips, typically only 2-5 clips are visible at any time.

### 3. Sorted Clips at Edit Time

Maintaining sorted order during edits (O(log n) insert) is cheaper than sorting at render time (30-60 fps).

### 4. Separate Playback Store

High-frequency updates (current time, playhead position) are in a separate Zustand store to avoid triggering re-renders of the main editor state.

### 5. Ref-Based Drag State

Timeline interactions use React refs instead of state to avoid re-renders during drag operations.

---

## Testing Strategy

### Unit Tests (Node.js)

`tests/clip-operations.test.ts` - 76 tests covering:

- Clip CRUD operations
- Movement and trimming
- Splitting and linking
- Track operations
- Overlap validation

Run with: `pnpm test`

### Visual Tests (Browser/WebGPU)

Require browser environment with WebGPU support. Excluded from Node.js test runs.

**`tests/compositor.test.ts`** - Basic compositor tests:

- Basic rendering (solid colors, gradients)
- Layer ordering (track-based z-index)
- Transforms (position, scale, rotation)
- Effects (opacity, brightness, contrast, blur)
- Text over image
- Shapes
- Complex compositions

**`tests/visual-layers.test.ts`** - Comprehensive layer type tests (56 tests):

**Shape Layers:**

- Rectangle shapes (basic, rounded corners, stroke)
- Square (rectangle with equal dimensions)
- Ellipse shapes (basic, with stroke only)
- Circle (ellipse with equal dimensions)
- Polygon shapes (triangle, pentagon, hexagon, octagon)

**Line Layers:**

- Basic lines (diagonal, horizontal, vertical)
- Arrow heads (single, double)
- Circle endpoints
- Stroke styles (solid, dashed, dotted)

**Text Layers:**

- Basic text rendering
- Colored text
- Text with background (solid, rounded)
- Text alignment (left, center, right)
- Font styling (bold, italic, letter spacing)
- Karaoke/word highlighting

**Unified Transitions:**

- Media layer transitions (fade, slide, zoom)
- Shape layer transitions (same system)
- Line layer transitions (same system)
- Text layer transitions (same system)
- Transition out effects

**Z-Ordering:**

- Mixed layer types with correct z-order
- Complex compositions with all layer types

**Opacity and Blending:**

- Varying opacity levels
- Overlapping shapes with alpha blending

**Edge Cases:**

- Empty frames
- Very thin/thick lines
- Very small shapes
- Shapes at canvas edges
- Performance with many layers

Run with: `pnpm test:browser`

### Test Utilities

```typescript
import {
  SnapshotTester,
  layer,
  textLayer,
  rectangle,
  ellipse,
  polygon,
  lineLayer,
  frame,
} from "@tooscut/render-engine/testing";

// Media layer
const mediaLayer = layer("texture-id")
  .position(100, 100)
  .scale(2)
  .opacity(0.8)
  .transitionIn("Fade", 1, { preset: "Linear" }, 0.5)
  .build();

// Text layer
const text = textLayer("id", "Hello World")
  .box(10, 40, 80, 20)
  .fontSize(32)
  .color(1, 1, 1, 1)
  .background(0, 0, 0, 0.5)
  .transitionIn("SlideUp", 0.5)
  .build();

// Shape layers
const rect = rectangle("rect1").box(25, 25, 50, 50).fill(1, 0, 0, 1).cornerRadius(10).build();

const circle = ellipse("circle1")
  .box(30, 30, 40, 40) // Equal width/height = circle
  .fill(0, 1, 0, 1)
  .build();

const triangle = polygon("tri", 3).box(20, 20, 60, 60).fill(0, 0, 1, 1).build();

// Line layer
const arrow = lineLayer("arrow1")
  .from(10, 50)
  .to(90, 50)
  .stroke(1, 1, 1, 1)
  .strokeWidth(3)
  .arrow(10)
  .dashed()
  .build();

// Create frame with all layer types
const renderFrame = frame(400, 300, {
  mediaLayers: [mediaLayer],
  textLayers: [text],
  shapeLayers: [rect, circle, triangle],
  lineLayers: [arrow],
});
```

### Texture Generators

For testing, various texture generators are available:

- `generateSolidTexture()` - Solid color
- `generateGradientTexture()` - Linear gradient
- `generateCheckerboardTexture()` - Checkerboard pattern
- `generateRadialGradientTexture()` - Radial gradient
- `generateSceneTexture()` - Simulated scene (sky, sun, ground)
- `generateTextTexture()` - Simulated text lines
- `generateShapeTexture()` - Circle, rectangle, triangle

---

## Appendix: Type Reference

### Core Types

```typescript
// Transform
interface Transform {
  x: number;
  y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  anchor_x: number;
  anchor_y: number;
}

// Effects
interface Effects {
  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue_rotate: number;
  blur: number;
}

// Layer sent to compositor
interface LayerData {
  texture_id: string;
  transform: Transform;
  effects: Effects;
  z_index: number;
  crop?: Crop;
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
  cross_transition?: ActiveCrossTransition;
}
```

### Keyframe Types

```typescript
interface Keyframe {
  time: number;
  value: number;
  easing: EasingType;
  bezier?: CubicBezier;
}

interface KeyframeTrack {
  property: string;
  keyframes: Keyframe[];
}

interface KeyframeTracks {
  tracks: KeyframeTrack[];
}
```
