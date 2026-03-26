/**
 * Unit tests for clip operations.
 *
 * These tests don't require WebGPU and can run in Node.js.
 */

import { describe, it, expect } from "vitest";

import {
  addClip,
  addClips,
  removeClip,
  removeClipWithLinked,
  updateClip,
  moveClip,
  trimClipLeft,
  trimClipRight,
  splitClip,
  splitClipWithLinked,
  linkClips,
  unlinkClip,
  findInsertionIndex,
  isClipsSorted,
  findOverlappingClips,
  canPlaceClip,
  sortClipsByStartTime,
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
  type EditableClip,
  type EditableTrack,
} from "../src/clip-operations.js";

// Helper to create test clips
function createClip(
  id: string,
  startTime: number,
  duration: number,
  trackId: string = "track-1",
): EditableClip {
  return {
    id,
    startTime,
    duration,
    trackId,
    inPoint: 0,
  };
}

describe("clip-operations", () => {
  describe("findInsertionIndex", () => {
    it("finds correct index in empty array", () => {
      expect(findInsertionIndex([], 5)).toBe(0);
    });

    it("finds correct index at start", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      expect(findInsertionIndex(clips, 5)).toBe(0);
    });

    it("finds correct index in middle", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      expect(findInsertionIndex(clips, 15)).toBe(1);
    });

    it("finds correct index at end", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      expect(findInsertionIndex(clips, 25)).toBe(2);
    });

    it("handles equal start times", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      expect(findInsertionIndex(clips, 10)).toBe(0);
    });
  });

  describe("addClip", () => {
    it("adds clip to empty array", () => {
      const clip = createClip("a", 10, 5);
      const result = addClip([], clip);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(clip);
    });

    it("maintains sorted order when adding to start", () => {
      const clips = [createClip("b", 20, 5)];
      const newClip = createClip("a", 10, 5);
      const result = addClip(clips, newClip);
      expect(result.map((c) => c.id)).toEqual(["a", "b"]);
    });

    it("maintains sorted order when adding to middle", () => {
      const clips = [createClip("a", 10, 5), createClip("c", 30, 5)];
      const newClip = createClip("b", 20, 5);
      const result = addClip(clips, newClip);
      expect(result.map((c) => c.id)).toEqual(["a", "b", "c"]);
    });

    it("maintains sorted order when adding to end", () => {
      const clips = [createClip("a", 10, 5)];
      const newClip = createClip("b", 20, 5);
      const result = addClip(clips, newClip);
      expect(result.map((c) => c.id)).toEqual(["a", "b"]);
    });

    it("does not mutate original array", () => {
      const clips = [createClip("a", 10, 5)];
      const original = [...clips];
      addClip(clips, createClip("b", 5, 5));
      expect(clips).toEqual(original);
    });
  });

  describe("addClips", () => {
    it("adds multiple clips maintaining sorted order", () => {
      const clips = [createClip("b", 20, 5)];
      const newClips = [createClip("a", 10, 5), createClip("c", 30, 5)];
      const result = addClips(clips, newClips);
      expect(result.map((c) => c.id)).toEqual(["a", "b", "c"]);
    });

    it("handles empty new clips array", () => {
      const clips = [createClip("a", 10, 5)];
      const result = addClips(clips, []);
      expect(result).toHaveLength(1);
    });

    it("handles empty existing clips array", () => {
      const newClips = [createClip("b", 20, 5), createClip("a", 10, 5)];
      const result = addClips([], newClips);
      expect(result.map((c) => c.id)).toEqual(["a", "b"]);
    });
  });

  describe("removeClip", () => {
    it("removes clip by id", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      const result = removeClip(clips, "a");
      expect(result.map((c) => c.id)).toEqual(["b"]);
    });

    it("returns copy if clip not found", () => {
      const clips = [createClip("a", 10, 5)];
      const result = removeClip(clips, "nonexistent");
      expect(result).toHaveLength(1);
      expect(result).not.toBe(clips);
    });
  });

  describe("removeClipWithLinked", () => {
    it("removes clip and its linked partner", () => {
      const clips: EditableClip[] = [
        { ...createClip("video", 10, 5), linkedClipId: "audio" },
        { ...createClip("audio", 10, 5), linkedClipId: "video" },
        createClip("other", 20, 5),
      ];
      const result = removeClipWithLinked(clips, "video");
      expect(result.map((c) => c.id)).toEqual(["other"]);
    });

    it("removes only the clip if no linked partner", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      const result = removeClipWithLinked(clips, "a");
      expect(result.map((c) => c.id)).toEqual(["b"]);
    });
  });

  describe("updateClip", () => {
    it("updates clip properties", () => {
      const clips = [createClip("a", 10, 5)];
      const result = updateClip(clips, "a", { duration: 10 });
      expect(result[0].duration).toBe(10);
    });

    it("re-sorts when startTime changes", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      const result = updateClip(clips, "b", { startTime: 5 });
      expect(result.map((c) => c.id)).toEqual(["b", "a"]);
    });

    it("returns copy if clip not found", () => {
      const clips = [createClip("a", 10, 5)];
      const result = updateClip(clips, "nonexistent", { duration: 10 });
      expect(result[0].duration).toBe(5);
    });
  });

  describe("moveClip", () => {
    it("moves clip to new start time", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      const result = moveClip(clips, "a", 25);
      expect(result.map((c) => c.id)).toEqual(["b", "a"]);
      expect(result[1].startTime).toBe(25);
    });

    it("moves linked clip as well", () => {
      const clips: EditableClip[] = [
        { ...createClip("video", 10, 5), linkedClipId: "audio" },
        { ...createClip("audio", 10, 5), linkedClipId: "video" },
      ];
      const result = moveClip(clips, "video", 20);
      expect(result.find((c) => c.id === "video")?.startTime).toBe(20);
      expect(result.find((c) => c.id === "audio")?.startTime).toBe(20);
    });

    it("can skip moving linked clip", () => {
      const clips: EditableClip[] = [
        { ...createClip("video", 10, 5), linkedClipId: "audio" },
        { ...createClip("audio", 10, 5), linkedClipId: "video" },
      ];
      const result = moveClip(clips, "video", 20, { moveLinked: false });
      expect(result.find((c) => c.id === "video")?.startTime).toBe(20);
      expect(result.find((c) => c.id === "audio")?.startTime).toBe(10);
    });
  });

  describe("trimClipLeft", () => {
    it("trims from left", () => {
      const clips = [createClip("a", 10, 10)]; // 10-20
      const result = trimClipLeft(clips, "a", 15);
      expect(result[0].startTime).toBe(15);
      expect(result[0].duration).toBe(5);
      expect(result[0].inPoint).toBe(5);
    });

    it("trims linked clip", () => {
      const clips: EditableClip[] = [
        { ...createClip("video", 10, 10), linkedClipId: "audio" },
        { ...createClip("audio", 10, 10), linkedClipId: "video" },
      ];
      const result = trimClipLeft(clips, "video", 15);
      expect(result.find((c) => c.id === "video")?.duration).toBe(5);
      expect(result.find((c) => c.id === "audio")?.duration).toBe(5);
    });

    it("prevents negative duration", () => {
      const clips = [createClip("a", 10, 5)];
      const result = trimClipLeft(clips, "a", 20); // Would make duration negative
      expect(result[0]).toEqual(clips[0]); // Unchanged
    });
  });

  describe("trimClipRight", () => {
    it("trims from right", () => {
      const clips = [createClip("a", 10, 10)];
      const result = trimClipRight(clips, "a", 5);
      expect(result[0].duration).toBe(5);
      expect(result[0].startTime).toBe(10); // Unchanged
    });

    it("trims linked clip", () => {
      const clips: EditableClip[] = [
        { ...createClip("video", 10, 10), linkedClipId: "audio" },
        { ...createClip("audio", 10, 10), linkedClipId: "video" },
      ];
      const result = trimClipRight(clips, "video", 5);
      expect(result.find((c) => c.id === "video")?.duration).toBe(5);
      expect(result.find((c) => c.id === "audio")?.duration).toBe(5);
    });

    it("prevents zero or negative duration", () => {
      const clips = [createClip("a", 10, 5)];
      const result = trimClipRight(clips, "a", 0);
      expect(result[0].duration).toBe(5); // Unchanged
    });
  });

  describe("splitClip", () => {
    it("splits clip at given time", () => {
      const clip = createClip("a", 10, 10); // 10-20
      const result = splitClip(clip, 15, "left", "right");

      expect(result).not.toBeNull();
      expect(result!.left.id).toBe("left");
      expect(result!.left.startTime).toBe(10);
      expect(result!.left.duration).toBe(5);
      expect(result!.left.inPoint).toBe(0);

      expect(result!.right.id).toBe("right");
      expect(result!.right.startTime).toBe(15);
      expect(result!.right.duration).toBe(5);
      expect(result!.right.inPoint).toBe(5);
    });

    it("returns null for invalid split time (before clip)", () => {
      const clip = createClip("a", 10, 10);
      const result = splitClip(clip, 5, "left", "right");
      expect(result).toBeNull();
    });

    it("returns null for invalid split time (after clip)", () => {
      const clip = createClip("a", 10, 10);
      const result = splitClip(clip, 25, "left", "right");
      expect(result).toBeNull();
    });

    it("returns null for split at clip start", () => {
      const clip = createClip("a", 10, 10);
      const result = splitClip(clip, 10, "left", "right");
      expect(result).toBeNull();
    });

    it("returns null for split at clip end", () => {
      const clip = createClip("a", 10, 10);
      const result = splitClip(clip, 20, "left", "right");
      expect(result).toBeNull();
    });
  });

  describe("splitClipWithLinked", () => {
    it("splits clip and linked partner", () => {
      const clips: EditableClip[] = [
        { ...createClip("video", 10, 10), linkedClipId: "audio" },
        { ...createClip("audio", 10, 10), linkedClipId: "video" },
      ];

      let idCounter = 0;
      const generateId = () => `id-${idCounter++}`;

      const result = splitClipWithLinked(clips, "video", 15, generateId);

      expect(result).not.toBeNull();
      expect(result!.updatedClips).toHaveLength(4);
      expect(result!.splitResults).toHaveLength(2);

      // Check that new clips are linked correctly
      const videoLeft = result!.splitResults[0].left;
      const audioLeft = result!.splitResults[1].left;
      expect(videoLeft.linkedClipId).toBe(audioLeft.id);
      expect(audioLeft.linkedClipId).toBe(videoLeft.id);
    });
  });

  describe("linkClips", () => {
    it("links two clips", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 10, 5)];
      const result = linkClips(clips, "a", "b");
      expect(result.find((c) => c.id === "a")?.linkedClipId).toBe("b");
      expect(result.find((c) => c.id === "b")?.linkedClipId).toBe("a");
    });

    it("returns copy if clips not found", () => {
      const clips = [createClip("a", 10, 5)];
      const result = linkClips(clips, "a", "nonexistent");
      expect(result.find((c) => c.id === "a")?.linkedClipId).toBeUndefined();
    });
  });

  describe("unlinkClip", () => {
    it("unlinks clip from partner", () => {
      const clips: EditableClip[] = [
        { ...createClip("a", 10, 5), linkedClipId: "b" },
        { ...createClip("b", 10, 5), linkedClipId: "a" },
      ];
      const result = unlinkClip(clips, "a");
      expect(result.find((c) => c.id === "a")?.linkedClipId).toBeUndefined();
      expect(result.find((c) => c.id === "b")?.linkedClipId).toBeUndefined();
    });
  });

  describe("isClipsSorted", () => {
    it("returns true for sorted clips", () => {
      const clips = [createClip("a", 10, 5), createClip("b", 20, 5)];
      expect(isClipsSorted(clips)).toBe(true);
    });

    it("returns false for unsorted clips", () => {
      const clips = [createClip("b", 20, 5), createClip("a", 10, 5)];
      expect(isClipsSorted(clips)).toBe(false);
    });

    it("returns true for empty array", () => {
      expect(isClipsSorted([])).toBe(true);
    });

    it("returns true for single clip", () => {
      expect(isClipsSorted([createClip("a", 10, 5)])).toBe(true);
    });
  });

  describe("findOverlappingClips", () => {
    it("finds overlapping clips on same track", () => {
      const clips = [
        createClip("a", 10, 10), // 10-20
        createClip("b", 15, 10), // 15-25 (overlaps with a)
      ];
      const overlaps = findOverlappingClips(clips);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0]).toContain("a");
      expect(overlaps[0]).toContain("b");
    });

    it("does not find overlapping clips on different tracks", () => {
      const clips = [createClip("a", 10, 10, "track-1"), createClip("b", 15, 10, "track-2")];
      const overlaps = findOverlappingClips(clips);
      expect(overlaps).toHaveLength(0);
    });

    it("does not consider touching clips as overlapping", () => {
      const clips = [
        createClip("a", 10, 10), // 10-20
        createClip("b", 20, 10), // 20-30 (touches but doesn't overlap)
      ];
      const overlaps = findOverlappingClips(clips);
      expect(overlaps).toHaveLength(0);
    });

    it("allows overlap for cross transition participants", () => {
      const clips = [
        createClip("a", 10, 10), // 10-20
        createClip("b", 15, 10), // 15-25 (overlaps with a)
      ];
      const crossTransitions = [
        { id: "ct-1", outgoingClipId: "a", incomingClipId: "b", duration: 5 },
      ];
      const overlaps = findOverlappingClips(clips, crossTransitions);
      expect(overlaps).toHaveLength(0); // Overlap is allowed due to cross transition
    });

    it("reports illegal overlap even when other cross transitions exist", () => {
      const clips = [
        createClip("a", 10, 10), // 10-20
        createClip("b", 15, 10), // 15-25 (illegal overlap with a)
        createClip("c", 25, 10), // 25-35 (no overlap)
      ];
      const crossTransitions = [
        // Cross transition between b and c, but NOT a and b
        { id: "ct-1", outgoingClipId: "b", incomingClipId: "c", duration: 5 },
      ];
      const overlaps = findOverlappingClips(clips, crossTransitions);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0]).toContain("a");
      expect(overlaps[0]).toContain("b");
    });
  });

  describe("canPlaceClip", () => {
    it("allows placing clip with no overlap", () => {
      const clips = [createClip("a", 10, 5)]; // 10-15
      const newClip = createClip("b", 20, 5); // 20-25
      expect(canPlaceClip(clips, newClip)).toBe(true);
    });

    it("rejects placing clip with illegal overlap", () => {
      const clips = [createClip("a", 10, 10)]; // 10-20
      const newClip = createClip("b", 15, 10); // 15-25 (overlaps)
      expect(canPlaceClip(clips, newClip)).toBe(false);
    });

    it("allows overlap on different tracks", () => {
      const clips = [createClip("a", 10, 10, "track-1")]; // 10-20
      const newClip = createClip("b", 15, 10, "track-2"); // 15-25
      expect(canPlaceClip(clips, newClip)).toBe(true);
    });

    it("allows overlap for cross transition partners", () => {
      const clips = [createClip("a", 10, 10)]; // 10-20
      const newClip = createClip("b", 15, 10); // 15-25
      const crossTransitions = [
        { id: "ct-1", outgoingClipId: "a", incomingClipId: "b", duration: 5 },
      ];
      expect(canPlaceClip(clips, newClip, crossTransitions)).toBe(true);
    });

    it("excludes specified clip from overlap check (for updates)", () => {
      const clips = [
        createClip("a", 10, 10), // 10-20
        createClip("b", 20, 10), // 20-30 (being updated)
      ];
      // Moving clip b to overlap with a
      const updatedClip = createClip("b", 15, 10); // 15-25
      // Without excludeClipId, this would fail
      expect(canPlaceClip(clips, updatedClip)).toBe(false);
      // With excludeClipId, the old position of b is ignored
      expect(canPlaceClip(clips, updatedClip, [], "b")).toBe(false); // Still fails because of a
    });
  });

  describe("sortClipsByStartTime", () => {
    it("sorts clips by start time", () => {
      const clips = [createClip("c", 30, 5), createClip("a", 10, 5), createClip("b", 20, 5)];
      const result = sortClipsByStartTime(clips);
      expect(result.map((c) => c.id)).toEqual(["a", "b", "c"]);
    });

    it("does not mutate original array", () => {
      const clips = [createClip("b", 20, 5), createClip("a", 10, 5)];
      const original = [...clips];
      sortClipsByStartTime(clips);
      expect(clips).toEqual(original);
    });
  });
});

