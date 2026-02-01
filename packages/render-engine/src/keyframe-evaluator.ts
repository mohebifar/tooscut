/**
 * Pure TypeScript keyframe evaluation with temporal caching.
 *
 * No WASM dependency - easier to extend with custom curves and spline editing.
 */

import type {
  KeyframeTracks,
  KeyframeTrack,
  Keyframe,
  Transform,
  Effects,
  Easing,
  CubicBezier,
  EasingPreset,
} from "./types.js";
import { DEFAULT_TRANSFORM, DEFAULT_EFFECTS } from "./types.js";

// ============================================================================
// Cubic Bezier Evaluation
// ============================================================================

/**
 * Common cubic bezier presets.
 */
export const CUBIC_BEZIER_PRESETS: Record<EasingPreset, CubicBezier> = {
  Linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  EaseIn: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  EaseOut: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  EaseInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  Custom: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }, // Fallback
};

/**
 * Evaluate a cubic bezier curve at parameter t.
 * Uses Newton-Raphson iteration to find the curve parameter.
 */
export function evaluateCubicBezier(bezier: CubicBezier, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const { x1, y1, x2, y2 } = bezier;

  // Newton-Raphson iteration to find u where x(u) = t
  let u = t; // Initial guess

  for (let i = 0; i < 8; i++) {
    const x = sampleBezierX(x1, x2, u) - t;
    if (Math.abs(x) < 1e-6) break;

    const dx = sampleBezierDX(x1, x2, u);
    if (Math.abs(dx) < 1e-6) break;

    u -= x / dx;
  }

  return sampleBezierY(y1, y2, Math.max(0, Math.min(1, u)));
}

/** Sample X coordinate of bezier at parameter u */
function sampleBezierX(x1: number, x2: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const mt = 1 - u;
  const mt2 = mt * mt;
  return 3 * mt2 * u * x1 + 3 * mt * u2 * x2 + u3;
}

/** Sample Y coordinate of bezier at parameter u */
function sampleBezierY(y1: number, y2: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  const mt = 1 - u;
  const mt2 = mt * mt;
  return 3 * mt2 * u * y1 + 3 * mt * u2 * y2 + u3;
}

/** Derivative of X with respect to u */
function sampleBezierDX(x1: number, x2: number, u: number): number {
  const u2 = u * u;
  const mt = 1 - u;
  return 3 * mt * mt * x1 + 6 * mt * u * (x2 - x1) + 3 * u2 * (1 - x2);
}

/**
 * Evaluate an easing at progress t (0-1).
 */
export function evaluateEasing(easing: Easing, t: number): number {
  const bezier = easing.custom_bezier ?? CUBIC_BEZIER_PRESETS[easing.preset];
  return evaluateCubicBezier(bezier, t);
}

// ============================================================================
// Keyframe Interpolation
// ============================================================================

/**
 * Interpolate between two keyframes at the given time.
 */
function interpolateKeyframes(k1: Keyframe, k2: Keyframe, time: number): number {
  if (k1.time >= k2.time) return k1.value;

  // Calculate linear progress
  const t = (time - k1.time) / (k2.time - k1.time);

  switch (k1.interpolation) {
    case "Step":
      return k1.value;

    case "Linear":
      return k1.value + (k2.value - k1.value) * t;

    case "Bezier": {
      const easedT = evaluateEasing(k1.easing, t);
      return k1.value + (k2.value - k1.value) * easedT;
    }

    default:
      return k1.value + (k2.value - k1.value) * t;
  }
}

/**
 * Evaluate a keyframe track at the given time.
 */
