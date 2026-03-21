/**
 * Clip manipulation utilities.
 *
 * All operations maintain clips sorted by startTime for O(log n + k) visibility queries.
 * Mutations return new arrays (immutable) for compatibility with Zustand/React state.
 */

import type { ClipBounds, CrossTransitionRef } from "./frame-builder.js";
import type { CrossTransitionType, Easing } from "./types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Full clip data for editing operations.
 * Extends ClipBounds with all editable properties.
 */
export interface EditableClip extends ClipBounds {
  trackId: string;
  inPoint: number;
  linkedClipId?: string;
}

/**
 * Result of a split operation.
 */
export interface SplitResult<T extends EditableClip> {
  /** The left portion of the split clip */
  left: T;
  /** The right portion of the split clip */
  right: T;
}

/**
 * Options for adding a clip.
 */
export interface AddClipOptions {
  /** If true, push existing clips to make room. If false, just insert. */
  ripple?: boolean;
}

/**
 * Options for moving a clip.
 */
export interface MoveClipOptions {
  /** If true, also move linked clips. Default: true */
  moveLinked?: boolean;
}

/**
 * Options for trimming a clip.
 */
export interface TrimClipOptions {
  /** If true, also trim linked clips. Default: true */
  trimLinked?: boolean;
}

/**
 * A track in the timeline.
 *
 * Tracks are always created in pairs: one video track and one audio track.
 * The video track renders visuals, while the audio track handles sound.
 *
 * Z-order is determined by track index: higher index = rendered on top.
 */
export interface EditableTrack {
  id: string;
  /** Track index determines z-order for video tracks (higher = on top) */
  index: number;
  type: "video" | "audio";
  /** Optional custom name - if not set, derive from position (e.g., "Video 1", "Audio 2") */
  name?: string;
  /** ID of the paired track (video tracks link to audio, audio to video) */
  pairedTrackId: string;
  muted: boolean;
  locked: boolean;
  /** Volume level for audio tracks (0-1) */
  volume: number;
}

/**
 * Result of adding a track pair.
 */
export interface TrackPairResult {
  videoTrack: EditableTrack;
  audioTrack: EditableTrack;
}

// ============================================================================
// Track Operations
// ============================================================================

/**
 * Create a new track pair (video + audio).
 *
 * Tracks are always added in pairs. The video track handles visual content,
 * and the audio track handles sound from clips on that track.
 *
 * @param tracks - Existing tracks
 * @param videoTrackId - ID for the new video track
 * @param audioTrackId - ID for the new audio track
 * @param name - Base name for the tracks (e.g., "Track 1" -> "Track 1" and "Track 1 Audio")
 * @param insertAtIndex - Index to insert at (shifts existing tracks). If undefined, adds at top.
 * @returns New tracks array with the pair added
 */
export function addTrackPair(
  tracks: readonly EditableTrack[],
  videoTrackId: string,
  audioTrackId: string,
  name?: string,
  insertAtIndex?: number,
): { tracks: EditableTrack[]; result: TrackPairResult } {
  // Determine insertion index
  const videoTracks = tracks.filter((t) => t.type === "video");
  const maxIndex = videoTracks.length > 0 ? Math.max(...videoTracks.map((t) => t.index)) : -1;
  const newIndex = insertAtIndex ?? maxIndex + 1;

  // Shift existing tracks if inserting in the middle
  const updatedTracks = tracks.map((track) => {
    if (track.type === "video" && track.index >= newIndex) {
      return { ...track, index: track.index + 1 };
    }
    return track;
  });

  // Create the new track pair
  // Name is optional - UI should derive names from position (e.g., "Video 1", "Audio 1")
  const videoTrack: EditableTrack = {
    id: videoTrackId,
    index: newIndex,
    type: "video",
    name,
    pairedTrackId: audioTrackId,
    muted: false,
    locked: false,
    volume: 1,
  };

  const audioTrack: EditableTrack = {
    id: audioTrackId,
    index: newIndex, // Audio tracks share index with their paired video track
    type: "audio",
    name, // Same name as video track if provided
    pairedTrackId: videoTrackId,
    muted: false,
    locked: false,
    volume: 1,
  };

  return {
    tracks: [...updatedTracks, videoTrack, audioTrack],
    result: { videoTrack, audioTrack },
  };
}