// ============================================================================
// Track Operations Tests
// ============================================================================

// Helper to create test tracks
function createTrackPair(
  videoId: string,
  audioId: string,
  index: number,
  name: string,
): [EditableTrack, EditableTrack] {
  return [
    {
      id: videoId,
      index,
      type: "video",
      name,
      pairedTrackId: audioId,
      muted: false,
      locked: false,
      volume: 1,
    },
    {
      id: audioId,
      index,
      type: "audio",
      name: `${name} Audio`,
      pairedTrackId: videoId,
      muted: false,
      locked: false,
      volume: 1,
    },
  ];
}

describe("track-operations", () => {
  describe("addTrackPair", () => {
    it("adds a track pair to empty tracks", () => {
      const { tracks, result } = addTrackPair([], "v1", "a1", "Track 1");

      expect(tracks).toHaveLength(2);
      expect(result.videoTrack.id).toBe("v1");
      expect(result.audioTrack.id).toBe("a1");
      expect(result.videoTrack.pairedTrackId).toBe("a1");
      expect(result.audioTrack.pairedTrackId).toBe("v1");
      expect(result.videoTrack.index).toBe(0);
      expect(result.audioTrack.index).toBe(0);
    });

    it("adds a track pair at the top by default", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const existingTracks = [v1, a1];

      const { tracks, result } = addTrackPair(existingTracks, "v2", "a2", "Track 2");

      expect(tracks).toHaveLength(4);
      expect(result.videoTrack.index).toBe(1); // New track at top (higher index)
    });

    it("inserts track at specified index and shifts others", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const existingTracks = [v1, a1, v2, a2];

      const { tracks } = addTrackPair(existingTracks, "v3", "a3", "Track 3", 1);

      const videoTracks = tracks.filter((t) => t.type === "video");
      expect(videoTracks.find((t) => t.id === "v1")?.index).toBe(0); // Unchanged
      expect(videoTracks.find((t) => t.id === "v3")?.index).toBe(1); // New track
      expect(videoTracks.find((t) => t.id === "v2")?.index).toBe(2); // Shifted up
    });
  });

  describe("removeTrackPair", () => {
    it("removes both video and audio tracks", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const tracks = [v1, a1, v2, a2];
      const clips: EditableClip[] = [];

      const result = removeTrackPair(tracks, clips, "v1");

      expect(result.tracks).toHaveLength(2);
      expect(result.tracks.find((t) => t.id === "v1")).toBeUndefined();
      expect(result.tracks.find((t) => t.id === "a1")).toBeUndefined();
    });

    it("removes track pair when given audio track id", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1, a1];
      const clips: EditableClip[] = [];

      const result = removeTrackPair(tracks, clips, "a1");

      expect(result.tracks).toHaveLength(0);
    });

    it("removes clips on the removed tracks", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const tracks = [v1, a1, v2, a2];
      const clips = [
        createClip("clip1", 0, 10, "v1"),
        createClip("clip2", 0, 10, "a1"),
        createClip("clip3", 0, 10, "v2"),
      ];

      const result = removeTrackPair(tracks, clips, "v1");

      expect(result.clips).toHaveLength(1);
      expect(result.clips[0].id).toBe("clip3");
    });

    it("shifts track indices after removal", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const [v3, a3] = createTrackPair("v3", "a3", 2, "Track 3");
      const tracks = [v1, a1, v2, a2, v3, a3];
      const clips: EditableClip[] = [];

      const result = removeTrackPair(tracks, clips, "v2");

      const videoTracks = result.tracks.filter((t) => t.type === "video");
      expect(videoTracks.find((t) => t.id === "v1")?.index).toBe(0);
      expect(videoTracks.find((t) => t.id === "v3")?.index).toBe(1); // Shifted down
    });
  });

  describe("reorderTrackPair", () => {
    it("moves track to new index", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const [v3, a3] = createTrackPair("v3", "a3", 2, "Track 3");
      const tracks = [v1, a1, v2, a2, v3, a3];

      const result = reorderTrackPair(tracks, "v1", 2);

      const videoTracks = result.filter((t) => t.type === "video");
      expect(videoTracks.find((t) => t.id === "v1")?.index).toBe(2);
      expect(videoTracks.find((t) => t.id === "v2")?.index).toBe(0);
      expect(videoTracks.find((t) => t.id === "v3")?.index).toBe(1);
    });

    it("also moves paired audio track", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const tracks = [v1, a1, v2, a2];

      const result = reorderTrackPair(tracks, "v1", 1);

      expect(result.find((t) => t.id === "a1")?.index).toBe(1);
    });

    it("works when given audio track id", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const tracks = [v1, a1, v2, a2];

      const result = reorderTrackPair(tracks, "a1", 1);

      expect(result.find((t) => t.id === "v1")?.index).toBe(1);
    });
  });

  describe("updateTrack", () => {
    it("updates track properties", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1, a1];

      const result = updateTrack(tracks, "v1", { name: "Renamed Track", muted: true });

      expect(result.find((t) => t.id === "v1")?.name).toBe("Renamed Track");
      expect(result.find((t) => t.id === "v1")?.muted).toBe(true);
    });

    it("updates volume on audio track", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1, a1];

      const result = updateTrack(tracks, "a1", { volume: 0.5 });

      expect(result.find((t) => t.id === "a1")?.volume).toBe(0.5);
    });
  });

  describe("muteTrackPair", () => {
    it("mutes both tracks in pair", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1, a1];

      const result = muteTrackPair(tracks, "v1", true);

      expect(result.find((t) => t.id === "v1")?.muted).toBe(true);
      expect(result.find((t) => t.id === "a1")?.muted).toBe(true);
    });

    it("unmutes both tracks in pair", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      v1.muted = true;
      a1.muted = true;
      const tracks = [v1, a1];

      const result = muteTrackPair(tracks, "a1", false);

      expect(result.find((t) => t.id === "v1")?.muted).toBe(false);
      expect(result.find((t) => t.id === "a1")?.muted).toBe(false);
    });
  });

  describe("lockTrackPair", () => {
    it("locks both tracks in pair", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1, a1];

      const result = lockTrackPair(tracks, "v1", true);

      expect(result.find((t) => t.id === "v1")?.locked).toBe(true);
      expect(result.find((t) => t.id === "a1")?.locked).toBe(true);
    });
  });

  describe("findTrackById", () => {
    it("finds track by id", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1, a1];

      expect(findTrackById(tracks, "v1")).toEqual(v1);
      expect(findTrackById(tracks, "a1")).toEqual(a1);
      expect(findTrackById(tracks, "nonexistent")).toBeUndefined();
    });
  });

  describe("getPairedTrack", () => {
    it("gets paired track", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1, a1];

      expect(getPairedTrack(tracks, "v1")).toEqual(a1);
      expect(getPairedTrack(tracks, "a1")).toEqual(v1);
    });
  });

  describe("getVideoTracksSorted", () => {
    it("returns video tracks sorted by index", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const [v3, a3] = createTrackPair("v3", "a3", 2, "Track 3");
      // Insert in wrong order
      const tracks = [v3, a3, v1, a1, v2, a2];

      const result = getVideoTracksSorted(tracks);

      expect(result.map((t) => t.id)).toEqual(["v1", "v2", "v3"]);
    });
  });

  describe("getAudioTracks", () => {
    it("returns only audio tracks", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const tracks = [v1, a1, v2, a2];

      const result = getAudioTracks(tracks);

      expect(result).toHaveLength(2);
      expect(result.every((t) => t.type === "audio")).toBe(true);
    });
  });

  describe("validateTracks", () => {
    it("validates correct track structure", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 1, "Track 2");
      const tracks = [v1, a1, v2, a2];

      const result = validateTracks(tracks);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects missing paired track", () => {
      const [v1] = createTrackPair("v1", "a1", 0, "Track 1");
      const tracks = [v1]; // Missing a1

      const result = validateTracks(tracks);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("invalid pairedTrackId"))).toBe(true);
    });

    it("detects non-contiguous indices", () => {
      const [v1, a1] = createTrackPair("v1", "a1", 0, "Track 1");
      const [v2, a2] = createTrackPair("v2", "a2", 2, "Track 2"); // Index 2 instead of 1
      const tracks = [v1, a1, v2, a2];

      const result = validateTracks(tracks);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("not contiguous"))).toBe(true);
    });
  });
});
