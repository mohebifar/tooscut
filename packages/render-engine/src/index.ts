/**
 * @tooscut/render-engine
 *
 * GPU-accelerated video rendering engine for the Tooscut editor.
 *
 * This package provides:
 * - Pure TypeScript keyframe evaluation (no WASM)
 * - GPU compositor for rendering video frames (WASM)
 * - Utilities for building render frames from timeline clips
 *
 * Architecture:
 * - Stateless design for parallel rendering across web workers
 * - Keyframes evaluated in pure JS before sending to GPU compositor
 * - Compositor uses WASM/WebGPU for hardware-accelerated rendering
 *
 * @example
 * ```typescript
 * import {
 *   Compositor,
 *   KeyframeEvaluator,
 *   EvaluatorManager,
 *   buildRenderFrame,
 * } from "@tooscut/render-engine";
 *
 * // Create compositor from canvas
 * const compositor = await Compositor.fromCanvas(canvas);
 *
 * // Evaluate keyframes (pure JS, synchronous)
 * const evaluatorManager = new EvaluatorManager();
 * const frame = buildRenderFrameSync(clips, time, 1920, 1080, evaluatorManager);
 *
 * // Render
 * compositor.renderFrame(frame);
 * ```
 */

// Types
export * from "./types.js";

// Keyframe evaluation (pure TypeScript)
export {
  KeyframeEvaluator,
  evaluateTrack,
  evaluateCubicBezier,
  evaluateEasing,
  createLinearKeyframe,
  createStepKeyframe,
  createBezierKeyframe,
  createEasedKeyframe,
  createCustomBezierKeyframe,
  CUBIC_BEZIER_PRESETS,
} from "./keyframe-evaluator.js";

// Compositor (WASM)
export { Compositor, initCompositorWasm } from "./compositor.js";

// Frame building
export {
  EvaluatorManager,
  isClipVisible,
  getVisibleClips,
  getVisibleClipsWithTransitions,
  buildMediaLayerData,
  buildMediaLayerDataSync,
  buildRenderFrame,
  buildRenderFrameSync,
  type ClipBounds,
  type CrossTransitionRef,
  type Track,
  type TimelineClip,
  type BuildRenderFrameOptions,
} from "./frame-builder.js";

// Clip operations (edit-time utilities)
export {
  // Binary search utilities
  findInsertionIndex,
  findClipById,
  sortClipsByStartTime,
  // Clip CRUD
  addClip,
  addClips,
  removeClip,
  removeClipWithLinked,
  updateClip,
  // Movement
  moveClip,
  moveClipToTrack,
  // Trimming
  trimClipLeft,
  trimClipRight,
  // Splitting
  splitClip,
  splitClipWithLinked,
  // Linking
  linkClips,
  unlinkClip,
  // Cross transitions
  addCrossTransition,
  removeCrossTransition,
  removeCrossTransitionsForClip,
  // Track operations
  addTrackPair,
  removeTrackPair,
  reorderTrackPair,
  updateTrack,
  muteTrackPair,
  lockTrackPair,
  findTrackById,
  getPairedTrack,
  getVideoTracksSorted,
  getAudioTracks,
  validateTracks,
  // Validation
  isClipsSorted,
  findOverlappingClips,
  canPlaceClip,
  // Types
  type EditableClip,
  type EditableTrack,
  type TrackPairResult,
  type SplitResult,
  type AddClipOptions,
  type MoveClipOptions,
  type TrimClipOptions,
} from "./clip-operations.js";

export {
  VideoFrameLoader,
  VideoFrameLoaderManager,
  type VideoAssetInfo,
  type FrameResult,
  type VideoFrameMode,
  type VideoFrameLoaderOptions,
} from "./video-frame-loader.js";

// Audio engine
export {
  BrowserAudioEngine,
  type AudioClipState,
  type AudioTrackState,
  type AudioCrossTransition,
  type AudioTimelineState,
  type AudioEngineConfig,
  type AudioEffectsParams,
  type AudioEqParams,
  type AudioCompressorParams,
  type AudioNoiseGateParams,
  type AudioReverbParams,
} from "./audio-engine.js";
