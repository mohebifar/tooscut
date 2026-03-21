/**
 * Timeline types.
 */

export interface TimelineTrack {
  id: string;
  fullId: string;
  type: "video" | "audio";
  name: string;
  order: number;
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
  startX: number;
  originalStartTime: number;
  originalDuration: number;
  originalInPoint?: number;
  originalOutPoint?: number;
  linkedClipId?: string;
  currentStartTime: number;
  currentDuration: number;
  currentInPoint?: number;
  currentOutPoint?: number;
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
