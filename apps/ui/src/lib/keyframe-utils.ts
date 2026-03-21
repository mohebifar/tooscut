/**
 * Keyframe utility functions for UI layer keyframe checks.
 */

import type { KeyframeTracks, AnimatableProperty, Keyframe } from "@tooscut/render-engine";
import { KeyframeEvaluator } from "@tooscut/render-engine";

/** Threshold in seconds for detecting if playhead is at a keyframe */
const KEYFRAME_THRESHOLD = 0.05; // 50ms

/**
 * Evaluate a keyframed property at a given time.
 * Returns null if property is not keyframed.
 *
 * @param keyframes The clip's keyframe data
 * @param property The property to evaluate
 * @param time Clip-relative time (0 = start of clip)
 */
export function evaluateKeyframe(
  keyframes: KeyframeTracks | undefined,
  property: AnimatableProperty,
  time: number,
): number | null {
  if (!keyframes || keyframes.tracks.length === 0) {
    return null;
  }

  const evaluator = new KeyframeEvaluator(keyframes);
  const value = evaluator.evaluate(property, time);

  return Number.isNaN(value) ? null : value;
}

/**
 * Check if playhead is at a keyframe (within threshold).
 *
 * @param keyframes The clip's keyframe data
 * @param property The property to check
 * @param time Clip-relative time
 */
export function isAtKeyframe(
  keyframes: KeyframeTracks | undefined,
  property: AnimatableProperty,
  time: number,
): boolean {
  return getKeyframeIndexAtTime(keyframes, property, time) !== -1;
}

/**
 * Check if a property has any keyframes.
 *
 * @param keyframes The clip's keyframe data
 * @param property The property to check
 */
export function isPropertyKeyframed(
  keyframes: KeyframeTracks | undefined,
  property: AnimatableProperty,
): boolean {
  if (!keyframes || keyframes.tracks.length === 0) {
    return false;
  }

  const track = keyframes.tracks.find((t) => t.property === property);
  return track !== undefined && track.keyframes.length > 0;
}

/**
 * Get keyframe index at current time, or -1 if not at keyframe.
 *
 * @param keyframes The clip's keyframe data
 * @param property The property to check
 * @param time Clip-relative time
 */
export function getKeyframeIndexAtTime(
  keyframes: KeyframeTracks | undefined,
  property: AnimatableProperty,
  time: number,
): number {
  if (!keyframes || keyframes.tracks.length === 0) {
    return -1;
  }

  const track = keyframes.tracks.find((t) => t.property === property);
  if (!track || track.keyframes.length === 0) {
    return -1;
  }

  // Find keyframe within threshold
  for (let i = 0; i < track.keyframes.length; i++) {
    if (Math.abs(track.keyframes[i].time - time) <= KEYFRAME_THRESHOLD) {
      return i;
    }
  }

  return -1;
}

/**
 * Get all keyframes for a property.
 *
 * @param keyframes The clip's keyframe data
 * @param property The property to get keyframes for
 */
export function getKeyframesForProperty(
  keyframes: KeyframeTracks | undefined,
  property: AnimatableProperty,
): Keyframe[] {
  if (!keyframes || keyframes.tracks.length === 0) {
    return [];
  }

  const track = keyframes.tracks.find((t) => t.property === property);
  return track?.keyframes ?? [];
}

/**
 * Get adjacent keyframe times for navigation (prev/next).
 *
 * @param keyframes The clip's keyframe data
 * @param property The property to navigate
 * @param time Current clip-relative time
 * @returns [prevTime, nextTime] - null if no prev/next exists
 */
export function getAdjacentKeyframeTimes(
  keyframes: KeyframeTracks | undefined,
  property: AnimatableProperty,
  time: number,
): [number | null, number | null] {
  const kfs = getKeyframesForProperty(keyframes, property);
  if (kfs.length === 0) {
    return [null, null];
  }

  let prevTime: number | null = null;
  let nextTime: number | null = null;

  for (const kf of kfs) {
    // Previous: largest time that is strictly less than current
    if (kf.time < time - KEYFRAME_THRESHOLD) {
      if (prevTime === null || kf.time > prevTime) {
        prevTime = kf.time;
      }
    }
    // Next: smallest time that is strictly greater than current
    if (kf.time > time + KEYFRAME_THRESHOLD) {
      if (nextTime === null || kf.time < nextTime) {
        nextTime = kf.time;
      }
    }
  }

  return [prevTime, nextTime];
}

/**
 * Get the number of keyframes for a property.
 */
export function getKeyframeCount(
  keyframes: KeyframeTracks | undefined,
  property: AnimatableProperty,
): number {
  return getKeyframesForProperty(keyframes, property).length;
}
