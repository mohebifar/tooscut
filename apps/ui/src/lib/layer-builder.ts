/**
 * Layer builder utility for constructing render frames from timeline clips.
 *
 * This module extracts the layer building logic from preview-panel.tsx into a
 * reusable utility. It's used by both preview rendering (live playback) and
 * export (frame-by-frame rendering).
 */

import {
  buildRenderFrame,
  KeyframeEvaluator,
  framesToSeconds,
  type TextLayerData,
  type ShapeLayerData,
  type LineLayerData,
  type LineBox,
  type LineStyle,
  type RenderFrame,
  type Track,
  type TimelineClip,
  type ActiveTransition,
  type ActiveCrossTransition,
  type CrossTransition,
  type Transition,
  type CrossTransitionRef,
  type EditableTrack,
  type FrameRate,
  EvaluatorManager,
} from "@tooscut/render-engine";
import type {
  EditorClip,
  VideoClip,
  ImageClip,
  TextClip,
  ShapeClip,
  LineClip,
  ProjectSettings,
} from "../state/video-editor-store";

export interface LayerBuilderInput {
  clips: EditorClip[];
  tracks: EditableTrack[];
  crossTransitions: CrossTransitionRef[];
  settings: ProjectSettings;
  /** Current timeline position in frames (project frame rate) */
  timelineTime: number;
  evaluatorManager: EvaluatorManager;
  /** If true, ignore muted track filtering (for export) */
  includeMutedTracks?: boolean;
}

export interface LayerBuilderOutput {
  frame: RenderFrame;
  visibleMediaClips: (VideoClip | ImageClip)[];
  visibleTextClips: TextClip[];
  visibleShapeClips: ShapeClip[];
  visibleLineClips: LineClip[];
  /** Clip IDs involved in active cross transitions — need per-clip texture keys */
  crossTransitionTextureMap: Map<string, string>;
}

/**
 * Compute an ActiveTransition for a clip's transition-in at the given time.
 * Returns undefined if no transition or the transition period has elapsed.
 */
function computeTransitionIn(
  clip: { startTime: number; transitionIn?: Transition },
  timelineTime: number,
): ActiveTransition | undefined {
  const t = clip.transitionIn;
  if (!t || t.type === "None" || t.duration <= 0) return undefined;
  const elapsed = timelineTime - clip.startTime;
  if (elapsed >= t.duration) return undefined;
  const progress = elapsed / t.duration;
  return { transition: t, progress: Math.max(0, Math.min(1, progress)) };
}

/**
 * Compute an ActiveTransition for a clip's transition-out at the given time.
 * Returns undefined if no transition or not yet in the transition period.
 */
function computeTransitionOut(
  clip: { startTime: number; duration: number; transitionOut?: Transition },
  timelineTime: number,
): ActiveTransition | undefined {
  const t = clip.transitionOut;
  if (!t || t.type === "None" || t.duration <= 0) return undefined;
  const endTime = clip.startTime + clip.duration;
  const remaining = endTime - timelineTime;
  if (remaining >= t.duration) return undefined;
  const progress = 1 - remaining / t.duration;
  return { transition: t, progress: Math.max(0, Math.min(1, progress)) };
}

/**
 * Compute an ActiveCrossTransition for a clip at the given time.
 * Returns undefined if the clip is not part of any active cross transition.
 */
