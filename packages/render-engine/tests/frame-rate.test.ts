import { describe, it, expect } from "vitest";

import {
  framesToSeconds,
  secondsToFrames,
  frameRateToFloat,
  FRAME_RATE_PRESETS,
  type FrameRate,
} from "../src/types";

describe("FrameRate", () => {
  describe("FRAME_RATE_PRESETS", () => {
    it("has correct rational representations", () => {
      expect(FRAME_RATE_PRESETS["24"]).toEqual({ numerator: 24, denominator: 1 });
      expect(FRAME_RATE_PRESETS["30"]).toEqual({ numerator: 30, denominator: 1 });
      expect(FRAME_RATE_PRESETS["29.97"]).toEqual({ numerator: 30000, denominator: 1001 });
      expect(FRAME_RATE_PRESETS["23.976"]).toEqual({ numerator: 24000, denominator: 1001 });
      expect(FRAME_RATE_PRESETS["59.94"]).toEqual({ numerator: 60000, denominator: 1001 });
    });
  });

  describe("frameRateToFloat", () => {
    it("converts integer rates exactly", () => {
      expect(frameRateToFloat(FRAME_RATE_PRESETS["24"])).toBe(24);
      expect(frameRateToFloat(FRAME_RATE_PRESETS["30"])).toBe(30);
      expect(frameRateToFloat(FRAME_RATE_PRESETS["60"])).toBe(60);
    });

    it("converts drop-frame rates approximately", () => {
      expect(frameRateToFloat(FRAME_RATE_PRESETS["29.97"])).toBeCloseTo(29.97, 2);
      expect(frameRateToFloat(FRAME_RATE_PRESETS["23.976"])).toBeCloseTo(23.976, 2);
      expect(frameRateToFloat(FRAME_RATE_PRESETS["59.94"])).toBeCloseTo(59.94, 2);
    });
  });

  describe("framesToSeconds", () => {
    it("converts frame 0 to 0 seconds", () => {
      expect(framesToSeconds(0, FRAME_RATE_PRESETS["30"])).toBe(0);
      expect(framesToSeconds(0, FRAME_RATE_PRESETS["29.97"])).toBe(0);
    });

    it("converts integer frame rates exactly", () => {
      const fps30: FrameRate = FRAME_RATE_PRESETS["30"];
      expect(framesToSeconds(30, fps30)).toBe(1);
      expect(framesToSeconds(1, fps30)).toBeCloseTo(1 / 30, 10);
      expect(framesToSeconds(150, fps30)).toBe(5);

      const fps24: FrameRate = FRAME_RATE_PRESETS["24"];
      expect(framesToSeconds(24, fps24)).toBe(1);
      expect(framesToSeconds(48, fps24)).toBe(2);

      const fps60: FrameRate = FRAME_RATE_PRESETS["60"];
      expect(framesToSeconds(60, fps60)).toBe(1);
      expect(framesToSeconds(600, fps60)).toBe(10);
    });

    it("converts 29.97fps correctly", () => {
      const fps = FRAME_RATE_PRESETS["29.97"];
      // 30000 frames at 30000/1001 fps = 1001 seconds
      expect(framesToSeconds(30000, fps)).toBe(1001);
      // 1 frame at 29.97fps
      expect(framesToSeconds(1, fps)).toBeCloseTo(1001 / 30000, 10);
    });

    it("converts 23.976fps correctly", () => {
      const fps = FRAME_RATE_PRESETS["23.976"];
      // 24000 frames at 24000/1001 fps = 1001 seconds
      expect(framesToSeconds(24000, fps)).toBe(1001);
    });

    it("handles large frame counts", () => {
      const fps = FRAME_RATE_PRESETS["30"];
      // 1 hour = 108000 frames at 30fps
      expect(framesToSeconds(108000, fps)).toBe(3600);
    });
  });

  describe("secondsToFrames", () => {
    it("converts 0 seconds to frame 0", () => {
      expect(secondsToFrames(0, FRAME_RATE_PRESETS["30"])).toBe(0);
      expect(secondsToFrames(0, FRAME_RATE_PRESETS["29.97"])).toBe(0);
    });

    it("converts integer frame rates exactly", () => {
      const fps30 = FRAME_RATE_PRESETS["30"];
      expect(secondsToFrames(1, fps30)).toBe(30);
      expect(secondsToFrames(5, fps30)).toBe(150);
      expect(secondsToFrames(0.1, fps30)).toBe(3);

      const fps60 = FRAME_RATE_PRESETS["60"];
      expect(secondsToFrames(1, fps60)).toBe(60);
      expect(secondsToFrames(10, fps60)).toBe(600);
    });

    it("rounds to nearest frame", () => {
      const fps30 = FRAME_RATE_PRESETS["30"];
      // 0.5 / 30 = 0.0167 seconds is between frames 0 and 1
      // 0.02 seconds * 30 = 0.6 → rounds to 1
      expect(secondsToFrames(0.02, fps30)).toBe(1);
      // 0.01 seconds * 30 = 0.3 → rounds to 0
      expect(secondsToFrames(0.01, fps30)).toBe(0);
    });

    it("converts 29.97fps correctly", () => {
      const fps = FRAME_RATE_PRESETS["29.97"];
      expect(secondsToFrames(1, fps)).toBe(30); // 1 * 30000/1001 = 29.97 → rounds to 30
      expect(secondsToFrames(1001, fps)).toBe(30000); // exact
    });

    it("handles large durations", () => {
      const fps = FRAME_RATE_PRESETS["30"];
      expect(secondsToFrames(3600, fps)).toBe(108000); // 1 hour
    });
  });

  describe("round-trip accuracy", () => {
    const allPresets = Object.values(FRAME_RATE_PRESETS);

    it("frames → seconds → frames is identity for all presets", () => {
      for (const fps of allPresets) {
        for (const frame of [0, 1, 10, 100, 1000, 30000, 108000]) {
          const seconds = framesToSeconds(frame, fps);
          const roundTrip = secondsToFrames(seconds, fps);
          expect(roundTrip).toBe(frame);
        }
      }
    });

    it("seconds → frames → seconds is accurate within half-frame for all presets", () => {
      for (const fps of allPresets) {
        const halfFrame = framesToSeconds(1, fps) / 2;
        for (const seconds of [0, 0.5, 1, 5, 10, 60, 300, 3600]) {
          const frames = secondsToFrames(seconds, fps);
          const roundTrip = framesToSeconds(frames, fps);
          // Allow a tiny epsilon for floating-point math on top of the half-frame tolerance
          expect(Math.abs(roundTrip - seconds)).toBeLessThanOrEqual(halfFrame + 1e-10);
        }
      }
    });
  });
});
