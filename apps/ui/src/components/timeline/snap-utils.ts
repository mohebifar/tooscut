import type { EditorClip } from "../../state/video-editor-store";

export interface SnapResult {
  time: number;
  snapLines: number[];
}

/**
 * Collect all snap target times from clip edges and the playhead.
 * Excludes clips in the `excludeIds` set.
 * Returns a sorted array of unique times.
 */
export function findSnapTargets(
  clips: EditorClip[],
  excludeIds: Set<string>,
  currentTime: number,
): number[] {
  const targets = new Set<number>();

  for (const clip of clips) {
    if (excludeIds.has(clip.id)) continue;
    targets.add(clip.startTime);
    targets.add(clip.startTime + clip.duration);
  }

  targets.add(currentTime);

  return Array.from(targets).sort((a, b) => a - b);
}

/**
 * Find the closest snap target within a threshold (in time units).
 * Returns the snapped time and snap line positions.
 */
export function snapTime(time: number, targets: number[], thresholdTime: number): SnapResult {
  let closest: number | null = null;
  let closestDist = Infinity;

  for (const target of targets) {
    const dist = Math.abs(time - target);
    if (dist < closestDist) {
      closestDist = dist;
      closest = target;
    }
  }

  if (closest !== null && closestDist <= thresholdTime) {
    return { time: closest, snapLines: [closest] };
  }

  return { time, snapLines: [] };
}
