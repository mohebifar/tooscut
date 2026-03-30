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
