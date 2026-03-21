/**
 * Timeline-specific store for UI state.
 * Main editor state will be in a separate video-editor-store.
 */
import { create } from "zustand";
import { DEFAULT_ZOOM } from "./constants";

export interface TimelineClip {
  id: string;
  type: "video" | "audio" | "image" | "text" | "shape";
  trackId: string;
  startTime: number;
  duration: number;
  name?: string;
  assetId?: string;
  /** Linked clip ID (e.g., audio paired with video) */
  linkedClipId?: string;
  /** In-point for trimming (seconds from asset start) */
  inPoint: number;
  /** Speed multiplier (1.0 = normal) */
  speed: number;
  /** Original asset duration (for calculating trim limits) */
  assetDuration?: number;
}

export interface TimelineTrackData {
  id: string;
  name: string;
  order: number;
  muted: boolean;
  locked: boolean;
}

interface TimelineState {
  // View state
  zoom: number;
  scrollX: number;
  scrollY: number;

  // Playback state
  currentTime: number;
  duration: number;
  isPlaying: boolean;

  // Selection state
  selectedClipIds: string[];

  // Tracks (temporary - will come from main store)
  videoTracks: TimelineTrackData[];
  audioTracks: TimelineTrackData[];

  // Clips (temporary - will come from main store)
  clips: TimelineClip[];

  // Actions
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setScrollY: (scrollY: number) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setSelectedClipIds: (ids: string[]) => void;
  clearSelection: () => void;
  addClip: (
    clip: Omit<TimelineClip, "id" | "inPoint" | "speed"> & { inPoint?: number; speed?: number },
  ) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<TimelineClip>) => void;
  addTrack: (type: "video" | "audio", name?: string) => string;

  // Clip operations with overlap handling
  moveClip: (clipId: string, newStartTime: number, newTrackId: string) => void;
  trimClipLeft: (clipId: string, newStartTime: number) => void;
  trimClipRight: (clipId: string, newDuration: number) => void;
  linkClips: (clipId1: string, clipId2: string) => void;
  unlinkClip: (clipId: string) => void;

  // Helper to get corresponding track for linked clip
  getCorrespondingTrack: (trackId: string) => string | null;
}

/**
 * Get the corresponding track ID for a linked clip.
 * video-1 -> audio-1, audio-1 -> video-1, etc.
 */
