import { describe, it, expect } from "vitest";

import type { KeyframeTrack, KeyframeTracks } from "../src/types";

import {
  KeyframeEvaluator,
  evaluateCubicBezier,
  evaluateEasing,
  evaluateTrack,
  createLinearKeyframe,
  createStepKeyframe,
  createBezierKeyframe,
  createEasedKeyframe,
  createCustomBezierKeyframe,
} from "../src/keyframe-evaluator";

function track(property: string, keyframes: KeyframeTrack["keyframes"]): KeyframeTrack {
  return { property, keyframes };
}

function tracks(...trackList: KeyframeTrack[]): KeyframeTracks {
  return { tracks: trackList };
}

describe("evaluateCubicBezier", () => {
  it("clamps t outside [0, 1]", () => {
    const bezier = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
    expect(evaluateCubicBezier(bezier, -1)).toBe(0);
    expect(evaluateCubicBezier(bezier, 2)).toBe(1);
  });

  it("returns 0 and 1 at the endpoints", () => {
    const bezier = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
    expect(evaluateCubicBezier(bezier, 0)).toBeCloseTo(0, 5);
    expect(evaluateCubicBezier(bezier, 1)).toBeCloseTo(1, 5);
  });

  it("linear bezier is the identity function", () => {
    const linear = { x1: 0, y1: 0, x2: 1, y2: 1 };
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(evaluateCubicBezier(linear, t)).toBeCloseTo(t, 4);
    }
  });

  it("ease-in starts slow (below linear) in the first half", () => {
    const easeIn = { x1: 0.42, y1: 0, x2: 1, y2: 1 };
    expect(evaluateCubicBezier(easeIn, 0.25)).toBeLessThan(0.25);
  });
});

describe("evaluateEasing", () => {
  it("uses the preset when no custom bezier is given", () => {
    expect(evaluateEasing({ preset: "Linear" }, 0.5)).toBeCloseTo(0.5, 4);
  });

  it("prefers custom_bezier over the preset", () => {
    const steep = { x1: 0, y1: 1, x2: 1, y2: 1 }; // jumps to ~1 immediately
    const viaCustom = evaluateEasing({ preset: "Linear", custom_bezier: steep }, 0.1);
    const viaPreset = evaluateEasing({ preset: "Linear" }, 0.1);
    expect(viaCustom).not.toBeCloseTo(viaPreset, 2);
  });
});

describe("evaluateTrack", () => {
  it("returns NaN for an empty track", () => {
    expect(evaluateTrack(track("x", []), 5)).toBeNaN();
  });

  it("returns the single value for a track with one keyframe, at any time", () => {
    const t = track("x", [createLinearKeyframe(10, 42)]);
    expect(evaluateTrack(t, 0)).toBe(42);
    expect(evaluateTrack(t, 10)).toBe(42);
    expect(evaluateTrack(t, 1000)).toBe(42);
  });

  it("clamps to the first keyframe's value before it", () => {
    const t = track("x", [createLinearKeyframe(10, 0), createLinearKeyframe(20, 100)]);
    expect(evaluateTrack(t, 0)).toBe(0);
    expect(evaluateTrack(t, 10)).toBe(0);
  });

  it("clamps to the last keyframe's value after it", () => {
    const t = track("x", [createLinearKeyframe(10, 0), createLinearKeyframe(20, 100)]);
    expect(evaluateTrack(t, 20)).toBe(100);
    expect(evaluateTrack(t, 1000)).toBe(100);
  });

  it("interpolates linearly between two keyframes", () => {
    const t = track("x", [createLinearKeyframe(0, 0), createLinearKeyframe(10, 100)]);
    expect(evaluateTrack(t, 5)).toBeCloseTo(50, 4);
    expect(evaluateTrack(t, 2.5)).toBeCloseTo(25, 4);
  });

  it("holds the left value for Step interpolation", () => {
    const t = track("x", [createStepKeyframe(0, 1), createStepKeyframe(10, 2)]);
    expect(evaluateTrack(t, 0)).toBe(1);
    expect(evaluateTrack(t, 5)).toBe(1);
    expect(evaluateTrack(t, 9.999)).toBe(1);
    expect(evaluateTrack(t, 10)).toBe(2);
  });

  it("applies bezier easing between keyframes", () => {
    const t = track("x", [
      createBezierKeyframe(0, 0, { preset: "EaseIn" }),
      createLinearKeyframe(10, 100),
    ]);
    // EaseIn starts slow, so progress at t=2.5 (25% through) should be well below 25
    expect(evaluateTrack(t, 2.5)).toBeLessThan(25);
    // ...but still ends exactly at the second keyframe's value
    expect(evaluateTrack(t, 10)).toBe(100);
  });

  it("finds the correct segment among many keyframes via binary search", () => {
    const t = track(
      "x",
      Array.from({ length: 20 }, (_, i) => createLinearKeyframe(i * 10, i)),
    );
    expect(evaluateTrack(t, 55)).toBeCloseTo(5.5, 4);
    expect(evaluateTrack(t, 125)).toBeCloseTo(12.5, 4);
    expect(evaluateTrack(t, 0)).toBe(0);
    expect(evaluateTrack(t, 190)).toBe(19);
  });
});

