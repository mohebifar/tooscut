/**
 * Snapshot testing framework for the render engine.
 *
 * Renders frames using the compositor and compares output against reference images.
 * Designed to run in browser environments (Vitest browser mode, Playwright, etc.)
 * where WebGPU is available.
 */

import type {
  RenderFrame,
  MediaLayerData,
  Transform,
  Effects,
  TextLayerData,
  HighlightStyle,
  ShapeLayerData,
  ShapeType,
  LineLayerData,
  LineHeadType,
  LineStrokeStyle,
  TransitionType,
  Easing,
} from "../types.js";
import {
  DEFAULT_TRANSFORM,
  DEFAULT_EFFECTS,
  DEFAULT_TEXT_STYLE,
  DEFAULT_SHAPE_STYLE,
  DEFAULT_LINE_STYLE,
  DEFAULT_EASING,
} from "../types.js";

// Legacy alias for backwards compatibility
type LayerData = MediaLayerData;
import { Compositor, initCompositorWasm } from "../compositor.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a snapshot comparison.
 */
export interface SnapshotResult {
  /** Whether the snapshot matched */
  passed: boolean;
  /** Difference score (0 = identical, higher = more different) */
  diffScore: number;
  /** Number of pixels that differ */
  diffPixelCount: number;
  /** Total number of pixels */
  totalPixels: number;
  /** Percentage of pixels that differ */
  diffPercentage: number;
  /** The rendered image as a data URL (for debugging) */
  actualDataUrl: string;
  /** The expected image as a data URL (if available) */
  expectedDataUrl?: string;
  /** Diff image as a data URL (highlights differences) */
  diffDataUrl?: string;
}

/**
 * Options for snapshot comparison.
 */
export interface SnapshotOptions {
  /** Threshold for per-pixel color difference (0-255). Default: 0 */
  colorThreshold?: number;
  /** Maximum allowed percentage of differing pixels. Default: 0 */
  diffThreshold?: number;
  /** Whether to generate a diff image. Default: true */
  generateDiff?: boolean;
}

/**
 * A test texture definition.
 */
export interface TestTexture {
  id: string;
  width: number;
  height: number;
  /** RGBA color to fill the texture, or raw RGBA data */
  fill: [number, number, number, number] | Uint8Array;
}

/**
 * A test case definition.
 */
export interface TestCase {
  name: string;
  /** Canvas dimensions */
  width: number;
  height: number;
  /** Textures to upload before rendering */
  textures: TestTexture[];
  /** The frame to render */
  frame: RenderFrame;
  /** Path to the expected snapshot image */
  snapshotPath?: string;
}

// ============================================================================
// Snapshot Tester
// ============================================================================

/**
 * Snapshot tester for the render engine compositor.
 *
 * @example
 * ```typescript
 * const tester = await SnapshotTester.create(256, 256);
 *
 * // Add a test texture
 * tester.addSolidTexture("red", 100, 100, [255, 0, 0, 255]);
 *
 * // Render and compare
 * const result = await tester.renderAndCompare(frame, expectedImageData);
 *
 * if (!result.passed) {
 *   console.log(`Diff: ${result.diffPercentage}%`);
 * }
 *
 * tester.dispose();
 * ```
 */
export class SnapshotTester {
  private canvas: OffscreenCanvas;
  private compositor: Compositor;
  private ctx2d: OffscreenCanvasRenderingContext2D;

  private constructor(
    canvas: OffscreenCanvas,
    compositor: Compositor,
    ctx2d: OffscreenCanvasRenderingContext2D,
  ) {
    this.canvas = canvas;
    this.compositor = compositor;
    this.ctx2d = ctx2d;
  }

  /**
   * Create a new snapshot tester.
   *
   * @param width - Canvas width
   * @param height - Canvas height
   * @param wasmUrl - Optional URL to the WASM binary
   */
  static async create(
    width: number,
    height: number,
    wasmUrl?: string | URL,
  ): Promise<SnapshotTester> {
    await initCompositorWasm(wasmUrl);

    // Create offscreen canvas for compositor
    const canvas = new OffscreenCanvas(width, height);
    const compositor = await Compositor.fromOffscreenCanvas(canvas);

    // Create a second canvas for reading pixels (compositor uses WebGPU, need 2D for reading)
    const readCanvas = new OffscreenCanvas(width, height);
    const ctx2d = readCanvas.getContext("2d");
    if (!ctx2d) {
      throw new Error("Failed to create 2D context");
    }

    return new SnapshotTester(canvas, compositor, ctx2d);
  }

