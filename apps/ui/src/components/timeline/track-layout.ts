/**
 * Track layout computation for split video/audio timeline.
 *
 * The timeline is split into two equal halves:
 * - Top half: video tracks
 * - Bottom half: audio tracks
 *
 * Both halves share the same scroll offset and track heights are mirrored
 * between paired video/audio tracks (pair index 0 = first pair, etc.).
 *
 * Track heights are keyed by pair index, so resizing video track 2 also
 * resizes audio track 2.
 */

import type { TimelineTrack } from "./types";

import { DEFAULT_TRACK_HEIGHT } from "./constants";

export interface SectionLayout {
  /** Cumulative Y offsets within the section for each track */
  trackYOffsets: number[];
  /** Height of each track */
  trackHeights: number[];
  /** Total content height of this section (may exceed viewport if scrollable) */
  totalContentHeight: number;
}

export interface SplitTrackLayout {
  /** Layout for video tracks (top section) */
  video: SectionLayout;
  /** Layout for audio tracks (bottom section) */
  audio: SectionLayout;
  /** Number of video tracks */
  videoTrackCount: number;
  /** Number of audio tracks */
  audioTrackCount: number;
}

/**
 * Compute the split layout for video and audio track sections.
 *
 * Video tracks are sorted descending (V3, V2, V1 — highest index at top).
 * Audio tracks are sorted ascending (A1, A2, A3 — lowest index at top).
 * This creates a "butterfly" layout where V1 and A1 are adjacent at the divider.
 *
 * Heights are mirrored between paired tracks:
 * - videoTracks[last] (V1) pairs with audioTracks[0] (A1)
 * - videoTracks[last-1] (V2) pairs with audioTracks[1] (A2)
 * - etc.
 *
 * @param videoTracks - Video tracks sorted descending by index
 * @param audioTracks - Audio tracks sorted ascending by index
 * @param trackHeightsMap - Per-track height overrides keyed by track ID
 * @param defaultHeight - Default height for tracks without an override
 */
export function computeSplitLayout(
  videoTracks: TimelineTrack[],
  audioTracks: TimelineTrack[],
  trackHeightsMap: Record<string, number>,
  defaultHeight: number = DEFAULT_TRACK_HEIGHT,
): SplitTrackLayout {
  const numVideo = videoTracks.length;
  const numAudio = audioTracks.length;

  // Resolve heights per section position.
  // Video position i maps to pair: videoTracks[i] pairs with audioTracks[numVideo - 1 - i]
  // So video[0] (V_max) pairs with audio[numVideo-1] (A_max), and
  //    video[last] (V1) pairs with audio[0] (A1).
  const videoHeights: number[] = [];
  const audioHeights: number[] = [];

  for (let vi = 0; vi < numVideo; vi++) {
    // The paired audio index for video position vi
    const ai = numVideo - 1 - vi;
    const vTrack = videoTracks[vi];
    const aTrack = ai < numAudio ? audioTracks[ai] : undefined;

    const height =
      (vTrack && trackHeightsMap[vTrack.id]) ??
      (aTrack && trackHeightsMap[aTrack.id]) ??
      defaultHeight;

    videoHeights.push(height);
  }

  for (let ai = 0; ai < numAudio; ai++) {
    // The paired video index for audio position ai
    const vi = numVideo - 1 - ai;
    const aTrack = audioTracks[ai];
    const vTrack = vi >= 0 ? videoTracks[vi] : undefined;

    const height =
      (aTrack && trackHeightsMap[aTrack.id]) ??
      (vTrack && trackHeightsMap[vTrack.id]) ??
      defaultHeight;

    audioHeights.push(height);
  }

  const videoLayout = buildSectionLayoutFromHeights(videoHeights);
  const audioLayout = buildSectionLayoutFromHeights(audioHeights);

  return {
    video: videoLayout,
    audio: audioLayout,
    videoTrackCount: numVideo,
    audioTrackCount: numAudio,
  };
}

function buildSectionLayoutFromHeights(heights: number[]): SectionLayout {
  const trackYOffsets: number[] = [];
  const trackHeights: number[] = [];
  let cumulative = 0;

  for (const height of heights) {
    trackYOffsets.push(cumulative);
    trackHeights.push(height);
    cumulative += height;
  }

  return { trackYOffsets, trackHeights, totalContentHeight: cumulative };
}

/**
 * Binary search to find which track index within a section a local Y falls in.
 * @param localY - Y coordinate relative to the section top
 * @param section - The section layout
 * @returns Track index within the section, or -1 if outside
 */
export function yToSectionTrackIndex(localY: number, section: SectionLayout): number {
  if (localY < 0 || localY >= section.totalContentHeight) return -1;

  const offsets = section.trackYOffsets;
  let lo = 0;
  let hi = offsets.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (offsets[mid] <= localY) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  if (localY >= offsets[lo] + section.trackHeights[lo]) return -1;

  return lo;
}