export function evaluateTrack(track: KeyframeTrack, time: number): number {
  const keyframes = track.keyframes;

  if (keyframes.length === 0) {
    return NaN;
  }

  // Single keyframe - always return its value
  if (keyframes.length === 1) {
    return keyframes[0].value;
  }

  // Before first keyframe
  if (time <= keyframes[0].time) {
    return keyframes[0].value;
  }

  // After last keyframe
  const lastIdx = keyframes.length - 1;
  if (time >= keyframes[lastIdx].time) {
    return keyframes[lastIdx].value;
  }

  // Binary search for the keyframe pair
  let low = 0;
  let high = keyframes.length - 1;

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    if (keyframes[mid].time <= time) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return interpolateKeyframes(keyframes[low], keyframes[low + 1], time);
}

// ============================================================================
// KeyframeEvaluator Class
// ============================================================================

/**
 * Evaluator for keyframe animations with temporal caching.
 *
 * During sequential playback, lookups are O(1) due to index caching.
 * After seeking, call clearCache() for optimal performance.
 */
export class KeyframeEvaluator {
  private tracks: KeyframeTracks;
  private trackMap: Map<string, KeyframeTrack>;
  private cache: Map<string, number>; // property -> last keyframe index

  constructor(tracks: KeyframeTracks) {
    this.tracks = tracks;
    this.trackMap = new Map();
    this.cache = new Map();

    // Build lookup map
    for (const track of tracks.tracks) {
      this.trackMap.set(track.property, track);
    }
  }

  /**
   * Evaluate a single property at the given time.
   * Returns NaN if the property doesn't exist.
   */
  evaluate(property: string, time: number): number {
    const track = this.trackMap.get(property);
    if (!track || track.keyframes.length === 0) {
      return NaN;
    }

    const keyframes = track.keyframes;

    // Single keyframe
    if (keyframes.length === 1) {
      return keyframes[0].value;
    }

    // Before first keyframe
    if (time <= keyframes[0].time) {
      return keyframes[0].value;
    }

    // After last keyframe
    const lastIdx = keyframes.length - 1;
    if (time >= keyframes[lastIdx].time) {
      return keyframes[lastIdx].value;
    }

    // Try cached index first (temporal coherence)
    const cachedIdx = this.cache.get(property);
    let idx: number;

    if (cachedIdx !== undefined) {
      idx = this.findIndexFromCache(keyframes, time, cachedIdx);
    } else {
      idx = this.binarySearchIndex(keyframes, time);
    }

    // Update cache
    this.cache.set(property, idx);

    return interpolateKeyframes(keyframes[idx], keyframes[idx + 1], time);
  }

  /**
   * Find keyframe index using cached hint.
   * Fast for sequential playback (O(1)), falls back to binary search for seeks.
   */
  private findIndexFromCache(keyframes: Keyframe[], time: number, cachedIdx: number): number {
    const len = keyframes.length;
    const idx = Math.min(cachedIdx, len - 2);

    // Check if time is still in the same segment
    if (idx < len - 1 && keyframes[idx].time <= time && time < keyframes[idx + 1].time) {
      return idx;
    }

    // Try forward linear search (common case during playback)
    const searchLimit = 4;
    for (let i = 0; i < searchLimit; i++) {
      const checkIdx = idx + i + 1;
      if (checkIdx >= len - 1) break;

      if (keyframes[checkIdx].time <= time && time < keyframes[checkIdx + 1].time) {
        return checkIdx;
      }
    }

    // Fall back to binary search
    return this.binarySearchIndex(keyframes, time);
  }

