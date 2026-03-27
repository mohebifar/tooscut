/**
 * Timeline types.
 */

export interface TimelineTrack {
  id: string;
  fullId: string;
  type: "video" | "audio";
  name: string;
  muted: boolean;
  locked: boolean;
}

export interface TimelineClip {
  id: string;
  type: "video" | "audio" | "image" | "text" | "shape";
  trackId: string;
  startTime: number;
  duration: number;
  assetId?: string;
  name?: string;
  /** Linked clip ID (e.g., audio paired with video) */
  linkedClipId?: string;
  /** In-point for trimming (seconds from asset start) */
  inPoint: number;
  /** Speed multiplier (1.0 = normal) */
  speed: number;
  /** Original asset duration (for calculating trim limits) */
  assetDuration?: number;
}

export interface DropPreview {
  x: number;
  y: number;
  trackIndex: number;
  time: number;
  itemType: "asset" | "text" | "shape";
  assetId?: string;
  duration: number;
}

export interface DragState {
  clipId: string;
  startX: number;
  startY: number;
  originalStartTime: number;
  originalTrackId: string;
  originalTrackIndex: number;
  linkedClipId?: string;
  currentStartTime: number;
  currentTrackId: string;
}

export interface TrimState {
  clipId: string;
  edge: "left" | "right";
  startMouseX: number;
  originalStartTime: number;
  originalDuration: number;
  originalInPoint: number;
  speed: number;
  assetDuration: number | undefined;
  /** Whether this clip is backed by a media asset (video/audio/image). Text/shape clips are not. */
  hasAsset: boolean;
  // Linked clip info for visual feedback during trim
  linkedClipId?: string;
  linkedTrackIndex?: number;
  // Multi-select trim
  isMulti?: boolean;
  multiClips?: Array<{
    clipId: string;
    originalStartTime: number;
    originalDuration: number;
    originalInPoint: number;
    speed: number;
    assetDuration: number | undefined;
    hasAsset: boolean;
    linkedClipId?: string;
    linkedTrackIndex?: number;
  }>;
}

export interface BoxSelectState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface TimelineStageProps {
  width: number;
  height: number;
  dropPreview: DropPreview | null;
}

export interface TransitionResizeState {
  clipId: string;
  edge: "in" | "out";
  startMouseX: number;
  originalDuration: number;
  clipDuration: number;
}

export interface CrossTransitionResizeState {
  transitionId: string;
  edge: "left" | "right";
  startMouseX: number;
  originalDuration: number;
  maxDuration: number;
  boundary: number;
  /** Maximum extension on the outgoing side (from boundary) */
  totalMaxOut: number;
  /** Maximum extension on the incoming side (from boundary) */
  totalMaxIn: number;
}