  /**
   * Resize the tester canvas.
   */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.compositor.resize(width, height);
    this.ctx2d.canvas.width = width;
    this.ctx2d.canvas.height = height;
  }

  /**
   * Add a solid color texture.
   */
  addSolidTexture(
    id: string,
    width: number,
    height: number,
    color: [number, number, number, number],
  ): void {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = color[0];
      data[i * 4 + 1] = color[1];
      data[i * 4 + 2] = color[2];
      data[i * 4 + 3] = color[3];
    }
    this.compositor.uploadRgba(id, width, height, data);
  }

  /**
   * Add a gradient texture (for testing transforms).
   */
  addGradientTexture(
    id: string,
    width: number,
    height: number,
    direction: "horizontal" | "vertical" | "diagonal" = "horizontal",
  ): void {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let t: number;
        switch (direction) {
          case "horizontal":
            t = x / (width - 1);
            break;
          case "vertical":
            t = y / (height - 1);
            break;
          case "diagonal":
            t = (x + y) / (width + height - 2);
            break;
        }
        data[i] = Math.round(t * 255); // R
        data[i + 1] = Math.round((1 - t) * 255); // G
        data[i + 2] = 128; // B
        data[i + 3] = 255; // A
      }
    }
    this.compositor.uploadRgba(id, width, height, data);
  }

  /**
   * Add a checkerboard texture (for testing transparency).
   */
  addCheckerboardTexture(
    id: string,
    width: number,
    height: number,
    cellSize: number = 8,
    color1: [number, number, number, number] = [255, 255, 255, 255],
    color2: [number, number, number, number] = [200, 200, 200, 255],
  ): void {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const isEven = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
        const color = isEven ? color1 : color2;
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = color[3];
      }
    }
    this.compositor.uploadRgba(id, width, height, data);
  }

  /**
   * Add a raw RGBA texture.
   */
  addRawTexture(id: string, width: number, height: number, data: Uint8Array): void {
    this.compositor.uploadRgba(id, width, height, data);
  }

  /**
   * Add a texture from an ImageBitmap.
   */
  addBitmapTexture(id: string, bitmap: ImageBitmap): void {
    this.compositor.uploadBitmap(bitmap, id);
  }

  /**
   * Clear a texture.
   */
  clearTexture(id: string): void {
    this.compositor.clearTexture(id);
  }

  /**
   * Clear all textures.
   */
  clearAllTextures(): void {
    this.compositor.clearAllTextures();
  }

  /**
   * Render a frame and return the result as ImageData.
   */
  async render(frame: RenderFrame): Promise<ImageData> {
    this.compositor.renderFrame(frame);
    this.compositor.flush();

    // Copy from WebGPU canvas to 2D canvas to read pixels
    const bitmap = await createImageBitmap(this.canvas);
    this.ctx2d.drawImage(bitmap, 0, 0);
    bitmap.close();

    return this.ctx2d.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render a frame and return as a data URL.
   */
  async renderToDataUrl(frame: RenderFrame): Promise<string> {
    await this.render(frame);
    const blob = await this.ctx2d.canvas.convertToBlob({ type: "image/png" });
    return blobToDataUrl(blob);
  }

  /**
   * Compare two ImageData objects.
   */
  compareImages(
    actual: ImageData,
    expected: ImageData,
    options: SnapshotOptions = {},
  ): SnapshotResult {
    const { colorThreshold = 0, diffThreshold = 0, generateDiff = true } = options;

    if (actual.width !== expected.width || actual.height !== expected.height) {
      throw new Error(
        `Image dimensions don't match: ${actual.width}x${actual.height} vs ${expected.width}x${expected.height}`,
      );
    }

    const width = actual.width;
    const height = actual.height;
    const totalPixels = width * height;

    let diffPixelCount = 0;
    let diffScore = 0;

    const diffData = generateDiff ? new Uint8ClampedArray(width * height * 4) : null;

    for (let i = 0; i < actual.data.length; i += 4) {
      const rDiff = Math.abs(actual.data[i] - expected.data[i]);
      const gDiff = Math.abs(actual.data[i + 1] - expected.data[i + 1]);
      const bDiff = Math.abs(actual.data[i + 2] - expected.data[i + 2]);
      const aDiff = Math.abs(actual.data[i + 3] - expected.data[i + 3]);

      const maxDiff = Math.max(rDiff, gDiff, bDiff, aDiff);
      const avgDiff = (rDiff + gDiff + bDiff + aDiff) / 4;

      if (maxDiff > colorThreshold) {
        diffPixelCount++;
        diffScore += avgDiff;
      }

      if (diffData) {
        if (maxDiff > colorThreshold) {
          // Highlight differences in red
          diffData[i] = 255;
          diffData[i + 1] = 0;
          diffData[i + 2] = 0;
          diffData[i + 3] = 255;
        } else {
          // Dim the matching pixels
          diffData[i] = actual.data[i] * 0.3;
          diffData[i + 1] = actual.data[i + 1] * 0.3;
          diffData[i + 2] = actual.data[i + 2] * 0.3;
          diffData[i + 3] = 255;
        }
      }
    }

    const diffPercentage = (diffPixelCount / totalPixels) * 100;
    const passed = diffPercentage <= diffThreshold;

    const result: SnapshotResult = {
      passed,
      diffScore,
      diffPixelCount,
      totalPixels,
      diffPercentage,
      actualDataUrl: "", // Will be set by caller if needed
    };

    if (diffData) {
      const diffImageData = new ImageData(diffData, width, height);
      result.diffDataUrl = imageDataToDataUrl(diffImageData);
    }

    return result;
  }

  /**
   * Render a frame and compare against expected ImageData.
   */
  async renderAndCompare(
    frame: RenderFrame,
    expected: ImageData,
    options: SnapshotOptions = {},
  ): Promise<SnapshotResult> {
    const actual = await this.render(frame);
    const result = this.compareImages(actual, expected, options);

    // Add data URLs for debugging
    result.actualDataUrl = imageDataToDataUrl(actual);
    result.expectedDataUrl = imageDataToDataUrl(expected);

    return result;
  }

  /**
   * Get the compositor instance (for advanced usage).
   */
  getCompositor(): Compositor {
    return this.compositor;
  }

  /**
   * Dispose of the tester and release resources.
   */
  dispose(): void {
    this.compositor.dispose();
  }
}

