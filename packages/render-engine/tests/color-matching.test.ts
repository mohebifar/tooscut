import { describe, it, expect } from "vitest";

import {
  computeChannelStats,
  matchColorCorrection,
  matchColorFromPixels,
} from "../src/color-matching";

function solidFrame(r: number, g: number, b: number, pixelCount = 100): Uint8Array {
  const buf = new Uint8Array(pixelCount * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  }
  return buf;
}

describe("computeChannelStats", () => {
  it("returns zero for an empty buffer", () => {
    const stats = computeChannelStats(new Uint8Array(0));
    expect(stats).toEqual({ mean: [0, 0, 0], std: [0, 0, 0] });
  });

  it("computes exact mean for a solid-color frame", () => {
    const stats = computeChannelStats(solidFrame(255, 128, 0));
    expect(stats.mean[0]).toBeCloseTo(1, 5);
    expect(stats.mean[1]).toBeCloseTo(128 / 255, 5);
    expect(stats.mean[2]).toBeCloseTo(0, 5);
  });

  it("computes zero standard deviation for a solid-color frame", () => {
    const stats = computeChannelStats(solidFrame(200, 50, 100));
    expect(stats.std[0]).toBeCloseTo(0, 5);
    expect(stats.std[1]).toBeCloseTo(0, 5);
    expect(stats.std[2]).toBeCloseTo(0, 5);
  });

  it("computes nonzero standard deviation for a mixed frame", () => {
    // Half black, half white pixels — std should be 0.5 (max for [0,1] range)
    const buf = new Uint8Array(200 * 4);
    for (let i = 0; i < buf.length; i += 4) {
      const isWhite = i / 4 < 100;
      const v = isWhite ? 255 : 0;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
      buf[i + 3] = 255;
    }
    const stats = computeChannelStats(buf);
    expect(stats.mean[0]).toBeCloseTo(0.5, 2);
    expect(stats.std[0]).toBeCloseTo(0.5, 2);
  });

  it("ignores the alpha channel", () => {
    const buf = new Uint8Array(4);
    buf[0] = 100;
    buf[1] = 150;
    buf[2] = 200;
    buf[3] = 0; // fully transparent, must not affect RGB stats
    const stats = computeChannelStats(buf);
    expect(stats.mean[0]).toBeCloseTo(100 / 255, 5);
    expect(stats.mean[1]).toBeCloseTo(150 / 255, 5);
    expect(stats.mean[2]).toBeCloseTo(200 / 255, 5);
  });
});

describe("matchColorCorrection", () => {
  it("is a no-op when reference and target stats are identical", () => {
    const stats = {
      mean: [0.5, 0.4, 0.3] as [number, number, number],
      std: [0.2, 0.2, 0.2] as [number, number, number],
    };
    const correction = matchColorCorrection(stats, stats);
    expect(correction.slope[0]).toBeCloseTo(1, 5);
    expect(correction.slope[1]).toBeCloseTo(1, 5);
    expect(correction.slope[2]).toBeCloseTo(1, 5);
    expect(correction.offset[0]).toBeCloseTo(0, 5);
    expect(correction.offset[1]).toBeCloseTo(0, 5);
    expect(correction.offset[2]).toBeCloseTo(0, 5);
  });

  it("leaves power at 1 and other fields at their default (linear match only)", () => {
    const ref = {
      mean: [0.6, 0.6, 0.6] as [number, number, number],
      std: [0.1, 0.1, 0.1] as [number, number, number],
    };
    const target = {
      mean: [0.4, 0.4, 0.4] as [number, number, number],
      std: [0.1, 0.1, 0.1] as [number, number, number],
    };
    const correction = matchColorCorrection(ref, target);
    expect(correction.power).toEqual([1, 1, 1]);
    expect(correction.saturation).toBe(1);
    expect(correction.exposure).toBe(0);
  });

  it("solves offset such that applying the correction to target reproduces reference's mean", () => {
    const ref = {
      mean: [0.7, 0.5, 0.3] as [number, number, number],
      std: [0.15, 0.1, 0.05] as [number, number, number],
    };
    const target = {
      mean: [0.4, 0.4, 0.4] as [number, number, number],
      std: [0.1, 0.2, 0.02] as [number, number, number],
    };
    const correction = matchColorCorrection(ref, target);

    for (let c = 0; c < 3; c++) {
      // Matches apply_cdl(): output = input * slope + offset (power = 1)
      const matched = target.mean[c] * correction.slope[c] + correction.offset[c];
      expect(matched).toBeCloseTo(ref.mean[c], 5);
    }
  });

  it("clamps slope so a near-flat target channel doesn't blow up", () => {
    const ref = {
      mean: [0.5, 0.5, 0.5] as [number, number, number],
      std: [0.4, 0.4, 0.4] as [number, number, number],
    };
    const target = {
      mean: [0.5, 0.5, 0.5] as [number, number, number],
      std: [0.0001, 0.0001, 0.0001] as [number, number, number],
    };
    const correction = matchColorCorrection(ref, target);
    // Below MIN_STD, slope for that channel should fall back to 1 (unscaled), not a huge ratio
    expect(correction.slope[0]).toBe(1);
    expect(correction.slope[1]).toBe(1);
    expect(correction.slope[2]).toBe(1);
  });

  it("clamps slope for an extreme (but non-flat) contrast ratio", () => {
    const ref = {
      mean: [0.5, 0.5, 0.5] as [number, number, number],
      std: [0.4, 0.4, 0.4] as [number, number, number],
    };
    const target = {
      mean: [0.5, 0.5, 0.5] as [number, number, number],
      std: [0.02, 0.02, 0.02] as [number, number, number],
    };
    const correction = matchColorCorrection(ref, target);
    expect(correction.slope[0]).toBeLessThanOrEqual(5);
  });
});

describe("matchColorFromPixels", () => {
  it("derives a correction that maps a target solid frame onto a reference solid frame", () => {
    const reference = solidFrame(200, 200, 200);
    const target = solidFrame(50, 50, 50);
    const correction = matchColorFromPixels(reference, target);

    // Flat frames (std=0) fall back to slope 1 for each channel; offset alone
    // should shift target's mean exactly onto reference's mean.
    const targetMean = 50 / 255;
    const refMean = 200 / 255;
    for (let c = 0; c < 3; c++) {
      expect(correction.slope[c]).toBe(1);
      expect(targetMean * correction.slope[c] + correction.offset[c]).toBeCloseTo(refMean, 5);
    }
  });
});
