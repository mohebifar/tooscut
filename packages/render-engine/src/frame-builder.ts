/**
 * Utilities for building render frames from timeline clips.
 *
 * This module handles the conversion from editor state (clips with keyframes)
 * to render-ready frames (pre-evaluated transform/effects).
 */

import type {
  KeyframeTracks,
  Transform,
  Effects,
  MediaLayerData,
  RenderFrame,
  Crop,
  ActiveTransition,
  ActiveCrossTransition,
  TextLayerData,
  ShapeLayerData,
  LineLayerData,
} from "./types.js";
import { DEFAULT_TRANSFORM, DEFAULT_EFFECTS } from "./types.js";
import { KeyframeEvaluator } from "./keyframe-evaluator.js";

/**
 * Minimal clip interface for visibility checks.
 */
export interface ClipBounds {
  id: string;
  startTime: number;
  duration: number;
}

/**
 * Cross transition reference linking two clips.
 */
export interface CrossTransitionRef {
  id: string;
  outgoingClipId: string;
  incomingClipId: string;
  duration: number;
}

/**
 * Check if a clip is visible at a given time.
 */
export function isClipVisible(clip: ClipBounds, time: number): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}

/**
 * Binary search to find the first clip that could be visible at or after the given time.
 * Clips must be sorted by startTime in ascending order.
 *
 * Returns the index of the first clip where startTime + duration > time,
 * or clips.length if no such clip exists.
 */