function computeCrossTransition(
  clipId: string,
  clips: EditorClip[],
  crossTransitions: CrossTransitionRef[],
  timelineTime: number,
): ActiveCrossTransition | undefined {
  for (const ct of crossTransitions) {
    const isOutgoing = ct.outgoingClipId === clipId;
    const isIncoming = ct.incomingClipId === clipId;
    if (!isOutgoing && !isIncoming) continue;

    // Find the outgoing clip to compute overlap region
    const outgoing = clips.find((c) => c.id === ct.outgoingClipId);
    const incoming = clips.find((c) => c.id === ct.incomingClipId);
    if (!outgoing || !incoming) continue;

    // Cross transition occupies the actual overlap between the two clips.
    // With the centered model, incoming.startTime < outgoingEnd.
    const outgoingEnd = outgoing.startTime + outgoing.duration;
    const transitionStart = incoming.startTime;
    const transitionEnd = outgoingEnd;

    if (timelineTime < transitionStart || timelineTime > transitionEnd) continue;

    const transitionDuration = transitionEnd - transitionStart;
    if (transitionDuration <= 0) continue;

    const progress = (timelineTime - transitionStart) / transitionDuration;
    const crossTransition: CrossTransition = {
      type: ct.type,
      duration: ct.duration,
      easing: ct.easing,
    };

    return {
      cross_transition: crossTransition,
      progress: Math.max(0, Math.min(1, progress)),
      is_outgoing: isOutgoing,
    };
  }
  return undefined;
}

/**
 * Build render frame and layers for a given timeline time.
 * Shared between preview-panel (live playback) and export (frame rendering).
 *
 * Performance: single pass over tracks and clips, no intermediate arrays,
 * inline visibility check instead of calling getVisibleClips 3 times.
 */