function getCorrespondingTrackId(trackId: string): string | null {
  const [type, id] = trackId.split("-");
  if (type === "video") {
    return `audio-${id}`;
  } else if (type === "audio") {
    return `video-${id}`;
  }
  return null;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  // View state
  zoom: DEFAULT_ZOOM,
  scrollX: 0,
  scrollY: 0,

  // Playback state
  currentTime: 0,
  duration: 30, // 30 seconds default
  isPlaying: false,

  // Selection state
  selectedClipIds: [],

  // Demo tracks
  videoTracks: [{ id: "1", name: "Video 1", order: 0, muted: false, locked: false }],
  audioTracks: [{ id: "1", name: "Audio 1", order: 0, muted: false, locked: false }],

  // Demo clips
  clips: [
    {
      id: "clip-1",
      type: "video",
      trackId: "video-1",
      startTime: 2,
      duration: 5,
      name: "Sample Video",
      linkedClipId: "clip-2",
      inPoint: 0,
      speed: 1,
      assetDuration: 10,
    },
    {
      id: "clip-2",
      type: "audio",
      trackId: "audio-1",
      startTime: 2,
      duration: 5,
      name: "Sample Audio",
      linkedClipId: "clip-1",
      inPoint: 0,
      speed: 1,
      assetDuration: 10,
    },
    {
      id: "clip-3",
      type: "video",
      trackId: "video-1",
      startTime: 8,
      duration: 3,
      name: "Another Clip",
      inPoint: 0,
      speed: 1,
      assetDuration: 5,
    },
  ],

  // Actions
  setZoom: (zoom) => set({ zoom }),
  setScrollX: (scrollX) => set({ scrollX }),
  setScrollY: (scrollY) => set({ scrollY }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setSelectedClipIds: (selectedClipIds) => set({ selectedClipIds }),
  clearSelection: () => set({ selectedClipIds: [] }),

  addClip: (clip) => {
    const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    set((state) => {
      const newClip: TimelineClip = {
        ...clip,
        id,
        inPoint: clip.inPoint ?? 0,
        speed: clip.speed ?? 1,
      };
      const newClips = [...state.clips, newClip];
      // Update duration if clip extends beyond current duration
      const clipEnd = clip.startTime + clip.duration;
      const newDuration = Math.max(state.duration, clipEnd + 5);
      return { clips: newClips, duration: newDuration };
    });
    return id;
  },

  removeClip: (clipId) =>
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== clipId),
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
    })),

  updateClip: (clipId, updates) =>
    set((state) => ({
      clips: state.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
    })),

  addTrack: (type, name) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    set((state) => {
      if (type === "video") {
        const order = state.videoTracks.length;
        const trackName = name || `Video ${order + 1}`;
        return {
          videoTracks: [
            ...state.videoTracks,
            { id, name: trackName, order, muted: false, locked: false },
          ],
        };
      } else {
        const order = state.audioTracks.length;
        const trackName = name || `Audio ${order + 1}`;
        return {
          audioTracks: [
            ...state.audioTracks,
            { id, name: trackName, order, muted: false, locked: false },
          ],
        };
      }
    });
    return id;
  },

  // Get the corresponding track for a linked clip (video-1 -> audio-1, etc.)
  getCorrespondingTrack: (trackId: string) => {
    return getCorrespondingTrackId(trackId);
  },

  // Move a clip to a new time and/or track, handling overlaps and linked clips
  moveClip: (clipId, newStartTime, newTrackId) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip) return state;

      // Ensure start time is not negative
      const clampedStartTime = Math.max(0, newStartTime);

      // Get the linked clip if any
      const linkedClip = clip.linkedClipId
        ? state.clips.find((c) => c.id === clip.linkedClipId)
        : null;

      // Determine the new track for the linked clip
      let newLinkedTrackId: string | null = null;
      if (linkedClip) {
        const correspondingTrack = getCorrespondingTrackId(newTrackId);
        if (correspondingTrack) {
          newLinkedTrackId = correspondingTrack;
        }
      }

      // Build set of clip IDs being moved (to exclude from overlap check)
      const movingClipIds = new Set([clipId]);
      if (linkedClip) {
        movingClipIds.add(linkedClip.id);
      }

      // Find overlapping clips on the target track and remove them
      const clipEnd = clampedStartTime + clip.duration;
      const overlappingClipIds = new Set<string>();

      state.clips.forEach((c) => {
        if (movingClipIds.has(c.id)) return;

        // Check main clip overlap
        if (c.trackId === newTrackId) {
          const cEnd = c.startTime + c.duration;
          if (!(clipEnd <= c.startTime || clampedStartTime >= cEnd)) {
            overlappingClipIds.add(c.id);
            // Also remove linked clip
            if (c.linkedClipId) {
              overlappingClipIds.add(c.linkedClipId);
            }
          }
        }

        // Check linked clip overlap
        if (newLinkedTrackId && c.trackId === newLinkedTrackId) {
          const cEnd = c.startTime + c.duration;
          if (!(clipEnd <= c.startTime || clampedStartTime >= cEnd)) {
            overlappingClipIds.add(c.id);
            if (c.linkedClipId) {
              overlappingClipIds.add(c.linkedClipId);
            }
          }
        }
      });

      // Update clips
      const newClips = state.clips
        .filter((c) => !overlappingClipIds.has(c.id))
        .map((c) => {
          if (c.id === clipId) {
            return { ...c, startTime: clampedStartTime, trackId: newTrackId };
          }
          if (linkedClip && c.id === linkedClip.id && newLinkedTrackId) {
            return { ...c, startTime: clampedStartTime, trackId: newLinkedTrackId };
          }
          return c;
        });

      // Update duration if clip extends beyond current duration
      const newDuration = Math.max(state.duration, clipEnd + 5);

      return {
        clips: newClips,
        duration: newDuration,
        selectedClipIds: state.selectedClipIds.filter((id) => !overlappingClipIds.has(id)),
      };
    }),

  // Trim clip from the left edge (adjusts startTime, duration, and inPoint)
  trimClipLeft: (clipId, newStartTime) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip) return state;

      // Calculate the delta (how much we're moving the start)
      const delta = newStartTime - clip.startTime;

      // Can't trim past the right edge
      const maxDelta = clip.duration - 0.1; // Keep at least 0.1s duration
      const clampedDelta = Math.min(delta, maxDelta);

      // Can't trim before time 0
      const finalStartTime = Math.max(0, clip.startTime + clampedDelta);
      const actualDelta = finalStartTime - clip.startTime;

      // Calculate new in-point based on speed
      // When trimming left, we're revealing or hiding content at the start
      const inPointDelta = actualDelta * clip.speed;
      const newInPoint = Math.max(0, clip.inPoint + inPointDelta);

      // Check if we have enough asset duration for this trim
      if (clip.assetDuration !== undefined) {
        const maxInPoint = clip.assetDuration - (clip.duration - actualDelta) * clip.speed;
        if (newInPoint > maxInPoint) {
          return state; // Can't trim further
        }
      }

      const newDuration = clip.duration - actualDelta;

      // Get linked clip
      const linkedClip = clip.linkedClipId
        ? state.clips.find((c) => c.id === clip.linkedClipId)
        : null;

      // Remove overlapping clips
      const clipEnd = finalStartTime + newDuration;
      const overlappingClipIds = new Set<string>();

      state.clips.forEach((c) => {
        if (c.id === clipId || (linkedClip && c.id === linkedClip.id)) return;

        if (c.trackId === clip.trackId || (linkedClip && c.trackId === linkedClip.trackId)) {
          const cEnd = c.startTime + c.duration;
          if (!(clipEnd <= c.startTime || finalStartTime >= cEnd)) {
            overlappingClipIds.add(c.id);
            if (c.linkedClipId) {
              overlappingClipIds.add(c.linkedClipId);
            }
          }
        }
      });

      const newClips = state.clips
        .filter((c) => !overlappingClipIds.has(c.id))
        .map((c) => {
          if (c.id === clipId) {
            return {
              ...c,
              startTime: finalStartTime,
              duration: newDuration,
              inPoint: newInPoint,
            };
          }
          // Apply same trim to linked clip
          if (linkedClip && c.id === linkedClip.id) {
            return {
              ...c,
              startTime: finalStartTime,
              duration: newDuration,
              inPoint: Math.max(0, linkedClip.inPoint + inPointDelta),
            };
          }
          return c;
        });

      return {
        clips: newClips,
        selectedClipIds: state.selectedClipIds.filter((id) => !overlappingClipIds.has(id)),
      };
    }),

  // Trim clip from the right edge (adjusts duration only)
  trimClipRight: (clipId, newDuration) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip) return state;

      // Keep at least 0.1s duration
      const clampedDuration = Math.max(0.1, newDuration);

      // Check if we have enough asset duration for this trim
      if (clip.assetDuration !== undefined) {
        const maxDuration = (clip.assetDuration - clip.inPoint) / clip.speed;
        if (clampedDuration > maxDuration) {
          return state; // Can't extend further
        }
      }

      // Get linked clip
      const linkedClip = clip.linkedClipId
        ? state.clips.find((c) => c.id === clip.linkedClipId)
        : null;

      // Remove overlapping clips
      const clipEnd = clip.startTime + clampedDuration;
      const overlappingClipIds = new Set<string>();

      state.clips.forEach((c) => {
        if (c.id === clipId || (linkedClip && c.id === linkedClip.id)) return;

        if (c.trackId === clip.trackId || (linkedClip && c.trackId === linkedClip.trackId)) {
          const cEnd = c.startTime + c.duration;
          if (!(clipEnd <= c.startTime || clip.startTime >= cEnd)) {
            overlappingClipIds.add(c.id);
            if (c.linkedClipId) {
              overlappingClipIds.add(c.linkedClipId);
            }
          }
        }
      });

      const newClips = state.clips
        .filter((c) => !overlappingClipIds.has(c.id))
        .map((c) => {
          if (c.id === clipId) {
            return { ...c, duration: clampedDuration };
          }
          // Apply same trim to linked clip
          if (linkedClip && c.id === linkedClip.id) {
            return { ...c, duration: clampedDuration };
          }
          return c;
        });

      // Update duration if clip extends beyond current duration
      const newTimelineDuration = Math.max(state.duration, clipEnd + 5);

      return {
        clips: newClips,
        duration: newTimelineDuration,
        selectedClipIds: state.selectedClipIds.filter((id) => !overlappingClipIds.has(id)),
      };
    }),

  // Link two clips together
  linkClips: (clipId1, clipId2) =>
    set((state) => ({
      clips: state.clips.map((c) => {
        if (c.id === clipId1) {
          return { ...c, linkedClipId: clipId2 };
        }
        if (c.id === clipId2) {
          return { ...c, linkedClipId: clipId1 };
        }
        return c;
      }),
    })),

  // Unlink a clip from its linked clip
  unlinkClip: (clipId) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip?.linkedClipId) return state;

      return {
        clips: state.clips.map((c) => {
          if (c.id === clipId || c.id === clip.linkedClipId) {
            return { ...c, linkedClipId: undefined };
          }
          return c;
        }),
      };
    }),
}));