function findFirstPotentiallyVisible<T extends ClipBounds>(clips: T[], time: number): number {
  let low = 0;
  let high = clips.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    const clip = clips[mid];
    // A clip is potentially visible if it hasn't ended yet
    if (clip.startTime + clip.duration <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Filter clips to only those visible at the current time using binary search.
 *
 * IMPORTANT: Clips must be sorted by startTime in ascending order.
 *
 * Time complexity: O(log n + k) where k is the number of visible clips.
 * For long timelines with few visible clips, this is much faster than O(n) filtering.
 */
export function getVisibleClips<T extends ClipBounds>(clips: T[], time: number): T[] {
  if (clips.length === 0) return [];

  const result: T[] = [];
  const startIdx = findFirstPotentiallyVisible(clips, time);

  // Scan forward from the first potentially visible clip
  for (let i = startIdx; i < clips.length; i++) {
    const clip = clips[i];

    // If this clip starts after our time, no more clips can be visible
    if (clip.startTime > time) {
      break;
    }

    // Check if clip is actually visible
    if (isClipVisible(clip, time)) {
      result.push(clip);
    }
  }

  return result;
}

/**
 * Get clips that are visible at the current time, including clips needed for cross transitions.
 *
 * When a cross transition is active, both the outgoing and incoming clips need to be rendered,
 * even if one wouldn't normally be "visible" based on simple time bounds.
 *
 * IMPORTANT: Clips must be sorted by startTime in ascending order.
 *
 * @param clips - All clips, sorted by startTime
 * @param crossTransitions - Active cross transitions in the timeline
 * @param time - Current timeline time
 * @returns Clips that should be rendered (visible + transition participants)
 */
export function getVisibleClipsWithTransitions<T extends ClipBounds>(
  clips: T[],
  crossTransitions: CrossTransitionRef[],
  time: number,
): T[] {
  const visibleClips = getVisibleClips(clips, time);
  const visibleIds = new Set(visibleClips.map((c) => c.id));

  // Find cross transitions that are active at this time
  // A cross transition is active when we're in the overlap region
  const additionalClipIds = new Set<string>();

  for (const ct of crossTransitions) {
    // Check if either participant is visible
    const outgoingVisible = visibleIds.has(ct.outgoingClipId);
    const incomingVisible = visibleIds.has(ct.incomingClipId);

    if (outgoingVisible && !incomingVisible) {
      // Outgoing is visible, need to include incoming for the transition
      additionalClipIds.add(ct.incomingClipId);
    } else if (incomingVisible && !outgoingVisible) {
      // Incoming is visible, need to include outgoing for the transition
      additionalClipIds.add(ct.outgoingClipId);
    }
  }

  // If no additional clips needed, return early
  if (additionalClipIds.size === 0) {
    return visibleClips;
  }

  // Build a map for quick lookup of additional clips
  const clipMap = new Map<string, T>();
  for (const clip of clips) {
    if (additionalClipIds.has(clip.id)) {
      clipMap.set(clip.id, clip);
    }
  }

  // Combine visible clips with additional transition clips
  const result = [...visibleClips];
  for (const id of additionalClipIds) {
    const clip = clipMap.get(id);
    if (clip) {
      result.push(clip);
    }
  }

  return result;
}

/**
 * A track in the timeline.
 *
 * Tracks determine z-order: higher index tracks render on top of lower index tracks.
 * Example: Track 3 renders over Track 2, which renders over Track 1.
 */
export interface Track {
  id: string;
  /** Track index determines z-order (higher = on top) */
  index: number;
  type: "video" | "audio";
}

/**
 * A clip from the editor timeline.
 *
 * Note: z-index is NOT stored on clips. It's derived from the track's index.
 * Two clips on the same track cannot coexist at the same time, except during
 * the overlap period of a cross transition.
 */
export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  transform?: Partial<Transform>;
  effects?: Partial<Effects>;
  crop?: Crop;
  keyframes?: KeyframeTracks;
  transitionIn?: ActiveTransition;
  transitionOut?: ActiveTransition;
  crossTransition?: ActiveCrossTransition;
}

/**
 * Manager for keyframe evaluators.
 *
 * Maintains one evaluator per clip for efficient cached evaluation.
 * Call clearAllCaches() after seeking.
 */
export class EvaluatorManager {
  private evaluators = new Map<string, KeyframeEvaluator>();

  /**
   * Get or create an evaluator for a clip.
   */
  getEvaluator(clip: TimelineClip): KeyframeEvaluator | null {
    if (!clip.keyframes || clip.keyframes.tracks.length === 0) {
      return null;
    }

    let evaluator = this.evaluators.get(clip.id);
    if (!evaluator) {
      evaluator = new KeyframeEvaluator(clip.keyframes);
      this.evaluators.set(clip.id, evaluator);
    }
    return evaluator;
  }

  /**
   * Remove an evaluator when a clip is deleted.
   */
  removeEvaluator(clipId: string): void {
    this.evaluators.delete(clipId);
  }

  /**
   * Clear all caches (call after seeking).
   */
  clearAllCaches(): void {
    for (const evaluator of this.evaluators.values()) {
      evaluator.clearCache();
    }
  }

  /**
   * Clear all evaluators.
   */
  clear(): void {
    this.evaluators.clear();
  }
}

/**
 * Build a MediaLayerData from a clip at a specific time.
 *
 * Evaluates keyframes and merges with base transform/effects.
 * Pure synchronous operation - no async needed.
 *
 * @param clip - The clip to build layer data from
 * @param trackIndex - The track's index (determines z-order)
 * @param timelineTime - Current timeline time
 * @param evaluatorManager - Keyframe evaluator manager
 */
export function buildMediaLayerData(
  clip: TimelineClip,
  trackIndex: number,
  timelineTime: number,
  evaluatorManager: EvaluatorManager,
): MediaLayerData | null {
  // Check if clip is visible at this time
  if (timelineTime < clip.startTime || timelineTime >= clip.startTime + clip.duration) {
    return null;
  }

  // Local time within the clip
  const localTime = timelineTime - clip.startTime + clip.inPoint;

  // Get base values
  const baseTransform: Transform = {
    ...DEFAULT_TRANSFORM,
    ...clip.transform,
  };
  const baseEffects: Effects = {
    ...DEFAULT_EFFECTS,
    ...clip.effects,
  };

  // Evaluate keyframes if present
  let transform = baseTransform;
  let effects = baseEffects;

  const evaluator = evaluatorManager.getEvaluator(clip);
  if (evaluator) {
    const keyframedTransform = evaluator.evaluateTransform(localTime);
    const keyframedEffects = evaluator.evaluateEffects(localTime);

    // Merge keyframed values with base (keyframes override base)
    transform = {
      ...baseTransform,
      ...keyframedTransform,
    };
    effects = {
      ...baseEffects,
      ...keyframedEffects,
    };
  }

  return {
    texture_id: clip.assetId,
    transform,
    effects,
    z_index: trackIndex,
    crop: clip.crop,
    transition_in: clip.transitionIn,
    transition_out: clip.transitionOut,
    cross_transition: clip.crossTransition,
  };
}

/**
 * Build a MediaLayerData synchronously.
 * @deprecated Use buildMediaLayerData instead - it's now synchronous.
 */
export function buildMediaLayerDataSync(
  clip: TimelineClip,
  trackIndex: number,
  timelineTime: number,
  evaluatorManager: EvaluatorManager,
): MediaLayerData | null {
  return buildMediaLayerData(clip, trackIndex, timelineTime, evaluatorManager);
}

/**
 * Legacy alias for buildMediaLayerData.
 * @deprecated Use buildMediaLayerData instead.
 */
export const buildLayerData = buildMediaLayerData;

/**
 * Legacy alias for buildMediaLayerDataSync.
 * @deprecated Use buildMediaLayerData instead.
 */
export const buildLayerDataSync = buildMediaLayerDataSync;

/**
 * Input options for building a complete render frame.
 */
export interface BuildRenderFrameOptions {
  /** Media clips (video/image) */
  mediaClips: TimelineClip[];
  /** Text clips */
  textLayers?: TextLayerData[];
  /** Shape layers (pre-built) */
  shapeLayers?: ShapeLayerData[];
  /** Line layers (pre-built) */
  lineLayers?: LineLayerData[];
  /** All tracks for z-order lookup */
  tracks: Track[];
  /** Current timeline time */
  timelineTime: number;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Keyframe evaluator manager */
  evaluatorManager: EvaluatorManager;
}

/**
 * Build a complete RenderFrame from timeline clips.
 *
 * Z-order is determined by track index: higher track index = rendered on top.
 * Example: Track 3 clips render over Track 2 clips, which render over Track 1 clips.
 *
 * All layer types (media, text, shape, line) share the same transition system.
 * Transitions are applied uniformly by the compositor regardless of layer type.
 *
 * For best performance, pre-filter clips using `getVisibleClips()` before calling this.
 * This function will still filter out invisible clips, but pre-filtering avoids
 * passing large arrays across worker boundaries.
 *
 * Pure synchronous operation - no async needed.
 */
export function buildRenderFrame(options: BuildRenderFrameOptions): RenderFrame;
/**
 * @deprecated Use the options object overload instead.
 */
export function buildRenderFrame(
  clips: TimelineClip[],
  tracks: Track[],
  timelineTime: number,
  width: number,
  height: number,
  evaluatorManager: EvaluatorManager,
): RenderFrame;
export function buildRenderFrame(
  optionsOrClips: BuildRenderFrameOptions | TimelineClip[],
  tracks?: Track[],
  timelineTime?: number,
  width?: number,
  height?: number,
  evaluatorManager?: EvaluatorManager,
): RenderFrame {
  // Handle both overloads
  let options: BuildRenderFrameOptions;
  if (Array.isArray(optionsOrClips)) {
    // Legacy overload
    options = {
      mediaClips: optionsOrClips,
      tracks: tracks!,
      timelineTime: timelineTime!,
      width: width!,
      height: height!,
      evaluatorManager: evaluatorManager!,
    };
  } else {
    options = optionsOrClips;
  }

  // Build track index lookup
  const trackIndexMap = new Map<string, number>();
  for (const track of options.tracks) {
    trackIndexMap.set(track.id, track.index);
  }

  const mediaLayers: MediaLayerData[] = [];

  for (const clip of options.mediaClips) {
    const trackIndex = trackIndexMap.get(clip.trackId) ?? 0;
    const layer = buildMediaLayerData(
      clip,
      trackIndex,
      options.timelineTime,
      options.evaluatorManager,
    );
    if (layer) {
      mediaLayers.push(layer);
    }
  }

  // Sort media layers by z-index (track index)
  mediaLayers.sort((a, b) => a.z_index - b.z_index);

  // Text, shape, and line layers are pre-sorted by caller
  const textLayers = options.textLayers ?? [];
  const shapeLayers = options.shapeLayers ?? [];
  const lineLayers = options.lineLayers ?? [];

  return {
    media_layers: mediaLayers,
    text_layers: textLayers,
    shape_layers: shapeLayers,
    line_layers: lineLayers,
    timeline_time: options.timelineTime,
    width: options.width,
    height: options.height,
  };
}

/**
 * Build a RenderFrame synchronously.
 * @deprecated Use buildRenderFrame instead - it's now synchronous.
 */
export function buildRenderFrameSync(
  clips: TimelineClip[],
  tracks: Track[],
  timelineTime: number,
  width: number,
  height: number,
  evaluatorManager: EvaluatorManager,
): RenderFrame {
  return buildRenderFrame(clips, tracks, timelineTime, width, height, evaluatorManager);
}