// ============================================================================
// Test Case Builder
// ============================================================================

/**
 * Builder for creating test layers.
 */
export class LayerBuilder {
  private layer: LayerData;

  constructor(textureId: string) {
    this.layer = {
      texture_id: textureId,
      transform: { ...DEFAULT_TRANSFORM },
      effects: { ...DEFAULT_EFFECTS },
      z_index: 0,
    };
  }

  /**
   * Set transform properties.
   */
  transform(transform: Partial<Transform>): this {
    this.layer.transform = { ...this.layer.transform, ...transform };
    return this;
  }

  /**
   * Set position.
   */
  position(x: number, y: number): this {
    this.layer.transform.x = x;
    this.layer.transform.y = y;
    return this;
  }

  /**
   * Set scale.
   */
  scale(scaleX: number, scaleY?: number): this {
    this.layer.transform.scale_x = scaleX;
    this.layer.transform.scale_y = scaleY ?? scaleX;
    return this;
  }

  /**
   * Set rotation in degrees.
   */
  rotation(degrees: number): this {
    this.layer.transform.rotation = degrees;
    return this;
  }

  /**
   * Set anchor point (0-1, where 0.5 is center).
   */
  anchor(x: number, y: number): this {
    this.layer.transform.anchor_x = x;
    this.layer.transform.anchor_y = y;
    return this;
  }

  /**
   * Set effects properties.
   */
  effects(effects: Partial<Effects>): this {
    this.layer.effects = { ...this.layer.effects, ...effects };
    return this;
  }

  /**
   * Set opacity (0-1).
   */
  opacity(value: number): this {
    this.layer.effects.opacity = value;
    return this;
  }

  /**
   * Set brightness (1 = normal).
   */
  brightness(value: number): this {
    this.layer.effects.brightness = value;
    return this;
  }

  /**
   * Set contrast (1 = normal).
   */
  contrast(value: number): this {
    this.layer.effects.contrast = value;
    return this;
  }

  /**
   * Set saturation (1 = normal, 0 = grayscale).
   */
  saturation(value: number): this {
    this.layer.effects.saturation = value;
    return this;
  }