  /**
   * Binary search for the keyframe index.
   */
  private binarySearchIndex(keyframes: Keyframe[], time: number): number {
    let low = 0;
    let high = keyframes.length - 1;

    while (low < high - 1) {
      const mid = Math.floor((low + high) / 2);
      if (keyframes[mid].time <= time) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return Math.min(low, keyframes.length - 2);
  }

  /**
   * Check if a property has keyframes.
   */
  hasProperty(property: string): boolean {
    const track = this.trackMap.get(property);
    return track !== undefined && track.keyframes.length > 0;
  }

  /**
   * Get all animated property names.
   */
  properties(): string[] {
    return Array.from(this.trackMap.keys());
  }

  /**
   * Clear the temporal cache.
   * Call this after seeking to a non-sequential time.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Evaluate all transform properties at the given time.
   */
  evaluateTransform(time: number): Transform {
    const x = this.evaluate("x", time);
    const y = this.evaluate("y", time);
    const scaleX = this.evaluate("scaleX", time);
    const scaleY = this.evaluate("scaleY", time);
    const rotation = this.evaluate("rotation", time);

    return {
      x: Number.isNaN(x) ? DEFAULT_TRANSFORM.x : x,
      y: Number.isNaN(y) ? DEFAULT_TRANSFORM.y : y,
      scale_x: Number.isNaN(scaleX) ? DEFAULT_TRANSFORM.scale_x : scaleX,
      scale_y: Number.isNaN(scaleY) ? DEFAULT_TRANSFORM.scale_y : scaleY,
      rotation: Number.isNaN(rotation) ? DEFAULT_TRANSFORM.rotation : rotation,
      anchor_x: DEFAULT_TRANSFORM.anchor_x,
      anchor_y: DEFAULT_TRANSFORM.anchor_y,
    };
  }

  /**
   * Evaluate all effect properties at the given time.
   */
  evaluateEffects(time: number): Effects {
    const opacity = this.evaluate("opacity", time);
    const brightness = this.evaluate("brightness", time);
    const contrast = this.evaluate("contrast", time);
    const saturation = this.evaluate("saturation", time);
    const hueRotate = this.evaluate("hueRotate", time);
    const blur = this.evaluate("blur", time);

    return {
      opacity: Number.isNaN(opacity) ? DEFAULT_EFFECTS.opacity : opacity,
      brightness: Number.isNaN(brightness) ? DEFAULT_EFFECTS.brightness : brightness,
      contrast: Number.isNaN(contrast) ? DEFAULT_EFFECTS.contrast : contrast,
      saturation: Number.isNaN(saturation) ? DEFAULT_EFFECTS.saturation : saturation,
      hue_rotate: Number.isNaN(hueRotate) ? DEFAULT_EFFECTS.hue_rotate : hueRotate,
      blur: Number.isNaN(blur) ? DEFAULT_EFFECTS.blur : blur,
    };
  }

  /**
   * Evaluate all properties at the given time.
   * Returns a map of property name to value.
   */
  evaluateAll(time: number): Map<string, number> {
    const result = new Map<string, number>();
    for (const property of this.trackMap.keys()) {
      const value = this.evaluate(property, time);
      if (!Number.isNaN(value)) {
        result.set(property, value);
      }
    }
    return result;
  }
}

// ============================================================================
// Keyframe Helpers
// ============================================================================

/**
 * Create a linear keyframe.
 */
export function createLinearKeyframe(time: number, value: number): Keyframe {
  return {
    time,
    value,
    interpolation: "Linear",
    easing: { preset: "Linear" },
  };
}

/**
 * Create a step (hold) keyframe.
 */
export function createStepKeyframe(time: number, value: number): Keyframe {
  return {
    time,
    value,
    interpolation: "Step",
    easing: { preset: "Linear" },
  };
}

/**
 * Create a bezier keyframe with custom easing.
 */
export function createBezierKeyframe(time: number, value: number, easing: Easing): Keyframe {
  return {
    time,
    value,
    interpolation: "Bezier",
    easing,
  };
}

/**
 * Create a bezier keyframe with preset easing.
 */
export function createEasedKeyframe(time: number, value: number, preset: EasingPreset): Keyframe {
  return {
    time,
    value,
    interpolation: "Bezier",
    easing: { preset },
  };
}

/**
 * Create a bezier keyframe with custom cubic bezier curve.
 */
export function createCustomBezierKeyframe(
  time: number,
  value: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Keyframe {
  return {
    time,
    value,
    interpolation: "Bezier",
    easing: {
      preset: "Custom",
      custom_bezier: { x1, y1, x2, y2 },
    },
  };
}