/**
 * Remove a track pair (video + audio) and all clips on those tracks.
 *
 * When removing a track, both the video and audio tracks are removed,
 * along with all clips that belong to those tracks.
 *
 * @param tracks - Existing tracks
 * @param clips - Existing clips
 * @param trackId - ID of either the video or audio track to remove
 * @returns New tracks and clips arrays with the pair removed
 */
export function removeTrackPair<T extends EditableClip>(
  tracks: readonly EditableTrack[],
  clips: readonly T[],
  trackId: string,
): { tracks: EditableTrack[]; clips: T[] } {
  // Find the track
  const track = tracks.find((t) => t.id === trackId);
  if (!track) {
    return { tracks: [...tracks], clips: [...clips] };
  }

  // Get both track IDs (the track and its pair)
  const trackIdsToRemove = new Set([track.id, track.pairedTrackId]);

  // Get the index of the video track being removed
  const videoTrack =
    track.type === "video" ? track : tracks.find((t) => t.id === track.pairedTrackId);
  const removedIndex = videoTrack?.index ?? -1;

  // Remove tracks and shift indices
  const newTracks = tracks
    .filter((t) => !trackIdsToRemove.has(t.id))
    .map((t) => {
      // Shift video tracks above the removed one down
      if (t.type === "video" && t.index > removedIndex) {
        return { ...t, index: t.index - 1 };
      }
      return t;
    });

  // Remove clips on those tracks
  const newClips = clips.filter((c) => !trackIdsToRemove.has(c.trackId));

  return { tracks: newTracks, clips: newClips };
}

/**
 * Reorder tracks by moving a track pair to a new index.
 *
 * @param tracks - Existing tracks
 * @param trackId - ID of either the video or audio track to move
 * @param newIndex - New index for the video track
 * @returns New tracks array with updated indices
 */
export function reorderTrackPair(
  tracks: readonly EditableTrack[],
  trackId: string,
  newIndex: number,
): EditableTrack[] {
  // Find the track and its pair
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return [...tracks];

  const videoTrack =
    track.type === "video" ? track : tracks.find((t) => t.id === track.pairedTrackId);
  if (!videoTrack) return [...tracks];

  const oldIndex = videoTrack.index;
  if (oldIndex === newIndex) return [...tracks];

  // Update indices
  return tracks.map((t) => {
    if (t.type !== "video") {
      // Audio tracks follow their paired video track
      const pairedVideo = tracks.find((v) => v.id === t.pairedTrackId);
      if (pairedVideo) {
        // Will be updated when we process the video track
        if (pairedVideo.id === videoTrack.id) {
          return { ...t, index: newIndex };
        }
      }
      return t;
    }

    // Handle video tracks
    if (t.id === videoTrack.id) {
      return { ...t, index: newIndex };
    }

    // Shift other tracks
    if (oldIndex < newIndex) {
      // Moving down: shift tracks in between up
      if (t.index > oldIndex && t.index <= newIndex) {
        return { ...t, index: t.index - 1 };
      }
    } else {
      // Moving up: shift tracks in between down
      if (t.index >= newIndex && t.index < oldIndex) {
        return { ...t, index: t.index + 1 };
      }
    }

    return t;
  });
}

/**
 * Update track properties (name, muted, locked, volume).
 *
 * @param tracks - Existing tracks
 * @param trackId - ID of the track to update
 * @param updates - Properties to update
 * @returns New tracks array with the updated track
 */
export function updateTrack(
  tracks: readonly EditableTrack[],
  trackId: string,
  updates: Partial<Pick<EditableTrack, "name" | "muted" | "locked" | "volume">>,
): EditableTrack[] {
  return tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t));
}

/**
 * Mute or unmute a track pair.
 *
 * @param tracks - Existing tracks
 * @param trackId - ID of either track in the pair
 * @param muted - Whether to mute
 * @returns New tracks array
 */
export function muteTrackPair(
  tracks: readonly EditableTrack[],
  trackId: string,
  muted: boolean,
): EditableTrack[] {
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return [...tracks];

  const trackIds = new Set([track.id, track.pairedTrackId]);
  return tracks.map((t) => (trackIds.has(t.id) ? { ...t, muted } : t));
}