describe("KeyframeEvaluator", () => {
  it("returns NaN for a property with no track", () => {
    const evaluator = new KeyframeEvaluator(tracks());
    expect(evaluator.evaluate("x", 5)).toBeNaN();
    expect(evaluator.hasProperty("x")).toBe(false);
  });

  it("evaluates a simple linear property", () => {
    const evaluator = new KeyframeEvaluator(
      tracks(track("x", [createLinearKeyframe(0, 0), createLinearKeyframe(10, 100)])),
    );
    expect(evaluator.evaluate("x", 5)).toBeCloseTo(50, 4);
    expect(evaluator.hasProperty("x")).toBe(true);
  });

  it("gives identical results for sequential playback and random seeks (cache correctness)", () => {
    const data = tracks(
      track("x", [
        createLinearKeyframe(0, 0),
        createLinearKeyframe(10, 100),
        createLinearKeyframe(20, 0),
        createLinearKeyframe(30, 50),
        createLinearKeyframe(45, 200),
      ]),
    );

    // Reference: fresh evaluator per sample, no cache reuse at all.
    const times = [0, 3, 7, 10, 12, 19, 20, 25, 30, 33, 40, 45];
    const reference = times.map((t) => new KeyframeEvaluator(data).evaluate("x", t));

    // Sequential playback: cache warms up incrementally in increasing time order.
    const sequential = new KeyframeEvaluator(data);
    const sequentialResults = [...times]
      .sort((a, b) => a - b)
      .map((t) => sequential.evaluate("x", t));
    const sortedReference = [...times]
      .sort((a, b) => a - b)
      .map((t) => new KeyframeEvaluator(data).evaluate("x", t));
    sequentialResults.forEach((v, i) => expect(v).toBeCloseTo(sortedReference[i], 6));

    // Non-sequential seeks: same evaluator, times visited out of order (scrubbing).
    // This must produce the same result as never having cached anything, since the
    // forward-scan is bounded and falls back to binary search beyond that.
    const scrubOrder = [30, 3, 45, 0, 19, 12, 7, 40, 20, 33, 10, 25];
    const scrubbing = new KeyframeEvaluator(data);
    for (const t of scrubOrder) {
      const expected = reference[times.indexOf(t)];
      expect(scrubbing.evaluate("x", t)).toBeCloseTo(expected, 6);
    }
  });

  it("clearCache does not change subsequent evaluation results", () => {
    const data = tracks(
      track("x", [
        createLinearKeyframe(0, 0),
        createLinearKeyframe(10, 100),
        createLinearKeyframe(20, 0),
      ]),
    );
    const evaluator = new KeyframeEvaluator(data);
    evaluator.evaluate("x", 5);
    evaluator.evaluate("x", 15);
    evaluator.clearCache();
    expect(evaluator.evaluate("x", 5)).toBeCloseTo(50, 4);
    expect(evaluator.evaluate("x", 15)).toBeCloseTo(50, 4);
  });

  it("lists animated properties", () => {
    const evaluator = new KeyframeEvaluator(
      tracks(
        track("x", [createLinearKeyframe(0, 0)]),
        track("opacity", [createLinearKeyframe(0, 1)]),
      ),
    );
    expect(evaluator.properties().sort()).toEqual(["opacity", "x"]);
  });

  describe("evaluateTransform", () => {
    it("only includes keyframed transform properties, mapped to snake_case", () => {
      const evaluator = new KeyframeEvaluator(
        tracks(
          track("x", [createLinearKeyframe(0, 5)]),
          track("scaleX", [createLinearKeyframe(0, 2)]),
        ),
      );
      const result = evaluator.evaluateTransform(0);
      expect(result).toEqual({ x: 5, scale_x: 2 });
      expect(result.y).toBeUndefined();
      expect(result.rotation).toBeUndefined();
    });

    it("returns an empty object when nothing is keyframed", () => {
      const evaluator = new KeyframeEvaluator(tracks());
      expect(evaluator.evaluateTransform(0)).toEqual({});
    });
  });

  describe("evaluateEffects", () => {
    it("only includes keyframed effect properties, mapped to snake_case", () => {
      const evaluator = new KeyframeEvaluator(
        tracks(
          track("opacity", [createLinearKeyframe(0, 0.5)]),
          track("hueRotate", [createLinearKeyframe(0, 90)]),
        ),
      );
      const result = evaluator.evaluateEffects(0);
      expect(result).toEqual({ opacity: 0.5, hue_rotate: 90 });
    });
  });

  describe("evaluateAll", () => {
    it("returns a map of every animated property at the given time", () => {
      const evaluator = new KeyframeEvaluator(
        tracks(
          track("x", [createLinearKeyframe(0, 0), createLinearKeyframe(10, 100)]),
          track("opacity", [createLinearKeyframe(0, 1)]),
        ),
      );
      const result = evaluator.evaluateAll(5);
      expect(result.get("x")).toBeCloseTo(50, 4);
      expect(result.get("opacity")).toBe(1);
      expect(result.size).toBe(2);
    });
  });
});

