import type { TemporalState } from "zundo";

import {
  type EditableClip,
  type EditableTrack,
  type Transform,
  type Effects,
  type TextStyle,
  type TextBox,
  type ShapeType,
  type ShapeStyle,
  type ShapeBox,
  type LineStyle,
  type LineBox,
  type KeyframeTracks,
  type Keyframe,
  type AnimatableProperty,
  type Interpolation,
  type EasingPreset,
  type Transition,
  type CrossTransitionRef,
  type CrossTransitionType,
  type AudioEffectsParams,
  type FrameRate,
  addTrackPair,
  removeTrackPair,
  addClip,
  removeClipWithLinked,
  moveClip,
  moveClipToTrack,
  trimClipLeft,
  trimClipRight,
  splitClipWithLinked,
  linkClips,
  unlinkClip,
  findClipById,
  sortClipsByStartTime,
  addCrossTransition,
  removeCrossTransition,
  removeCrossTransitionsForClip,
  type TimelineClip as RenderTimelineClip,
  type Track as RenderTrack,
} from "@tooscut/render-engine";
import { temporal } from "zundo";
/**
 * Main video editor state store using render-engine clip operations.
 *
 * This store manages the editor state including tracks, clips, and assets.
 * All clip operations use the immutable functions from @tooscut/render-engine.
 */
import { create } from "zustand";
import { useStore } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ============================================================================
// Types
// ============================================================================

/**
 * Base for visual clips (video, image, text, shape) with transform/effects.
 */
interface VisualClipBase extends EditableClip {
  name?: string;
  speed: number;
  assetDuration?: number;
  transform: Partial<Transform>;
  effects?: Partial<Effects>;
  keyframes?: KeyframeTracks;
  transitionIn?: Transition;
  transitionOut?: Transition;
}

export interface VideoClip extends VisualClipBase {
  type: "video";
  assetId: string;
  volume?: number;
  linkedClipId?: string;
}

export interface AudioClip extends EditableClip {
  type: "audio";
  assetId: string;
  name?: string;
  speed: number;
  assetDuration?: number;
  volume?: number;
  linkedClipId?: string;
  /** Keyframe animation data (e.g., volume automation) */
  keyframes?: KeyframeTracks;
  /** Per-clip audio effects (EQ, compressor, noise gate, reverb) */
  audioEffects?: AudioEffectsParams;
}

export interface ImageClip extends VisualClipBase {
  type: "image";
  assetId: string;
}

export interface TextClip extends VisualClipBase {
  type: "text";
  text: string;
  textStyle: TextStyle;
  textBox: TextBox;
}

export interface ShapeClip extends VisualClipBase {
  type: "shape";
  shape: ShapeType;
  shapeStyle: ShapeStyle;
  shapeBox: ShapeBox;
}

export interface LineClip extends VisualClipBase {
  type: "line";
  lineStyle: LineStyle;
  lineBox: LineBox;
}

export type EditorClip = VideoClip | AudioClip | ImageClip | TextClip | ShapeClip | LineClip;

/** Input type for adding a new clip (id, inPoint, trackId, transform generated automatically) */
interface NewClipInput {
  type: EditorClip["type"];
  startTime: number;
  duration: number;
  speed: number;
  trackId?: string;
  name?: string;
  assetId?: string;
  assetDuration?: number;
  transform?: Partial<Transform>;
  effects?: Partial<Effects>;
  volume?: number;
  linkedClipId?: string;
  keyframes?: KeyframeTracks;
  text?: string;
  textStyle?: TextStyle;
  textBox?: TextBox;
  shape?: ShapeType;
  shapeStyle?: ShapeStyle;
  shapeBox?: ShapeBox;
  lineStyle?: LineStyle;
  lineBox?: LineBox;
}

/**
 * Media asset stored in the editor.
 * Duration is in frame counts relative to the project frame rate.
 */
export interface MediaAsset {
  id: string;
  type: "video" | "audio" | "image";
  name: string;
  url: string;
  /** Asset duration in frames (project frame rate) */
  duration: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  /** Native frame rate of the source media (for frame-accurate extraction) */
  sourceFps?: FrameRate;
}

/**
 * Project settings.
 */
export interface ProjectSettings {
  width: number;
  height: number;
  fps: FrameRate;
}

// ============================================================================
// Store Interface
// ============================================================================

interface VideoEditorState {
  // Project settings
  settings: ProjectSettings;

  // Timeline state
  tracks: EditableTrack[];
  clips: EditorClip[];
  crossTransitions: CrossTransitionRef[];
  /** Current playhead position in frames (project frame rate) */
  currentFrame: number;
  /** Total project duration in frames (project frame rate) */
  durationFrames: number;
  isPlaying: boolean;
  /** Incremented on user-initiated seeks so audio engine can detect them */
  seekVersion: number;

  // Selection state
  selectedClipIds: string[];
  selectedTransition: { clipId: string; edge: "in" | "out" } | null;
  selectedCrossTransition: string | null;

  // Clipboard (not tracked by undo/redo)
  clipboard: EditorClip[];

  // View state
  zoom: number;
  scrollX: number;
  scrollY: number;
  trackHeights: Record<string, number>;
  activeTool: "select" | "razor";
  previewMode: "view" | "transform";
  /** Preview canvas zoom: "fit" auto-fills container, or a percentage (e.g. 50, 100) */
  previewZoom: "fit" | number;

  // Assets
  assets: MediaAsset[];

  // Actions - Project
  loadProject: (data: {
    tracks: EditableTrack[];
    clips: EditorClip[];
    crossTransitions?: CrossTransitionRef[];
    assets: MediaAsset[];
    settings: ProjectSettings;
  }) => void;
  resetStore: () => void;
  setSettings: (settings: Partial<ProjectSettings>) => void;
  updateAssetUrl: (assetId: string, url: string) => void;

  // Actions - Playback
  setCurrentFrame: (frame: number) => void;
  /** Seek to a frame (user-initiated) — also increments seekVersion for audio sync */
  seekTo: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayback: () => void;

  // Actions - View
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setScrollY: (scrollY: number) => void;
  setTrackHeight: (trackId: string, height: number) => void;
  setActiveTool: (tool: "select" | "razor") => void;
  setPreviewMode: (mode: "view" | "transform") => void;
  setPreviewZoom: (zoom: "fit" | number) => void;

  // Actions - Selection
  setSelectedClipIds: (ids: string[]) => void;
  setSelectedTransition: (selection: { clipId: string; edge: "in" | "out" } | null) => void;
  setSelectedCrossTransition: (id: string | null) => void;
  clearSelection: () => void;

  // Actions - Clipboard
  copySelectedClips: () => void;
  pasteClipsAtPlayhead: () => void;

  // Actions - Tracks
  addTrack: () => { videoTrackId: string; audioTrackId: string };
  removeTrack: (trackId: string) => void;
  toggleTrackMuted: (trackId: string) => void;
  toggleTrackLocked: (trackId: string) => void;

  // Actions - Clips
  addClipToTrack: (clip: NewClipInput) => string;
  removeClip: (clipId: string) => void;
  moveClipTime: (clipId: string, newStartTime: number) => void;
  moveClipTrack: (clipId: string, newTrackId: string) => void;
  moveClipTimeAndTrack: (clipId: string, newStartTime: number, newTrackId: string) => void;
  batchMoveClips: (moves: Array<{ clipId: string; newStartTime: number }>) => void;
  trimLeft: (clipId: string, newStartTime: number) => void;
  trimRight: (clipId: string, newDuration: number) => void;
  batchTrimClips: (
    edge: "left" | "right",
    trims: Array<{ clipId: string; newStartTime: number; newDuration: number }>,
  ) => void;
  linkClipPair: (clipId1: string, clipId2: string) => void;
  unlinkClipPair: (clipId: string) => void;
  splitClipAtTime: (clipId: string, time: number) => void;
  updateClipTransform: (clipId: string, transform: Partial<Transform>) => void;
  updateClipEffects: (clipId: string, effects: Partial<Effects>) => void;
  updateClipVolume: (clipId: string, volume: number) => void;
  updateClipSpeed: (clipId: string, speed: number) => void;
  updateClipAudioEffects: (
    clipId: string,
    effectType: keyof AudioEffectsParams,
    params: Record<string, number>,
  ) => void;
  toggleClipAudioEffect: (
    clipId: string,
    effectType: keyof AudioEffectsParams,
    enabled: boolean,
  ) => void;