/**
 * Lock or unlock a track pair.
 *
 * @param tracks - Existing tracks
 * @param trackId - ID of either track in the pair
 * @param locked - Whether to lock
 * @returns New tracks array
 */
export function lockTrackPair(
  tracks: readonly EditableTrack[],
  trackId: string,
  locked: boolean,
): EditableTrack[] {
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return [...tracks];

  const trackIds = new Set([track.id, track.pairedTrackId]);
  return tracks.map((t) => (trackIds.has(t.id) ? { ...t, locked } : t));
}

/**
 * Find a track by ID.
 */
export function findTrackById(
  tracks: readonly EditableTrack[],
  trackId: string,
): EditableTrack | undefined {
  return tracks.find((t) => t.id === trackId);
}

/**
 * Get the paired track (video -> audio or audio -> video).
 */
export function getPairedTrack(
  tracks: readonly EditableTrack[],
  trackId: string,
): EditableTrack | undefined {
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return undefined;
  return tracks.find((t) => t.id === track.pairedTrackId);
}

/**
 * Get all video tracks sorted by index (for z-order).
 */
export function getVideoTracksSorted(tracks: readonly EditableTrack[]): EditableTrack[] {
  return tracks.filter((t) => t.type === "video").sort((a, b) => a.index - b.index);
}

/**
 * Get all audio tracks.
 */
export function getAudioTracks(tracks: readonly EditableTrack[]): EditableTrack[] {
  return tracks.filter((t) => t.type === "audio");
}

/**
 * Validate track structure (all tracks have valid pairs, indices are contiguous).
 */
