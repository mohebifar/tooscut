import type { EditorClip } from "../../state/video-editor-store";

interface SnapResult {
  frame: number;
  snapLines: number[];
}

/**
 * Collect all snap target frames from clip edges and the playhead.
 * Excludes clips in the `excludeIds` set.
 * Returns a sorted array of unique frame positions.
 */
export function findSnapTargets(
  clips: EditorClip[],
  excludeIds: Set<string>,
  currentFrame: number,
): number[] {
  const targets = new Set<number>();

  for (const clip of clips) {
    if (excludeIds.has(clip.id)) continue;
    targets.add(clip.startTime);
    targets.add(clip.startTime + clip.duration);
  }

  targets.add(currentFrame);

  return Array.from(targets).sort((a, b) => a - b);
}

/**
 * Find the closest snap target within a threshold (in frames).
 * Returns the snapped frame and snap line positions.
 */
export function snapFrame(frame: number, targets: number[], thresholdFrames: number): SnapResult {
  let closest: number | null = null;
  let closestDist = Infinity;

  for (const target of targets) {
    const dist = Math.abs(frame - target);
    if (dist < closestDist) {
      closestDist = dist;
      closest = target;
    }
  }

  if (closest !== null && closestDist <= thresholdFrames) {
    return { frame: closest, snapLines: [closest] };
  }

  return { frame, snapLines: [] };
}