export function buildLayersForTime(input: LayerBuilderInput): LayerBuilderOutput {
  const {
    clips,
    tracks,
    crossTransitions,
    settings,
    timelineTime,
    evaluatorManager,
    includeMutedTracks,
  } = input;

  // Build track index lookup and render tracks in one pass
  const trackIndexMap = new Map<string, number>();
  const mutedTrackIds = includeMutedTracks ? null : new Set<string>();
  const renderTracks: Track[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.type !== "video") continue;
    trackIndexMap.set(t.id, t.index);
    if (!includeMutedTracks && t.muted) {
      mutedTrackIds!.add(t.id);
    } else {
      renderTracks.push({ id: t.id, index: t.index, type: "video" });
    }
  }

  // Build set of clip IDs involved in cross transitions for extended visibility
  const crossTransitionClipIds = new Set<string>();
  for (const ct of crossTransitions) {
    crossTransitionClipIds.add(ct.outgoingClipId);
    crossTransitionClipIds.add(ct.incomingClipId);
  }

  // Single pass: classify clips by type, inline visibility check, build output arrays directly.
  // Clips are sorted by startTime, so we can't binary-search once for all types
  // (they're interleaved). But we avoid 3× filter + 3× getVisibleClips + 3× map.
  const visibleMediaClips: (VideoClip | ImageClip)[] = [];
  const mediaClipsForRender: TimelineClip[] = [];
  const visibleTextClips: TextClip[] = [];
  const textLayers: TextLayerData[] = [];
  const visibleShapeClips: ShapeClip[] = [];
  const shapeLayers: ShapeLayerData[] = [];
  const visibleLineClips: LineClip[] = [];
  const lineLayers: LineLayerData[] = [];
  // Map clipId → textureId for clips in cross transitions (need per-clip textures)
  const crossTransitionTextureMap = new Map<string, string>();

  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];

    // Early exit: since clips are sorted by startTime, if this clip starts
    // after timelineTime, all subsequent clips also start after — none visible.
    // But skip this optimization if clip is involved in cross transitions
    if (c.startTime > timelineTime && !crossTransitionClipIds.has(c.id)) break;

    // Visibility check: clip is visible if within its time range,
    // OR if it's involved in an active cross transition
    const normallyVisible = timelineTime >= c.startTime && timelineTime < c.startTime + c.duration;
    const hasCrossTransition = crossTransitionClipIds.has(c.id);
    if (!normallyVisible && !hasCrossTransition) continue;

    // For cross transition clips that are not normally visible, check if
    // the cross transition is actually active at this time
    if (!normallyVisible && hasCrossTransition) {
      const ct = computeCrossTransition(c.id, clips, crossTransitions, timelineTime);
      if (!ct) continue;
    }

    // Skip clips on muted tracks
    if (mutedTrackIds !== null && mutedTrackIds.has(c.trackId)) continue;

    const activeCrossTransition = hasCrossTransition
      ? computeCrossTransition(c.id, clips, crossTransitions, timelineTime)
      : undefined;

    const type = c.type;
    if (type === "video" || type === "image") {
      const mc = c as VideoClip | ImageClip;
      visibleMediaClips.push(mc);
      // When a clip is in a cross transition, use its clip ID as texture key
      // so that two clips from the same asset get separate textures.
      const textureId = activeCrossTransition ? mc.id : mc.assetId;
      if (activeCrossTransition) {
        crossTransitionTextureMap.set(mc.id, textureId);
      }
      mediaClipsForRender.push({
        id: mc.id,
        assetId: textureId,
        trackId: mc.trackId,
        startTime: mc.startTime,
        duration: mc.duration,
        inPoint: mc.inPoint,
        transform: mc.transform,
        effects: mc.effects,
        keyframes: mc.keyframes,
        transitionIn: computeTransitionIn(mc, timelineTime),
        transitionOut: computeTransitionOut(mc, timelineTime),
        crossTransition: activeCrossTransition,
      });
    } else if (type === "text") {
      const tc = c as TextClip;
      visibleTextClips.push(tc);
      textLayers.push({
        id: tc.id,
        text: tc.text,
        box: tc.textBox,
        style: tc.textStyle,
        z_index: trackIndexMap.get(tc.trackId) ?? 0,
        opacity: tc.effects?.opacity ?? 1,
        transition_in: computeTransitionIn(tc, timelineTime),
        transition_out: computeTransitionOut(tc, timelineTime),
      });
    } else if (type === "shape") {
      const sc = c as ShapeClip;
      visibleShapeClips.push(sc);

      let box = sc.shapeBox;
      let style = sc.shapeStyle;
      let opacity = sc.effects?.opacity ?? 1;

      if (sc.keyframes?.tracks?.length) {
        // Keyframes are in seconds — convert frame-based local time to seconds
        const localTimeSeconds = framesToSeconds(timelineTime - sc.startTime, settings.fps);
        const evaluator = new KeyframeEvaluator(sc.keyframes);
        const ex = evaluator.evaluate("x", localTimeSeconds);
        const ey = evaluator.evaluate("y", localTimeSeconds);
        const ew = evaluator.evaluate("width", localTimeSeconds);
        const eh = evaluator.evaluate("height", localTimeSeconds);
        const cr = evaluator.evaluate("cornerRadius", localTimeSeconds);
        const sw = evaluator.evaluate("strokeWidth", localTimeSeconds);
        const op = evaluator.evaluate("opacity", localTimeSeconds);

        if (!Number.isNaN(ex) || !Number.isNaN(ey) || !Number.isNaN(ew) || !Number.isNaN(eh)) {
          box = {
            x: Number.isNaN(ex) ? box.x : ex,
            y: Number.isNaN(ey) ? box.y : ey,
            width: Number.isNaN(ew) ? box.width : ew,
            height: Number.isNaN(eh) ? box.height : eh,
          };
        }
        if (!Number.isNaN(cr) || !Number.isNaN(sw)) {
          style = {
            ...style,
            ...(Number.isNaN(cr) ? {} : { corner_radius: cr }),
            ...(Number.isNaN(sw) ? {} : { stroke_width: sw }),
          };
        }
        if (!Number.isNaN(op)) {
          opacity = op;
        }
      }

      shapeLayers.push({
        id: sc.id,
        shape: sc.shape,
        box,
        style,
        z_index: trackIndexMap.get(sc.trackId) ?? 0,
        opacity,
        transition_in: computeTransitionIn(sc, timelineTime),
        transition_out: computeTransitionOut(sc, timelineTime),
      });
    } else if (type === "line") {
      const lc = c as LineClip;
      visibleLineClips.push(lc);

      let box: LineBox = lc.lineBox;
      let style: LineStyle = lc.lineStyle;
      let opacity = lc.effects?.opacity ?? 1;

      if (lc.keyframes?.tracks?.length) {
        // Keyframes are in seconds — convert frame-based local time to seconds
        const localTimeSeconds = framesToSeconds(timelineTime - lc.startTime, settings.fps);
        const evaluator = new KeyframeEvaluator(lc.keyframes);
        const x1 = evaluator.evaluate("x1", localTimeSeconds);
        const y1 = evaluator.evaluate("y1", localTimeSeconds);
        const x2 = evaluator.evaluate("x2", localTimeSeconds);
        const y2 = evaluator.evaluate("y2", localTimeSeconds);
        const sw = evaluator.evaluate("strokeWidth", localTimeSeconds);
        const op = evaluator.evaluate("opacity", localTimeSeconds);

        if (!Number.isNaN(x1) || !Number.isNaN(y1) || !Number.isNaN(x2) || !Number.isNaN(y2)) {
          box = {
            x1: Number.isNaN(x1) ? box.x1 : x1,
            y1: Number.isNaN(y1) ? box.y1 : y1,
            x2: Number.isNaN(x2) ? box.x2 : x2,
            y2: Number.isNaN(y2) ? box.y2 : y2,
          };
        }
        if (!Number.isNaN(sw)) {
          style = { ...style, stroke_width: sw };
        }
        if (!Number.isNaN(op)) {
          opacity = op;
        }
      }

      lineLayers.push({
        id: lc.id,
        box,
        style,
        z_index: trackIndexMap.get(lc.trackId) ?? 0,
        opacity,
        transition_in: computeTransitionIn(lc, timelineTime),
        transition_out: computeTransitionOut(lc, timelineTime),
      });
    }
    // audio clips are skipped — not rendered visually
  }

  // Convert frame-based timeline time to seconds for the RenderFrame
  // (compositor and keyframe evaluator expect seconds)
  const timelineTimeSeconds = framesToSeconds(timelineTime, settings.fps);

  const frame = buildRenderFrame({
    mediaClips: mediaClipsForRender,
    textLayers,
    shapeLayers,
    lineLayers,
    tracks: renderTracks,
    trackIndexMap,
    timelineTime: timelineTimeSeconds,
    width: settings.width,
    height: settings.height,
    evaluatorManager,
  });

  return {
    frame,
    visibleMediaClips,
    visibleTextClips,
    visibleShapeClips,
    visibleLineClips,
    crossTransitionTextureMap,
  };
}