describe("keyframe factory helpers", () => {
  it("createLinearKeyframe produces Linear interpolation", () => {
    const kf = createLinearKeyframe(5, 10);
    expect(kf).toMatchObject({ time: 5, value: 10, interpolation: "Linear" });
  });

  it("createStepKeyframe produces Step interpolation", () => {
    const kf = createStepKeyframe(5, 10);
    expect(kf.interpolation).toBe("Step");
  });

  it("createBezierKeyframe carries the given easing through unchanged", () => {
    const easing = { preset: "EaseOut" as const };
    const kf = createBezierKeyframe(5, 10, easing);
    expect(kf.interpolation).toBe("Bezier");
    expect(kf.easing).toBe(easing);
  });

  it("createEasedKeyframe wraps a preset in Bezier interpolation", () => {
    const kf = createEasedKeyframe(5, 10, "EaseInOut");
    expect(kf.interpolation).toBe("Bezier");
    expect(kf.easing).toEqual({ preset: "EaseInOut" });
  });

  it("createCustomBezierKeyframe sets preset Custom with the given control points", () => {
    const kf = createCustomBezierKeyframe(5, 10, 0.1, 0.2, 0.3, 0.4);
    expect(kf.easing).toEqual({
      preset: "Custom",
      custom_bezier: { x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 },
    });
  });
});
