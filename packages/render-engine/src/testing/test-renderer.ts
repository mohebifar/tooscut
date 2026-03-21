/**
 * Test renderer for generating compositor output images.
 *
 * This module provides utilities for rendering test frames and saving
 * them as PNG files for visual inspection and snapshot testing.
 */

import type { RenderFrame, MediaLayerData, Transform, Effects } from "../types.js";
import { DEFAULT_TRANSFORM, DEFAULT_EFFECTS } from "../types.js";

// Legacy alias for backwards compatibility
type LayerData = MediaLayerData;

// ============================================================================
// Texture Generation
// ============================================================================

/**
 * Generate a solid color texture.
 */
export function generateSolidTexture(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number = 255,
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

/**
 * Generate a gradient texture.
 */
export function generateGradientTexture(
  width: number,
  height: number,
  startColor: [number, number, number, number],
  endColor: [number, number, number, number],
  direction: "horizontal" | "vertical" | "diagonal" = "horizontal",
): Uint8Array {
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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

      const i = (y * width + x) * 4;
      data[i] = Math.round(startColor[0] + (endColor[0] - startColor[0]) * t);
      data[i + 1] = Math.round(startColor[1] + (endColor[1] - startColor[1]) * t);
      data[i + 2] = Math.round(startColor[2] + (endColor[2] - startColor[2]) * t);
      data[i + 3] = Math.round(startColor[3] + (endColor[3] - startColor[3]) * t);
    }
  }

  return data;
}

/**
 * Generate a checkerboard texture.
 */
export function generateCheckerboardTexture(
  width: number,
  height: number,
  cellSize: number = 16,
  color1: [number, number, number, number] = [255, 255, 255, 255],
  color2: [number, number, number, number] = [200, 200, 200, 255],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isLight = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      const color = isLight ? color1 : color2;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }

  return data;
}

/**
 * Generate a radial gradient texture (for circular shapes).
 */
export function generateRadialGradientTexture(
  width: number,
  height: number,
  centerColor: [number, number, number, number],
  edgeColor: [number, number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, dist / maxDist);

      const i = (y * width + x) * 4;
      data[i] = Math.round(centerColor[0] + (edgeColor[0] - centerColor[0]) * t);
      data[i + 1] = Math.round(centerColor[1] + (edgeColor[1] - centerColor[1]) * t);
      data[i + 2] = Math.round(centerColor[2] + (edgeColor[2] - centerColor[2]) * t);
      data[i + 3] = Math.round(centerColor[3] + (edgeColor[3] - centerColor[3]) * t);
    }
  }

  return data;
}

/**
 * Generate a "photo-like" texture with regions of different colors.
 * Simulates an image with sky, ground, and a sun.
 */
export function generateSceneTexture(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);

  // Sky gradient (top half)
  const skyTop: [number, number, number, number] = [135, 206, 235, 255]; // Light blue
  const skyBottom: [number, number, number, number] = [200, 230, 255, 255]; // Lighter blue

  // Ground (bottom half)
  const groundColor: [number, number, number, number] = [34, 139, 34, 255]; // Forest green

  // Sun
  const sunColor: [number, number, number, number] = [255, 223, 0, 255]; // Golden
  const sunX = width * 0.75;
  const sunY = height * 0.25;
  const sunRadius = Math.min(width, height) * 0.1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Check if pixel is in sun
      const dx = x - sunX;
      const dy = y - sunY;
      const distToSun = Math.sqrt(dx * dx + dy * dy);

      if (distToSun < sunRadius) {
        // Sun
        data[i] = sunColor[0];
        data[i + 1] = sunColor[1];
        data[i + 2] = sunColor[2];
        data[i + 3] = sunColor[3];
      } else if (y < height / 2) {
        // Sky gradient
        const t = y / (height / 2);
        data[i] = Math.round(skyTop[0] + (skyBottom[0] - skyTop[0]) * t);
        data[i + 1] = Math.round(skyTop[1] + (skyBottom[1] - skyTop[1]) * t);
        data[i + 2] = Math.round(skyTop[2] + (skyBottom[2] - skyTop[2]) * t);
        data[i + 3] = 255;
      } else {
        // Ground
        data[i] = groundColor[0];
        data[i + 1] = groundColor[1];
        data[i + 2] = groundColor[2];
        data[i + 3] = groundColor[3];
      }
    }
  }

  return data;
}