export function validateTracks(tracks: readonly EditableTrack[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check each track has a valid pair
  for (const track of tracks) {
    const pair = tracks.find((t) => t.id === track.pairedTrackId);
    if (!pair) {
      errors.push(`Track "${track.id}" has invalid pairedTrackId "${track.pairedTrackId}"`);
    } else if (pair.type === track.type) {
      errors.push(`Track "${track.id}" is paired with same type track "${pair.id}"`);
    }
  }

  // Check video track indices are contiguous
  const videoTracks = getVideoTracksSorted(tracks);
  for (let i = 0; i < videoTracks.length; i++) {
    if (videoTracks[i].index !== i) {
      errors.push(
        `Video track indices are not contiguous: expected ${i}, got ${videoTracks[i].index}`,
      );
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Binary Search Utilities
// ============================================================================

/**
 * Find insertion index to maintain sorted order by startTime.
 * Uses binary search for O(log n) performance.
 */
export function findInsertionIndex<T extends ClipBounds>(
  clips: readonly T[],
  startTime: number,
): number {
  let low = 0;
  let high = clips.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (clips[mid].startTime < startTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Find a clip by ID using linear search.
 * Returns [index, clip] or [-1, undefined] if not found.
 */
export function findClipById<T extends ClipBounds>(
  clips: readonly T[],
  id: string,
): [number, T | undefined] {
  const index = clips.findIndex((c) => c.id === id);
  return [index, index >= 0 ? clips[index] : undefined];
}

/**
 * Insert a clip while maintaining sorted order.
 */
function insertSorted<T extends ClipBounds>(clips: readonly T[], clip: T): T[] {
  const index = findInsertionIndex(clips, clip.startTime);
  const result = [...clips];
  result.splice(index, 0, clip);
  return result;
}

/**
 * Re-sort clips array. Use after batch operations that may disorder clips.
 */
export function sortClipsByStartTime<T extends ClipBounds>(clips: readonly T[]): T[] {
  return [...clips].sort((a, b) => a.startTime - b.startTime);
}

// ============================================================================
// Clip Operations
// ============================================================================

/**
 * Add a clip to the timeline, maintaining sorted order.
 *
 * @returns New clips array with the clip inserted
 */
export function addClip<T extends ClipBounds>(
  clips: readonly T[],
  clip: T,
  _options: AddClipOptions = {},
): T[] {
  return insertSorted(clips, clip);
}

/**
 * Add multiple clips to the timeline, maintaining sorted order.
 *
 * More efficient than calling addClip multiple times.
 *
 * @returns New clips array with all clips inserted
 */
export function addClips<T extends ClipBounds>(
  clips: readonly T[],
  newClips: readonly T[],
  _options: AddClipOptions = {},
): T[] {
  if (newClips.length === 0) return [...clips];
  if (clips.length === 0) return sortClipsByStartTime(newClips);

  // For multiple clips, concat and sort is more efficient than multiple inserts
  return sortClipsByStartTime([...clips, ...newClips]);
}

/**
 * Remove a clip by ID.
 *
 * @returns New clips array without the clip, or same array if not found
 */
export function removeClip<T extends ClipBounds>(clips: readonly T[], clipId: string): T[] {
  const [index] = findClipById(clips, clipId);
  if (index < 0) return [...clips];

  const result = [...clips];
  result.splice(index, 1);
  return result;
}

/**
 * Remove a clip and its linked clip (if any).
 *
 * @returns New clips array without the clip(s)
 */
export function removeClipWithLinked<T extends EditableClip>(
  clips: readonly T[],
  clipId: string,
): T[] {
  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip) return [...clips];

  const idsToRemove = new Set([clipId]);
  if (clip.linkedClipId) {
    idsToRemove.add(clip.linkedClipId);
  }

  return clips.filter((c) => !idsToRemove.has(c.id));
}

/**
 * Update a clip's properties.
 * If startTime changes, re-sorts the array.
 *
 * @returns New clips array with the updated clip
 */
export function updateClip<T extends ClipBounds>(
  clips: readonly T[],
  clipId: string,
  updates: Partial<T>,
): T[] {
  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip) return [...clips];

  const updatedClip = { ...clip, ...updates };
  const result = [...clips];
  result[index] = updatedClip;

  // If startTime changed, we need to re-sort
  if (updates.startTime !== undefined && updates.startTime !== clip.startTime) {
    return sortClipsByStartTime(result);
  }

  return result;
}

/**
 * Move a clip to a new start time.
 * Maintains sorted order and optionally moves linked clips.
 *
 * @returns New clips array with the clip(s) moved
 */
export function moveClip<T extends EditableClip>(
  clips: readonly T[],
  clipId: string,
  newStartTime: number,
  options: MoveClipOptions = {},
): T[] {
  const { moveLinked = true } = options;

  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip) return [...clips];

  const delta = newStartTime - clip.startTime;
  if (delta === 0) return [...clips];

  const result = [...clips];

  // Update the primary clip
  result[index] = { ...clip, startTime: newStartTime };

  // Update linked clip if exists and moveLinked is true
  if (moveLinked && clip.linkedClipId) {
    const [linkedIndex, linkedClip] = findClipById(result, clip.linkedClipId);
    if (linkedIndex >= 0 && linkedClip) {
      result[linkedIndex] = { ...linkedClip, startTime: linkedClip.startTime + delta };
    }
  }

  return sortClipsByStartTime(result);
}

/**
 * Move a clip to a different track.
 * Optionally moves linked clip to maintain pairing on adjacent tracks.
 *
 * @returns New clips array with the clip(s) moved
 */
export function moveClipToTrack<T extends EditableClip>(
  clips: readonly T[],
  clipId: string,
  newTrackId: string,
  options: MoveClipOptions = {},
): T[] {
  const { moveLinked = true } = options;

  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip) return [...clips];

  if (clip.trackId === newTrackId) return [...clips];

  const result = [...clips];
  result[index] = { ...clip, trackId: newTrackId };

  // Note: For linked clips (e.g., video+audio), the caller should determine
  // the appropriate track for the linked clip based on track layout.
  // This function just handles the primary clip by default.
  if (moveLinked && clip.linkedClipId) {
    // Linked clip track movement is left to the caller to specify
    // since it depends on track layout (audio tracks, video tracks, etc.)
  }

  return result;
}

/**
 * Trim a clip from the left (change start time and in-point).
 *
 * @param clipId - ID of the clip to trim
 * @param newStartTime - New start time on the timeline
 * @returns New clips array with the trimmed clip
 */
export function trimClipLeft<T extends EditableClip>(
  clips: readonly T[],
  clipId: string,
  newStartTime: number,
  options: TrimClipOptions = {},
): T[] {
  const { trimLinked = true } = options;

  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip) return [...clips];

  const delta = newStartTime - clip.startTime;
  const newDuration = clip.duration - delta;
  const newInPoint = clip.inPoint + delta;

  // Don't allow negative duration
  if (newDuration <= 0) return [...clips];

  const result = [...clips];
  result[index] = {
    ...clip,
    startTime: newStartTime,
    duration: newDuration,
    inPoint: newInPoint,
  };

  // Trim linked clip
  if (trimLinked && clip.linkedClipId) {
    const [linkedIndex, linkedClip] = findClipById(result, clip.linkedClipId);
    if (linkedIndex >= 0 && linkedClip) {
      result[linkedIndex] = {
        ...linkedClip,
        startTime: newStartTime,
        duration: newDuration,
        inPoint: linkedClip.inPoint + delta,
      };
    }
  }

  return sortClipsByStartTime(result);
}

/**
 * Trim a clip from the right (change duration).
 *
 * @param clipId - ID of the clip to trim
 * @param newDuration - New duration of the clip
 * @returns New clips array with the trimmed clip
 */
export function trimClipRight<T extends EditableClip>(
  clips: readonly T[],
  clipId: string,
  newDuration: number,
  options: TrimClipOptions = {},
): T[] {
  const { trimLinked = true } = options;

  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip) return [...clips];

  // Don't allow negative or zero duration
  if (newDuration <= 0) return [...clips];

  const result = [...clips];
  result[index] = { ...clip, duration: newDuration };

  // Trim linked clip
  if (trimLinked && clip.linkedClipId) {
    const [linkedIndex, linkedClip] = findClipById(result, clip.linkedClipId);
    if (linkedIndex >= 0 && linkedClip) {
      result[linkedIndex] = { ...linkedClip, duration: newDuration };
    }
  }

  return result;
}