  /**
   * Set blur in pixels.
   */
  blur(value: number): this {
    this.layer.effects.blur = value;
    return this;
  }

  /**
   * Set z-index.
   */
  zIndex(value: number): this {
    this.layer.z_index = value;
    return this;
  }

  /**
   * Set crop.
   */
  crop(top: number, right: number, bottom: number, left: number): this {
    this.layer.crop = { top, right, bottom, left };
    return this;
  }

  /**
   * Set transition in.
   */
  transitionIn(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_in = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Set transition out.
   */
  transitionOut(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_out = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Build the layer data.
   */
  build(): LayerData {
    return { ...this.layer };
  }
}

/**
 * Create a new layer builder.
 */
export function layer(textureId: string): LayerBuilder {
  return new LayerBuilder(textureId);
}

// ============================================================================
// Text Layer Builder
// ============================================================================

/**
 * Builder for creating test text layers.
 */
export class TextLayerBuilder {
  private layer: TextLayerData;

  constructor(id: string, text: string) {
    this.layer = {
      id,
      text,
      box: { x: 0, y: 0, width: 100, height: 100 },
      style: { ...DEFAULT_TEXT_STYLE },
      z_index: 0,
      opacity: 1,
    };
  }

  /**
   * Set bounding box (as percentage of canvas 0-100).
   */
  box(x: number, y: number, width: number, height: number): this {
    this.layer.box = { x, y, width, height };
    return this;
  }

  /**
   * Set font family.
   */
  fontFamily(family: string): this {
    this.layer.style.font_family = family;
    return this;
  }

  /**
   * Set font size in pixels.
   */
  fontSize(size: number): this {
    this.layer.style.font_size = size;
    return this;
  }

  /**
   * Set font weight (100-900).
   */
  fontWeight(weight: number): this {
    this.layer.style.font_weight = weight;
    return this;
  }

  /**
   * Set italic.
   */
  italic(value: boolean = true): this {
    this.layer.style.italic = value;
    return this;
  }

  /**
   * Set text color.
   */
  color(r: number, g: number, b: number, a: number = 1): this {
    this.layer.style.color = [r, g, b, a];
    return this;
  }

  /**
   * Set text alignment.
   */
  align(horizontal: "Left" | "Center" | "Right", vertical?: "Top" | "Middle" | "Bottom"): this {
    this.layer.style.text_align = horizontal;
    if (vertical) {
      this.layer.style.vertical_align = vertical;
    }
    return this;
  }

  /**
   * Set line height multiplier.
   */
  lineHeight(value: number): this {
    this.layer.style.line_height = value;
    return this;
  }

  /**
   * Set letter spacing in pixels.
   */
  letterSpacing(value: number): this {
    this.layer.style.letter_spacing = value;
    return this;
  }

  /**
   * Set background color.
   */
  background(r: number, g: number, b: number, a: number = 1): this {
    this.layer.style.background_color = [r, g, b, a];
    return this;
  }

  /**
   * Set background padding.
   */
  backgroundPadding(value: number): this {
    this.layer.style.background_padding = value;
    return this;
  }

  /**
   * Set background border radius.
   */
  backgroundRadius(value: number): this {
    this.layer.style.background_border_radius = value;
    return this;
  }

  /**
   * Set z-index.
   */
  zIndex(value: number): this {
    this.layer.z_index = value;
    return this;
  }

  /**
   * Set opacity (0-1).
   */
  opacity(value: number): this {
    this.layer.opacity = value;
    return this;
  }

  /**
   * Set highlight style for karaoke effect.
   */
  highlight(style: Partial<HighlightStyle>, wordIndices: number[]): this {
    this.layer.highlight_style = {
      color: style.color,
      background_color: style.background_color,
      background_padding: style.background_padding,
      background_border_radius: style.background_border_radius,
      font_weight: style.font_weight,
      scale: style.scale,
    };
    this.layer.highlighted_word_indices = wordIndices;
    return this;
  }

  /**
   * Set transition in.
   */
  transitionIn(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_in = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Set transition out.
   */
  transitionOut(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_out = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Build the text layer data.
   */
  build(): TextLayerData {
    return { ...this.layer, style: { ...this.layer.style }, box: { ...this.layer.box } };
  }
}

/**
 * Create a new text layer builder.
 */
export function textLayer(id: string, text: string): TextLayerBuilder {
  return new TextLayerBuilder(id, text);
}

// ============================================================================
// Shape Layer Builder
// ============================================================================

/**
 * Builder for creating test shape layers.
 */
export class ShapeLayerBuilder {
  private layer: ShapeLayerData;

  constructor(id: string, shape: ShapeType) {
    this.layer = {
      id,
      shape,
      box: { x: 0, y: 0, width: 50, height: 50 },
      style: { ...DEFAULT_SHAPE_STYLE },
      z_index: 0,
      opacity: 1,
    };
  }

  /**
   * Set bounding box (as percentage of canvas 0-100).
   */
  box(x: number, y: number, width: number, height: number): this {
    this.layer.box = { x, y, width, height };
    return this;
  }

  /**
   * Set fill color.
   */
  fill(r: number, g: number, b: number, a: number = 1): this {
    this.layer.style.fill = [r, g, b, a];
    return this;
  }

  /**
   * Set stroke color and width.
   */
  stroke(r: number, g: number, b: number, a: number = 1, width: number = 2): this {
    this.layer.style.stroke = [r, g, b, a];
    this.layer.style.stroke_width = width;
    return this;
  }

  /**
   * Set stroke width only.
   */
  strokeWidth(width: number): this {
    this.layer.style.stroke_width = width;
    return this;
  }

  /**
   * Set corner radius (for rectangles).
   */
  cornerRadius(value: number): this {
    this.layer.style.corner_radius = value;
    return this;
  }

  /**
   * Set number of sides (for polygons).
   */
  sides(value: number): this {
    this.layer.style.sides = value;
    return this;
  }

  /**
   * Set z-index.
   */
  zIndex(value: number): this {
    this.layer.z_index = value;
    return this;
  }

  /**
   * Set opacity (0-1).
   */
  opacity(value: number): this {
    this.layer.opacity = value;
    return this;
  }

  /**
   * Set transition in.
   */
  transitionIn(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_in = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Set transition out.
   */
  transitionOut(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_out = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Build the shape layer data.
   */
  build(): ShapeLayerData {
    return { ...this.layer, style: { ...this.layer.style }, box: { ...this.layer.box } };
  }
}

/**
 * Create a new shape layer builder.
 */
export function shapeLayer(id: string, shape: ShapeType): ShapeLayerBuilder {
  return new ShapeLayerBuilder(id, shape);
}

/**
 * Convenience: Create a rectangle shape layer.
 */
export function rectangle(id: string): ShapeLayerBuilder {
  return new ShapeLayerBuilder(id, "Rectangle");
}

/**
 * Convenience: Create an ellipse shape layer.
 */
export function ellipse(id: string): ShapeLayerBuilder {
  return new ShapeLayerBuilder(id, "Ellipse");
}

/**
 * Convenience: Create a polygon shape layer.
 */
export function polygon(id: string, sides: number = 6): ShapeLayerBuilder {
  return new ShapeLayerBuilder(id, "Polygon").sides(sides);
}

// ============================================================================
// Line Layer Builder
// ============================================================================

/**
 * Builder for creating test line layers.
 */
export class LineLayerBuilder {
  private layer: LineLayerData;

  constructor(id: string) {
    this.layer = {
      id,
      box: { x1: 0, y1: 0, x2: 100, y2: 100 },
      style: { ...DEFAULT_LINE_STYLE },
      z_index: 0,
      opacity: 1,
    };
  }

  /**
   * Set line endpoints (as percentage of canvas 0-100).
   */
  endpoints(x1: number, y1: number, x2: number, y2: number): this {
    this.layer.box = { x1, y1, x2, y2 };
    return this;
  }

  /**
   * Set from point.
   */
  from(x: number, y: number): this {
    this.layer.box.x1 = x;
    this.layer.box.y1 = y;
    return this;
  }

  /**
   * Set to point.
   */
  to(x: number, y: number): this {
    this.layer.box.x2 = x;
    this.layer.box.y2 = y;
    return this;
  }

  /**
   * Set stroke color.
   */
  stroke(r: number, g: number, b: number, a: number = 1): this {
    this.layer.style.stroke = [r, g, b, a];
    return this;
  }

  /**
   * Set stroke width.
   */
  strokeWidth(width: number): this {
    this.layer.style.stroke_width = width;
    return this;
  }

  /**
   * Set stroke style.
   */
  strokeStyle(style: LineStrokeStyle): this {
    this.layer.style.stroke_style = style;
    return this;
  }

  /**
   * Set dashed stroke.
   */
  dashed(): this {
    this.layer.style.stroke_style = "Dashed";
    return this;
  }

  /**
   * Set dotted stroke.
   */
  dotted(): this {
    this.layer.style.stroke_style = "Dotted";
    return this;
  }

  /**
   * Set start head.
   */
  startHead(type: LineHeadType, size: number = 10): this {
    this.layer.style.start_head = { type, size };
    return this;
  }

  /**
   * Set end head.
   */
  endHead(type: LineHeadType, size: number = 10): this {
    this.layer.style.end_head = { type, size };
    return this;
  }

  /**
   * Set arrow heads on both ends.
   */
  arrows(size: number = 10): this {
    this.layer.style.start_head = { type: "Arrow", size };
    this.layer.style.end_head = { type: "Arrow", size };
    return this;
  }

  /**
   * Set arrow head on end only.
   */
  arrow(size: number = 10): this {
    this.layer.style.end_head = { type: "Arrow", size };
    return this;
  }

  /**
   * Set z-index.
   */
  zIndex(value: number): this {
    this.layer.z_index = value;
    return this;
  }

  /**
   * Set opacity (0-1).
   */
  opacity(value: number): this {
    this.layer.opacity = value;
    return this;
  }

  /**
   * Set transition in.
   */
  transitionIn(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_in = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Set transition out.
   */
  transitionOut(
    type: TransitionType,
    duration: number,
    easing: Easing = DEFAULT_EASING,
    progress: number = 0,
  ): this {
    this.layer.transition_out = {
      transition: { type, duration, easing },
      progress,
    };
    return this;
  }

  /**
   * Build the line layer data.
   */
  build(): LineLayerData {
    return { ...this.layer, style: { ...this.layer.style }, box: { ...this.layer.box } };
  }
}

/**
 * Create a new line layer builder.
 */
export function lineLayer(id: string): LineLayerBuilder {
  return new LineLayerBuilder(id);
}

// ============================================================================
// Frame Builder (Extended)
// ============================================================================

/**
 * Options for creating a render frame.
 */
export interface FrameOptions {
  mediaLayers?: LayerData[];
  textLayers?: TextLayerData[];
  shapeLayers?: ShapeLayerData[];
  lineLayers?: LineLayerData[];
  timelineTime?: number;
}

/**
 * Create a render frame from layers.
 */
export function frame(
  width: number,
  height: number,
  layers: LayerData[],
  timelineTime?: number,
): RenderFrame;
export function frame(width: number, height: number, options: FrameOptions): RenderFrame;
export function frame(
  width: number,
  height: number,
  layersOrOptions: LayerData[] | FrameOptions,
  timelineTime: number = 0,
): RenderFrame {
  if (Array.isArray(layersOrOptions)) {
    // Legacy signature
    return {
      media_layers: layersOrOptions,
      text_layers: [],
      shape_layers: [],
      line_layers: [],
      timeline_time: timelineTime,
      width,
      height,
    };
  } else {
    // New options signature
    return {
      media_layers: layersOrOptions.mediaLayers ?? [],
      text_layers: layersOrOptions.textLayers ?? [],
      shape_layers: layersOrOptions.shapeLayers ?? [],
      line_layers: layersOrOptions.lineLayers ?? [],
      timeline_time: layersOrOptions.timelineTime ?? 0,
      width,
      height,
    };
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Convert a Blob to a data URL.
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert ImageData to a data URL.
 */
function imageDataToDataUrl(imageData: ImageData): string {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create 2D context");
  ctx.putImageData(imageData, 0, 0);

  // OffscreenCanvas doesn't have toDataURL, use convertToBlob sync workaround
  // For now, create a temporary canvas (this is sync in browser)
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) throw new Error("Failed to create 2D context");
  tempCtx.putImageData(imageData, 0, 0);
  return tempCanvas.toDataURL("image/png");
}

/**
 * Load an image from a URL and return as ImageData.
 */
export async function loadImageData(url: string): Promise<ImageData> {
  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create 2D context");

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Create a solid color ImageData for testing.
 */
export function createSolidImageData(
  width: number,
  height: number,
  color: [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = color[3];
  }
  return new ImageData(data, width, height);
}