/**
 * Generate a text-like texture (simulates text with rectangles).
 */
export function generateTextTexture(
  width: number,
  height: number,
  textColor: [number, number, number, number] = [255, 255, 255, 255],
  bgColor: [number, number, number, number] = [0, 0, 0, 0],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);

  // Fill background
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = bgColor[0];
    data[i * 4 + 1] = bgColor[1];
    data[i * 4 + 2] = bgColor[2];
    data[i * 4 + 3] = bgColor[3];
  }

  // Draw "text" as horizontal bars
  const lineHeight = Math.floor(height / 5);
  const margin = Math.floor(width * 0.1);

  for (let line = 0; line < 3; line++) {
    const y1 = Math.floor(height * 0.2) + line * lineHeight;
    const y2 = y1 + Math.floor(lineHeight * 0.6);
    const lineWidth = width - margin * 2 - line * margin; // Each line shorter

    for (let y = y1; y < y2 && y < height; y++) {
      for (let x = margin; x < margin + lineWidth && x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = textColor[0];
        data[i + 1] = textColor[1];
        data[i + 2] = textColor[2];
        data[i + 3] = textColor[3];
      }
    }
  }

  return data;
}

/**
 * Generate a shape texture (circle, rectangle, etc.).
 */
export function generateShapeTexture(
  width: number,
  height: number,
  shape: "circle" | "rectangle" | "triangle",
  fillColor: [number, number, number, number],
  strokeColor: [number, number, number, number] = [0, 0, 0, 0],
  strokeWidth: number = 0,
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let inside = false;
      let onStroke = false;

      switch (shape) {
        case "circle": {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const radius = Math.min(width, height) / 2 - strokeWidth;
          inside = dist < radius;
          onStroke = strokeWidth > 0 && dist >= radius && dist < radius + strokeWidth;
          break;
        }
        case "rectangle": {
          const margin = strokeWidth;
          inside = x >= margin && x < width - margin && y >= margin && y < height - margin;
          onStroke = strokeWidth > 0 && !inside && x >= 0 && x < width && y >= 0 && y < height;
          break;
        }
        case "triangle": {
          // Equilateral triangle pointing up
          const h = height - strokeWidth * 2;
          const base = width - strokeWidth * 2;
          const px = x - strokeWidth;
          const py = y - strokeWidth;

          // Check if point is inside triangle
          const relY = h - py;
          const halfWidth = (relY / h) * (base / 2);
          const centerX = base / 2;
          inside = py >= 0 && py < h && px >= centerX - halfWidth && px <= centerX + halfWidth;

          // Approximate stroke
          if (!inside && strokeWidth > 0) {
            const expandedH = height;
            const expandedBase = width;
            const relY2 = expandedH - y;
            const halfWidth2 = (relY2 / expandedH) * (expandedBase / 2);
            const centerX2 = expandedBase / 2;
            onStroke =
              y >= 0 && y < expandedH && x >= centerX2 - halfWidth2 && x <= centerX2 + halfWidth2;
          }
          break;
        }
      }

      if (onStroke) {
        data[i] = strokeColor[0];
        data[i + 1] = strokeColor[1];
        data[i + 2] = strokeColor[2];
        data[i + 3] = strokeColor[3];
      } else if (inside) {
        data[i] = fillColor[0];
        data[i + 1] = fillColor[1];
        data[i + 2] = fillColor[2];
        data[i + 3] = fillColor[3];
      } else {
        // Transparent
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }

  return data;
}

// ============================================================================
// Layer Builders
// ============================================================================

/**
 * Create a layer with default values.
 *
 * Positions are specified relative to canvas center:
 * - Omitting x/y or setting them to 0 means centered on canvas
 * - Positive x moves right, positive y moves down
 *
 * The createFrame() function adds canvas center to convert to absolute positions.
 */