/**
 * Split a clip at a specific time.
 *
 * @param clip - The clip to split
 * @param splitTime - Timeline time to split at (must be within clip bounds)
 * @param leftId - ID for the left portion
 * @param rightId - ID for the right portion
 * @returns Split result with left and right clips, or null if splitTime is invalid
 */
export function splitClip<T extends EditableClip>(
  clip: T,
  splitTime: number,
  leftId: string,
  rightId: string,
): SplitResult<T> | null {
  // Validate split time is within clip bounds
  if (splitTime <= clip.startTime || splitTime >= clip.startTime + clip.duration) {
    return null;
  }

  const leftDuration = splitTime - clip.startTime;
  const rightDuration = clip.duration - leftDuration;
  const rightInPoint = clip.inPoint + leftDuration;

  const left: T = {
    ...clip,
    id: leftId,
    duration: leftDuration,
    linkedClipId: undefined, // Will be re-linked if needed
  };

  const right: T = {
    ...clip,
    id: rightId,
    startTime: splitTime,
    duration: rightDuration,
    inPoint: rightInPoint,
    linkedClipId: undefined, // Will be re-linked if needed
  };

  return { left, right };
}

/**
 * Split a clip and its linked clip at a specific time.
 *
 * @returns Array of split results [primary, linked?], or null if invalid
 */
export function splitClipWithLinked<T extends EditableClip>(
  clips: readonly T[],
  clipId: string,
  splitTime: number,
  generateId: () => string,
): { updatedClips: T[]; splitResults: SplitResult<T>[] } | null {
  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip) return null;

  const primaryLeftId = generateId();
  const primaryRightId = generateId();

  const primarySplit = splitClip(clip, splitTime, primaryLeftId, primaryRightId);
  if (!primarySplit) return null;

  const splitResults: SplitResult<T>[] = [primarySplit];
  let result = removeClip(clips, clipId);

  // Handle linked clip
  if (clip.linkedClipId) {
    const [, linkedClip] = findClipById(clips, clip.linkedClipId);
    if (linkedClip) {
      const linkedLeftId = generateId();
      const linkedRightId = generateId();

      const linkedSplit = splitClip(linkedClip, splitTime, linkedLeftId, linkedRightId);
      if (linkedSplit) {
        // Link the split clips
        primarySplit.left.linkedClipId = linkedLeftId;
        primarySplit.right.linkedClipId = linkedRightId;
        linkedSplit.left.linkedClipId = primaryLeftId;
        linkedSplit.right.linkedClipId = primaryRightId;

        splitResults.push(linkedSplit);
        result = removeClip(result, clip.linkedClipId);
        result = addClips(result, [linkedSplit.left, linkedSplit.right]);
      }
    }
  }

  result = addClips(result, [primarySplit.left, primarySplit.right]);

  return { updatedClips: result, splitResults };
}

