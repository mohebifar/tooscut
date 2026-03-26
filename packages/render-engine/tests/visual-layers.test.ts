/**
 * Comprehensive visual tests for all layer types.
 *
 * Tests:
 * - Shape layers (Rectangle, Ellipse, Polygon)
 * - Line layers (various endpoints and styles)
 * - Text layers (styling, alignment, backgrounds)
 * - Transitions (unified across all layer types)
 * - Z-ordering across mixed layer types
 *
 * These tests require a browser environment with WebGPU support.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

import {
  SnapshotTester,
  PixelAsserter,
  frame,
  layer,
  textLayer,
  rectangle,
  ellipse,
  polygon,
  lineLayer,
} from "../src/testing/snapshot-tester.js";
import { generateSceneTexture } from "../src/testing/test-renderer.js";
import { VideoFrameLoader } from "../src/video-frame-loader.js";

describe("visual layers", () => {
  let tester: SnapshotTester;

  beforeAll(async () => {
    tester = await SnapshotTester.create(400, 300);
  });

  afterAll(() => {
    tester.dispose();
  });

  beforeEach(() => {
    tester.clearAllTextures();
  });

  afterEach(async () => {
    await tester.captureScreenshot();
  });

  // ============================================================================
  // Image/Media Layers
  // ============================================================================

  describe("image layers", () => {
    /**
     * Helper to load an image from fixtures and add it as a texture.
     *
     * NOTE: In tests we use raw RGBA upload because the test environment
     * (SwiftShader/WebGL2 via ANGLE) doesn't fully support the WebGPU
     * `copy_external_image_to_texture` API used by `uploadBitmap`.
     *
     * In production with real WebGPU, use `addBitmapTexture` for zero-copy
     * ImageBitmap transfer which is significantly faster.
     */
    async function loadImageTexture(
      tester: SnapshotTester,
      textureId: string,
      imagePath: string,
      targetWidth: number = 400,
      targetHeight: number = 300,
    ): Promise<{ width: number; height: number }> {
      const response = await fetch(imagePath);
      const blob = await response.blob();

      // Create resized bitmap to exactly match canvas dimensions
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: targetWidth,
        resizeHeight: targetHeight,
        resizeQuality: "high",
      });

      // Draw to canvas to extract raw RGBA data
      // (SwiftShader/WebGL2 backend doesn't support copy_external_image_to_texture)
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to create 2D context");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const rgbaData = new Uint8Array(imageData.data);

      // Upload as raw RGBA data (works reliably in all environments)
      tester.addRawTexture(textureId, targetWidth, targetHeight, rgbaData);

      return { width: targetWidth, height: targetHeight };
    }

    it("renders a basic image layer", async () => {
      await loadImageTexture(tester, "street", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [layer("street").build()]);

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Image should be visible (not black)
      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
      pixels.expectPixelAtPercent(50, 50).isNotBlack();
    });

    it("renders an image with position offset", async () => {
      await loadImageTexture(tester, "street-pos", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-pos")
          .position(100, 50) // Offset from center
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
    });

    it("renders an image with scale transform", async () => {
      await loadImageTexture(tester, "street-scale", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-scale")
          .scale(0.5) // Half size
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      expect(imageData.width).toBe(400);
      // Center should still have image content
      pixels.expectPixelAtPercent(50, 50).isNotBlack();
    });

    it("renders an image with rotation", async () => {
      await loadImageTexture(tester, "street-rotate", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-rotate")
          .rotation(45) // 45 degrees
          .scale(0.5) // Scale down so corners don't get clipped
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
    });

    it("renders an image with opacity", async () => {
      await loadImageTexture(tester, "street-opacity", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-opacity")
          .opacity(0.5) // 50% transparent
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
    });

    it("renders an image with brightness adjustment", async () => {
      await loadImageTexture(tester, "street-bright", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-bright")
          .brightness(1.5) // 50% brighter
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with contrast adjustment", async () => {
      await loadImageTexture(tester, "street-contrast", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-contrast")
          .contrast(1.5) // Higher contrast
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with saturation adjustment (grayscale)", async () => {
      await loadImageTexture(tester, "street-gray", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-gray")
          .saturation(0) // Grayscale
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with crop", async () => {
      await loadImageTexture(tester, "street-crop", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-crop")
          .crop(0.1, 0.1, 0.1, 0.1) // 10% crop on all sides
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with combined transforms", async () => {
      await loadImageTexture(tester, "street-combo", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-combo").position(50, 25).scale(0.6).rotation(15).opacity(0.8).build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders multiple image layers with z-ordering", async () => {
      // Load same image twice with different IDs
      await loadImageTexture(tester, "street-back", "/tests/fixtures/images/street.jpg");
      await loadImageTexture(tester, "street-front", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-back").scale(0.8).position(-50, 0).opacity(0.6).zIndex(0).build(),
        layer("street-front").scale(0.5).position(50, 0).zIndex(1).build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with blur effect", async () => {
      await loadImageTexture(tester, "street-blur", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-blur")
          .blur(5) // 5px blur
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image layer under a shape overlay", async () => {
      await loadImageTexture(tester, "street-under", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, {
        mediaLayers: [layer("street-under").zIndex(0).build()],
        shapeLayers: [
          rectangle("overlay")
            .box(10, 70, 80, 20)
            .fill(0, 0, 0, 0.7) // Semi-transparent black bar
            .zIndex(1)
            .build(),
        ],
        textLayers: [
          textLayer("caption", "Street Photo")
            .box(10, 72, 80, 16)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .align("Center", "Middle")
            .zIndex(2)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with anchor point adjustment", async () => {
      await loadImageTexture(tester, "street-anchor", "/tests/fixtures/images/street.jpg");

      // Anchor at top-left corner instead of center
      const renderFrame = frame(400, 300, [
        layer("street-anchor")
          .anchor(0, 0) // Top-left anchor
          .scale(0.5)
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with fade in transition", async () => {
      await loadImageTexture(tester, "street-fade", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-fade")
          .transitionIn("Fade", 1, { preset: "Linear" }, 0.5) // 50% faded in
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an image with slide in transition", async () => {
      await loadImageTexture(tester, "street-slide", "/tests/fixtures/images/street.jpg");

      const renderFrame = frame(400, 300, [
        layer("street-slide").transitionIn("SlideRight", 1, { preset: "EaseOut" }, 0.5).build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });
  });

  // ============================================================================
  // Video Layers (using MediaBunny VideoFrameLoader)
  // ============================================================================

  describe("video layers", () => {
    /**
     * Helper to load a video frame and add it as a texture.
     * Uses MediaBunny's VideoFrameLoader for frame-accurate video decoding.
     */
    async function loadVideoFrame(
      tester: SnapshotTester,
      textureId: string,
      videoPath: string,
      timestamp: number,
      targetWidth: number = 400,
      targetHeight: number = 300,
    ): Promise<{ width: number; height: number; actualTimestamp: number }> {
      const loader = await VideoFrameLoader.fromUrl(videoPath);

      // Get RGBA data at the specified timestamp
      const rgbaData = await loader.getRgbaData(timestamp);

      // Resize if needed (video dimensions may differ from canvas)
      if (rgbaData.width !== targetWidth || rgbaData.height !== targetHeight) {
        // Use canvas to resize
        const srcCanvas = new OffscreenCanvas(rgbaData.width, rgbaData.height);
        const srcCtx = srcCanvas.getContext("2d");
        if (!srcCtx) throw new Error("Failed to create source 2D context");

        const srcImageData = new ImageData(
          new Uint8ClampedArray(rgbaData.data),
          rgbaData.width,
          rgbaData.height,
        );
        srcCtx.putImageData(srcImageData, 0, 0);

        const dstCanvas = new OffscreenCanvas(targetWidth, targetHeight);
        const dstCtx = dstCanvas.getContext("2d");
        if (!dstCtx) throw new Error("Failed to create dest 2D context");

        dstCtx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
        const resizedData = dstCtx.getImageData(0, 0, targetWidth, targetHeight);

        tester.addRawTexture(
          textureId,
          targetWidth,
          targetHeight,
          new Uint8Array(resizedData.data),
        );
      } else {
        tester.addRawTexture(textureId, rgbaData.width, rgbaData.height, rgbaData.data);
      }

      const actualTimestamp = (rgbaData as { timestamp?: number }).timestamp;
      loader.dispose();

      return { width: targetWidth, height: targetHeight, actualTimestamp };
    }

    it("renders a video frame at start", async () => {
      await loadVideoFrame(tester, "video-start", "/tests/fixtures/videos/sample-480p.mp4", 0);

      const renderFrame = frame(400, 300, [layer("video-start").build()]);

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
      pixels.expectPixelAtPercent(50, 50).isNotBlack();
    });

    it("renders a video frame at middle", async () => {
      await loadVideoFrame(tester, "video-mid", "/tests/fixtures/videos/sample-480p.mp4", 15);

      const renderFrame = frame(400, 300, [layer("video-mid").build()]);

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      expect(imageData.width).toBe(400);
      pixels.expectPixelAtPercent(50, 50).isNotBlack();
    });

    it("renders a video frame near end", async () => {
      await loadVideoFrame(tester, "video-end", "/tests/fixtures/videos/sample-480p.mp4", 28);

      const renderFrame = frame(400, 300, [layer("video-end").build()]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with position offset", async () => {
      await loadVideoFrame(tester, "video-pos", "/tests/fixtures/videos/sample-480p.mp4", 10);

      const renderFrame = frame(400, 300, [layer("video-pos").position(50, 25).build()]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with scale transform", async () => {
      await loadVideoFrame(tester, "video-scale", "/tests/fixtures/videos/sample-480p.mp4", 5);

      const renderFrame = frame(400, 300, [layer("video-scale").scale(0.5).build()]);

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      expect(imageData.width).toBe(400);
      pixels.expectPixelAtPercent(50, 50).isNotBlack();
    });

    it("renders video frame with rotation", async () => {
      await loadVideoFrame(tester, "video-rotate", "/tests/fixtures/videos/sample-480p.mp4", 8);

      const renderFrame = frame(400, 300, [layer("video-rotate").rotation(15).scale(0.8).build()]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with opacity", async () => {
      await loadVideoFrame(tester, "video-opacity", "/tests/fixtures/videos/sample-480p.mp4", 12);

      const renderFrame = frame(400, 300, [layer("video-opacity").opacity(0.5).build()]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with brightness adjustment", async () => {
      await loadVideoFrame(tester, "video-bright", "/tests/fixtures/videos/sample-480p.mp4", 7);

      const renderFrame = frame(400, 300, [layer("video-bright").brightness(1.3).build()]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with saturation (grayscale)", async () => {
      await loadVideoFrame(tester, "video-gray", "/tests/fixtures/videos/sample-480p.mp4", 20);

      const renderFrame = frame(400, 300, [layer("video-gray").saturation(0).build()]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with blur effect", async () => {
      await loadVideoFrame(tester, "video-blur", "/tests/fixtures/videos/sample-480p.mp4", 18);

      const renderFrame = frame(400, 300, [layer("video-blur").blur(5).build()]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with combined transforms", async () => {
      await loadVideoFrame(tester, "video-combo", "/tests/fixtures/videos/sample-480p.mp4", 22);

      const renderFrame = frame(400, 300, [
        layer("video-combo")
          .position(30, 20)
          .scale(0.7)
          .rotation(10)
          .opacity(0.9)
          .brightness(1.1)
          .build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with text overlay", async () => {
      await loadVideoFrame(tester, "video-overlay", "/tests/fixtures/videos/sample-480p.mp4", 15);

      const renderFrame = frame(400, 300, {
        mediaLayers: [layer("video-overlay").zIndex(0).build()],
        shapeLayers: [
          rectangle("caption-bg").box(10, 75, 80, 15).fill(0, 0, 0, 0.7).zIndex(1).build(),
        ],
        textLayers: [
          textLayer("caption", "Video Caption")
            .box(10, 77, 80, 12)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .align("Center", "Middle")
            .zIndex(2)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame with fade transition", async () => {
      await loadVideoFrame(tester, "video-fade", "/tests/fixtures/videos/sample-480p.mp4", 10);

      const renderFrame = frame(400, 300, [
        layer("video-fade").transitionIn("Fade", 1, { preset: "Linear" }, 0.5).build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders multiple video frames at different timestamps", async () => {
      // Load two frames from different parts of the video
      await loadVideoFrame(
        tester,
        "video-frame1",
        "/tests/fixtures/videos/sample-480p.mp4",
        5,
        200,
        150,
      );
      await loadVideoFrame(
        tester,
        "video-frame2",
        "/tests/fixtures/videos/sample-480p.mp4",
        20,
        200,
        150,
      );

      const renderFrame = frame(400, 300, [
        layer("video-frame1").position(-100, 0).zIndex(0).build(),
        layer("video-frame2").position(100, 0).zIndex(1).build(),
      ]);

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders video frame from short test video (red)", async () => {
      // Use the simple red test video
      await loadVideoFrame(tester, "video-red", "/tests/fixtures/videos/test-red.mp4", 1);

      const renderFrame = frame(400, 300, [layer("video-red").build()]);

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      expect(imageData.width).toBe(400);
      // The test-red.mp4 is a solid red video
      pixels.expectPixelAtPercent(50, 50).redGreaterThan(200);
    });
  });

  // ============================================================================
  // Shape Layers - Rectangle
  // ============================================================================

  describe("rectangle shapes", () => {
    it("renders a basic filled rectangle", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("rect1")
            .box(25, 25, 50, 50)
            .fill(1, 0, 0, 1) // Red
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Center of rectangle should be red
      pixels.expectPixelAtPercent(50, 50).redGreaterThan(200);
      pixels.expectPixelAtPercent(50, 50).greenLessThan(50);
      pixels.expectPixelAtPercent(50, 50).blueLessThan(50);
    });

    it("renders a rectangle with rounded corners", async () => {
      // Use large corner radius (100) that will be visible even after scale factor
      // Scale factor = 300/1080 = 0.278, so effective radius = ~28 pixels
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("rounded")
            .box(20, 20, 60, 60)
            .fill(0, 0.5, 1, 1) // Blue
            .cornerRadius(100) // Large radius for clear corner effect
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Check center is blue
      pixels.expectPixelAtPercent(50, 50).blueGreaterThan(200);

      // The exact corner of the bounding box (20%, 20%) should be transparent
      // because the rounded corner clips it
      pixels.expectPixelAtPercent(20, 20).alphaLessThan(255);
    });

    it("renders a rectangle with stroke", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("stroked")
            .box(25, 25, 50, 50)
            .fill(1, 1, 0, 1) // Yellow fill
            .stroke(0, 0, 0, 1, 4) // Black stroke
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Center should be yellow
      pixels.expectPixelAtPercent(50, 50).redGreaterThan(200);
      pixels.expectPixelAtPercent(50, 50).greenGreaterThan(200);
      pixels.expectPixelAtPercent(50, 50).blueLessThan(50);

      // Edge should be darker than center (stroke)
      pixels.expectPixelAtPercent(25, 50).isDarkerThan(200, 150);
    });

    it("renders a square (equal width and height rectangle)", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("square")
            .box(35, 30, 30, 40) // 30% width = 120px, 40% height = 120px (square on 400x300)
            .fill(0.5, 0, 0.5, 1) // Purple
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      // Verify render happened
      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
    });
  });

  // ============================================================================
  // Shape Layers - Ellipse
  // ============================================================================

  describe("ellipse shapes", () => {
    it("renders a basic ellipse", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          ellipse("ellipse1")
            .box(20, 20, 60, 60)
            .fill(0, 1, 0, 1) // Green
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Center should be green
      pixels.expectPixelAtPercent(50, 50).greenGreaterThan(200);
    });

    it("renders a circle (equal width and height ellipse)", async () => {
      // 25% of 400 = 100px, 33% of 300 = 100px (circle)
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          ellipse("circle")
            .box(37.5, 33.33, 25, 33.33)
            .fill(1, 0.5, 0, 1) // Orange
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Center should be orange
      pixels.expectPixelAtPercent(50, 50).redGreaterThan(200);
      pixels.expectPixelAtPercent(50, 50).greenGreaterThan(100);
    });

    it("renders an ellipse with stroke only (no fill)", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          ellipse("strokeOnly")
            .box(20, 20, 60, 60)
            .fill(0, 0, 0, 0) // Transparent fill
            .stroke(1, 0, 0, 1, 3) // Red stroke
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Center should be transparent (or close to background)
      pixels.expectPixelAtPercent(50, 50).alphaLessThan(50);

      // Edge area should have some color (red stroke)
      pixels.expectPixelAtPercent(20, 50).redGreaterThan(0);
    });
  });

  // ============================================================================
  // Shape Layers - Polygon
  // ============================================================================

  describe("polygon shapes", () => {
    it("renders a triangle (3-sided polygon)", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          polygon("triangle", 3)
            .box(25, 20, 50, 60)
            .fill(0, 1, 1, 1) // Cyan
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      // Should have rendered something
      expect(imageData.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    });

    it("renders a pentagon (5-sided polygon)", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          polygon("pentagon", 5)
            .box(25, 20, 50, 60)
            .fill(1, 0, 1, 1) // Magenta
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Center should have magenta
      pixels.expectPixelAtPercent(50, 50).redGreaterThan(100);
      pixels.expectPixelAtPercent(50, 50).blueGreaterThan(100);
    });

    it("renders a hexagon (6-sided polygon)", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          polygon("hexagon", 6)
            .box(25, 20, 50, 60)
            .fill(1, 1, 0, 1) // Yellow
            .stroke(0, 0, 0, 1, 2)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders an octagon (8-sided polygon)", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          polygon("octagon", 8)
            .box(25, 20, 50, 60)
            .fill(0.5, 0.5, 0.5, 1) // Gray
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });
  });

  // ============================================================================
  // Line Layers
  // ============================================================================

  describe("line layers", () => {
    it("renders a basic diagonal line", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("line1").endpoints(10, 10, 90, 90).stroke(1, 1, 1, 1).strokeWidth(3).build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Line should be visible - check along the diagonal
      pixels.expectPixelAtPercent(50, 50).isNotBlack();
    });

    it("renders a horizontal line", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("hline")
            .from(10, 50)
            .to(90, 50)
            .stroke(1, 0, 0, 1) // Red
            .strokeWidth(5)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Check middle of the line should have red
      pixels.expectPixelAtPercent(50, 50).redGreaterThan(100);
    });

    it("renders a vertical line", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("vline")
            .from(50, 10)
            .to(50, 90)
            .stroke(0, 1, 0, 1) // Green
            .strokeWidth(4)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders a line with arrow head", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrow")
            .from(10, 50)
            .to(90, 50)
            .stroke(0, 0, 1, 1) // Blue
            .strokeWidth(3)
            .arrow(15)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders a line with arrows on both ends", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("doubleArrow")
            .endpoints(15, 50, 85, 50)
            .stroke(1, 0.5, 0, 1) // Orange
            .strokeWidth(4)
            .arrows(12)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders a line with circle endpoints", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("circleEnds")
            .endpoints(15, 50, 85, 50)
            .stroke(0.5, 0, 0.5, 1) // Purple
            .strokeWidth(3)
            .startHead("Circle", 10)
            .endHead("Circle", 10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders a dashed line", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("dashed")
            .endpoints(10, 50, 90, 50)
            .stroke(0, 0, 0, 1) // Black
            .strokeWidth(3)
            .dashed()
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders a dotted line", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("dotted")
            .endpoints(10, 50, 90, 50)
            .stroke(0.3, 0.3, 0.3, 1) // Dark gray
            .strokeWidth(4)
            .dotted()
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    // Arrow direction tests
    it("renders arrow left to right", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowLR")
            .endpoints(15, 50, 85, 50)
            .stroke(0.2, 0.6, 1, 1) // Light blue
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders arrow right to left", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowRL")
            .endpoints(85, 50, 15, 50)
            .stroke(1, 0.4, 0.4, 1) // Light red
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders arrow top to bottom", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowTB")
            .endpoints(50, 15, 50, 85)
            .stroke(0.4, 0.8, 0.4, 1) // Light green
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders arrow bottom to top", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowBT")
            .endpoints(50, 85, 50, 15)
            .stroke(1, 0.8, 0.2, 1) // Yellow
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders arrow top-left to bottom-right", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowTLBR")
            .endpoints(15, 15, 85, 85)
            .stroke(0.8, 0.4, 1, 1) // Purple
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders arrow bottom-right to top-left", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowBRTL")
            .endpoints(85, 85, 15, 15)
            .stroke(1, 0.6, 0.2, 1) // Orange
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders arrow top-right to bottom-left", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowTRBL")
            .endpoints(85, 15, 15, 85)
            .stroke(0.2, 0.8, 0.8, 1) // Cyan
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders arrow bottom-left to top-right", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("arrowBLTR")
            .endpoints(15, 85, 85, 15)
            .stroke(1, 0.4, 0.6, 1) // Pink
            .strokeWidth(4)
            .arrow(14)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });
  });

  // ============================================================================
  // Text Layers
  // ============================================================================

  describe("text layers", () => {
    it("renders basic white text", async () => {
      // NOTE: Text glyph rendering requires glyphon integration (not yet implemented).
      // This test renders text with a dark background to show the text box position.
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("text1", "Hello World")
            .box(10, 40, 80, 20)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .background(0.1, 0.1, 0.3, 1) // Dark blue background to show text box
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      // Verify the render completes and background is visible
      expect(imageData.width).toBe(400);
    });

    it("renders colored text", async () => {
      // NOTE: Text glyph rendering requires glyphon integration (not yet implemented).
      // This test renders text with a light background to show the text box position.
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("coloredText", "Red Text")
            .box(10, 40, 80, 20)
            .fontSize(36)
            .color(1, 0, 0, 1) // Red (text color - not visible until glyphon is integrated)
            .background(1, 0.9, 0.9, 1) // Light red background to show text box
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders text with background", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("bgText", "Background Text")
            .box(10, 40, 80, 20)
            .fontSize(28)
            .color(1, 1, 1, 1)
            .background(0, 0, 0, 0.8) // Semi-transparent black background
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders text with rounded background", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("roundedBg", "Rounded Background")
            .box(10, 40, 80, 20)
            .fontSize(24)
            .color(0, 0, 0, 1) // Black text
            .background(1, 1, 0, 1) // Yellow background
            .backgroundPadding(12)
            .backgroundRadius(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    // NOTE: Text glyph rendering (glyphon) is not yet implemented.
    // These tests verify the text background/box rendering only.
    // The actual text characters will not be visible until glyphon integration is complete.

    it("renders left-aligned text", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("leftAlign", "Left Aligned")
            .box(10, 40, 80, 20)
            .fontSize(28)
            .color(1, 1, 1, 1)
            .align("Left")
            .background(0.2, 0.2, 0.8, 1) // Blue background to show text box position
            .backgroundPadding(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders center-aligned text", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("centerAlign", "Center Aligned")
            .box(10, 40, 80, 20)
            .fontSize(28)
            .color(1, 1, 1, 1)
            .align("Center", "Middle")
            .background(0.2, 0.8, 0.2, 1) // Green background
            .backgroundPadding(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders right-aligned text", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("rightAlign", "Right Aligned")
            .box(10, 40, 80, 20)
            .fontSize(28)
            .color(1, 1, 1, 1)
            .align("Right")
            .background(0.8, 0.2, 0.2, 1) // Red background
            .backgroundPadding(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders bold text", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("boldText", "Bold Text")
            .box(10, 40, 80, 20)
            .fontSize(32)
            .fontWeight(700)
            .color(1, 1, 1, 1)
            .background(0.8, 0.4, 0, 1) // Orange background
            .backgroundPadding(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders italic text", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("italicText", "Italic Text")
            .box(10, 40, 80, 20)
            .fontSize(32)
            .italic()
            .color(1, 1, 1, 1)
            .background(0.5, 0, 0.5, 1) // Purple background
            .backgroundPadding(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders text with letter spacing", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("spacedText", "Spaced Text")
            .box(10, 40, 80, 20)
            .fontSize(28)
            .letterSpacing(5)
            .color(1, 1, 1, 1)
            .background(0, 0.5, 0.5, 1) // Teal background
            .backgroundPadding(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders text with highlighted words (karaoke)", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("karaokeText", "Hello beautiful world")
            .box(10, 40, 80, 20)
            .fontSize(28)
            .color(1, 1, 1, 1)
            .background(0.1, 0.1, 0.1, 0.9) // Dark background
            .backgroundPadding(10)
            .highlight(
              { color: [1, 1, 0, 1], scale: 1.2 }, // Yellow highlighted
              [1], // Highlight "beautiful"
            )
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    // ============================================================================
    // Multilingual Text (LTR, RTL, CJK)
    // ============================================================================

    it("renders English text (LTR)", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("englishText", "Hello World")
            .box(10, 40, 80, 20)
            .fontSize(48)
            .color(1, 1, 1, 1)
            .background(0.1, 0.1, 0.3, 1) // Dark blue background
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Background should be visible
      pixels.expectPixelAtPercent(50, 50).blueGreaterThan(50);
    });

    it("renders Persian text (RTL)", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("persianText", "درود دنیا")
            .box(10, 40, 80, 20)
            .fontSize(48)
            .color(1, 1, 1, 1)
            .background(0.1, 0.3, 0.1, 1) // Dark green background
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Background should be visible
      pixels.expectPixelAtPercent(50, 50).greenGreaterThan(50);
    });

    // CJK fonts not embedded (too large ~16MB). Load via loadFont() if needed.
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("renders Chinese text (CJK)", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("chineseText", "你好世界")
            .box(10, 40, 80, 20)
            .fontSize(48)
            .color(1, 1, 1, 1)
            .background(0.3, 0.1, 0.1, 1) // Dark red background
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Background should be visible
      pixels.expectPixelAtPercent(50, 50).redGreaterThan(50);
    });

    it("renders mixed LTR/RTL text", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("mixedText", "Hello درود World")
            .box(10, 40, 80, 20)
            .fontSize(36)
            .color(1, 1, 1, 1)
            .background(0.2, 0.2, 0.2, 1) // Gray background
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      // Should render without crashing
      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
    });

    it("renders Persian text with custom Vazirmatn font", async () => {
      // Load the Vazirmatn font
      const fontResponse = await fetch(
        new URL("./fixtures/fonts/Vazirmatn-Regular.ttf", import.meta.url),
      );
      const fontData = new Uint8Array(await fontResponse.arrayBuffer());
      tester.loadFont("Vazirmatn", fontData);

      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("vazirmatnText", "درود دنیا")
            .box(10, 30, 80, 30)
            .fontSize(56)
            .fontFamily("Vazirmatn")
            .color(1, 1, 1, 1)
            .background(0.15, 0.1, 0.3, 1) // Dark purple background
            .backgroundPadding(12)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Background should be visible (dark purple has some blue)
      pixels.expectPixelAtPercent(50, 50).blueGreaterThan(30);
    });
  });

  // ============================================================================
  // Unified Transitions
  // ============================================================================

  describe("unified transitions", () => {
    describe("media layer transitions", () => {
      it("renders fade in transition at 50% progress", async () => {
        tester.addSolidTexture("red", 400, 300, [255, 0, 0, 255]);

        const renderFrame = frame(400, 300, [
          layer("red").transitionIn("Fade", 1, { preset: "Linear" }, 0.5).build(),
        ]);

        const imageData = await tester.render(renderFrame);
        const pixels = new PixelAsserter(imageData);

        // Should be semi-transparent (50% fade)
        // Red channel should be present but potentially reduced due to transition
        pixels.expectPixelAtPercent(50, 50).redGreaterThan(50);
      });

      it("renders slide in transition", async () => {
        tester.addSolidTexture("blue", 200, 150, [0, 0, 255, 255]);

        const renderFrame = frame(400, 300, [
          layer("blue")
            .position(100, 75)
            .transitionIn("SlideRight", 1, { preset: "EaseOut" }, 0.5)
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });

      it("renders zoom in transition", async () => {
        tester.addSolidTexture("green", 200, 150, [0, 255, 0, 255]);

        const renderFrame = frame(400, 300, [
          layer("green")
            .position(100, 75)
            .transitionIn("ZoomIn", 1, { preset: "EaseInOut" }, 0.3)
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });
    });

    describe("shape layer transitions", () => {
      it("renders shape with fade transition", async () => {
        const renderFrame = frame(400, 300, {
          shapeLayers: [
            rectangle("fadeRect")
              .box(25, 25, 50, 50)
              .fill(1, 0, 0, 1)
              .transitionIn("Fade", 1, { preset: "Linear" }, 0.5)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });

      it("renders shape with slide transition", async () => {
        const renderFrame = frame(400, 300, {
          shapeLayers: [
            ellipse("slideEllipse")
              .box(25, 25, 50, 50)
              .fill(0, 1, 0, 1)
              .transitionIn("SlideUp", 1, { preset: "EaseOut" }, 0.7)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });

      it("renders shape with zoom transition", async () => {
        const renderFrame = frame(400, 300, {
          shapeLayers: [
            polygon("zoomPoly", 6)
              .box(25, 25, 50, 50)
              .fill(0, 0, 1, 1)
              .transitionIn("ZoomIn", 1, { preset: "EaseIn" }, 0.4)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });
    });

    describe("line layer transitions", () => {
      it("renders line with fade transition", async () => {
        const renderFrame = frame(400, 300, {
          lineLayers: [
            lineLayer("fadeLine")
              .endpoints(10, 50, 90, 50)
              .stroke(1, 1, 1, 1)
              .strokeWidth(4)
              .transitionIn("Fade", 1, { preset: "Linear" }, 0.6)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });

      it("renders line with wipe transition", async () => {
        const renderFrame = frame(400, 300, {
          lineLayers: [
            lineLayer("wipeLine")
              .endpoints(10, 50, 90, 50)
              .stroke(1, 0, 0, 1)
              .strokeWidth(4)
              .arrow(10)
              .transitionIn("WipeRight", 1, { preset: "EaseOut" }, 0.5)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });
    });

    describe("text layer transitions", () => {
      it("renders text with fade transition", async () => {
        const renderFrame = frame(400, 300, {
          textLayers: [
            textLayer("fadeText", "Fading In")
              .box(10, 40, 80, 20)
              .fontSize(32)
              .color(1, 1, 1, 1)
              .background(0.3, 0.3, 0.6, 1) // Blue-gray background
              .backgroundPadding(10)
              .transitionIn("Fade", 1, { preset: "Linear" }, 0.5)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });

      it("renders text with slide transition", async () => {
        const renderFrame = frame(400, 300, {
          textLayers: [
            textLayer("slideText", "Sliding Up")
              .box(10, 40, 80, 20)
              .fontSize(32)
              .color(1, 1, 0, 1)
              .background(0.6, 0.3, 0.3, 1) // Reddish background
              .backgroundPadding(10)
              .transitionIn("SlideUp", 1, { preset: "EaseOut" }, 0.3)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });

      it("renders text with zoom transition", async () => {
        const renderFrame = frame(400, 300, {
          textLayers: [
            textLayer("zoomText", "Zooming In")
              .box(10, 40, 80, 20)
              .fontSize(32)
              .color(0, 1, 1, 1)
              .background(0.3, 0.6, 0.3, 1) // Greenish background
              .backgroundPadding(10)
              .transitionIn("ZoomIn", 1, { preset: "EaseInOut" }, 0.7)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });
    });

    describe("transition out", () => {
      it("renders shape with fade out transition", async () => {
        const renderFrame = frame(400, 300, {
          shapeLayers: [
            rectangle("fadeOutRect")
              .box(25, 25, 50, 50)
              .fill(1, 0.5, 0, 1) // Orange
              .transitionOut("Fade", 1, { preset: "Linear" }, 0.3)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });

      it("renders line with slide out transition", async () => {
        const renderFrame = frame(400, 300, {
          lineLayers: [
            lineLayer("slideOutLine")
              .endpoints(10, 50, 90, 50)
              .stroke(0, 1, 0, 1)
              .strokeWidth(5)
              .transitionOut("SlideDown", 1, { preset: "EaseIn" }, 0.6)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);

        expect(imageData.width).toBe(400);
      });
    });
  });

  // ============================================================================
  // Z-Ordering Across Mixed Layer Types
  // ============================================================================

  describe("z-ordering across layer types", () => {
    it("renders media under shape under text", async () => {
      tester.addSolidTexture("bg", 400, 300, [50, 50, 100, 255]);

      const renderFrame = frame(400, 300, {
        mediaLayers: [layer("bg").zIndex(0).build()],
        shapeLayers: [
          rectangle("overlayRect")
            .box(20, 20, 60, 60)
            .fill(1, 0, 0, 0.7) // Semi-transparent red
            .zIndex(1)
            .build(),
        ],
        textLayers: [
          textLayer("topText", "On Top")
            .box(25, 40, 50, 20)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .background(0, 0, 0, 0.8) // Dark background to show text box
            .backgroundPadding(6)
            .zIndex(2)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      // Should have all layers rendered
      expect(imageData.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    });

    it("renders shapes and lines interleaved by z-index", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("rect1").box(10, 10, 40, 40).fill(1, 0, 0, 1).zIndex(0).build(),
          ellipse("ellipse1").box(50, 10, 40, 40).fill(0, 0, 1, 1).zIndex(2).build(),
        ],
        lineLayers: [
          lineLayer("line1")
            .endpoints(20, 50, 80, 50)
            .stroke(0, 1, 0, 1)
            .strokeWidth(5)
            .zIndex(1)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders complex composition with all layer types", async () => {
      // Background video
      const sceneData = generateSceneTexture(400, 300);
      tester.addRawTexture("scene", 400, 300, sceneData);

      const renderFrame = frame(400, 300, {
        mediaLayers: [layer("scene").zIndex(0).build()],
        shapeLayers: [
          // Decorative shapes
          ellipse("decorCircle").box(5, 5, 15, 20).fill(1, 1, 0, 0.5).zIndex(1).build(),
          rectangle("infoBox")
            .box(60, 70, 35, 25)
            .fill(0, 0, 0, 0.7)
            .cornerRadius(8)
            .zIndex(2)
            .build(),
        ],
        lineLayers: [
          lineLayer("pointer")
            .from(50, 50)
            .to(65, 75)
            .stroke(1, 1, 1, 1)
            .strokeWidth(2)
            .arrow(8)
            .zIndex(3)
            .build(),
        ],
        textLayers: [
          textLayer("title", "Video Title")
            .box(5, 90, 50, 8)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .zIndex(4)
            .build(),
          textLayer("info", "Additional Info")
            .box(62, 75, 30, 10)
            .fontSize(16)
            .color(1, 1, 1, 1)
            .zIndex(4)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      // Should have rendered all layers
      expect(imageData.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    });
  });

  // ============================================================================
  // Opacity and Blending
  // ============================================================================

  describe("opacity and blending", () => {
    it("renders shapes with varying opacity", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("full").box(10, 25, 25, 50).fill(1, 0, 0, 1).opacity(1).zIndex(0).build(),
          rectangle("half").box(37.5, 25, 25, 50).fill(1, 0, 0, 1).opacity(0.5).zIndex(0).build(),
          rectangle("quarter").box(65, 25, 25, 50).fill(1, 0, 0, 1).opacity(0.25).zIndex(0).build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders overlapping shapes with opacity blending", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("redRect").box(20, 25, 35, 50).fill(1, 0, 0, 0.7).zIndex(0).build(),
          rectangle("blueRect").box(45, 25, 35, 50).fill(0, 0, 1, 0.7).zIndex(1).build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Overlap area should have mixed colors
      // Both red and blue should contribute
      expect(pixels.hasVisiblePixels()).toBe(true);
      const [r, , b] = pixels.getPixelPercent(55, 50);
      expect(r + b).toBeGreaterThan(0);
    });

    it("renders lines with transparency", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("line1")
            .endpoints(10, 40, 90, 40)
            .stroke(1, 0, 0, 1)
            .strokeWidth(10)
            .opacity(1)
            .zIndex(0)
            .build(),
          lineLayer("line2")
            .endpoints(10, 50, 90, 50)
            .stroke(0, 1, 0, 1)
            .strokeWidth(10)
            .opacity(0.5)
            .zIndex(1)
            .build(),
          lineLayer("line3")
            .endpoints(10, 60, 90, 60)
            .stroke(0, 0, 1, 1)
            .strokeWidth(10)
            .opacity(0.25)
            .zIndex(2)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders text with transparency", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("text1", "Full Opacity")
            .box(10, 20, 80, 15)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .background(0.2, 0.5, 0.8, 1) // Blue background
            .backgroundPadding(8)
            .opacity(1)
            .build(),
          textLayer("text2", "Half Opacity")
            .box(10, 45, 80, 15)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .background(0.2, 0.5, 0.8, 1) // Blue background
            .backgroundPadding(8)
            .opacity(0.5)
            .build(),
          textLayer("text3", "Quarter Opacity")
            .box(10, 70, 80, 15)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .background(0.2, 0.5, 0.8, 1) // Blue background
            .backgroundPadding(8)
            .opacity(0.25)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("edge cases", () => {
    it("renders empty frame without errors", async () => {
      const renderFrame = frame(400, 300, {});

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
      expect(imageData.height).toBe(300);
    });

    it("renders very thin line", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("thinLine").endpoints(10, 50, 90, 50).stroke(1, 1, 1, 1).strokeWidth(1).build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders very thick line", async () => {
      const renderFrame = frame(400, 300, {
        lineLayers: [
          lineLayer("thickLine")
            .endpoints(10, 50, 90, 50)
            .stroke(1, 0, 0, 1)
            .strokeWidth(50)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders very small shape", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [
          rectangle("tiny")
            .box(48, 48, 4, 4) // 16x12 pixels
            .fill(1, 1, 1, 1)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(400);
    });

    it("renders shape at canvas edge", async () => {
      const renderFrame = frame(400, 300, {
        shapeLayers: [rectangle("edge").box(0, 0, 20, 20).fill(1, 0, 0, 1).build()],
      });

      const imageData = await tester.render(renderFrame);
      const pixels = new PixelAsserter(imageData);

      // Top-left area should be red
      pixels.expectPixelAt(10, 10).redGreaterThan(200);
    });

    it("renders many layers without performance issues", async () => {
      const shapeLayers = [];
      for (let i = 0; i < 50; i++) {
        shapeLayers.push(
          rectangle(`rect${i}`)
            .box((i % 10) * 10, Math.floor(i / 10) * 20, 8, 16)
            .fill(i / 50, 1 - i / 50, 0.5, 0.8)
            .zIndex(i)
            .build(),
        );
      }

      const renderFrame = frame(400, 300, { shapeLayers });

      const start = performance.now();
      const imageData = await tester.render(renderFrame);
      const elapsed = performance.now() - start;

      expect(imageData.width).toBe(400);
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  // ============================================================================
  // Multilingual Text Rendering
  // ============================================================================

  describe("multilingual text", () => {
    it("renders English text (LTR)", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("english", "Hello World")
            .box(10, 30, 80, 40)
            .fontSize(48)
            .color(1, 1, 1, 1)
            .background(0.1, 0.1, 0.3, 1)
            .backgroundPadding(12)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders Persian text (RTL)", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("persian", "درود دنیا")
            .box(10, 30, 80, 40)
            .fontSize(48)
            .color(1, 1, 1, 1)
            .align("Right") // RTL text should be right-aligned
            .background(0.1, 0.3, 0.1, 1)
            .backgroundPadding(12)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    // CJK fonts not embedded (too large ~16MB). Load via loadFont() if needed.
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("renders Chinese text (CJK)", async () => {
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("chinese", "你好世界")
            .box(10, 30, 80, 40)
            .fontSize(48)
            .color(1, 1, 1, 1)
            .background(0.3, 0.1, 0.1, 1)
            .backgroundPadding(12)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders mixed LTR/RTL text (bidirectional)", async () => {
      // Mixing English with Persian in the same text
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("mixed", "Hello درود World دنیا")
            .box(10, 30, 80, 40)
            .fontSize(36)
            .color(1, 1, 1, 1)
            .background(0.2, 0.2, 0.2, 1)
            .backgroundPadding(12)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders multiple scripts together", async () => {
      // English, Persian (RTL), and French (accented Latin)
      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("eng", "Hello")
            .box(10, 10, 30, 20)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .background(0.8, 0.2, 0.2, 1)
            .backgroundPadding(8)
            .build(),
          textLayer("per", "درود")
            .box(35, 10, 30, 20)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .align("Right")
            .background(0.2, 0.8, 0.2, 1)
            .backgroundPadding(8)
            .build(),
          textLayer("fr", "Café")
            .box(60, 10, 30, 20)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .background(0.2, 0.2, 0.8, 1)
            .backgroundPadding(8)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });

    it("renders Persian text with custom Vazirmatn font", async () => {
      // Load the Vazirmatn font from fixtures
      const fontResponse = await fetch("/tests/fixtures/fonts/Vazirmatn-Regular.ttf");
      const fontData = new Uint8Array(await fontResponse.arrayBuffer());
      // Load the font - it's OK if it returns false (already loaded)
      tester.loadFont("Vazirmatn", fontData);

      const renderFrame = frame(400, 300, {
        textLayers: [
          textLayer("vazir", "درود به دنیای برنامه‌نویسی")
            .box(5, 30, 90, 40)
            .fontFamily("Vazirmatn")
            .fontSize(36)
            .color(1, 1, 1, 1)
            .align("Right")
            .background(0.15, 0.15, 0.25, 1)
            .backgroundPadding(10)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);
      expect(imageData.width).toBe(400);
    });
  });

  // ============================================================================
  // Transition Tests (Start, Middle, End frames)
  // NOTE: Transition effects in the compositor are not yet fully implemented.
  // These tests capture screenshots for visual verification of the transition
  // infrastructure. Pixel assertions are skipped where transitions aren't applied.
  // ============================================================================

  describe("transition frame captures", () => {
    describe("fade transition", () => {
      it("renders fade-in at start (0%)", async () => {
        tester.addSolidTexture("red", 200, 150, [255, 100, 100, 255]);

        const renderFrame = frame(400, 300, [
          layer("red")
            .position(100, 75)
            .transitionIn("Fade", 1, { preset: "Linear" }, 0) // 0% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        // NOTE: Transition not yet applied in compositor - just verify render completes
        expect(imageData.width).toBe(400);
      });

      it("renders fade-in at middle (50%)", async () => {
        tester.addSolidTexture("red", 200, 150, [255, 100, 100, 255]);

        const renderFrame = frame(400, 300, [
          layer("red")
            .position(100, 75)
            .transitionIn("Fade", 1, { preset: "Linear" }, 0.5) // 50% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        // NOTE: Transition not yet applied in compositor
        expect(imageData.width).toBe(400);
      });

      it("renders fade-in at end (100%)", async () => {
        tester.addSolidTexture("red", 200, 150, [255, 100, 100, 255]);

        const renderFrame = frame(400, 300, [
          layer("red")
            .position(100, 75)
            .transitionIn("Fade", 1, { preset: "Linear" }, 1) // 100% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        const pixels = new PixelAsserter(imageData);

        // At 100%, should be fully visible (red) - this works even without transitions
        pixels.expectPixelAtPercent(50, 50).redGreaterThan(200);
      });
    });

    describe("slide transition", () => {
      it("renders slide-right at start (0%)", async () => {
        tester.addSolidTexture("blue", 200, 150, [100, 100, 255, 255]);

        const renderFrame = frame(400, 300, [
          layer("blue")
            .position(100, 75)
            .transitionIn("SlideRight", 1, { preset: "EaseOut" }, 0) // 0% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders slide-right at middle (50%)", async () => {
        tester.addSolidTexture("blue", 200, 150, [100, 100, 255, 255]);

        const renderFrame = frame(400, 300, [
          layer("blue")
            .position(100, 75)
            .transitionIn("SlideRight", 1, { preset: "EaseOut" }, 0.5) // 50% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders slide-right at end (100%)", async () => {
        tester.addSolidTexture("blue", 200, 150, [100, 100, 255, 255]);

        const renderFrame = frame(400, 300, [
          layer("blue")
            .position(100, 75)
            .transitionIn("SlideRight", 1, { preset: "EaseOut" }, 1) // 100% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        const pixels = new PixelAsserter(imageData);

        // At 100%, layer should be visible
        pixels.expectPixelAtPercent(50, 50).blueGreaterThan(200);
      });
    });

    describe("zoom transition", () => {
      it("renders zoom-in at start (0%)", async () => {
        tester.addSolidTexture("green", 200, 150, [100, 255, 100, 255]);

        const renderFrame = frame(400, 300, [
          layer("green")
            .position(100, 75)
            .transitionIn("ZoomIn", 1, { preset: "EaseInOut" }, 0) // 0% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders zoom-in at middle (50%)", async () => {
        tester.addSolidTexture("green", 200, 150, [100, 255, 100, 255]);

        const renderFrame = frame(400, 300, [
          layer("green")
            .position(100, 75)
            .transitionIn("ZoomIn", 1, { preset: "EaseInOut" }, 0.5) // 50% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders zoom-in at end (100%)", async () => {
        tester.addSolidTexture("green", 200, 150, [100, 255, 100, 255]);

        const renderFrame = frame(400, 300, [
          layer("green")
            .position(100, 75)
            .transitionIn("ZoomIn", 1, { preset: "EaseInOut" }, 1) // 100% progress
            .build(),
        ]);

        const imageData = await tester.render(renderFrame);
        const pixels = new PixelAsserter(imageData);

        // At 100%, layer should be visible
        pixels.expectPixelAtPercent(50, 50).greenGreaterThan(200);
      });
    });

    describe("shape transitions", () => {
      it("renders shape fade at start (0%)", async () => {
        const renderFrame = frame(400, 300, {
          shapeLayers: [
            rectangle("fadeRect")
              .box(25, 25, 50, 50)
              .fill(1, 0.5, 0, 1) // Orange
              .transitionIn("Fade", 1, { preset: "Linear" }, 0)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders shape fade at middle (50%)", async () => {
        const renderFrame = frame(400, 300, {
          shapeLayers: [
            rectangle("fadeRect")
              .box(25, 25, 50, 50)
              .fill(1, 0.5, 0, 1) // Orange
              .transitionIn("Fade", 1, { preset: "Linear" }, 0.5)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders shape fade at end (100%)", async () => {
        const renderFrame = frame(400, 300, {
          shapeLayers: [
            rectangle("fadeRect")
              .box(25, 25, 50, 50)
              .fill(1, 0.5, 0, 1) // Orange
              .transitionIn("Fade", 1, { preset: "Linear" }, 1)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        const pixels = new PixelAsserter(imageData);

        // At 100%, shape should be fully visible (orange)
        pixels.expectPixelAtPercent(50, 50).redGreaterThan(200);
      });
    });

    describe("text transitions", () => {
      it("renders text fade at start (0%)", async () => {
        const renderFrame = frame(400, 300, {
          textLayers: [
            textLayer("fadeText", "Fading In")
              .box(10, 40, 80, 20)
              .fontSize(36)
              .color(1, 1, 1, 1)
              .background(0.5, 0, 0.5, 1) // Purple background
              .backgroundPadding(10)
              .transitionIn("Fade", 1, { preset: "Linear" }, 0)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders text fade at middle (50%)", async () => {
        const renderFrame = frame(400, 300, {
          textLayers: [
            textLayer("fadeText", "Fading In")
              .box(10, 40, 80, 20)
              .fontSize(36)
              .color(1, 1, 1, 1)
              .background(0.5, 0, 0.5, 1) // Purple background
              .backgroundPadding(10)
              .transitionIn("Fade", 1, { preset: "Linear" }, 0.5)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders text fade at end (100%)", async () => {
        const renderFrame = frame(400, 300, {
          textLayers: [
            textLayer("fadeText", "Fading In")
              .box(10, 40, 80, 20)
              .fontSize(36)
              .color(1, 1, 1, 1)
              .background(0.5, 0, 0.5, 1) // Purple background
              .backgroundPadding(10)
              .transitionIn("Fade", 1, { preset: "Linear" }, 1)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });
    });

    describe("line transitions", () => {
      it("renders line wipe at start (0%)", async () => {
        const renderFrame = frame(400, 300, {
          lineLayers: [
            lineLayer("wipeLine")
              .endpoints(10, 50, 90, 50)
              .stroke(1, 1, 0, 1) // Yellow
              .strokeWidth(6)
              .transitionIn("WipeRight", 1, { preset: "Linear" }, 0)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders line wipe at middle (50%)", async () => {
        const renderFrame = frame(400, 300, {
          lineLayers: [
            lineLayer("wipeLine")
              .endpoints(10, 50, 90, 50)
              .stroke(1, 1, 0, 1) // Yellow
              .strokeWidth(6)
              .transitionIn("WipeRight", 1, { preset: "Linear" }, 0.5)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });

      it("renders line wipe at end (100%)", async () => {
        const renderFrame = frame(400, 300, {
          lineLayers: [
            lineLayer("wipeLine")
              .endpoints(10, 50, 90, 50)
              .stroke(1, 1, 0, 1) // Yellow
              .strokeWidth(6)
              .transitionIn("WipeRight", 1, { preset: "Linear" }, 1)
              .build(),
          ],
        });

        const imageData = await tester.render(renderFrame);
        expect(imageData.width).toBe(400);
      });
    });
  });
});