  // Actions - Text clips
  updateClipText: (clipId: string, text: string) => void;
  updateClipTextStyle: (clipId: string, style: Partial<TextStyle>) => void;
  updateClipTextBox: (clipId: string, box: Partial<TextBox>) => void;

  // Actions - Shape clips
  updateClipShape: (clipId: string, shape: ShapeType) => void;
  updateClipShapeStyle: (clipId: string, style: Partial<ShapeStyle>) => void;
  updateClipShapeBox: (clipId: string, box: Partial<ShapeBox>) => void;

  // Actions - Line clips
  updateClipLineStyle: (clipId: string, style: Partial<LineStyle>) => void;
  updateClipLineBox: (clipId: string, box: Partial<LineBox>) => void;

  // Actions - Keyframes
  addKeyframe: (
    clipId: string,
    property: AnimatableProperty,
    time: number,
    value: number,
    options?: { interpolation?: Interpolation; easing?: EasingPreset },
  ) => void;
  updateKeyframe: (
    clipId: string,
    property: AnimatableProperty,
    keyframeIndex: number,
    updates: Partial<Keyframe>,
  ) => void;
  deleteKeyframe: (clipId: string, property: AnimatableProperty, keyframeIndex: number) => void;
  removeAllKeyframes: (clipId: string, property: AnimatableProperty) => void;

  // Actions - Transitions
  setClipTransitionIn: (clipId: string, transition: Transition | null) => void;
  setClipTransitionOut: (clipId: string, transition: Transition | null) => void;
  addCrossTransitionBetween: (
    outgoingClipId: string,
    incomingClipId: string,
    type: CrossTransitionType,
    duration: number,
  ) => void;
  removeCrossTransitionById: (crossTransitionId: string) => void;
  updateCrossTransitionDuration: (crossTransitionId: string, duration: number) => void;

  // Actions - Assets
  addAsset: (asset: MediaAsset) => void;
  addAssets: (assets: MediaAsset[]) => void;
  removeAsset: (assetId: string) => void;

  // Computed - Get clips and tracks for rendering
  getTracksForRender: () => RenderTrack[];
  getClipsForRender: () => RenderTimelineClip[];
  getVisibleClipsAtTime: (time: number) => EditorClip[];
}

// ============================================================================
// Helpers
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Filter out cross transitions that are no longer valid (clips separated, removed, or on different tracks).
 */
function validateCrossTransitions(
  clips: EditorClip[],
  crossTransitions: CrossTransitionRef[],
): CrossTransitionRef[] {
  return crossTransitions.filter((ct) => {
    const outgoing = clips.find((c) => c.id === ct.outgoingClipId);
    const incoming = clips.find((c) => c.id === ct.incomingClipId);
    if (!outgoing || !incoming) return false;
    if (outgoing.trackId !== incoming.trackId) return false;
    const outgoingEnd = outgoing.startTime + outgoing.duration;
    const gap = incoming.startTime - outgoingEnd;
    return gap <= 1;
  });
}

/**
 * How much timeline time a clip's end can be extended (source material after current out-point).
 */
function availableExtensionAfter(clip: EditorClip): number {
  if (
    clip.type === "image" ||
    clip.type === "text" ||
    clip.type === "shape" ||
    clip.type === "line"
  )
    return Infinity;
  const speed = clip.speed ?? 1;
  const assetDur = clip.assetDuration ?? clip.duration;
  const sourceEnd = clip.inPoint + clip.duration * speed;
  return Math.max(0, (assetDur - sourceEnd) / speed);
}

/**
 * How much timeline time a clip's start can be extended backward (source material before in-point).
 */
function availableExtensionBefore(clip: EditorClip): number {
  if (
    clip.type === "image" ||
    clip.type === "text" ||
    clip.type === "shape" ||
    clip.type === "line"
  )
    return Infinity;
  const speed = clip.speed ?? 1;
  return Math.max(0, clip.inPoint / speed);
}

/** Calculate project duration in frames. Adds 150 frames (~5s at 30fps) padding after last clip. */
function calculateDurationFrames(clips: EditorClip[], fps: FrameRate): number {
  const fpsFloat = fps.numerator / fps.denominator;
  const defaultDuration = Math.round(30 * fpsFloat); // 30 seconds default
  const padding = Math.round(5 * fpsFloat); // 5 seconds padding
  if (clips.length === 0) return defaultDuration;
  const maxEnd = Math.max(...clips.map((c) => c.startTime + c.duration));
  return Math.max(defaultDuration, maxEnd + padding);
}

/**
 * Get the paired track ID for a given track.
 * Uses the pairedTrackId field from the track.
 */
function getPairedTrackIdFromTracks(tracks: EditableTrack[], trackId: string): string | null {
  const track = tracks.find((t) => t.id === trackId);
  return track?.pairedTrackId ?? null;
}

/**
 * Check if a clip type is compatible with a track type.
 * - Audio tracks: only audio clips
 * - Video tracks: video, image, text, shape clips (everything except audio)
 */
function isClipCompatibleWithTrack(
  clipType: EditorClip["type"],
  trackType: "video" | "audio",
): boolean {
  if (trackType === "audio") {
    return clipType === "audio";
  }
  // Video tracks accept everything except audio
  return clipType !== "audio";
}

/**
 * Check if a clip is on a locked track.
 */
function isClipOnLockedTrack(clip: EditorClip, tracks: EditableTrack[]): boolean {
  const track = tracks.find((t) => t.id === clip.trackId);
  return track?.locked ?? false;
}

/**
 * Trim or split a clip and its linked clip to avoid overlap.
 * Returns the modified/new clips, or empty array if fully covered (delete).
 */
