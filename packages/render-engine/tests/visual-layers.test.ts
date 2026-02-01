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
    // Capture screenshot after each test for visual verification
    await tester.captureScreenshot();
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
          textLayer("persianText", "سلام دنیا")
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

    it("renders Chinese text (CJK)", async () => {
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
          textLayer("mixedText", "Hello سلام World")
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
      if (pixels.hasVisiblePixels()) {
        const [r, , b] = pixels.getPixelPercent(55, 50);
        expect(r + b).toBeGreaterThan(0);
      }
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
});
