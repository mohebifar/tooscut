/**
 * Automatic color matching between two clips.
 *
 * Given RGBA pixel buffers rendered from a reference frame and a target
 * frame, computes a linear (slope + offset) correction that maps the
 * target's per-channel mean and spread onto the reference's — the
 * standard "mean/std transfer" technique for quick shot matching.
 *
 * Deliberately linear only (CDL power stays 1.0): matching gamma too is
 * possible but far more sensitive to noisy statistics on a single frame,
 * and a wrong gamma match looks much worse than a wrong slope/offset one.
 */

import type { PrimaryCorrection } from "./types.js";

import { DEFAULT_PRIMARY_CORRECTION } from "./types.js";

export interface ChannelStats {
  /** Per-channel mean, normalized 0-1. */
  mean: [number, number, number];
  /** Per-channel standard deviation, normalized 0-1. */
  std: [number, number, number];
}

/**
 * Compute per-channel mean and standard deviation from an RGBA pixel buffer
 * (as produced by Compositor.renderToPixels — 4 bytes per pixel, 0-255).
 */
export function computeChannelStats(pixels: Uint8Array | Uint8ClampedArray): ChannelStats {
  const pixelCount = pixels.length / 4;
  if (pixelCount <= 0) {
    return { mean: [0, 0, 0], std: [0, 0, 0] };
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    sumR += pixels[i];
    sumG += pixels[i + 1];
    sumB += pixels[i + 2];
  }
  const meanR = sumR / pixelCount / 255;
  const meanG = sumG / pixelCount / 255;
  const meanB = sumB / pixelCount / 255;

  let sqR = 0;
  let sqG = 0;
  let sqB = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const dr = pixels[i] / 255 - meanR;
    const dg = pixels[i + 1] / 255 - meanG;
    const db = pixels[i + 2] / 255 - meanB;
    sqR += dr * dr;
    sqG += dg * dg;
    sqB += db * db;
  }

  return {
    mean: [meanR, meanG, meanB],
    std: [Math.sqrt(sqR / pixelCount), Math.sqrt(sqG / pixelCount), Math.sqrt(sqB / pixelCount)],
  };
}

/** Clamp slope so a near-flat (low-contrast/low-variance) frame can't produce an extreme correction. */
const MIN_SLOPE = 0.2;
const MAX_SLOPE = 5.0;
/** Below this standard deviation, a channel is treated as flat and left unscaled (slope 1). */
const MIN_STD = 0.01;

/**
 * Derive a PrimaryCorrection (slope/offset only) that matches `target`'s
 * per-channel mean and spread onto `reference`'s.
 *
 * output = clamp(input * slope + offset, 0, 1) — matches apply_cdl() in the
 * compositor shader with power left at 1.0.
 */
export function matchColorCorrection(
  reference: ChannelStats,
  target: ChannelStats,
): PrimaryCorrection {
  const slope: [number, number, number] = [1, 1, 1];
  const offset: [number, number, number] = [0, 0, 0];

  for (let c = 0; c < 3; c++) {
    const targetStd = target.std[c];
    const s =
      targetStd < MIN_STD
        ? 1
        : Math.min(MAX_SLOPE, Math.max(MIN_SLOPE, reference.std[c] / targetStd));
    slope[c] = s;
    offset[c] = reference.mean[c] - target.mean[c] * s;
  }

  return {
    ...DEFAULT_PRIMARY_CORRECTION,
    slope,
    offset,
  };
}

/** Convenience wrapper: compute stats for both buffers, then match. */
export function matchColorFromPixels(
  referencePixels: Uint8Array | Uint8ClampedArray,
  targetPixels: Uint8Array | Uint8ClampedArray,
): PrimaryCorrection {
  return matchColorCorrection(
    computeChannelStats(referencePixels),
    computeChannelStats(targetPixels),
  );
}