function trimClipForOverlap(
  clip: EditorClip,
  linkedClip: EditorClip | null,
  movingStart: number,
  movingEnd: number,
): EditorClip[] {
  const clipEnd = clip.startTime + clip.duration;

  // Case 1: Moving clip fully covers existing clip - delete it
  if (movingStart <= clip.startTime && movingEnd >= clipEnd) {
    return [];
  }

  // Case 2: Moving clip overlaps start of existing - trim from start
  if (movingStart <= clip.startTime && movingEnd > clip.startTime && movingEnd < clipEnd) {
    const trimAmount = movingEnd - clip.startTime;
    const trimmedClip: EditorClip = {
      ...clip,
      startTime: movingEnd,
      duration: clip.duration - trimAmount,
      inPoint: clip.inPoint + trimAmount / clip.speed,
    };
    const result = [trimmedClip];

    // Apply same trim to linked clip
    if (linkedClip) {
      result.push({
        ...linkedClip,
        startTime: movingEnd,
        duration: linkedClip.duration - trimAmount,
        inPoint: linkedClip.inPoint + trimAmount / linkedClip.speed,
      });
    }
    return result;
  }

  // Case 3: Moving clip overlaps end of existing - trim from end
  if (movingStart > clip.startTime && movingStart < clipEnd && movingEnd >= clipEnd) {
    const newDuration = movingStart - clip.startTime;
    const trimmedClip: EditorClip = {
      ...clip,
      duration: newDuration,
    };
    const result = [trimmedClip];

    // Apply same trim to linked clip
    if (linkedClip) {
      result.push({
        ...linkedClip,
        duration: newDuration,
      });
    }
    return result;
  }

  // Case 4: Moving clip is inside existing - split into two clips
  if (movingStart > clip.startTime && movingEnd < clipEnd) {
    const leftDuration = movingStart - clip.startTime;
    const rightStart = movingEnd;
    const rightDuration = clipEnd - movingEnd;
    const rightInPointOffset = (movingEnd - clip.startTime) / clip.speed;

    const leftClip: EditorClip = {
      ...clip,
      duration: leftDuration,
      // Clear linked clip - we'll re-link the split clips
      linkedClipId: undefined,
    };

    const rightClip: EditorClip = {
      ...clip,
      id: `${clip.id}-split`,
      startTime: rightStart,
      duration: rightDuration,
      inPoint: clip.inPoint + rightInPointOffset,
      linkedClipId: undefined,
    };

    const result = [leftClip, rightClip];

    // Apply same split to linked clip
    if (linkedClip) {
      const linkedLeftClip: EditorClip = {
        ...linkedClip,
        duration: leftDuration,
        linkedClipId: leftClip.id,
      };
      leftClip.linkedClipId = linkedLeftClip.id;

      const linkedRightClip: EditorClip = {
        ...linkedClip,
        id: `${linkedClip.id}-split`,
        startTime: rightStart,
        duration: rightDuration,
        inPoint: linkedClip.inPoint + rightInPointOffset,
        linkedClipId: rightClip.id,
      };
      rightClip.linkedClipId = linkedRightClip.id;

      result.push(linkedLeftClip, linkedRightClip);
    }

    return result;
  }

  // No overlap - return unchanged
  return linkedClip ? [clip, linkedClip] : [clip];
}

/**
 * Resolve overlapping clips on the same track.
 * The moving clip takes priority - overlapping clips are trimmed or split.
 * Only fully covered clips are deleted.
 *
 * @param newDuration - Optional new duration for trim operations (uses clip.duration if not provided)
 */
function resolveOverlaps(
  clips: EditorClip[],
  tracks: EditableTrack[],
  movingClipId: string,
  newStartTime: number,
  newTrackId: string,
  newDuration?: number,
): EditorClip[] {
  const movingClip = clips.find((c) => c.id === movingClipId);
  if (!movingClip) return clips;

  const movingEnd = newStartTime + (newDuration ?? movingClip.duration);

  // Include linked clip in the "safe" set
  const safeIds = new Set([movingClipId]);
  if (movingClip.linkedClipId) {
    safeIds.add(movingClip.linkedClipId);
  }

  // Get the paired track for checking linked clip overlaps
  const linkedMovingClip = movingClip.linkedClipId
    ? clips.find((c) => c.id === movingClip.linkedClipId)
    : null;

  // Determine linked clip's target track using pairedTrackId from tracks
  const linkedTrackId = linkedMovingClip ? getPairedTrackIdFromTracks(tracks, newTrackId) : null;

  // Track which clips to remove and which to add
  const clipsToRemove = new Set<string>();
  const clipsToAdd: EditorClip[] = [];

  // Process clips that might overlap
  const processedLinkedIds = new Set<string>();

  for (const clip of clips) {
    if (safeIds.has(clip.id)) continue;
    if (processedLinkedIds.has(clip.id)) continue;

    // Check if this clip overlaps on main track or linked track
    const isOnMainTrack = clip.trackId === newTrackId;
    const isOnLinkedTrack = linkedTrackId && clip.trackId === linkedTrackId;

    if (!isOnMainTrack && !isOnLinkedTrack) continue;

    const clipEnd = clip.startTime + clip.duration;
    const hasOverlap = !(movingEnd <= clip.startTime || newStartTime >= clipEnd);

    if (!hasOverlap) continue;

    // Get the linked clip for this overlapping clip
    const linkedClip = clip.linkedClipId ? clips.find((c) => c.id === clip.linkedClipId) : null;

    // Mark both clips for removal (we'll add trimmed versions)
    clipsToRemove.add(clip.id);
    if (linkedClip) {
      clipsToRemove.add(linkedClip.id);
      processedLinkedIds.add(linkedClip.id);
    }

    // Get trimmed/split clips
    const trimmedClips = trimClipForOverlap(clip, linkedClip ?? null, newStartTime, movingEnd);
    clipsToAdd.push(...trimmedClips);
  }

  // Build result: keep non-overlapping clips, add trimmed/split clips
  const result = clips.filter((c) => !clipsToRemove.has(c.id));
  result.push(...clipsToAdd);

  return result;
}

// ============================================================================
// Store
// ============================================================================

/** State fields tracked by undo/redo history */
type TrackedState = Pick<
  VideoEditorState,
  "tracks" | "clips" | "crossTransitions" | "assets" | "settings"
>;