export function createLayer(
  textureId: string,
  options: {
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    anchorX?: number;
    anchorY?: number;
    opacity?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    hueRotate?: number;
    blur?: number;
    zIndex?: number;
    crop?: { top: number; right: number; bottom: number; left: number };
  } = {},
): LayerData {
  const transform: Transform = {
    ...DEFAULT_TRANSFORM,
    x: options.x ?? 0,
    y: options.y ?? 0,
    scale_x: options.scaleX ?? 1,
    scale_y: options.scaleY ?? 1,
    rotation: options.rotation ?? 0,
    anchor_x: options.anchorX ?? 0.5,
    anchor_y: options.anchorY ?? 0.5,
  };

  const effects: Effects = {
    ...DEFAULT_EFFECTS,
    opacity: options.opacity ?? 1,
    brightness: options.brightness ?? 1,
    contrast: options.contrast ?? 1,
    saturation: options.saturation ?? 1,
    hue_rotate: options.hueRotate ?? 0,
    blur: options.blur ?? 0,
  };

  return {
    texture_id: textureId,
    transform,
    effects,
    z_index: options.zIndex ?? 0,
    crop: options.crop,
  };
}

/**
 * Resolve layer positions by adding canvas center.
 * All positions are relative to canvas center.
 */
function resolveLayerPositions(layers: LayerData[], width: number, height: number): LayerData[] {
  const centerX = width / 2;
  const centerY = height / 2;
  return layers.map((layer) => ({
    ...layer,
    transform: {
      ...layer.transform,
      x: layer.transform.x + centerX,
      y: layer.transform.y + centerY,
    },
  }));
}

/**
 * Create a render frame.
 */
export function createFrame(
  width: number,
  height: number,
  layers: LayerData[],
  timelineTime: number = 0,
): RenderFrame {
  return {
    media_layers: resolveLayerPositions(layers, width, height),
    text_layers: [],
    shape_layers: [],
    line_layers: [],
    timeline_time: timelineTime,
    width,
    height,
  };
}

// ============================================================================
// Test Case Definitions
// ============================================================================

/**
 * Test case definition for visual testing.
 */
export interface VisualTestCase {
  name: string;
  description: string;
  width: number;
  height: number;
  textures: Array<{
    id: string;
    width: number;
    height: number;
    data: Uint8Array;
  }>;
  layers: LayerData[];
}

/**
 * Generate all visual test cases.
 */
