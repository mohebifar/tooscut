/**
 * Comprehensive compositor tests.
 *
 * These tests render various layer configurations and verify the output.
 * They require a browser environment with WebGPU support.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { SnapshotTester, createSolidImageData } from "../src/testing/snapshot-tester.js";
import {
  visualTestCases,
  generateSolidTexture,
  generateGradientTexture,
  generateCheckerboardTexture,
  generateSceneTexture,
  generateTextTexture,
  generateShapeTexture,
  generateRadialGradientTexture,
  createLayer,
  createFrame,
} from "../src/testing/test-renderer.js";

describe("compositor", () => {
  let tester: SnapshotTester;

  beforeAll(async () => {
    tester = await SnapshotTester.create(256, 256);
  });

  afterAll(() => {
    tester.dispose();
  });

  beforeEach(() => {
    tester.clearAllTextures();
  });

  // ============================================================================
  // Basic Rendering
  // ============================================================================

  describe("basic rendering", () => {
    it("renders a solid red layer filling the canvas", async () => {
      tester.addSolidTexture("red", 256, 256, [255, 0, 0, 255]);
      const frame = createFrame(256, 256, [createLayer("red")]);

      const expected = createSolidImageData(256, 256, [255, 0, 0, 255]);
      const result = await tester.renderAndCompare(frame, expected);

      expect(result.passed).toBe(true);
      expect(result.diffPercentage).toBe(0);
    });

    it("renders a solid green layer", async () => {
      tester.addSolidTexture("green", 256, 256, [0, 255, 0, 255]);
      const frame = createFrame(256, 256, [createLayer("green")]);

      const expected = createSolidImageData(256, 256, [0, 255, 0, 255]);
      const result = await tester.renderAndCompare(frame, expected);

      expect(result.passed).toBe(true);
    });

    it("renders a solid blue layer", async () => {
      tester.addSolidTexture("blue", 256, 256, [0, 0, 255, 255]);
      const frame = createFrame(256, 256, [createLayer("blue")]);

      const expected = createSolidImageData(256, 256, [0, 0, 255, 255]);
      const result = await tester.renderAndCompare(frame, expected);

      expect(result.passed).toBe(true);
    });

    it("renders a horizontal gradient", async () => {
      const gradientData = generateGradientTexture(
        256,
        256,
        [255, 0, 0, 255],
        [0, 0, 255, 255],
        "horizontal",
      );
      tester.addRawTexture("gradient", 256, 256, gradientData);
      const frame = createFrame(256, 256, [createLayer("gradient")]);

      const imageData = await tester.render(frame);

      // Check left edge is red
      expect(imageData.data[0]).toBeGreaterThan(200); // R
      expect(imageData.data[1]).toBeLessThan(50); // G
      expect(imageData.data[2]).toBeLessThan(50); // B

      // Check right edge is blue
      const rightPixel = 255 * 4; // Last column, first row
      expect(imageData.data[rightPixel]).toBeLessThan(50); // R
      expect(imageData.data[rightPixel + 1]).toBeLessThan(50); // G
      expect(imageData.data[rightPixel + 2]).toBeGreaterThan(200); // B
    });
  });

  // ============================================================================
  // Layer Ordering (Z-Index)
  // ============================================================================

  describe("layer ordering (z-index)", () => {
    it("renders layers in correct z-order with higher z-index on top", async () => {
      // Red at z=0, Green at z=1, Blue at z=2
      // All squares overlap at center, so center should be blue
      tester.addSolidTexture("red", 80, 80, [255, 0, 0, 255]);
      tester.addSolidTexture("green", 80, 80, [0, 255, 0, 255]);
      tester.addSolidTexture("blue", 80, 80, [0, 0, 255, 255]);

      const frame = createFrame(256, 256, [
        createLayer("red", { x: 60, y: 60, zIndex: 0 }),
        createLayer("green", { x: 90, y: 90, zIndex: 1 }),
        createLayer("blue", { x: 120, y: 120, zIndex: 2 }),
      ]);

      const imageData = await tester.render(frame);

      // Center of overlap (around 128, 128) should be blue
      const centerPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[centerPixel]).toBeLessThan(50); // R
      expect(imageData.data[centerPixel + 1]).toBeLessThan(50); // G
      expect(imageData.data[centerPixel + 2]).toBeGreaterThan(200); // B
    });

    it("correctly sorts layers regardless of input order", async () => {
      tester.addSolidTexture("red", 80, 80, [255, 0, 0, 255]);
      tester.addSolidTexture("green", 80, 80, [0, 255, 0, 255]);
      tester.addSolidTexture("blue", 80, 80, [0, 0, 255, 255]);

      // Provide layers in reverse z-order
      const frame = createFrame(256, 256, [
        createLayer("blue", { x: 120, y: 120, zIndex: 2 }),
        createLayer("green", { x: 90, y: 90, zIndex: 1 }),
        createLayer("red", { x: 60, y: 60, zIndex: 0 }),
      ]);

      const imageData = await tester.render(frame);

      // Center should still be blue (highest z-index)
      const centerPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[centerPixel + 2]).toBeGreaterThan(200); // B
    });

    it("renders same z-index layers in input order", async () => {
      tester.addSolidTexture("red", 100, 100, [255, 0, 0, 255]);
      tester.addSolidTexture("blue", 100, 100, [0, 0, 255, 255]);

      // Both at z=0, blue comes after red, so blue should be on top
      const frame = createFrame(256, 256, [
        createLayer("red", { x: 78, y: 78, zIndex: 0 }),
        createLayer("blue", { x: 78, y: 78, zIndex: 0 }),
      ]);

      const imageData = await tester.render(frame);

      // Center should be blue (rendered last)
      const centerPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[centerPixel]).toBeLessThan(50); // R
      expect(imageData.data[centerPixel + 2]).toBeGreaterThan(200); // B
    });
  });

  // ============================================================================
  // Transform Tests
  // ============================================================================

  describe("transforms", () => {
    it("positions a layer at specified coordinates", async () => {
      tester.addSolidTexture("yellow", 50, 50, [255, 255, 0, 255]);
      const frame = createFrame(256, 256, [createLayer("yellow", { x: 100, y: 100 })]);

      const imageData = await tester.render(frame);

      // Check that pixel at (125, 125) is yellow (center of positioned square)
      const pixel = (125 * 256 + 125) * 4;
      expect(imageData.data[pixel]).toBeGreaterThan(200); // R
      expect(imageData.data[pixel + 1]).toBeGreaterThan(200); // G
      expect(imageData.data[pixel + 2]).toBeLessThan(50); // B

      // Check that pixel at (50, 50) is not yellow (outside the square)
      const outsidePixel = (50 * 256 + 50) * 4;
      // Should be transparent/black
      expect(imageData.data[outsidePixel + 3]).toBeLessThan(50); // A or all zeros
    });

    it("scales a layer uniformly", async () => {
      tester.addSolidTexture("cyan", 50, 50, [0, 255, 255, 255]);
      const frame = createFrame(256, 256, [
        createLayer("cyan", { x: 78, y: 78, scaleX: 2, scaleY: 2 }),
      ]);

      const imageData = await tester.render(frame);

      // With 2x scale, the 50x50 texture becomes 100x100
      // Centered at (78+25, 78+25) = (103, 103) before scale adjustment
      // After scale, should cover a larger area
      const centerPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[centerPixel]).toBeLessThan(50); // R
      expect(imageData.data[centerPixel + 1]).toBeGreaterThan(200); // G
      expect(imageData.data[centerPixel + 2]).toBeGreaterThan(200); // B
    });

    it("scales a layer non-uniformly", async () => {
      tester.addSolidTexture("magenta", 50, 50, [255, 0, 255, 255]);
      const frame = createFrame(256, 256, [
        createLayer("magenta", { x: 78, y: 103, scaleX: 2, scaleY: 1 }),
      ]);

      const imageData = await tester.render(frame);

      // Should be wider than tall
      // Check horizontal extent
      const leftPixel = (128 * 256 + 50) * 4; // Should be inside

      expect(imageData.data[leftPixel + 3]).toBeGreaterThan(0); // Should have content
    });

    it("rotates a layer", async () => {
      tester.addSolidTexture("purple", 80, 20, [128, 0, 128, 255]);
      const frame = createFrame(256, 256, [createLayer("purple", { x: 88, y: 118, rotation: 45 })]);

      const imageData = await tester.render(frame);

      // A rotated rectangle should have content in diagonal corners
      // This is a basic sanity check
      expect(imageData.data.some((v, i) => i % 4 === 0 && v > 100)).toBe(true);
    });
  });

  // ============================================================================
  // Effects Tests
  // ============================================================================

  describe("effects", () => {
    it("applies opacity effect", async () => {
      tester.addSolidTexture("bg", 256, 256, [255, 255, 255, 255]);
      tester.addSolidTexture("overlay", 100, 100, [255, 0, 0, 255]);

      const frame = createFrame(256, 256, [
        createLayer("bg", { zIndex: 0 }),
        createLayer("overlay", { x: 78, y: 78, opacity: 0.5, zIndex: 1 }),
      ]);

      const imageData = await tester.render(frame);

      // Center should be pink (red at 50% over white)
      const centerPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[centerPixel]).toBeGreaterThan(200); // R (still high)
      expect(imageData.data[centerPixel + 1]).toBeGreaterThan(100); // G (mixed with white)
      expect(imageData.data[centerPixel + 2]).toBeGreaterThan(100); // B (mixed with white)
    });

    it("applies brightness effect", async () => {
      const sceneData = generateSceneTexture(256, 256);
      tester.addRawTexture("scene", 256, 256, sceneData);

      // Original scene
      const frameNormal = createFrame(256, 256, [createLayer("scene")]);
      const normalData = await tester.render(frameNormal);

      // Brightened scene
      const frameBright = createFrame(256, 256, [createLayer("scene", { brightness: 1.5 })]);
      const brightData = await tester.render(frameBright);

      // Brightened image should have higher average luminance
      let normalSum = 0;
      let brightSum = 0;
      for (let i = 0; i < normalData.data.length; i += 4) {
        normalSum += normalData.data[i] + normalData.data[i + 1] + normalData.data[i + 2];
        brightSum += brightData.data[i] + brightData.data[i + 1] + brightData.data[i + 2];
      }
      expect(brightSum).toBeGreaterThan(normalSum);
    });

    it("applies saturation effect (grayscale)", async () => {
      // Create a colorful texture
      const colorData = generateGradientTexture(
        256,
        256,
        [255, 0, 0, 255],
        [0, 255, 0, 255],
        "horizontal",
      );
      tester.addRawTexture("color", 256, 256, colorData);

      const frame = createFrame(256, 256, [createLayer("color", { saturation: 0 })]);

      const imageData = await tester.render(frame);

      // Check that R, G, B are approximately equal (grayscale)
      // Sample a few pixels
      for (let y = 50; y < 200; y += 50) {
        for (let x = 50; x < 200; x += 50) {
          const i = (y * 256 + x) * 4;
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];

          // In grayscale, R, G, B should be close to each other
          expect(Math.abs(r - g)).toBeLessThan(30);
          expect(Math.abs(g - b)).toBeLessThan(30);
          expect(Math.abs(r - b)).toBeLessThan(30);
        }
      }
    });

    it("applies blur effect", async () => {
      const checkerData = generateCheckerboardTexture(256, 256, 8);
      tester.addRawTexture("checker", 256, 256, checkerData);

      // Sharp checkerboard
      const frameSharp = createFrame(256, 256, [createLayer("checker")]);
      const sharpData = await tester.render(frameSharp);

      // Blurred checkerboard
      const frameBlurred = createFrame(256, 256, [createLayer("checker", { blur: 10 })]);
      const blurredData = await tester.render(frameBlurred);

      // Calculate variance - blurred image should have lower variance
      function calculateVariance(data: Uint8ClampedArray): number {
        let sum = 0;
        let sumSq = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
          sum += lum;
          sumSq += lum * lum;
        }
        const mean = sum / n;
        return sumSq / n - mean * mean;
      }

      const sharpVariance = calculateVariance(sharpData.data);
      const blurredVariance = calculateVariance(blurredData.data);

      expect(blurredVariance).toBeLessThan(sharpVariance);
    });
  });

  // ============================================================================
  // Image + Text Overlay Tests
  // ============================================================================

  describe("text over image", () => {
    it("renders text layer on top of image", async () => {
      const sceneData = generateSceneTexture(256, 256);
      const textData = generateTextTexture(200, 80, [255, 255, 255, 255], [0, 0, 0, 0]);

      tester.addRawTexture("scene", 256, 256, sceneData);
      tester.addRawTexture("text", 200, 80, textData);

      const frame = createFrame(256, 256, [
        createLayer("scene", { zIndex: 0 }),
        createLayer("text", { x: 28, y: 168, zIndex: 1 }),
      ]);

      const imageData = await tester.render(frame);

      // The text area should have white pixels (from the text)
      // Sample a pixel where text bars should be
      const textY = 180;
      const textX = 50;
      const pixel = (textY * 256 + textX) * 4;

      // Either has white text or the scene shows through
      expect(imageData.data[pixel + 3]).toBeGreaterThan(0);
    });

    it("renders semi-transparent text background over image", async () => {
      const sceneData = generateSceneTexture(256, 256);

      tester.addRawTexture("scene", 256, 256, sceneData);
      tester.addSolidTexture("textBg", 220, 60, [0, 0, 0, 180]); // Semi-transparent black

      const frame = createFrame(256, 256, [
        createLayer("scene", { zIndex: 0 }),
        createLayer("textBg", { x: 18, y: 178, zIndex: 1 }),
      ]);

      const imageData = await tester.render(frame);

      // The text background area should be darker than the scene
      // but not completely black (semi-transparent)
      const bgY = 200;
      const bgX = 128;
      const pixel = (bgY * 256 + bgX) * 4;

      // Should be dark but not pure black
      const luminance =
        (imageData.data[pixel] + imageData.data[pixel + 1] + imageData.data[pixel + 2]) / 3;
      expect(luminance).toBeLessThan(150); // Darkened
      expect(luminance).toBeGreaterThan(0); // But not pure black
    });
  });

  // ============================================================================
  // Shape Tests
  // ============================================================================

  describe("shapes", () => {
    it("renders a circle shape", async () => {
      const circleData = generateShapeTexture(100, 100, "circle", [255, 165, 0, 255]);
      tester.addSolidTexture("bg", 256, 256, [255, 255, 255, 255]);
      tester.addRawTexture("circle", 100, 100, circleData);

      const frame = createFrame(256, 256, [
        createLayer("bg", { zIndex: 0 }),
        createLayer("circle", { x: 78, y: 78, zIndex: 1 }),
      ]);

      const imageData = await tester.render(frame);

      // Center of circle should be orange
      const centerPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[centerPixel]).toBeGreaterThan(200); // R
      expect(imageData.data[centerPixel + 1]).toBeGreaterThan(100); // G (orange)
      expect(imageData.data[centerPixel + 2]).toBeLessThan(50); // B
    });

    it("renders multiple shapes with correct ordering", async () => {
      tester.addSolidTexture("bg", 256, 256, [40, 40, 40, 255]);

      const circleData = generateShapeTexture(60, 60, "circle", [255, 100, 100, 255]);
      const rectData = generateShapeTexture(60, 60, "rectangle", [100, 255, 100, 255]);

      tester.addRawTexture("circle", 60, 60, circleData);
      tester.addRawTexture("rect", 60, 60, rectData);

      const frame = createFrame(256, 256, [
        createLayer("bg", { zIndex: 0 }),
        createLayer("circle", { x: 70, y: 98, zIndex: 1 }),
        createLayer("rect", { x: 126, y: 98, zIndex: 1 }),
      ]);

      const imageData = await tester.render(frame);

      // Check circle center (around 100, 128) is reddish
      const circlePixel = (128 * 256 + 100) * 4;
      expect(imageData.data[circlePixel]).toBeGreaterThan(150); // R

      // Check rect center (around 156, 128) is greenish
      const rectPixel = (128 * 256 + 156) * 4;
      expect(imageData.data[rectPixel + 1]).toBeGreaterThan(150); // G
    });
  });

  // ============================================================================
  // Track-based Layer Ordering
  // ============================================================================

  describe("track-based ordering", () => {
    it("renders layers in track order (higher track = higher z-index)", async () => {
      // Simulating: Track 1 (bg), Track 2 (main video), Track 3 (overlay)
      const bgData = generateCheckerboardTexture(
        256,
        256,
        32,
        [100, 100, 100, 255],
        [80, 80, 80, 255],
      );
      const videoData = generateSceneTexture(200, 150);
      const overlayData = generateSolidTexture(180, 40, 255, 255, 0, 200);

      tester.addRawTexture("track1-bg", 256, 256, bgData);
      tester.addRawTexture("track2-video", 200, 150, videoData);
      tester.addRawTexture("track3-overlay", 180, 40, overlayData);

      const frame = createFrame(256, 256, [
        createLayer("track1-bg", { zIndex: 0 }),
        createLayer("track2-video", { x: 28, y: 53, zIndex: 1 }),
        createLayer("track3-overlay", { x: 38, y: 10, zIndex: 2 }),
      ]);

      const imageData = await tester.render(frame);

      // Overlay area (top center) should be yellow-ish
      const overlayPixel = (30 * 256 + 128) * 4;
      expect(imageData.data[overlayPixel]).toBeGreaterThan(200); // R
      expect(imageData.data[overlayPixel + 1]).toBeGreaterThan(200); // G
      expect(imageData.data[overlayPixel + 2]).toBeLessThan(100); // B (yellow)

      // Video area (middle) should show scene content
      const videoPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[videoPixel + 3]).toBe(255); // Full opacity
    });

    it("handles overlapping clips from different tracks", async () => {
      // Track 2 video partially covered by Track 3 overlay
      tester.addSolidTexture("video", 150, 150, [0, 100, 200, 255]); // Blue video
      tester.addSolidTexture("overlay", 100, 100, [255, 0, 0, 200]); // Semi-transparent red overlay

      const frame = createFrame(256, 256, [
        createLayer("video", { x: 53, y: 53, zIndex: 1 }), // Track 2
        createLayer("overlay", { x: 78, y: 78, zIndex: 2 }), // Track 3
      ]);

      const imageData = await tester.render(frame);

      // Overlap area should be reddish (red overlay over blue video)
      const overlapPixel = (128 * 256 + 128) * 4;
      expect(imageData.data[overlapPixel]).toBeGreaterThan(150); // R from overlay

      // Non-overlap video area should be blue
      const videoOnlyPixel = (60 * 256 + 60) * 4;
      expect(imageData.data[videoOnlyPixel + 2]).toBeGreaterThan(150); // B
    });
  });

  // ============================================================================
  // Complex Composition Tests
  // ============================================================================

  describe("complex compositions", () => {
    it("renders picture-in-picture composition", async () => {
      const mainVideo = generateSceneTexture(256, 256);
      const pipVideo = generateGradientTexture(
        80,
        60,
        [100, 0, 200, 255],
        [200, 100, 0, 255],
        "diagonal",
      );

      tester.addRawTexture("main", 256, 256, mainVideo);
      tester.addSolidTexture("pipBorder", 84, 64, [255, 255, 255, 255]);
      tester.addRawTexture("pip", 80, 60, pipVideo);

      const frame = createFrame(256, 256, [
        createLayer("main", { zIndex: 0 }),
        createLayer("pipBorder", { x: 164, y: 8, zIndex: 1 }),
        createLayer("pip", { x: 166, y: 10, zIndex: 2 }),
      ]);

      const imageData = await tester.render(frame);

      // PIP area should show the gradient
      const pipPixel = (40 * 256 + 200) * 4;
      expect(imageData.data[pipPixel + 3]).toBe(255); // Full opacity

      // Main video area should show scene
      const mainPixel = (128 * 256 + 50) * 4;
      expect(imageData.data[mainPixel + 3]).toBe(255);
    });

    it("renders multiple effects on different layers", async () => {
      const bgData = generateGradientTexture(
        256,
        256,
        [30, 30, 60, 255],
        [60, 30, 30, 255],
        "vertical",
      );
      const circle1 = generateRadialGradientTexture(
        80,
        80,
        [255, 200, 100, 255],
        [255, 100, 50, 0],
      );
      const circle2 = generateRadialGradientTexture(
        80,
        80,
        [100, 200, 255, 255],
        [50, 100, 255, 0],
      );

      tester.addRawTexture("bg", 256, 256, bgData);
      tester.addRawTexture("circle1", 80, 80, circle1);
      tester.addRawTexture("circle2", 80, 80, circle2);

      const frame = createFrame(256, 256, [
        createLayer("bg", { zIndex: 0 }),
        createLayer("circle1", { x: 48, y: 88, opacity: 0.8, zIndex: 1 }),
        createLayer("circle2", { x: 128, y: 88, opacity: 0.8, zIndex: 2 }),
      ]);

      const imageData = await tester.render(frame);

      // Should have rendered something
      expect(imageData.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    });
  });

  // ============================================================================
  // Run All Visual Test Cases
  // ============================================================================

  describe("visual test cases", () => {
    for (const testCase of visualTestCases) {
      it(`renders ${testCase.name}: ${testCase.description}`, async () => {
        tester.resize(testCase.width, testCase.height);
        tester.clearAllTextures();

        // Upload all textures
        for (const tex of testCase.textures) {
          tester.addRawTexture(tex.id, tex.width, tex.height, tex.data);
        }

        // Create and render frame
        const frame = createFrame(testCase.width, testCase.height, testCase.layers);
        const imageData = await tester.render(frame);

        // Basic validation: image should have non-zero content
        expect(imageData.width).toBe(testCase.width);
        expect(imageData.height).toBe(testCase.height);

        // At least some pixels should be non-transparent
        const hasContent = Array.from(imageData.data).some((v, i) => i % 4 === 3 && v > 0);
        expect(hasContent).toBe(true);

        // Store for visual inspection
        await expect(tester).toMatchRenderSnapshot(frame, testCase.name);
      });
    }
  });
});