export const useVideoEditorStore = create<VideoEditorState>()(
  subscribeWithSelector(
    temporal(
      (set, get) => ({
        // Initial state
        settings: {
          width: 1920,
          height: 1080,
          fps: { numerator: 30, denominator: 1 },
        },

        tracks: [],
        clips: [],
        crossTransitions: [],
        currentFrame: 0,
        durationFrames: 900, // 30s at 30fps
        isPlaying: false,
        seekVersion: 0,

        selectedClipIds: [],
        selectedTransition: null,
        selectedCrossTransition: null,
        clipboard: [],

        zoom: 1.67, // pixels per frame (~50px/s at 30fps)
        scrollX: 0,
        scrollY: 0,
        trackHeights: {},
        activeTool: "select" as const,
        previewMode: "transform" as const,
        previewZoom: "fit",

        assets: [],

        // Project actions
        loadProject: (data) =>
          set({
            tracks: data.tracks,
            clips: data.clips,
            crossTransitions: data.crossTransitions ?? [],
            assets: data.assets,
            settings: data.settings,
            currentFrame: 0,
            isPlaying: false,
            selectedClipIds: [],
            selectedTransition: null,
            selectedCrossTransition: null,
            durationFrames: calculateDurationFrames(data.clips, data.settings.fps),
          }),

        resetStore: () =>
          set({
            tracks: [],
            clips: [],
            crossTransitions: [],
            assets: [],
            settings: { width: 1920, height: 1080, fps: { numerator: 30, denominator: 1 } },
            currentFrame: 0,
            isPlaying: false,
            selectedClipIds: [],
            selectedTransition: null,
            selectedCrossTransition: null,
            zoom: 1.67, // pixels per frame (~50px/s at 30fps)
            scrollX: 0,
            scrollY: 0,
            trackHeights: {},
            activeTool: "select" as const,
            durationFrames: 900, // 30s at 30fps
          }),

        setSettings: (updates) =>
          set((state) => ({
            settings: { ...state.settings, ...updates },
          })),

        updateAssetUrl: (assetId, url) =>
          set((state) => ({
            assets: state.assets.map((a) => (a.id === assetId ? { ...a, url } : a)),
          })),

        // Playback actions
        setCurrentFrame: (frame) => set({ currentFrame: Math.max(0, Math.round(frame)) }),
        seekTo: (frame) =>
          set((state) => ({
            currentFrame: Math.max(0, Math.round(frame)),
            seekVersion: state.seekVersion + 1,
          })),
        setIsPlaying: (isPlaying) => set({ isPlaying }),
        togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

        // View actions
        setZoom: (zoom) => set({ zoom: Math.max(0.03, Math.min(20, zoom)) }),
        setScrollX: (scrollX) => set({ scrollX: Math.max(0, scrollX) }),
        setScrollY: (scrollY) => set({ scrollY: Math.max(0, scrollY) }),
        setTrackHeight: (trackId, height) =>
          set((state) => {
            const updates: Record<string, number> = { [trackId]: height };
            // Mirror height to paired track
            const pairedId = getPairedTrackIdFromTracks(state.tracks, trackId);
            if (pairedId) updates[pairedId] = height;
            return { trackHeights: { ...state.trackHeights, ...updates } };
          }),
        setActiveTool: (activeTool) => set({ activeTool }),
        setPreviewMode: (previewMode) => set({ previewMode }),
        setPreviewZoom: (previewZoom) => set({ previewZoom }),

        // Selection actions
        setSelectedClipIds: (ids) =>
          set({ selectedClipIds: ids, selectedTransition: null, selectedCrossTransition: null }),
        setSelectedTransition: (selection) =>
          set({
            selectedTransition: selection,
            selectedClipIds: [],
            selectedCrossTransition: null,
          }),
        setSelectedCrossTransition: (id) =>
          set({ selectedCrossTransition: id, selectedClipIds: [], selectedTransition: null }),
        clearSelection: () =>
          set({ selectedClipIds: [], selectedTransition: null, selectedCrossTransition: null }),

        // Clipboard actions
        copySelectedClips: () => {
          const state = get();
          if (state.selectedClipIds.length === 0) return;
          const clipsToCopy = state.clips.filter((c) => state.selectedClipIds.includes(c.id));
          set({ clipboard: clipsToCopy });
        },

        pasteClipsAtPlayhead: () => {
          const state = get();
          if (state.clipboard.length === 0) return;

          // Calculate the offset: shift all pasted clips so the earliest starts at playhead
          const earliestStart = Math.min(...state.clipboard.map((c) => c.startTime));
          const offset = state.currentFrame - earliestStart;

          // Build an old-id → new-id map for relinking
          const idMap = new Map<string, string>();
          for (const clip of state.clipboard) {
            idMap.set(clip.id, generateId());
          }

          const newClipIds: string[] = [];
          for (const clip of state.clipboard) {
            const newId = idMap.get(clip.id)!;
            newClipIds.push(newId);

            // Resolve linked clip id within the pasted group
            let newLinkedId: string | undefined;
            if ("linkedClipId" in clip && clip.linkedClipId) {
              newLinkedId = idMap.get(clip.linkedClipId);
            }

            const newClip: EditorClip = {
              ...clip,
              id: newId,
              startTime: clip.startTime + offset,
              ...(newLinkedId !== undefined
                ? { linkedClipId: newLinkedId }
                : { linkedClipId: undefined }),
            } as EditorClip;

            set((s) => {
              let clips = addClip(s.clips, newClip);
              clips = resolveOverlaps(clips, s.tracks, newId, newClip.startTime, newClip.trackId);
              return { clips, durationFrames: calculateDurationFrames(clips, get().settings.fps) };
            });
          }

          // Select the newly pasted clips
          set({ selectedClipIds: newClipIds });
        },

        // Track actions
        addTrack: () => {
          const videoTrackId = generateId();
          const audioTrackId = generateId();

          set((state) => {
            // Name is optional - UI derives names from position (e.g., "Video 1", "Audio 1")
            const { tracks } = addTrackPair(state.tracks, videoTrackId, audioTrackId);
            return { tracks };
          });

          return { videoTrackId, audioTrackId };
        },

        removeTrack: (trackId) =>
          set((state) => {
            const { tracks, clips } = removeTrackPair(state.tracks, state.clips, trackId);
            return {
              tracks,
              clips,
              selectedClipIds: state.selectedClipIds.filter((id) => clips.some((c) => c.id === id)),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        toggleTrackMuted: (trackId) =>
          set((state) => ({
            tracks: state.tracks.map((track) =>
              track.id === trackId ? { ...track, muted: !track.muted } : track,
            ),
          })),

        toggleTrackLocked: (trackId) =>
          set((state) => ({
            tracks: state.tracks.map((track) =>
              track.id === trackId ? { ...track, locked: !track.locked } : track,
            ),
          })),

        // Clip actions
        addClipToTrack: (clipData) => {
          const id = generateId();
          const state = get();

          // Determine the appropriate track type for this clip
          const isAudioClip = clipData.type === "audio";
          const requiredTrackType = isAudioClip ? "audio" : "video";

          // Default to first track of the appropriate type if not specified
          let trackId = clipData.trackId;
          if (!trackId) {
            const targetTrack = state.tracks.find((t) => t.type === requiredTrackType);
            if (!targetTrack) {
              // Create a track pair first
              const { videoTrackId, audioTrackId } = get().addTrack();
              trackId = isAudioClip ? audioTrackId : videoTrackId;
            } else {
              trackId = targetTrack.id;
            }
          } else {
            // Validate that the specified track is compatible with the clip type
            const track = state.tracks.find((t) => t.id === trackId);
            if (track && !isClipCompatibleWithTrack(clipData.type, track.type)) {
              console.warn(
                `Cannot add ${clipData.type} clip to ${track.type} track. ` +
                  `${clipData.type} clips can only be added to ${requiredTrackType} tracks.`,
              );
              return id; // Return without adding the clip
            }
          }

          const defaultTransform: Partial<Transform> = {
            x: state.settings.width / 2,
            y: state.settings.height / 2,
            scale_x: 1,
            scale_y: 1,
            rotation: 0,
            anchor_x: 0.5,
            anchor_y: 0.5,
          };

          const newClip =
            clipData.type === "audio"
              ? ({
                  id,
                  ...clipData,
                  trackId,
                  inPoint: 0,
                } as AudioClip)
              : ({
                  id,
                  ...clipData,
                  trackId,
                  inPoint: 0,
                  transform: { ...defaultTransform, ...clipData.transform },
                } as EditorClip);

          set((state) => {
            let clips = addClip(state.clips, newClip);
            clips = resolveOverlaps(clips, state.tracks, id, newClip.startTime, trackId);
            return {
              clips,
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          });

          return id;
        },

        removeClip: (clipId) =>
          set((state) => {
            const [, clip] = findClipById(state.clips, clipId);
            if (!clip || isClipOnLockedTrack(clip, state.tracks)) return state;

            const clips = removeClipWithLinked(state.clips, clipId);
            const crossTransitions = removeCrossTransitionsForClip(state.crossTransitions, clipId);
            return {
              clips,
              crossTransitions,
              selectedClipIds: state.selectedClipIds.filter((id) => clips.some((c) => c.id === id)),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        moveClipTime: (clipId, newStartTime) =>
          set((state) => {
            const clampedTime = Math.max(0, newStartTime);
            const [, clip] = findClipById(state.clips, clipId);
            if (!clip || isClipOnLockedTrack(clip, state.tracks)) return state;

            let clips = resolveOverlaps(
              state.clips,
              state.tracks,
              clipId,
              clampedTime,
              clip.trackId,
            );
            clips = moveClip(clips, clipId, clampedTime);

            return {
              clips,
              crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        moveClipTrack: (clipId, newTrackId) =>
          set((state) => {
            const [, clip] = findClipById(state.clips, clipId);
            if (!clip || isClipOnLockedTrack(clip, state.tracks)) return state;

            // Validate track compatibility
            const newTrack = state.tracks.find((t) => t.id === newTrackId);
            if (!newTrack || !isClipCompatibleWithTrack(clip.type, newTrack.type)) {
              return state; // Don't move if incompatible
            }

            // Don't move to a locked track
            if (newTrack.locked) return state;

            let clips = resolveOverlaps(
              state.clips,
              state.tracks,
              clipId,
              clip.startTime,
              newTrackId,
            );
            clips = moveClipToTrack(clips, clipId, newTrackId);

            // Move linked clip to paired track
            if (clip.linkedClipId) {
              const pairedTrackId = getPairedTrackIdFromTracks(state.tracks, newTrackId);
              if (pairedTrackId) {
                clips = moveClipToTrack(clips, clip.linkedClipId, pairedTrackId);
              }
            }

            return {
              clips,
              crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
            };
          }),

        moveClipTimeAndTrack: (clipId, newStartTime, newTrackId) =>
          set((state) => {
            const clampedTime = Math.max(0, newStartTime);
            const [, clip] = findClipById(state.clips, clipId);
            if (!clip || isClipOnLockedTrack(clip, state.tracks)) return state;

            // Validate track compatibility
            const newTrack = state.tracks.find((t) => t.id === newTrackId);
            if (!newTrack || !isClipCompatibleWithTrack(clip.type, newTrack.type)) {
              // If track is incompatible, only move in time on the same track
              let clips = resolveOverlaps(
                state.clips,
                state.tracks,
                clipId,
                clampedTime,
                clip.trackId,
              );
              clips = moveClip(clips, clipId, clampedTime);
              clips = sortClipsByStartTime(clips);
              return {
                clips,
                crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
                durationFrames: calculateDurationFrames(clips, get().settings.fps),
              };
            }

            // Don't move to a locked track
            if (newTrack.locked) {
              // Only move in time on the same track
              let clips = resolveOverlaps(
                state.clips,
                state.tracks,
                clipId,
                clampedTime,
                clip.trackId,
              );
              clips = moveClip(clips, clipId, clampedTime);
              clips = sortClipsByStartTime(clips);
              return {
                clips,
                crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
                durationFrames: calculateDurationFrames(clips, get().settings.fps),
              };
            }

            let clips = resolveOverlaps(state.clips, state.tracks, clipId, clampedTime, newTrackId);
            clips = moveClip(clips, clipId, clampedTime);
            clips = moveClipToTrack(clips, clipId, newTrackId);

            // Move linked clip
            if (clip.linkedClipId) {
              const pairedTrackId = getPairedTrackIdFromTracks(state.tracks, newTrackId);
              if (pairedTrackId) {
                clips = moveClipToTrack(clips, clip.linkedClipId, pairedTrackId);
              }
            }

            clips = sortClipsByStartTime(clips);
            return {
              clips,
              crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        batchMoveClips: (moves) =>
          set((state) => {
            const moveMap = new Map(moves.map((m) => [m.clipId, Math.max(0, m.newStartTime)]));
            const selectedIds = new Set(moves.map((m) => m.clipId));

            // Compute linked clip moves for clips not in selection
            const linkedMoves = new Map<string, number>();
            for (const { clipId, newStartTime } of moves) {
              const clip = state.clips.find((c) => c.id === clipId);
              if (!clip || isClipOnLockedTrack(clip, state.tracks)) continue;
              if (clip.linkedClipId && !selectedIds.has(clip.linkedClipId)) {
                const linkedClip = state.clips.find((c) => c.id === clip.linkedClipId);
                if (linkedClip) {
                  const delta = Math.max(0, newStartTime) - clip.startTime;
                  linkedMoves.set(clip.linkedClipId, Math.max(0, linkedClip.startTime + delta));
                }
              }
            }

            const allMovedIds = new Set([...selectedIds, ...linkedMoves.keys()]);

            // Apply all moves
            let clips: EditorClip[] = state.clips.map((c) => {
              if (moveMap.has(c.id)) return { ...c, startTime: moveMap.get(c.id)! };
              if (linkedMoves.has(c.id)) return { ...c, startTime: linkedMoves.get(c.id)! };
              return c;
            });

            // Resolve overlaps: for each moved clip, trim/split non-moved clips that overlap
            for (const clipId of allMovedIds) {
              const clip = clips.find((c) => c.id === clipId);
              if (!clip) continue;

              const movingEnd = clip.startTime + clip.duration;
              const removeIds = new Set<string>();
              const addClips: EditorClip[] = [];

              for (const existing of clips) {
                if (allMovedIds.has(existing.id) || removeIds.has(existing.id)) continue;
                if (existing.trackId !== clip.trackId) continue;
                const existingEnd = existing.startTime + existing.duration;
                if (movingEnd <= existing.startTime || clip.startTime >= existingEnd) continue;

                const linked = existing.linkedClipId
                  ? clips.find((c) => c.id === existing.linkedClipId)
                  : null;
                removeIds.add(existing.id);
                if (linked && !allMovedIds.has(linked.id)) removeIds.add(linked.id);
                const trimmed = trimClipForOverlap(
                  existing,
                  linked && !allMovedIds.has(linked.id) ? linked : null,
                  clip.startTime,
                  movingEnd,
                );
                addClips.push(...trimmed);
              }

              if (removeIds.size > 0) {
                clips = clips.filter((c) => !removeIds.has(c.id));
                clips.push(...addClips);
              }
            }

            clips = sortClipsByStartTime(clips);
            return {
              clips,
              crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        trimLeft: (clipId, newStartTime) =>
          set((state) => {
            const [, clip] = findClipById(state.clips, clipId);
            if (!clip || isClipOnLockedTrack(clip, state.tracks)) return state;

            // Resolve overlaps at the new position
            let clips = resolveOverlaps(
              state.clips,
              state.tracks,
              clipId,
              newStartTime,
              clip.trackId,
            );
            clips = trimClipLeft(clips, clipId, newStartTime);

            return {
              clips,
              crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        trimRight: (clipId, newDuration) =>
          set((state) => {
            const [, clip] = findClipById(state.clips, clipId);
            if (!clip || isClipOnLockedTrack(clip, state.tracks)) return state;

            // Resolve overlaps at the new end position (pass newDuration for correct overlap detection)
            let clips = resolveOverlaps(
              state.clips,
              state.tracks,
              clipId,
              clip.startTime,
              clip.trackId,
              newDuration,
            );
            clips = trimClipRight(clips, clipId, newDuration);

            return {
              clips,
              crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        batchTrimClips: (edge, trims) =>
          set((state) => {
            const selectedIds = new Set(trims.map((t) => t.clipId));
            let clips: EditorClip[] = [...state.clips];

            for (const { clipId, newStartTime, newDuration } of trims) {
              const clip = clips.find((c) => c.id === clipId);
              if (!clip || isClipOnLockedTrack(clip, state.tracks)) continue;

              // Resolve overlaps
              if (edge === "left") {
                clips = resolveOverlaps(clips, state.tracks, clipId, newStartTime, clip.trackId);
                clips = trimClipLeft(clips, clipId, newStartTime, { trimLinked: false });
              } else {
                clips = resolveOverlaps(
                  clips,
                  state.tracks,
                  clipId,
                  clip.startTime,
                  clip.trackId,
                  newDuration,
                );
                clips = trimClipRight(clips, clipId, newDuration, { trimLinked: false });
              }

              // Handle linked clip not in selection
              if (clip.linkedClipId && !selectedIds.has(clip.linkedClipId)) {
                if (edge === "left") {
                  clips = trimClipLeft(clips, clip.linkedClipId, newStartTime, {
                    trimLinked: false,
                  });
                } else {
                  clips = trimClipRight(clips, clip.linkedClipId, newDuration, {
                    trimLinked: false,
                  });
                }
              }
            }

            clips = sortClipsByStartTime(clips);
            return {
              clips,
              crossTransitions: validateCrossTransitions(clips, state.crossTransitions),
              durationFrames: calculateDurationFrames(clips, get().settings.fps),
            };
          }),

        linkClipPair: (clipId1, clipId2) =>
          set((state) => ({
            clips: linkClips(state.clips, clipId1, clipId2),
          })),

        unlinkClipPair: (clipId) =>
          set((state) => ({
            clips: unlinkClip(state.clips, clipId),
          })),

        splitClipAtTime: (clipId, time) =>
          set((state) => {
            const [, clip] = findClipById(state.clips, clipId);
            if (!clip) return state;

            // Check if on locked track
            const track = state.tracks.find((t) => t.id === clip.trackId);
            if (track?.locked) return state;

            const result = splitClipWithLinked(state.clips, clipId, time, generateId);
            if (!result) return state;

            return {
              clips: sortClipsByStartTime(result.updatedClips),
              durationFrames: calculateDurationFrames(result.updatedClips, get().settings.fps),
            };
          }),

        updateClipTransform: (clipId, transform) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type !== "audio"
                ? { ...clip, transform: { ...clip.transform, ...transform } }
                : clip,
            ),
          })),

        updateClipEffects: (clipId, effects) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type !== "audio"
                ? { ...clip, effects: { ...clip.effects, ...effects } }
                : clip,
            ),
          })),

        updateClipVolume: (clipId, volume) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId ? { ...clip, volume: Math.max(0, Math.min(2, volume)) } : clip,
            ),
          })),

        updateClipSpeed: (clipId, speed) =>
          set((state) => {
            const newSpeed = Math.max(0.1, Math.min(16, speed));

            const clip = state.clips.find((c) => c.id === clipId);
            if (!clip) return state;

            // Also update linked clip (video ↔ audio)
            const linkedId =
              clip.type === "video" || clip.type === "audio" ? clip.linkedClipId : undefined;
            const idsToUpdate = new Set([clipId]);
            if (linkedId) idsToUpdate.add(linkedId);

            return {
              clips: state.clips.map((c) => {
                if (!idsToUpdate.has(c.id)) return c;
                // Adjust duration to keep the same source content range:
                // sourceDuration = duration * oldSpeed, newDuration = sourceDuration / newSpeed
                const oldSpeed = c.speed ?? 1;
                const newDuration = (c.duration * oldSpeed) / newSpeed;
                return { ...c, speed: newSpeed, duration: newDuration };
              }),
            };
          }),

        updateClipAudioEffects: (clipId, effectType, params) =>
          set((state) => ({
            clips: state.clips.map((clip) => {
              if (clip.id !== clipId || clip.type !== "audio") return clip;
              const audioClip = clip;
              const currentEffects = audioClip.audioEffects ?? {};
              const currentEffect = currentEffects[effectType] ?? {};
              return {
                ...clip,
                audioEffects: {
                  ...currentEffects,
                  [effectType]: { ...currentEffect, ...params },
                },
              };
            }),
          })),

        toggleClipAudioEffect: (clipId, effectType, enabled) =>
          set((state) => ({
            clips: state.clips.map((clip) => {
              if (clip.id !== clipId || clip.type !== "audio") return clip;
              const audioClip = clip;
              const currentEffects = audioClip.audioEffects ?? {};
              if (enabled) {
                // Enable with defaults (empty object = all defaults via serde)
                return {
                  ...clip,
                  audioEffects: {
                    ...currentEffects,
                    [effectType]: currentEffects[effectType] ?? {},
                  },
                };
              }
              // Disable by removing the key
              const { [effectType]: _, ...rest } = currentEffects;
              return {
                ...clip,
                audioEffects: Object.keys(rest).length > 0 ? rest : undefined,
              };
            }),
          })),

        // Text clip actions
        updateClipText: (clipId, text) =>
          set((state) => ({
            clips: state.clips.map((clip) => (clip.id === clipId ? { ...clip, text } : clip)),
          })),

        updateClipTextStyle: (clipId, style) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type === "text"
                ? { ...clip, textStyle: { ...clip.textStyle, ...style } }
                : clip,
            ),
          })),

        updateClipTextBox: (clipId, box) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type === "text"
                ? { ...clip, textBox: { ...clip.textBox, ...box } }
                : clip,
            ),
          })),

        // Shape clip actions
        updateClipShape: (clipId, shape) =>
          set((state) => ({
            clips: state.clips.map((clip) => (clip.id === clipId ? { ...clip, shape } : clip)),
          })),

        updateClipShapeStyle: (clipId, style) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type === "shape"
                ? { ...clip, shapeStyle: { ...clip.shapeStyle, ...style } }
                : clip,
            ),
          })),

        updateClipShapeBox: (clipId, box) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type === "shape"
                ? { ...clip, shapeBox: { ...clip.shapeBox, ...box } }
                : clip,
            ),
          })),

        // Line clip actions
        updateClipLineStyle: (clipId, style) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type === "line"
                ? { ...clip, lineStyle: { ...clip.lineStyle, ...style } }
                : clip,
            ),
          })),

        updateClipLineBox: (clipId, box) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === clipId && clip.type === "line"
                ? { ...clip, lineBox: { ...clip.lineBox, ...box } }
                : clip,
            ),
          })),

        // Keyframe actions
        addKeyframe: (clipId, property, time, value, options) =>
          set((state) => ({
            clips: state.clips.map((clip) => {
              if (clip.id !== clipId) return clip;

              // Get or create tracks
              const tracks = clip.keyframes?.tracks ?? [];
              const trackIndex = tracks.findIndex((t) => t.property === property);

              const newKeyframe: Keyframe = {
                time,
                value,
                interpolation: options?.interpolation ?? "Bezier",
                easing: { preset: options?.easing ?? "EaseInOut" },
              };

              if (trackIndex === -1) {
                // Create new track
                return {
                  ...clip,
                  keyframes: {
                    tracks: [...tracks, { property, keyframes: [newKeyframe] }],
                  },
                };
              }

              // Check if keyframe already exists at this time (update instead of add)
              const existingKeyframes = tracks[trackIndex].keyframes;
              const existingIndex = existingKeyframes.findIndex(
                (k) => Math.abs(k.time - time) < 0.05,
              );

              let updatedKeyframes: Keyframe[];
              if (existingIndex !== -1) {
                // Update existing keyframe at this time
                updatedKeyframes = existingKeyframes.map((k, i) =>
                  i === existingIndex ? { ...k, value } : k,
                );
              } else {
                // Add new keyframe and keep sorted by time
                updatedKeyframes = [...existingKeyframes, newKeyframe].sort(
                  (a, b) => a.time - b.time,
                );
              }

              const updatedTracks = tracks.map((t, i) =>
                i === trackIndex ? { ...t, keyframes: updatedKeyframes } : t,
              );

              return {
                ...clip,
                keyframes: { tracks: updatedTracks },
              };
            }),
          })),

        updateKeyframe: (clipId, property, keyframeIndex, updates) =>
          set((state) => ({
            clips: state.clips.map((clip) => {
              if (clip.id !== clipId || !clip.keyframes) return clip;

              const trackIndex = clip.keyframes.tracks.findIndex((t) => t.property === property);
              if (trackIndex === -1) return clip;

              const track = clip.keyframes.tracks[trackIndex];
              if (keyframeIndex < 0 || keyframeIndex >= track.keyframes.length) return clip;

              const updatedKeyframes = track.keyframes.map((k, i) =>
                i === keyframeIndex ? { ...k, ...updates } : k,
              );

              // Re-sort if time was updated
              if (updates.time !== undefined) {
                updatedKeyframes.sort((a, b) => a.time - b.time);
              }

              const updatedTracks = clip.keyframes.tracks.map((t, i) =>
                i === trackIndex ? { ...t, keyframes: updatedKeyframes } : t,
              );

              return {
                ...clip,
                keyframes: { tracks: updatedTracks },
              };
            }),
          })),

        deleteKeyframe: (clipId, property, keyframeIndex) =>
          set((state) => ({
            clips: state.clips.map((clip) => {
              if (clip.id !== clipId || !clip.keyframes) return clip;

              const trackIndex = clip.keyframes.tracks.findIndex((t) => t.property === property);
              if (trackIndex === -1) return clip;

              const track = clip.keyframes.tracks[trackIndex];
              if (keyframeIndex < 0 || keyframeIndex >= track.keyframes.length) return clip;

              const updatedKeyframes = track.keyframes.filter((_, i) => i !== keyframeIndex);

              // Remove the track entirely if no keyframes remain
              if (updatedKeyframes.length === 0) {
                const updatedTracks = clip.keyframes.tracks.filter((_, i) => i !== trackIndex);
                if (updatedTracks.length === 0) {
                  return { ...clip, keyframes: undefined };
                }
                return { ...clip, keyframes: { tracks: updatedTracks } };
              }

              const updatedTracks = clip.keyframes.tracks.map((t, i) =>
                i === trackIndex ? { ...t, keyframes: updatedKeyframes } : t,
              );

              return { ...clip, keyframes: { tracks: updatedTracks } };
            }),
          })),

        removeAllKeyframes: (clipId, property) =>
          set((state) => ({
            clips: state.clips.map((clip) => {
              if (clip.id !== clipId || !clip.keyframes) return clip;

              const updatedTracks = clip.keyframes.tracks.filter((t) => t.property !== property);

              if (updatedTracks.length === 0) {
                return { ...clip, keyframes: undefined };
              }

              return { ...clip, keyframes: { tracks: updatedTracks } };
            }),
          })),

        // Transition actions
        setClipTransitionIn: (clipId, transition) =>
          set((state) => {
            let clips = state.clips.map((clip) =>
              clip.id === clipId && clip.type !== "audio"
                ? { ...clip, transitionIn: transition ?? undefined }
                : clip,
            );

            if (!transition) return { clips };

            // Remove cross transitions where this clip is the incoming clip,
            // and restore clip timing so they meet at the boundary without overlap
            const conflicting = state.crossTransitions.find((ct) => ct.incomingClipId === clipId);
            if (conflicting) {
              const outgoingLinkedId = state.clips.find(
                (c) => c.id === conflicting.outgoingClipId,
              )?.linkedClipId;
              const incomingLinkedId = state.clips.find(
                (c) => c.id === conflicting.incomingClipId,
              )?.linkedClipId;

              clips = clips.map((c) => {
                if (c.id === conflicting.outgoingClipId) {
                  return { ...c, duration: conflicting.boundary - c.startTime };
                }
                if (outgoingLinkedId && c.id === outgoingLinkedId) {
                  return { ...c, duration: conflicting.boundary - c.startTime };
                }
                if (c.id === conflicting.incomingClipId) {
                  const trimAmount = conflicting.boundary - c.startTime;
                  return {
                    ...c,
                    startTime: conflicting.boundary,
                    inPoint: c.inPoint + trimAmount * (c.speed ?? 1),
                    duration: c.duration - trimAmount,
                  };
                }
                if (incomingLinkedId && c.id === incomingLinkedId) {
                  const trimAmount = conflicting.boundary - c.startTime;
                  return {
                    ...c,
                    startTime: conflicting.boundary,
                    inPoint: c.inPoint + trimAmount * (c.speed ?? 1),
                    duration: c.duration - trimAmount,
                  };
                }
                return c;
              });
              clips = sortClipsByStartTime(clips);
            }

            const crossTransitions = state.crossTransitions.filter(
              (ct) => ct.incomingClipId !== clipId,
            );
            return { clips, crossTransitions };
          }),

        setClipTransitionOut: (clipId, transition) =>
          set((state) => {
            let clips = state.clips.map((clip) =>
              clip.id === clipId && clip.type !== "audio"
                ? { ...clip, transitionOut: transition ?? undefined }
                : clip,
            );

            if (!transition) return { clips };

            // Remove cross transitions where this clip is the outgoing clip,
            // and restore clip timing so they meet at the boundary without overlap
            const conflicting = state.crossTransitions.find((ct) => ct.outgoingClipId === clipId);
            if (conflicting) {
              const outgoingLinkedId = state.clips.find(
                (c) => c.id === conflicting.outgoingClipId,
              )?.linkedClipId;
              const incomingLinkedId = state.clips.find(
                (c) => c.id === conflicting.incomingClipId,
              )?.linkedClipId;

              clips = clips.map((c) => {
                if (c.id === conflicting.outgoingClipId) {
                  return { ...c, duration: conflicting.boundary - c.startTime };
                }
                if (outgoingLinkedId && c.id === outgoingLinkedId) {
                  return { ...c, duration: conflicting.boundary - c.startTime };
                }
                if (c.id === conflicting.incomingClipId) {
                  const trimAmount = conflicting.boundary - c.startTime;
                  return {
                    ...c,
                    startTime: conflicting.boundary,
                    inPoint: c.inPoint + trimAmount * (c.speed ?? 1),
                    duration: c.duration - trimAmount,
                  };
                }
                if (incomingLinkedId && c.id === incomingLinkedId) {
                  const trimAmount = conflicting.boundary - c.startTime;
                  return {
                    ...c,
                    startTime: conflicting.boundary,
                    inPoint: c.inPoint + trimAmount * (c.speed ?? 1),
                    duration: c.duration - trimAmount,
                  };
                }
                return c;
              });
              clips = sortClipsByStartTime(clips);
            }

            const crossTransitions = state.crossTransitions.filter(
              (ct) => ct.outgoingClipId !== clipId,
            );
            return { clips, crossTransitions };
          }),

        addCrossTransitionBetween: (outgoingClipId, incomingClipId, type, duration) =>
          set((state) => {
            const outgoing = state.clips.find((c) => c.id === outgoingClipId);
            const incoming = state.clips.find((c) => c.id === incomingClipId);
            if (!outgoing || !incoming) return state;

            // Only allow between clips on the same track
            if (outgoing.trackId !== incoming.trackId) return state;

            const outgoingEnd = outgoing.startTime + outgoing.duration;
            const gap = incoming.startTime - outgoingEnd;

            // Only allow between adjacent clips (gap <= 1 frame)
            if (gap > 1) return state;

            // Boundary is the original cut point (where outgoing ends).
            // Any gap is closed by shifting incoming left.
            const boundary = outgoingEnd;
            const half = duration / 2;

            // Extend each clip by half the duration (clamped to available source)
            const extendOut = Math.min(half, availableExtensionAfter(outgoing));
            const extendIn = Math.min(half, availableExtensionBefore(incoming));

            // Shortfall: what extensions couldn't cover, handled by shifting incoming
            const shortfall = duration - extendOut - extendIn;

            // Close gap + shift for shortfall: this is how much clips after incoming
            // need to move left to maintain adjacency with incoming's end.
            const gapClose = Math.max(0, gap);
            const clipsAfterShift = gapClose + shortfall;

            // Incoming clip shifts more: it also extends backward
            const incomingTotalShift = gapClose + extendIn + shortfall;

            // Find linked audio clips
            const outgoingLinkedId = outgoing.linkedClipId;
            const incomingLinkedId = incoming.linkedClipId;

            let clips = state.clips;
            if (incomingTotalShift > 0 || extendOut > 0) {
              // Collect IDs of clips being shifted (on same track, at or after incoming)
              const shiftedIds = new Set<string>();
              for (const c of clips) {
                if (c.trackId === incoming.trackId && c.startTime >= incoming.startTime) {
                  shiftedIds.add(c.id);
                }
              }

              clips = clips.map((c) => {
                // Extend outgoing clip duration
                if (c.id === outgoingClipId) {
                  return { ...c, duration: c.duration + extendOut };
                }
                // Extend outgoing linked audio clip
                if (outgoingLinkedId && c.id === outgoingLinkedId) {
                  return { ...c, duration: c.duration + extendOut };
                }
                // Extend and shift incoming clip
                if (c.id === incomingClipId) {
                  return {
                    ...c,
                    startTime: c.startTime - incomingTotalShift,
                    inPoint: c.inPoint - extendIn * (c.speed ?? 1),
                    duration: c.duration + extendIn + shortfall,
                  };
                }
                // Extend and shift incoming linked audio clip
                if (incomingLinkedId && c.id === incomingLinkedId) {
                  return {
                    ...c,
                    startTime: c.startTime - incomingTotalShift,
                    inPoint: c.inPoint - extendIn * (c.speed ?? 1),
                    duration: c.duration + extendIn + shortfall,
                  };
                }
                // Shift other clips on the same track that are after incoming
                if (shiftedIds.has(c.id) && c.id !== incomingClipId) {
                  return { ...c, startTime: c.startTime - clipsAfterShift };
                }
                // Shift linked clips of shifted clips
                if (c.linkedClipId && shiftedIds.has(c.linkedClipId) && c.id !== outgoingClipId) {
                  return { ...c, startTime: c.startTime - clipsAfterShift };
                }
                return c;
              });
              clips = sortClipsByStartTime(clips);
            }

            // Clear conflicting clip transitions on the involved edges
            clips = clips.map((c) => {
              if (c.id === outgoingClipId && c.type !== "audio") {
                return { ...c, transitionOut: undefined };
              }
              if (c.id === incomingClipId && c.type !== "audio") {
                return { ...c, transitionIn: undefined };
              }
              return c;
            });

            const result = addCrossTransition(
              clips,
              state.crossTransitions,
              outgoingClipId,
              incomingClipId,
              generateId(),
              duration,
              type,
              boundary,
            );
            if (!result) return state;
            return { clips, crossTransitions: result };
          }),

        removeCrossTransitionById: (crossTransitionId) =>
          set((state) => {
            const ct = state.crossTransitions.find((c) => c.id === crossTransitionId);
            if (!ct) return state;

            const outgoing = state.clips.find((c) => c.id === ct.outgoingClipId);
            const incoming = state.clips.find((c) => c.id === ct.incomingClipId);
            if (!outgoing || !incoming) {
              return {
                crossTransitions: removeCrossTransition(state.crossTransitions, crossTransitionId),
              };
            }

            // Find linked audio clips
            const outgoingLinkedId = outgoing.linkedClipId;
            const incomingLinkedId = incoming.linkedClipId;

            // Restore clips to meet at the boundary
            const clips = state.clips.map((c) => {
              if (c.id === ct.outgoingClipId) {
                // Trim outgoing to end at boundary
                return { ...c, duration: ct.boundary - c.startTime };
              }
              // Trim outgoing linked audio to match
              if (outgoingLinkedId && c.id === outgoingLinkedId) {
                return { ...c, duration: ct.boundary - c.startTime };
              }
              if (c.id === ct.incomingClipId) {
                // Restore incoming to start at boundary
                const trimAmount = ct.boundary - c.startTime;
                return {
                  ...c,
                  startTime: ct.boundary,
                  inPoint: c.inPoint + trimAmount * (c.speed ?? 1),
                  duration: c.duration - trimAmount,
                };
              }
              // Restore incoming linked audio to match
              if (incomingLinkedId && c.id === incomingLinkedId) {
                const trimAmount = ct.boundary - c.startTime;
                return {
                  ...c,
                  startTime: ct.boundary,
                  inPoint: c.inPoint + trimAmount * (c.speed ?? 1),
                  duration: c.duration - trimAmount,
                };
              }
              return c;
            });

            return {
              clips: sortClipsByStartTime(clips),
              crossTransitions: removeCrossTransition(state.crossTransitions, crossTransitionId),
            };
          }),

        updateCrossTransitionDuration: (crossTransitionId, newDuration) =>
          set((state) => {
            const ct = state.crossTransitions.find((c) => c.id === crossTransitionId);
            if (!ct) return state;

            const outgoing = state.clips.find((c) => c.id === ct.outgoingClipId);
            const incoming = state.clips.find((c) => c.id === ct.incomingClipId);
            if (!outgoing || !incoming) return state;

            const newHalf = newDuration / 2;

            // Compute how much each clip needs to extend from the boundary
            const extendOut = Math.min(
              newHalf,
              availableExtensionAfter(outgoing) +
                (outgoing.startTime + outgoing.duration - ct.boundary),
            );
            const extendIn = Math.min(
              newHalf,
              availableExtensionBefore(incoming) + (ct.boundary - incoming.startTime),
            );

            const actualDuration = extendOut + extendIn;

            // Find linked audio clips
            const outgoingLinkedId = outgoing.linkedClipId;
            const incomingLinkedId = incoming.linkedClipId;

            // Adjust clips to cover [boundary - extendIn, boundary + extendOut]
            const clips = state.clips.map((c) => {
              if (c.id === ct.outgoingClipId) {
                // Outgoing should end at boundary + extendOut
                return { ...c, duration: ct.boundary + extendOut - c.startTime };
              }
              // Outgoing linked audio
              if (outgoingLinkedId && c.id === outgoingLinkedId) {
                return { ...c, duration: ct.boundary + extendOut - c.startTime };
              }
              if (c.id === ct.incomingClipId) {
                // Incoming should start at boundary - extendIn
                const newStart = ct.boundary - extendIn;
                const startDelta = c.startTime - newStart;
                return {
                  ...c,
                  startTime: newStart,
                  inPoint: c.inPoint - startDelta * (c.speed ?? 1),
                  duration: c.duration + startDelta,
                };
              }
              // Incoming linked audio
              if (incomingLinkedId && c.id === incomingLinkedId) {
                const newStart = ct.boundary - extendIn;
                const startDelta = c.startTime - newStart;
                return {
                  ...c,
                  startTime: newStart,
                  inPoint: c.inPoint - startDelta * (c.speed ?? 1),
                  duration: c.duration + startDelta,
                };
              }
              return c;
            });

            return {
              clips: sortClipsByStartTime(clips),
              crossTransitions: state.crossTransitions.map((c) =>
                c.id === crossTransitionId ? { ...c, duration: actualDuration } : c,
              ),
            };
          }),

        // Asset actions
        addAsset: (asset) =>
          set((state) => ({
            assets: [...state.assets, asset],
          })),

        addAssets: (assets) =>
          set((state) => ({
            assets: [...state.assets, ...assets],
          })),

        removeAsset: (assetId) =>
          set((state) => ({
            assets: state.assets.filter((a) => a.id !== assetId),
          })),

        // Computed getters for rendering
        getTracksForRender: () => {
          const state = get();
          return state.tracks
            .filter((t) => t.type === "video")
            .map((t) => ({
              id: t.id,
              index: t.index,
              type: t.type,
            }));
        },

        getClipsForRender: () => {
          const state = get();
          // Get IDs of muted tracks
          const mutedTrackIds = new Set(state.tracks.filter((t) => t.muted).map((t) => t.id));

          return state.clips
            .filter((c) => c.type === "video" || c.type === "image")
            .filter((c) => !mutedTrackIds.has(c.trackId)) // Exclude clips on muted tracks
            .map((c) => ({
              id: c.id,
              assetId: c.assetId,
              trackId: c.trackId,
              startTime: c.startTime,
              duration: c.duration,
              inPoint: c.inPoint,
              transform: c.transform,
            }));
        },

        getVisibleClipsAtTime: (time) => {
          const state = get();
          // Get IDs of muted tracks
          const mutedTrackIds = new Set(state.tracks.filter((t) => t.muted).map((t) => t.id));

          return state.clips.filter(
            (c) =>
              time >= c.startTime &&
              time < c.startTime + c.duration &&
              !mutedTrackIds.has(c.trackId),
          );
        },
      }),
      {
        limit: 100,
        partialize: (state): TrackedState => ({
          tracks: state.tracks,
          clips: state.clips,
          crossTransitions: state.crossTransitions,
          assets: state.assets,
          settings: state.settings,
        }),
        equality: (pastState, currentState) =>
          pastState.tracks === currentState.tracks &&
          pastState.clips === currentState.clips &&
          pastState.crossTransitions === currentState.crossTransitions &&
          pastState.assets === currentState.assets &&
          pastState.settings === currentState.settings,
      },
    ),
  ),
);

/**
 * Hook to access the temporal (undo/redo) store.
 */
export const useTemporalStore = <T>(selector: (state: TemporalState<TrackedState>) => T) =>
  useStore(useVideoEditorStore.temporal, selector);