export function generateVisualTestCases(): VisualTestCase[] {
  const cases: VisualTestCase[] = [];

  // ============================================================================
  // Basic Rendering Tests
  // ============================================================================

  // 1. Single solid color layer
  cases.push({
    name: "solid-red",
    description: "Single red square covering the canvas",
    width: 256,
    height: 256,
    textures: [
      {
        id: "red",
        width: 256,
        height: 256,
        data: generateSolidTexture(256, 256, 255, 0, 0),
      },
    ],
    layers: [createLayer("red")],
  });

  // 2. Gradient texture
  cases.push({
    name: "gradient-horizontal",
    description: "Horizontal gradient from blue to green",
    width: 256,
    height: 256,
    textures: [
      {
        id: "gradient",
        width: 256,
        height: 256,
        data: generateGradientTexture(256, 256, [0, 0, 255, 255], [0, 255, 0, 255], "horizontal"),
      },
    ],
    layers: [createLayer("gradient")],
  });

  // ============================================================================
  // Layer Ordering Tests (track-based z-index)
  // Z-order is determined by track index: Track 3 > Track 2 > Track 1
  // ============================================================================

  // 3. Three overlapping colored squares on different tracks
  cases.push({
    name: "z-order-three-squares",
    description: "Three overlapping squares: Track 1 (red), Track 2 (green), Track 3 (blue)",
    width: 256,
    height: 256,
    textures: [
      { id: "red", width: 80, height: 80, data: generateSolidTexture(80, 80, 255, 0, 0) },
      { id: "green", width: 80, height: 80, data: generateSolidTexture(80, 80, 0, 255, 0) },
      { id: "blue", width: 80, height: 80, data: generateSolidTexture(80, 80, 0, 0, 255) },
    ],
    layers: [
      createLayer("red", { x: 60, y: 60, zIndex: 0 }),
      createLayer("green", { x: 90, y: 90, zIndex: 1 }),
      createLayer("blue", { x: 120, y: 120, zIndex: 2 }),
    ],
  });

  // 4. Reverse z-order (should look identical to above when sorted)
  cases.push({
    name: "z-order-reverse-input",
    description: "Same as above but layers provided in reverse order",
    width: 256,
    height: 256,
    textures: [
      { id: "red", width: 80, height: 80, data: generateSolidTexture(80, 80, 255, 0, 0) },
      { id: "green", width: 80, height: 80, data: generateSolidTexture(80, 80, 0, 255, 0) },
      { id: "blue", width: 80, height: 80, data: generateSolidTexture(80, 80, 0, 0, 255) },
    ],
    layers: [
      createLayer("blue", { x: 120, y: 120, zIndex: 2 }),
      createLayer("green", { x: 90, y: 90, zIndex: 1 }),
      createLayer("red", { x: 60, y: 60, zIndex: 0 }),
    ],
  });

  // ============================================================================
  // Transform Tests
  // ============================================================================

  // 5. Positioned layer
  cases.push({
    name: "transform-position",
    description: "Yellow square positioned at center",
    width: 256,
    height: 256,
    textures: [
      { id: "yellow", width: 60, height: 60, data: generateSolidTexture(60, 60, 255, 255, 0) },
    ],
    layers: [createLayer("yellow", { x: 98, y: 98 })],
  });

  // 6. Scaled layer
  cases.push({
    name: "transform-scale",
    description: "Cyan square scaled to 2x",
    width: 256,
    height: 256,
    textures: [
      { id: "cyan", width: 50, height: 50, data: generateSolidTexture(50, 50, 0, 255, 255) },
    ],
    layers: [createLayer("cyan", { x: 78, y: 78, scaleX: 2, scaleY: 2 })],
  });

  // 7. Rotated layer
  cases.push({
    name: "transform-rotation",
    description: "Magenta rectangle rotated 45 degrees",
    width: 256,
    height: 256,
    textures: [
      { id: "magenta", width: 80, height: 40, data: generateSolidTexture(80, 40, 255, 0, 255) },
    ],
    layers: [createLayer("magenta", { x: 88, y: 108, rotation: 45 })],
  });

  // 8. Combined transforms
  cases.push({
    name: "transform-combined",
    description: "Gradient with scale, rotation, and position",
    width: 256,
    height: 256,
    textures: [
      {
        id: "gradient",
        width: 60,
        height: 60,
        data: generateGradientTexture(60, 60, [255, 100, 0, 255], [100, 0, 255, 255], "diagonal"),
      },
    ],
    layers: [createLayer("gradient", { x: 128, y: 128, scaleX: 1.5, scaleY: 1.5, rotation: 30 })],
  });

  // ============================================================================
  // Effects Tests
  // ============================================================================

  // 9. Opacity effect
  cases.push({
    name: "effect-opacity",
    description: "Red square at 50% opacity over white background",
    width: 256,
    height: 256,
    textures: [
      { id: "white", width: 256, height: 256, data: generateSolidTexture(256, 256, 255, 255, 255) },
      { id: "red", width: 120, height: 120, data: generateSolidTexture(120, 120, 255, 0, 0) },
    ],
    layers: [
      createLayer("white", { zIndex: 0 }),
      createLayer("red", { x: 68, y: 68, opacity: 0.5, zIndex: 1 }),
    ],
  });

  // 10. Brightness effect
  cases.push({
    name: "effect-brightness",
    description: "Scene with increased brightness (1.5x)",
    width: 256,
    height: 256,
    textures: [{ id: "scene", width: 256, height: 256, data: generateSceneTexture(256, 256) }],
    layers: [createLayer("scene", { brightness: 1.5 })],
  });

  // 11. Contrast effect
  cases.push({
    name: "effect-contrast",
    description: "Scene with high contrast (2x)",
    width: 256,
    height: 256,
    textures: [{ id: "scene", width: 256, height: 256, data: generateSceneTexture(256, 256) }],
    layers: [createLayer("scene", { contrast: 2 })],
  });

  // 12. Saturation effect (grayscale)
  cases.push({
    name: "effect-saturation-grayscale",
    description: "Scene in grayscale (saturation 0)",
    width: 256,
    height: 256,
    textures: [{ id: "scene", width: 256, height: 256, data: generateSceneTexture(256, 256) }],
    layers: [createLayer("scene", { saturation: 0 })],
  });

  // 13. Hue rotation
  cases.push({
    name: "effect-hue-rotate",
    description: "Scene with 180 degree hue rotation",
    width: 256,
    height: 256,
    textures: [{ id: "scene", width: 256, height: 256, data: generateSceneTexture(256, 256) }],
    layers: [createLayer("scene", { hueRotate: 180 })],
  });

  // 14. Blur effect
  cases.push({
    name: "effect-blur",
    description: "Checkerboard with blur (5px radius)",
    width: 256,
    height: 256,
    textures: [
      { id: "checker", width: 256, height: 256, data: generateCheckerboardTexture(256, 256, 16) },
    ],
    layers: [createLayer("checker", { blur: 5 })],
  });

  // 15. Combined effects
  cases.push({
    name: "effect-combined",
    description: "Scene with brightness, contrast, and saturation adjustments",
    width: 256,
    height: 256,
    textures: [{ id: "scene", width: 256, height: 256, data: generateSceneTexture(256, 256) }],
    layers: [createLayer("scene", { brightness: 1.2, contrast: 1.3, saturation: 0.7 })],
  });

  // ============================================================================
  // Image + Text Overlay Tests
  // ============================================================================

  // 16. Text over image
  cases.push({
    name: "text-over-image",
    description: "White text overlaid on scene image",
    width: 256,
    height: 256,
    textures: [
      { id: "scene", width: 256, height: 256, data: generateSceneTexture(256, 256) },
      {
        id: "text",
        width: 200,
        height: 80,
        data: generateTextTexture(200, 80, [255, 255, 255, 255], [0, 0, 0, 0]),
      },
    ],
    layers: [
      createLayer("scene", { zIndex: 0 }),
      createLayer("text", { x: 28, y: 168, zIndex: 1 }),
    ],
  });

  // 17. Semi-transparent text background
  cases.push({
    name: "text-with-background",
    description: "Text with semi-transparent black background over image",
    width: 256,
    height: 256,
    textures: [
      { id: "scene", width: 256, height: 256, data: generateSceneTexture(256, 256) },
      { id: "textBg", width: 220, height: 60, data: generateSolidTexture(220, 60, 0, 0, 0, 180) },
      {
        id: "text",
        width: 200,
        height: 40,
        data: generateTextTexture(200, 40, [255, 255, 255, 255], [0, 0, 0, 0]),
      },
    ],
    layers: [
      createLayer("scene", { zIndex: 0 }),
      createLayer("textBg", { x: 18, y: 178, zIndex: 1 }),
      createLayer("text", { x: 28, y: 188, zIndex: 2 }),
    ],
  });

  // ============================================================================
  // Shape Tests
  // ============================================================================

  // 18. Circle shape
  cases.push({
    name: "shape-circle",
    description: "Orange circle on white background",
    width: 256,
    height: 256,
    textures: [
      { id: "white", width: 256, height: 256, data: generateSolidTexture(256, 256, 255, 255, 255) },
      {
        id: "circle",
        width: 100,
        height: 100,
        data: generateShapeTexture(100, 100, "circle", [255, 165, 0, 255]),
      },
    ],
    layers: [
      createLayer("white", { zIndex: 0 }),
      createLayer("circle", { x: 78, y: 78, zIndex: 1 }),
    ],
  });

  // 19. Multiple shapes
  cases.push({
    name: "shapes-multiple",
    description: "Circle, rectangle, and triangle shapes",
    width: 256,
    height: 256,
    textures: [
      { id: "bg", width: 256, height: 256, data: generateSolidTexture(256, 256, 40, 40, 40) },
      {
        id: "circle",
        width: 60,
        height: 60,
        data: generateShapeTexture(60, 60, "circle", [255, 100, 100, 255]),
      },
      {
        id: "rect",
        width: 60,
        height: 60,
        data: generateShapeTexture(60, 60, "rectangle", [100, 255, 100, 255]),
      },
      {
        id: "triangle",
        width: 60,
        height: 60,
        data: generateShapeTexture(60, 60, "triangle", [100, 100, 255, 255]),
      },
    ],
    layers: [
      createLayer("bg", { zIndex: 0 }),
      createLayer("circle", { x: 40, y: 98, zIndex: 1 }),
      createLayer("rect", { x: 98, y: 98, zIndex: 1 }),
      createLayer("triangle", { x: 156, y: 98, zIndex: 1 }),
    ],
  });

  // ============================================================================
  // Complex Composition Tests
  // ============================================================================

  // 20. Video editor-like composition
  cases.push({
    name: "complex-video-editor",
    description: "Main video with picture-in-picture and title overlay",
    width: 256,
    height: 256,
    textures: [
      { id: "mainVideo", width: 256, height: 256, data: generateSceneTexture(256, 256) },
      {
        id: "pipVideo",
        width: 80,
        height: 60,
        data: generateGradientTexture(80, 60, [100, 0, 200, 255], [200, 100, 0, 255], "diagonal"),
      },
      { id: "pipBorder", width: 84, height: 64, data: generateSolidTexture(84, 64, 255, 255, 255) },
      {
        id: "title",
        width: 180,
        height: 30,
        data: generateTextTexture(180, 30, [255, 255, 255, 255], [0, 0, 0, 180]),
      },
    ],
    layers: [
      createLayer("mainVideo", { zIndex: 0 }),
      createLayer("pipBorder", { x: 164, y: 8, zIndex: 1 }),
      createLayer("pipVideo", { x: 166, y: 10, zIndex: 2 }),
      createLayer("title", { x: 38, y: 216, zIndex: 3 }),
    ],
  });

  // 21. Layered composition with effects
  cases.push({
    name: "complex-effects-composition",
    description: "Multiple layers with different effects applied",
    width: 256,
    height: 256,
    textures: [
      {
        id: "bg",
        width: 256,
        height: 256,
        data: generateGradientTexture(256, 256, [30, 30, 60, 255], [60, 30, 30, 255], "vertical"),
      },
      {
        id: "circle1",
        width: 80,
        height: 80,
        data: generateRadialGradientTexture(80, 80, [255, 200, 100, 255], [255, 100, 50, 0]),
      },
      {
        id: "circle2",
        width: 80,
        height: 80,
        data: generateRadialGradientTexture(80, 80, [100, 200, 255, 255], [50, 100, 255, 0]),
      },
      {
        id: "circle3",
        width: 80,
        height: 80,
        data: generateRadialGradientTexture(80, 80, [200, 255, 100, 255], [100, 255, 50, 0]),
      },
    ],
    layers: [
      createLayer("bg", { zIndex: 0 }),
      createLayer("circle1", { x: 48, y: 88, opacity: 0.8, zIndex: 1 }),
      createLayer("circle2", { x: 88, y: 88, opacity: 0.8, zIndex: 2 }),
      createLayer("circle3", { x: 128, y: 88, opacity: 0.8, zIndex: 3 }),
    ],
  });

  // 22. Track-based ordering simulation
  cases.push({
    name: "track-order-simulation",
    description: "Simulates video tracks: Track 3 (top) > Track 2 > Track 1 (bottom)",
    width: 256,
    height: 256,
    textures: [
      {
        id: "track1-bg",
        width: 256,
        height: 256,
        data: generateCheckerboardTexture(256, 256, 32, [100, 100, 100, 255], [80, 80, 80, 255]),
      },
      {
        id: "track2-video",
        width: 200,
        height: 150,
        data: generateSceneTexture(200, 150),
      },
      {
        id: "track3-title",
        width: 180,
        height: 40,
        data: generateTextTexture(180, 40, [255, 255, 0, 255], [0, 0, 0, 200]),
      },
    ],
    layers: [
      createLayer("track1-bg", { zIndex: 0 }), // Track 1 (bottom)
      createLayer("track2-video", { x: 28, y: 53, zIndex: 1 }), // Track 2 (middle)
      createLayer("track3-title", { x: 38, y: 10, zIndex: 2 }), // Track 3 (top)
    ],
  });

  return cases;
}

/**
 * Export test cases for use in tests.
 */
export const visualTestCases = generateVisualTestCases();
