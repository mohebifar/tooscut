/**
 * Color Space Transform tests.
 *
 * Validates our transfer function and gamut conversion math against
 * reference values from the `colour-science` Python library.
 *
 * Regenerate fixtures: run the Python script in the commit message.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const fixtures = JSON.parse(readFileSync(join(__dirname, "fixtures/cst-reference.json"), "utf-8"));

function slog2ToLinear(slog: number): number {
  // legal-to-full (10-bit)
  const x = (slog * 1023.0 - 64.0) / 876.0;
  const threshold = 0.088251;
  let slogLinear: number;
  if (slog >= threshold) {
    slogLinear = Math.pow(10, (x - 0.616596 - 0.03) / 0.432699) - 0.037584;
  } else {
    slogLinear = (x - 0.030001222851889303) / 5.0;
  }
  return slogLinear * 1.2716129032; // 0.9 * 219/155
}

function slog3ToLinear(slog: number): number {
  const threshold = 171.2102946929 / 1023;
  if (slog >= threshold) {
    return Math.pow(10, (slog * 1023 - 420) / 261.5) * 0.19 - 0.01;
  }
  return ((slog * 1023 - 95) * 0.01125) / (171.2102946929 - 95);
}

function logc3ToLinear(logc: number): number {
  const a = 5.555556;
  const b = 0.052272;
  const c = 0.24719;
  const d = 0.385537;
  const e = 5.367655;
  const f = 0.092809;
  const breakpoint = 0.1496578; // e*cut + f
  if (logc > breakpoint) {
    return (Math.pow(10, (logc - d) / c) - b) / a;
  }
  return (logc - f) / e;
}

function vlogToLinear(vlog: number): number {
  if (vlog >= 0.181) {
    return Math.pow(10, (vlog - 0.598206) / 0.241514) - 0.00873;
  }
  return (vlog - 0.125) / 5.6;
}

function linearToSrgb(linear: number): number {
  if (linear <= 0.0031308) {
    return linear * 12.92;
  }
  return 1.055 * Math.pow(Math.max(linear, 0), 1 / 2.4) - 0.055;
}

// Gamut matrix: S-Gamut → Rec.709 (row-major, computed from colour-science)
const SGAMUT_TO_REC709 = [
  [1.8775895, -0.7940379, -0.083721],
  [-0.1768085, 1.3510232, -0.1741716],
  [-0.0262071, -0.148457, 1.1747362],
];

function matMul3(m: number[][], v: [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

describe("Transfer Functions", () => {
  it("S-Log2 → Linear matches colour-science", () => {
    for (const { input, expected } of fixtures.slog2_to_linear) {
      const actual = slog2ToLinear(input);
      expect(actual).toBeCloseTo(expected, 3);
    }
  });

  it("S-Log3 → Linear matches colour-science", () => {
    for (const { input, expected } of fixtures.slog3_to_linear) {
      const actual = slog3ToLinear(input);
      expect(actual).toBeCloseTo(expected, 4);
    }
  });

  it("LogC3 → Linear matches colour-science", () => {
    for (const { input, expected } of fixtures.logc3_to_linear) {
      const actual = logc3ToLinear(input);
      expect(actual).toBeCloseTo(expected, 4);
    }
  });

  it("V-Log → Linear matches colour-science", () => {
    for (const { input, expected } of fixtures.vlog_to_linear) {
      const actual = vlogToLinear(input);
      expect(actual).toBeCloseTo(expected, 5);
    }
  });
});

describe("Full Pipeline: S-Log2/S-Gamut → sRGB/Rec.709", () => {
  it("matches colour-science reference within tolerance", () => {
    for (const { input, expected } of fixtures.slog2_sgamut_to_srgb_rec709) {
      const [r, g, b] = input;

      // Step 1: S-Log2 → linear
      const linear: [number, number, number] = [
        slog2ToLinear(r),
        slog2ToLinear(g),
        slog2ToLinear(b),
      ];

      // Step 2: S-Gamut → Rec.709
      const rec709Linear = matMul3(SGAMUT_TO_REC709, linear);

      // Step 3: linear → sRGB (clamp negatives before gamma)
      const srgb = rec709Linear.map((v) => Math.min(1, Math.max(0, linearToSrgb(Math.max(0, v)))));

      for (let ch = 0; ch < 3; ch++) {
        expect(srgb[ch]).toBeCloseTo(expected[ch], 2);
      }
    }
  });
});