/**
 * Calculate source time (in seconds) for a clip given timeline frame.
 * All clip fields are in frames. Returns seconds for video frame extraction.
 */
export function calculateSourceTime(
  timelineFrame: number,
  clip: { startTime: number; inPoint: number; speed?: number },
  fps: FrameRate,
): number {
  const clipLocalFrames = timelineFrame - clip.startTime;
  const speed = clip.speed ?? 1;
  const sourceFrames = clip.inPoint + clipLocalFrames * speed;
  return framesToSeconds(sourceFrames, fps);
}

/**
 * Get all unique asset IDs from visible clips.
 * Useful for preloading textures.
 */
export function getVisibleAssetIds(visibleClips: EditorClip[]): Set<string> {
  const assetIds = new Set<string>();
  for (const clip of visibleClips) {
    if ("assetId" in clip) {
      assetIds.add(clip.assetId);
    }
  }
  return assetIds;
}

/**
 * Get all frames that need to be rendered for export.
 * @param durationFrames - Total project duration in frames
 * @returns Array of frame indices
 */
export function getExportFrames(durationFrames: number): Array<{ frameIndex: number }> {
  return Array.from({ length: durationFrames }, (_, i) => ({ frameIndex: i }));
}

/**
 * Get all unique font families used in text clips.
 */
export function getTextClipFontFamilies(clips: EditorClip[]): Set<string> {
  const families = new Set<string>();
  for (const clip of clips) {
    if (clip.type === "text") {
      families.add(clip.textStyle.font_family);
    }
  }
  return families;
}