// ============================================================================
// Linking Operations
// ============================================================================

/**
 * Link two clips together (e.g., video and audio from same source).
 *
 * @returns New clips array with the clips linked
 */
export function linkClips<T extends EditableClip>(
  clips: readonly T[],
  clipId1: string,
  clipId2: string,
): T[] {
  const [index1, clip1] = findClipById(clips, clipId1);
  const [index2, clip2] = findClipById(clips, clipId2);

  if (index1 < 0 || index2 < 0 || !clip1 || !clip2) return [...clips];
  if (clipId1 === clipId2) return [...clips];

  const result = [...clips];
  result[index1] = { ...clip1, linkedClipId: clipId2 };
  result[index2] = { ...clip2, linkedClipId: clipId1 };

  return result;
}

/**
 * Unlink a clip from its linked partner.
 *
 * @returns New clips array with the clips unlinked
 */
export function unlinkClip<T extends EditableClip>(clips: readonly T[], clipId: string): T[] {
  const [index, clip] = findClipById(clips, clipId);
  if (index < 0 || !clip || !clip.linkedClipId) return [...clips];

  const [linkedIndex, linkedClip] = findClipById(clips, clip.linkedClipId);

  const result = [...clips];
  result[index] = { ...clip, linkedClipId: undefined };

  if (linkedIndex >= 0 && linkedClip) {
    result[linkedIndex] = { ...linkedClip, linkedClipId: undefined };
  }

  return result;
}

// ============================================================================
// Cross Transition Operations
// ============================================================================

/**
 * Add a cross transition between two clips.
 * Validates that clips are on the same track and overlap appropriately.
 *
 * @returns New cross transitions array, or null if invalid
 */
export function addCrossTransition<T extends EditableClip>(
  clips: readonly T[],
  crossTransitions: readonly CrossTransitionRef[],
  outgoingClipId: string,
  incomingClipId: string,
  transitionId: string,
  duration: number,
  type: CrossTransitionType = "Dissolve",
  boundary?: number,
  easing: Easing = { preset: "EaseInOut" },
): CrossTransitionRef[] | null {
  const [, outgoing] = findClipById(clips, outgoingClipId);
  const [, incoming] = findClipById(clips, incomingClipId);

  if (!outgoing || !incoming) return null;

  // Must be on same track
  if (outgoing.trackId !== incoming.trackId) return null;

  // Outgoing must end where incoming starts (or overlap)
  const outgoingEnd = outgoing.startTime + outgoing.duration;
  if (incoming.startTime > outgoingEnd) return null;

  // Duration can't exceed the overlap
  const maxDuration = Math.min(
    outgoing.duration,
    incoming.duration,
    outgoingEnd - incoming.startTime + duration,
  );
  const actualDuration = Math.min(duration, maxDuration);

  const newTransition: CrossTransitionRef = {
    id: transitionId,
    outgoingClipId,
    incomingClipId,
    duration: actualDuration,
    type,
    boundary: boundary ?? outgoingEnd,
    easing,
  };

  return [...crossTransitions, newTransition];
}

/**
 * Remove a cross transition by ID.
 */
export function removeCrossTransition(
  crossTransitions: readonly CrossTransitionRef[],
  transitionId: string,
): CrossTransitionRef[] {
  return crossTransitions.filter((ct) => ct.id !== transitionId);
}

/**
 * Remove cross transitions involving a specific clip.
 * Use this when deleting a clip.
 */
