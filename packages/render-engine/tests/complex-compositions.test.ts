/**
 * Complex visual composition tests at 1920x1080 (Full HD) resolution.
 *
 * These tests verify realistic video editor scenarios with multiple layer types:
 * - Media layers (video frames, images)
 * - Text layers (titles, captions, labels)
 * - Shape layers (overlays, decorations, highlights)
 * - Line layers (annotations, arrows, connectors)
 *
 * All tests run at 1920x1080 to match real video editing workflows.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SnapshotTester,
  ellipse,
  frame,
  layer,
  lineLayer,
  polygon,
  rectangle,
  textLayer,
} from "../src/testing/snapshot-tester.js";
import {
  generateCheckerboardTexture,
  generateGradientTexture,
  generateSceneTexture,
} from "../src/testing/test-renderer.js";

const WIDTH = 1920;
const HEIGHT = 1080;

describe("complex compositions (1920x1080)", () => {
  let tester: SnapshotTester;

  beforeAll(async () => {
    tester = await SnapshotTester.create(WIDTH, HEIGHT);
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
  // Video Player with UI Overlay
  // ============================================================================

  describe("video player with UI overlay", () => {
    it("renders a video player with play button overlay", async () => {
      // Background video frame
      const videoData = generateSceneTexture(WIDTH, HEIGHT);
      tester.addRawTexture("video", WIDTH, HEIGHT, videoData);

      // Translucent overlay for play button area
      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [layer("video").zIndex(0).build()],
        shapeLayers: [
          // Semi-transparent dark overlay in center
          ellipse("playBg")
            .box(45, 40, 10, 18) // ~200px circle at center
            .fill(0, 0, 0, 0.6)
            .zIndex(1)
            .build(),
          // Play triangle (approximated with polygon)
          polygon("playIcon", 3).box(47, 43, 6, 12).fill(1, 1, 1, 0.95).zIndex(2).build(),
        ],
        lineLayers: [
          // Progress bar background
          lineLayer("progressBg")
            .endpoints(5, 93, 95, 93)
            .stroke(1, 1, 1, 0.3)
            .strokeWidth(6)
            .zIndex(3)
            .build(),
          // Progress bar filled portion (50% progress)
          lineLayer("progressFill")
            .endpoints(5, 93, 50, 93)
            .stroke(1, 0.2, 0.2, 1) // Red like YouTube
            .strokeWidth(6)
            .zIndex(4)
            .build(),
        ],
        textLayers: [
          // Current time
          textLayer("time", "05:23 / 10:45")
            .box(2, 87, 15, 5)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .fontWeight(500)
            .zIndex(5)
            .build(),
          // Video title
          textLayer("title", "Amazing Nature Documentary - Wildlife in Action")
            .box(2, 3, 70, 5)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .background(0, 0, 0, 0.5)
            .backgroundPadding(12)
            .backgroundRadius(6)
            .zIndex(5)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
      // Verify rendering occurred
      expect(imageData.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    });

    it("renders a video player with lower third caption", async () => {
      const videoData = generateSceneTexture(WIDTH, HEIGHT);
      tester.addRawTexture("video", WIDTH, HEIGHT, videoData);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [layer("video").zIndex(0).build()],
        shapeLayers: [
          // Lower third background - gradient effect using overlapping shapes
          rectangle("lowerThirdBg1")
            .box(0, 78, 100, 12)
            .fill(0.1, 0.1, 0.15, 0.85)
            .zIndex(1)
            .build(),
          // Accent line at top of lower third
          rectangle("accentLine")
            .box(0, 77.8, 40, 0.3)
            .fill(0.2, 0.6, 1, 1) // Blue accent
            .zIndex(2)
            .build(),
        ],
        textLayers: [
          // Speaker name
          textLayer("name", "Dr. Sarah Mitchell")
            .box(3, 79, 50, 4)
            .fontSize(42)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .zIndex(3)
            .build(),
          // Speaker title
          textLayer("subtitle", "Marine Biologist | Ocean Research Institute")
            .box(3, 84, 50, 3)
            .fontSize(28)
            .color(0.8, 0.8, 0.8, 1)
            .fontWeight(400)
            .zIndex(3)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });
  });

  // ============================================================================
  // Social Media Post Designs
  // ============================================================================

  describe("social media post designs", () => {
    it("renders an Instagram story layout", async () => {
      // Create a vertical gradient background
      const bgData = generateGradientTexture(
        WIDTH,
        HEIGHT,
        [80, 0, 120, 255], // Purple
        [200, 80, 120, 255], // Pink
        "diagonal",
      );
      tester.addRawTexture("bg", WIDTH, HEIGHT, bgData);

      // Placeholder for main content image
      const contentData = generateSceneTexture(1400, 900);
      tester.addRawTexture("content", 1400, 900, contentData);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [
          layer("bg").zIndex(0).build(),
          layer("content").position(260, 150).scale(1).zIndex(1).build(),
        ],
        shapeLayers: [
          // Profile picture placeholder
          ellipse("profilePic")
            .box(3, 3, 4, 7)
            .fill(1, 1, 1, 0.9)
            .stroke(1, 0.4, 0.6, 1, 4)
            .zIndex(3)
            .build(),
          // Poll option 1
          rectangle("poll1")
            .box(10, 75, 35, 6)
            .fill(1, 1, 1, 0.9)
            .cornerRadius(25)
            .zIndex(3)
            .build(),
          // Poll option 2
          rectangle("poll2")
            .box(55, 75, 35, 6)
            .fill(1, 1, 1, 0.9)
            .cornerRadius(25)
            .zIndex(3)
            .build(),
        ],
        textLayers: [
          // Username
          textLayer("username", "@wildlife_photographer")
            .box(9, 4, 30, 3)
            .fontSize(26)
            .color(1, 1, 1, 1)
            .fontWeight(600)
            .zIndex(4)
            .build(),
          // Story text overlay
          textLayer("storyText", "Which one do you prefer?")
            .box(20, 68, 60, 5)
            .fontSize(38)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(4)
            .build(),
          // Poll labels
          textLayer("option1", "Mountains")
            .box(15, 76, 25, 4)
            .fontSize(28)
            .color(0.1, 0.1, 0.1, 1)
            .fontWeight(600)
            .align("Center")
            .zIndex(5)
            .build(),
          textLayer("option2", "Ocean")
            .box(60, 76, 25, 4)
            .fontSize(28)
            .color(0.1, 0.1, 0.1, 1)
            .fontWeight(600)
            .align("Center")
            .zIndex(5)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });

    it("renders a YouTube thumbnail layout", async () => {
      const bgData = generateSceneTexture(WIDTH, HEIGHT);
      tester.addRawTexture("bg", WIDTH, HEIGHT, bgData);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [layer("bg").zIndex(0).brightness(0.7).build()],
        shapeLayers: [
          // Title background bar
          rectangle("titleBg")
            .box(0, 65, 100, 25)
            .fill(1, 0.1, 0.1, 0.95) // YouTube red
            .zIndex(1)
            .transitionIn("SlideUp", 0.5, { preset: "EaseOut" }, 1)
            .build(),
          // Corner badge for "NEW"
          rectangle("badge")
            .box(85, 5, 12, 8)
            .fill(1, 0.8, 0, 1) // Yellow
            .cornerRadius(8)
            .zIndex(3)
            .build(),
          // Subscriber count bubble
          ellipse("subBubble").box(3, 85, 8, 14).fill(1, 1, 1, 0.95).zIndex(2).build(),
        ],
        lineLayers: [
          // Arrow pointing to key element
          lineLayer("arrow1")
            .endpoints(35, 40, 50, 55)
            .stroke(1, 1, 0, 1)
            .strokeWidth(8)
            .arrow(20)
            .zIndex(4)
            .build(),
          // Another attention arrow
          lineLayer("arrow2")
            .endpoints(65, 40, 50, 55)
            .stroke(1, 1, 0, 1)
            .strokeWidth(8)
            .arrow(20)
            .zIndex(4)
            .build(),
        ],
        textLayers: [
          // Main title (all caps for impact)
          textLayer("mainTitle", "YOU WON'T BELIEVE")
            .box(5, 66, 90, 8)
            .fontSize(72)
            .color(1, 1, 1, 1)
            .fontWeight(900)
            .align("Center")
            .zIndex(5)
            .build(),
          // Subtitle
          textLayer("subtitle", "WHAT HAPPENED NEXT...")
            .box(5, 76, 90, 6)
            .fontSize(52)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(5)
            .build(),
          // Badge text
          textLayer("badgeText", "NEW")
            .box(86, 6.5, 10, 5)
            .fontSize(32)
            .color(0, 0, 0, 1)
            .fontWeight(900)
            .align("Center")
            .zIndex(4)
            .build(),
          // Sub count
          textLayer("subCount", "1.2M")
            .box(4, 88, 6, 4)
            .fontSize(28)
            .color(0.1, 0.1, 0.1, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(4)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });
  });

  // ============================================================================
  // Presentation Slides
  // ============================================================================

  describe("presentation slides", () => {
    it("renders a title slide with corporate branding", async () => {
      // Dark gradient background
      const bgData = generateGradientTexture(
        WIDTH,
        HEIGHT,
        [20, 30, 60, 255], // Dark blue
        [40, 20, 60, 255], // Dark purple
        "diagonal",
      );
      tester.addRawTexture("bg", WIDTH, HEIGHT, bgData);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [layer("bg").zIndex(0).build()],
        shapeLayers: [
          // Decorative circle top right
          ellipse("decor1").box(80, -10, 25, 45).fill(0.3, 0.5, 1, 0.15).zIndex(1).build(),
          // Decorative circle bottom left
          ellipse("decor2").box(-10, 70, 30, 55).fill(0.6, 0.3, 1, 0.1).zIndex(1).build(),
          // Logo placeholder
          rectangle("logo")
            .box(42, 18, 16, 12)
            .fill(1, 1, 1, 0.9)
            .cornerRadius(12)
            .zIndex(2)
            .build(),
          // Bottom accent bar
          rectangle("bottomBar").box(0, 95, 100, 5).fill(0.3, 0.5, 1, 1).zIndex(1).build(),
        ],
        lineLayers: [
          // Subtle decorative lines
          lineLayer("decorLine1")
            .endpoints(20, 50, 40, 50)
            .stroke(1, 1, 1, 0.3)
            .strokeWidth(2)
            .zIndex(1)
            .build(),
          lineLayer("decorLine2")
            .endpoints(60, 50, 80, 50)
            .stroke(1, 1, 1, 0.3)
            .strokeWidth(2)
            .zIndex(1)
            .build(),
        ],
        textLayers: [
          // Company name in logo area
          textLayer("company", "CORP")
            .box(43, 21, 14, 7)
            .fontSize(48)
            .color(0.2, 0.3, 0.5, 1)
            .fontWeight(900)
            .align("Center")
            .zIndex(3)
            .build(),
          // Main title
          textLayer("title", "Q4 2024 Business Review")
            .box(5, 40, 90, 10)
            .fontSize(72)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(3)
            .build(),
          // Subtitle
          textLayer("subtitle", "Annual Performance & Strategic Outlook")
            .box(5, 52, 90, 5)
            .fontSize(36)
            .color(0.7, 0.7, 0.8, 1)
            .fontWeight(400)
            .align("Center")
            .zIndex(3)
            .build(),
          // Presenter info
          textLayer("presenter", "Presented by John Smith, CEO")
            .box(5, 65, 90, 4)
            .fontSize(28)
            .color(0.5, 0.6, 0.8, 1)
            .fontWeight(400)
            .align("Center")
            .zIndex(3)
            .build(),
          // Date
          textLayer("date", "December 15, 2024")
            .box(5, 70, 90, 3)
            .fontSize(24)
            .color(0.5, 0.6, 0.8, 1)
            .fontWeight(400)
            .align("Center")
            .zIndex(3)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });

    it("renders a data visualization slide with annotations", async () => {
      // Light background for data visualization
      tester.addSolidTexture("bg", WIDTH, HEIGHT, [245, 247, 250, 255]);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [layer("bg").zIndex(0).build()],
        shapeLayers: [
          // Chart area background
          rectangle("chartBg")
            .box(8, 18, 55, 70)
            .fill(1, 1, 1, 1)
            .stroke(0.85, 0.87, 0.9, 1, 2)
            .cornerRadius(8)
            .zIndex(1)
            .build(),
          // Bar 1 (highest)
          rectangle("bar1")
            .box(12, 40, 8, 45)
            .fill(0.2, 0.5, 0.9, 1)
            .cornerRadius(4)
            .zIndex(2)
            .build(),
          // Bar 2
          rectangle("bar2")
            .box(22, 50, 8, 35)
            .fill(0.2, 0.5, 0.9, 0.8)
            .cornerRadius(4)
            .zIndex(2)
            .build(),
          // Bar 3
          rectangle("bar3")
            .box(32, 35, 8, 50)
            .fill(0.2, 0.8, 0.4, 1) // Green highlight
            .cornerRadius(4)
            .zIndex(2)
            .build(),
          // Bar 4
          rectangle("bar4")
            .box(42, 55, 8, 30)
            .fill(0.2, 0.5, 0.9, 0.8)
            .cornerRadius(4)
            .zIndex(2)
            .build(),
          // Bar 5
          rectangle("bar5")
            .box(52, 60, 8, 25)
            .fill(0.2, 0.5, 0.9, 0.8)
            .cornerRadius(4)
            .zIndex(2)
            .build(),
          // Key insights box
          rectangle("insightsBox")
            .box(68, 18, 28, 55)
            .fill(1, 1, 1, 1)
            .stroke(0.85, 0.87, 0.9, 1, 2)
            .cornerRadius(8)
            .zIndex(1)
            .build(),
          // Highlight badge
          rectangle("highlightBadge")
            .box(70, 22, 24, 6)
            .fill(0.2, 0.8, 0.4, 0.15)
            .cornerRadius(4)
            .zIndex(2)
            .build(),
        ],
        lineLayers: [
          // Annotation arrow pointing to highest bar
          lineLayer("annotationArrow")
            .endpoints(70, 40, 42, 38)
            .stroke(0.9, 0.3, 0.3, 1)
            .strokeWidth(3)
            .arrow(15)
            .zIndex(4)
            .build(),
          // Chart grid lines
          lineLayer("gridLine1")
            .endpoints(10, 45, 62, 45)
            .stroke(0.9, 0.9, 0.9, 1)
            .strokeWidth(1)
            .dashed()
            .zIndex(1)
            .build(),
          lineLayer("gridLine2")
            .endpoints(10, 55, 62, 55)
            .stroke(0.9, 0.9, 0.9, 1)
            .strokeWidth(1)
            .dashed()
            .zIndex(1)
            .build(),
          lineLayer("gridLine3")
            .endpoints(10, 65, 62, 65)
            .stroke(0.9, 0.9, 0.9, 1)
            .strokeWidth(1)
            .dashed()
            .zIndex(1)
            .build(),
        ],
        textLayers: [
          // Slide title
          textLayer("slideTitle", "Revenue Performance by Quarter")
            .box(8, 5, 80, 5)
            .fontSize(44)
            .color(0.15, 0.15, 0.2, 1)
            .fontWeight(700)
            .zIndex(5)
            .build(),
          // Subtitle
          textLayer("slideSubtitle", "FY 2024 vs FY 2023 Comparison")
            .box(8, 11, 50, 3)
            .fontSize(24)
            .color(0.5, 0.5, 0.55, 1)
            .fontWeight(400)
            .zIndex(5)
            .build(),
          // Bar labels
          textLayer("label1", "Q1")
            .box(12, 86, 8, 3)
            .fontSize(18)
            .color(0.4, 0.4, 0.45, 1)
            .align("Center")
            .zIndex(3)
            .build(),
          textLayer("label2", "Q2")
            .box(22, 86, 8, 3)
            .fontSize(18)
            .color(0.4, 0.4, 0.45, 1)
            .align("Center")
            .zIndex(3)
            .build(),
          textLayer("label3", "Q3")
            .box(32, 86, 8, 3)
            .fontSize(18)
            .color(0.2, 0.6, 0.3, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(3)
            .build(),
          textLayer("label4", "Q4")
            .box(42, 86, 8, 3)
            .fontSize(18)
            .color(0.4, 0.4, 0.45, 1)
            .align("Center")
            .zIndex(3)
            .build(),
          textLayer("label5", "Q1'25")
            .box(52, 86, 8, 3)
            .fontSize(18)
            .color(0.4, 0.4, 0.45, 1)
            .align("Center")
            .zIndex(3)
            .build(),
          // Key insights header
          textLayer("insightsHeader", "Key Insights")
            .box(70, 20, 24, 4)
            .fontSize(28)
            .color(0.15, 0.15, 0.2, 1)
            .fontWeight(700)
            .zIndex(5)
            .build(),
          // Highlight text
          textLayer("highlight", "+32% YoY Growth")
            .box(71, 23, 22, 4)
            .fontSize(24)
            .color(0.2, 0.6, 0.3, 1)
            .fontWeight(600)
            .zIndex(5)
            .build(),
          // Insight bullet points
          textLayer("insight1", "Q3 showed exceptional performance")
            .box(70, 32, 26, 4)
            .fontSize(20)
            .color(0.3, 0.3, 0.35, 1)
            .zIndex(5)
            .build(),
          textLayer("insight2", "New product line contributed 45%")
            .box(70, 38, 26, 4)
            .fontSize(20)
            .color(0.3, 0.3, 0.35, 1)
            .zIndex(5)
            .build(),
          textLayer("insight3", "APAC region led growth at 52%")
            .box(70, 44, 26, 4)
            .fontSize(20)
            .color(0.3, 0.3, 0.35, 1)
            .zIndex(5)
            .build(),
          // Annotation callout
          textLayer("callout", "Record Quarter!")
            .box(68, 35, 18, 4)
            .fontSize(22)
            .color(0.9, 0.3, 0.3, 1)
            .fontWeight(700)
            .zIndex(5)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });
  });

  // ============================================================================
  // Tutorial/Educational Content
  // ============================================================================

  describe("tutorial content", () => {
    it("renders a software tutorial with step annotations", async () => {
      // Screenshot background (simulated)
      const screenshotData = generateCheckerboardTexture(
        WIDTH,
        HEIGHT,
        40,
        [240, 240, 245, 255],
        [250, 250, 255, 255],
      );
      tester.addRawTexture("screenshot", WIDTH, HEIGHT, screenshotData);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [layer("screenshot").zIndex(0).build()],
        shapeLayers: [
          // Highlight box around UI element
          rectangle("highlightBox1")
            .box(20, 25, 25, 15)
            .fill(0, 0, 0, 0)
            .stroke(1, 0.4, 0.1, 1, 4)
            .cornerRadius(8)
            .zIndex(2)
            .build(),
          // Step number badge 1
          ellipse("step1Badge").box(19, 22, 2.5, 4.5).fill(1, 0.4, 0.1, 1).zIndex(3).build(),
          // Second highlight
          rectangle("highlightBox2")
            .box(55, 50, 20, 12)
            .fill(0, 0, 0, 0)
            .stroke(0.2, 0.7, 0.3, 1, 4)
            .cornerRadius(8)
            .zIndex(2)
            .build(),
          // Step number badge 2
          ellipse("step2Badge").box(74, 48, 2.5, 4.5).fill(0.2, 0.7, 0.3, 1).zIndex(3).build(),
          // Third highlight
          rectangle("highlightBox3")
            .box(10, 70, 30, 18)
            .fill(0, 0, 0, 0)
            .stroke(0.2, 0.4, 0.9, 1, 4)
            .cornerRadius(8)
            .zIndex(2)
            .build(),
          // Step number badge 3
          ellipse("step3Badge").box(9, 68, 2.5, 4.5).fill(0.2, 0.4, 0.9, 1).zIndex(3).build(),
          // Instruction panel
          rectangle("instructionPanel")
            .box(55, 70, 42, 25)
            .fill(0.15, 0.15, 0.2, 0.95)
            .cornerRadius(12)
            .zIndex(4)
            .build(),
        ],
        lineLayers: [
          // Arrow from step 1 to annotation
          lineLayer("arrow1")
            .endpoints(35, 32, 45, 32)
            .stroke(1, 0.4, 0.1, 1)
            .strokeWidth(3)
            .arrow(12)
            .dashed()
            .zIndex(3)
            .build(),
          // Arrow from step 2 to instruction
          lineLayer("arrow2")
            .endpoints(75, 56, 75, 68)
            .stroke(0.2, 0.7, 0.3, 1)
            .strokeWidth(3)
            .arrow(12)
            .zIndex(3)
            .build(),
          // Connector between steps
          lineLayer("connector")
            .endpoints(22, 40, 55, 50)
            .stroke(0.5, 0.5, 0.5, 0.5)
            .strokeWidth(2)
            .dashed()
            .zIndex(1)
            .build(),
        ],
        textLayers: [
          // Tutorial title
          textLayer("tutTitle", "How to Export Your Project")
            .box(2, 2, 50, 5)
            .fontSize(38)
            .color(0.15, 0.15, 0.2, 1)
            .fontWeight(700)
            .background(1, 1, 1, 0.9)
            .backgroundPadding(15)
            .backgroundRadius(8)
            .zIndex(5)
            .build(),
          // Step badges
          textLayer("step1Num", "1")
            .box(19.5, 23, 1.5, 3)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(4)
            .build(),
          textLayer("step2Num", "2")
            .box(74.5, 49, 1.5, 3)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(4)
            .build(),
          textLayer("step3Num", "3")
            .box(9.5, 69, 1.5, 3)
            .fontSize(24)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .align("Center")
            .zIndex(4)
            .build(),
          // Step 1 annotation
          textLayer("step1Text", "Click File Menu")
            .box(46, 30, 20, 4)
            .fontSize(22)
            .color(0.15, 0.15, 0.2, 1)
            .fontWeight(600)
            .background(1, 0.95, 0.9, 0.95)
            .backgroundPadding(10)
            .backgroundRadius(6)
            .zIndex(4)
            .build(),
          // Instruction panel content
          textLayer("instructionTitle", "Instructions")
            .box(57, 72, 20, 4)
            .fontSize(28)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .zIndex(5)
            .build(),
          textLayer("instruction1", "1. Open the File menu")
            .box(57, 77, 38, 3)
            .fontSize(22)
            .color(0.9, 0.9, 0.9, 1)
            .zIndex(5)
            .build(),
          textLayer("instruction2", "2. Select Export Settings")
            .box(57, 81, 38, 3)
            .fontSize(22)
            .color(0.9, 0.9, 0.9, 1)
            .zIndex(5)
            .build(),
          textLayer("instruction3", "3. Choose format and click Export")
            .box(57, 85, 38, 3)
            .fontSize(22)
            .color(0.9, 0.9, 0.9, 1)
            .zIndex(5)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });
  });

  // ============================================================================
  // Complex Layering and Transitions
  // ============================================================================

  describe("complex layering", () => {
    it("renders 20+ shapes with overlapping opacity", async () => {
      const shapeLayers = [];
      const colors: [number, number, number, number][] = [
        [1, 0.2, 0.2, 0.6],
        [0.2, 1, 0.2, 0.6],
        [0.2, 0.2, 1, 0.6],
        [1, 1, 0.2, 0.6],
        [1, 0.2, 1, 0.6],
        [0.2, 1, 1, 0.6],
      ];

      // Create overlapping circles in a pattern
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const idx = row * 6 + col;
          const color = colors[idx % colors.length];
          shapeLayers.push(
            ellipse(`circle${idx}`)
              .box(5 + col * 14, 10 + row * 20, 12, 22)
              .fill(color[0], color[1], color[2], color[3])
              .zIndex(idx)
              .build(),
          );
        }
      }

      const renderFrame = frame(WIDTH, HEIGHT, { shapeLayers });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });

    it("renders all layer types with interleaved z-ordering", async () => {
      const bgData = generateGradientTexture(
        WIDTH,
        HEIGHT,
        [30, 40, 70, 255],
        [70, 40, 70, 255],
        "horizontal",
      );
      tester.addRawTexture("bg", WIDTH, HEIGHT, bgData);

      const photoData = generateSceneTexture(600, 400);
      tester.addRawTexture("photo", 600, 400, photoData);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [
          layer("bg").zIndex(0).build(),
          layer("photo").position(100, 300).zIndex(5).build(),
        ],
        shapeLayers: [
          // Behind photo
          rectangle("behindRect")
            .box(3, 25, 40, 45)
            .fill(1, 1, 1, 0.1)
            .cornerRadius(20)
            .zIndex(2)
            .build(),
          // In front of photo
          ellipse("frontCircle").box(45, 55, 15, 27).fill(1, 0.8, 0, 0.8).zIndex(10).build(),
          // Top decoration
          polygon("topHex", 6).box(75, 10, 15, 27).fill(0.3, 0.8, 0.5, 0.9).zIndex(15).build(),
        ],
        lineLayers: [
          // Connecting line at z=3 (between background and photo)
          lineLayer("backLine")
            .endpoints(5, 50, 35, 40)
            .stroke(1, 1, 1, 0.3)
            .strokeWidth(4)
            .zIndex(3)
            .build(),
          // Arrow at z=12 (between circle and hexagon)
          lineLayer("midArrow")
            .endpoints(60, 65, 75, 25)
            .stroke(1, 1, 1, 0.9)
            .strokeWidth(4)
            .arrow(15)
            .zIndex(12)
            .build(),
          // Top decorative line
          lineLayer("topLine")
            .endpoints(5, 5, 95, 5)
            .stroke(1, 0.8, 0, 1)
            .strokeWidth(3)
            .zIndex(20)
            .build(),
        ],
        textLayers: [
          // Behind most elements
          textLayer("bgText", "Background Layer")
            .box(50, 80, 45, 8)
            .fontSize(48)
            .color(1, 1, 1, 0.2)
            .fontWeight(700)
            .zIndex(1)
            .build(),
          // On top of photo
          textLayer("photoCaption", "Featured Image")
            .box(5.5, 58, 30, 5)
            .fontSize(28)
            .color(1, 1, 1, 1)
            .fontWeight(600)
            .background(0, 0, 0, 0.7)
            .backgroundPadding(10)
            .backgroundRadius(6)
            .zIndex(8)
            .build(),
          // Very top
          textLayer("topTitle", "Composite Demo")
            .box(2, 10, 40, 8)
            .fontSize(52)
            .color(1, 1, 1, 1)
            .fontWeight(800)
            .zIndex(25)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });

    it("renders multiple transitions at different stages", async () => {
      tester.addSolidTexture("red", 300, 300, [255, 100, 100, 255]);
      tester.addSolidTexture("green", 300, 300, [100, 255, 100, 255]);
      tester.addSolidTexture("blue", 300, 300, [100, 100, 255, 255]);

      const renderFrame = frame(WIDTH, HEIGHT, {
        mediaLayers: [
          // Fully visible (transition complete)
          layer("red")
            .position(100, 100)
            .transitionIn("Fade", 1, { preset: "EaseOut" }, 1)
            .zIndex(1)
            .build(),
          // Mid-transition
          layer("green")
            .position(700, 100)
            .transitionIn("SlideRight", 1, { preset: "EaseOut" }, 0.5)
            .zIndex(2)
            .build(),
          // Just started transition
          layer("blue")
            .position(1300, 100)
            .transitionIn("ZoomIn", 1, { preset: "EaseIn" }, 0.1)
            .zIndex(3)
            .build(),
        ],
        shapeLayers: [
          // Shape fading out
          rectangle("fadeOutRect")
            .box(5, 50, 20, 35)
            .fill(1, 0.5, 0, 1)
            .transitionOut("Fade", 1, { preset: "Linear" }, 0.6)
            .zIndex(4)
            .build(),
          // Shape sliding in
          ellipse("slideInCircle")
            .box(40, 50, 15, 27)
            .fill(0.5, 0, 1, 1)
            .transitionIn("SlideUp", 1, { preset: "EaseOut" }, 0.8)
            .zIndex(5)
            .build(),
        ],
        textLayers: [
          // Text with zoom transition
          textLayer("zoomText", "Zooming In...")
            .box(60, 55, 35, 10)
            .fontSize(48)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .transitionIn("ZoomIn", 1.5, { preset: "EaseOut" }, 0.4)
            .zIndex(6)
            .build(),
        ],
        lineLayers: [
          // Line with wipe transition
          lineLayer("wipeLine")
            .endpoints(5, 90, 95, 90)
            .stroke(1, 1, 0, 1)
            .strokeWidth(8)
            .transitionIn("WipeRight", 2, { preset: "Linear" }, 0.7)
            .zIndex(7)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });
  });

  // ============================================================================
  // Edge Cases and Stress Tests
  // ============================================================================

  describe("edge cases and stress tests", () => {
    it("renders 100 small shapes without performance issues", async () => {
      const shapeLayers = [];

      for (let i = 0; i < 100; i++) {
        const x = (i % 10) * 9 + 5;
        const y = Math.floor(i / 10) * 9 + 5;
        const hue = (i / 100) * 360;
        const r = Math.cos((hue * Math.PI) / 180) * 0.5 + 0.5;
        const g = Math.cos(((hue - 120) * Math.PI) / 180) * 0.5 + 0.5;
        const b = Math.cos(((hue - 240) * Math.PI) / 180) * 0.5 + 0.5;

        shapeLayers.push(
          rectangle(`rect${i}`)
            .box(x, y, 7, 7)
            .fill(r, g, b, 0.9)
            .cornerRadius(4)
            .zIndex(i)
            .build(),
        );
      }

      const renderFrame = frame(WIDTH, HEIGHT, { shapeLayers });

      const start = performance.now();
      const imageData = await tester.render(renderFrame);
      const elapsed = performance.now() - start;

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
      expect(elapsed).toBeLessThan(2000); // Should render in under 2 seconds
    });

    it("renders very long text without overflow", async () => {
      const renderFrame = frame(WIDTH, HEIGHT, {
        textLayers: [
          textLayer(
            "longText",
            "This is an extremely long piece of text that should be properly contained within its bounding box and not cause any rendering issues or overflow problems when displayed on the canvas at full HD resolution.",
          )
            .box(5, 20, 90, 60)
            .fontSize(36)
            .color(1, 1, 1, 1)
            .fontWeight(400)
            .lineHeight(1.5)
            .background(0.1, 0.1, 0.15, 0.9)
            .backgroundPadding(30)
            .backgroundRadius(15)
            .zIndex(1)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });

    it("renders elements at canvas boundaries", async () => {
      const renderFrame = frame(WIDTH, HEIGHT, {
        shapeLayers: [
          // Top-left corner
          rectangle("topLeft").box(-2, -2, 8, 10).fill(1, 0, 0, 1).zIndex(1).build(),
          // Top-right corner
          rectangle("topRight").box(95, -2, 8, 10).fill(0, 1, 0, 1).zIndex(2).build(),
          // Bottom-left corner
          rectangle("bottomLeft").box(-2, 93, 8, 10).fill(0, 0, 1, 1).zIndex(3).build(),
          // Bottom-right corner
          rectangle("bottomRight").box(95, 93, 8, 10).fill(1, 1, 0, 1).zIndex(4).build(),
        ],
        lineLayers: [
          // Line extending beyond canvas
          lineLayer("extendingLine")
            .endpoints(-5, 50, 105, 50)
            .stroke(1, 1, 1, 1)
            .strokeWidth(5)
            .zIndex(5)
            .build(),
        ],
        textLayers: [
          // Text at edge
          textLayer("edgeText", "Edge of Canvas")
            .box(-3, 45, 30, 10)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .fontWeight(600)
            .zIndex(6)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });

    it("renders all shape types in a grid", async () => {
      const shapeLayers = [];
      const sidesSets = [3, 4, 5, 6, 7, 8, 10, 12];

      // Row 1: Rectangles with varying corner radius
      for (let i = 0; i < 6; i++) {
        shapeLayers.push(
          rectangle(`rect${i}`)
            .box(5 + i * 15, 5, 12, 18)
            .fill(0.9, 0.3, 0.3, 1)
            .cornerRadius(i * 5)
            .zIndex(i)
            .build(),
        );
      }

      // Row 2: Ellipses with varying proportions
      for (let i = 0; i < 6; i++) {
        shapeLayers.push(
          ellipse(`ellipse${i}`)
            .box(5 + i * 15, 28, 6 + i * 2, 15)
            .fill(0.3, 0.9, 0.3, 1)
            .zIndex(10 + i)
            .build(),
        );
      }

      // Row 3-4: Polygons with varying sides
      for (let i = 0; i < sidesSets.length; i++) {
        const col = i % 4;
        const row = Math.floor(i / 4);
        shapeLayers.push(
          polygon(`poly${i}`, sidesSets[i])
            .box(5 + col * 23, 50 + row * 25, 18, 22)
            .fill(0.3, 0.3, 0.9, 1)
            .stroke(1, 1, 1, 0.5, 2)
            .zIndex(20 + i)
            .build(),
        );
      }

      const renderFrame = frame(WIDTH, HEIGHT, {
        shapeLayers,
        textLayers: [
          textLayer("title", "All Shape Types")
            .box(5, 1, 40, 4)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .zIndex(100)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });

    it("renders all line styles and decorations", async () => {
      const lineLayers = [];
      const headTypes: Array<"None" | "Arrow" | "Circle" | "Square" | "Diamond"> = [
        "None",
        "Arrow",
        "Circle",
        "Square",
        "Diamond",
      ];

      // Solid lines with different head types
      for (let i = 0; i < headTypes.length; i++) {
        lineLayers.push(
          lineLayer(`solidLine${i}`)
            .endpoints(5, 10 + i * 10, 30, 10 + i * 10)
            .stroke(1, 1, 1, 1)
            .strokeWidth(4)
            .startHead(headTypes[i], 12)
            .endHead(headTypes[i], 12)
            .zIndex(i)
            .build(),
        );
      }

      // Dashed lines
      for (let i = 0; i < 3; i++) {
        lineLayers.push(
          lineLayer(`dashedLine${i}`)
            .endpoints(35, 10 + i * 10, 60, 10 + i * 10)
            .stroke(1, 0.8, 0.2, 1)
            .strokeWidth(3 + i)
            .dashed()
            .arrow(10)
            .zIndex(10 + i)
            .build(),
        );
      }

      // Dotted lines
      for (let i = 0; i < 3; i++) {
        lineLayers.push(
          lineLayer(`dottedLine${i}`)
            .endpoints(65, 10 + i * 10, 90, 10 + i * 10)
            .stroke(0.5, 0.8, 1, 1)
            .strokeWidth(4 + i)
            .dotted()
            .zIndex(20 + i)
            .build(),
        );
      }

      // Diagonal lines
      lineLayers.push(
        lineLayer("diag1")
          .endpoints(5, 60, 30, 90)
          .stroke(1, 0.3, 0.3, 1)
          .strokeWidth(5)
          .arrows(15)
          .zIndex(30)
          .build(),
        lineLayer("diag2")
          .endpoints(35, 90, 60, 60)
          .stroke(0.3, 1, 0.3, 1)
          .strokeWidth(5)
          .arrows(15)
          .zIndex(31)
          .build(),
        lineLayer("diag3")
          .endpoints(65, 60, 90, 90)
          .stroke(0.3, 0.3, 1, 1)
          .strokeWidth(5)
          .startHead("Circle", 15)
          .endHead("Diamond", 15)
          .zIndex(32)
          .build(),
      );

      const renderFrame = frame(WIDTH, HEIGHT, {
        lineLayers,
        textLayers: [
          textLayer("title", "All Line Styles")
            .box(5, 1, 40, 4)
            .fontSize(32)
            .color(1, 1, 1, 1)
            .fontWeight(700)
            .zIndex(100)
            .build(),
        ],
      });

      const imageData = await tester.render(renderFrame);

      expect(imageData.width).toBe(WIDTH);
      expect(imageData.height).toBe(HEIGHT);
    });
  });
});