export function removeCrossTransitionsForClip(
  crossTransitions: readonly CrossTransitionRef[],
  clipId: string,
): CrossTransitionRef[] {
  return crossTransitions.filter(
    (ct) => ct.outgoingClipId !== clipId && ct.incomingClipId !== clipId,
  );
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Check if clips array is properly sorted by startTime.
 * Useful for debugging.
 */
export function isClipsSorted<T extends ClipBounds>(clips: readonly T[]): boolean {
  for (let i = 1; i < clips.length; i++) {
    if (clips[i].startTime < clips[i - 1].startTime) {
      return false;
    }
  }
  return true;
}

/**
 * Find overlapping clips on the same track.
 * Returns pairs of clip IDs that overlap.
 *
 * Note: Two clips on the same track can only overlap during a cross transition.
 * Use this function to find invalid overlaps (excluding cross transition participants).
 *
 * @param clips - All clips to check
 * @param crossTransitions - Cross transitions (overlaps between these pairs are allowed)
 * @returns Pairs of clip IDs that overlap illegally
 */
export function findOverlappingClips<T extends EditableClip>(
  clips: readonly T[],
  crossTransitions: readonly CrossTransitionRef[] = [],
): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];

  // Build set of allowed overlapping pairs (cross transition participants)
  const allowedOverlaps = new Set<string>();
  for (const ct of crossTransitions) {
    // Store both orderings
    allowedOverlaps.add(`${ct.outgoingClipId}:${ct.incomingClipId}`);
    allowedOverlaps.add(`${ct.incomingClipId}:${ct.outgoingClipId}`);
  }

  // Group clips by track
  const byTrack = new Map<string, T[]>();
  for (const clip of clips) {
    const trackClips = byTrack.get(clip.trackId) || [];
    trackClips.push(clip);
    byTrack.set(clip.trackId, trackClips);
  }

  // Check overlaps within each track
  for (const trackClips of byTrack.values()) {
    for (let i = 0; i < trackClips.length; i++) {
      for (let j = i + 1; j < trackClips.length; j++) {
        const a = trackClips[i];
        const b = trackClips[j];

        const aEnd = a.startTime + a.duration;
        const bEnd = b.startTime + b.duration;

        // Check if they overlap (not just touch)
        if (a.startTime < bEnd && b.startTime < aEnd) {
          // Check if this overlap is allowed (cross transition)
          const key = `${a.id}:${b.id}`;
          if (!allowedOverlaps.has(key)) {
            overlaps.push([a.id, b.id]);
          }
        }
      }
    }
  }

  return overlaps;
}

/**
 * Validate that a clip can be placed at the given position without illegal overlap.
 *
 * @param clips - Existing clips
 * @param newClip - Clip to place (or updated clip)
 * @param crossTransitions - Cross transitions (these allow overlap)
 * @param excludeClipId - Clip ID to exclude from overlap check (use when updating existing clip)
 * @returns true if placement is valid, false if it would cause illegal overlap
 */
export function canPlaceClip<T extends EditableClip>(
  clips: readonly T[],
  newClip: T,
  crossTransitions: readonly CrossTransitionRef[] = [],
  excludeClipId?: string,
): boolean {
  // Get cross transition partners for this clip
  const allowedPartnerIds = new Set<string>();
  for (const ct of crossTransitions) {
    if (ct.outgoingClipId === newClip.id) {
      allowedPartnerIds.add(ct.incomingClipId);
    } else if (ct.incomingClipId === newClip.id) {
      allowedPartnerIds.add(ct.outgoingClipId);
    }
  }

  const newEnd = newClip.startTime + newClip.duration;

  for (const clip of clips) {
    // Skip the clip being updated
    if (excludeClipId && clip.id === excludeClipId) continue;

    // Skip clips on different tracks
    if (clip.trackId !== newClip.trackId) continue;

    // Skip self
    if (clip.id === newClip.id) continue;

    const clipEnd = clip.startTime + clip.duration;

    // Check for overlap
    if (newClip.startTime < clipEnd && clip.startTime < newEnd) {
      // Overlap exists - is it allowed?
      if (!allowedPartnerIds.has(clip.id)) {
        return false; // Illegal overlap
      }
    }
  }

  return true;
}
