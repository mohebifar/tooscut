/**
 * Compute display-space bounding boxes for clips.
 *
 * Matches the compositor's coordinate system:
 * - Media clips: (x, y) is where the anchor lands in canvas space.
 *   With default anchor (0.5, 0.5), (x, y) is the center.
 *   Layer size = assetWidth * scale_x, assetHeight * scale_y.
 * - Text/shape clips: box is percentage-based (0-100 mapped to canvas).
 */

import {
  KeyframeEvaluator,
  type Transform,
  type ShapeBox,
  type LineBox,
} from "@tooscut/render-engine";
import type { EditorClip, TextClip, ShapeClip, LineClip } from "../../../state/video-editor-store";
import type { MediaAsset } from "../../timeline/use-asset-store";
import type { DisplayBounds } from "./types";

interface BoundsContext {
  displayScale: number;
  settings: { width: number; height: number };
  assetMap: Map<string, MediaAsset>;
}

/**
 * Compute the display-space bounding box for a clip at its evaluated transform.
 * Returns null for audio clips or clips without sufficient data.
 * When currentTime is provided, keyframe-evaluated box values are used for shapes/lines.
 */
export function getClipDisplayBounds(
  clip: EditorClip,
  evaluatedTransform: Partial<Transform>,
  ctx: BoundsContext,
  currentTime?: number,
): DisplayBounds | null {
  if (clip.type === "audio") return null;

  if (clip.type === "text") {
    return getTextClipBounds(clip, ctx);
  }

  if (clip.type === "shape") {
    return getShapeClipBounds(clip, ctx, currentTime);
  }

  if (clip.type === "line") {
    return getLineClipBounds(clip, ctx, currentTime);
  }

  // Video or image clip
  return getMediaClipBounds(clip, evaluatedTransform, ctx);
}

function getMediaClipBounds(
  clip: EditorClip,
  transform: Partial<Transform>,
  ctx: BoundsContext,
): DisplayBounds | null {
  if (clip.type !== "video" && clip.type !== "image") return null;

  const asset = ctx.assetMap.get(clip.assetId);
  if (!asset?.width || !asset?.height) return null;

  const x = transform.x ?? ctx.settings.width / 2;
  const y = transform.y ?? ctx.settings.height / 2;
  const scaleX = transform.scale_x ?? 1;
  const scaleY = transform.scale_y ?? 1;
  const anchorX = transform.anchor_x ?? 0.5;
  const anchorY = transform.anchor_y ?? 0.5;

  const layerW = asset.width * scaleX;
  const layerH = asset.height * scaleY;

  // The anchor point is at (x, y) in canvas space.
  // Top-left of the layer = (x - anchorX * layerW, y - anchorY * layerH)
  const canvasX = x - anchorX * layerW;
  const canvasY = y - anchorY * layerH;

  return {
    x: canvasX * ctx.displayScale,
    y: canvasY * ctx.displayScale,
    width: layerW * ctx.displayScale,
    height: layerH * ctx.displayScale,
  };
}

function getTextClipBounds(clip: TextClip, ctx: BoundsContext): DisplayBounds {
  const box = clip.textBox;
  // TextBox values are percentages (0-100)
  return {
    x: (box.x / 100) * ctx.settings.width * ctx.displayScale,
    y: (box.y / 100) * ctx.settings.height * ctx.displayScale,
    width: (box.width / 100) * ctx.settings.width * ctx.displayScale,
    height: (box.height / 100) * ctx.settings.height * ctx.displayScale,
  };
}

function getShapeClipBounds(
  clip: ShapeClip,
  ctx: BoundsContext,
  currentTime?: number,
): DisplayBounds {
  const box = getEvaluatedShapeBox(clip, currentTime);
  return {
    x: (box.x / 100) * ctx.settings.width * ctx.displayScale,
    y: (box.y / 100) * ctx.settings.height * ctx.displayScale,
    width: (box.width / 100) * ctx.settings.width * ctx.displayScale,
    height: (box.height / 100) * ctx.settings.height * ctx.displayScale,
  };
}

/** Minimum bounding box size in display pixels for line clips */
const MIN_LINE_BOUNDS = 16;

function getLineClipBounds(
  clip: LineClip,
  ctx: BoundsContext,
  currentTime?: number,
): DisplayBounds {
  const box = getEvaluatedLineBox(clip, currentTime);
  const dx1 = (box.x1 / 100) * ctx.settings.width * ctx.displayScale;
  const dy1 = (box.y1 / 100) * ctx.settings.height * ctx.displayScale;
  const dx2 = (box.x2 / 100) * ctx.settings.width * ctx.displayScale;
  const dy2 = (box.y2 / 100) * ctx.settings.height * ctx.displayScale;

  const minX = Math.min(dx1, dx2);
  const minY = Math.min(dy1, dy2);
  const maxX = Math.max(dx1, dx2);
  const maxY = Math.max(dy1, dy2);

  // Ensure minimum bounds so the line is always clickable
  let w = maxX - minX;
  let h = maxY - minY;
  let x = minX;
  let y = minY;

  if (w < MIN_LINE_BOUNDS) {
    const pad = (MIN_LINE_BOUNDS - w) / 2;
    x -= pad;
    w = MIN_LINE_BOUNDS;
  }
  if (h < MIN_LINE_BOUNDS) {
    const pad = (MIN_LINE_BOUNDS - h) / 2;
    y -= pad;
    h = MIN_LINE_BOUNDS;
  }

  return { x, y, width: w, height: h };
}

/**
 * Get the display-space positions of a line clip's endpoints.
 * Uses keyframe-evaluated values when currentTime is provided.
 */
export function getLineEndpointDisplayPositions(
  clip: LineClip,
  ctx: BoundsContext,
  currentTime?: number,
): { p1: { x: number; y: number }; p2: { x: number; y: number } } {
  const box = getEvaluatedLineBox(clip, currentTime);
  return {
    p1: {
      x: (box.x1 / 100) * ctx.settings.width * ctx.displayScale,
      y: (box.y1 / 100) * ctx.settings.height * ctx.displayScale,
    },
    p2: {
      x: (box.x2 / 100) * ctx.settings.width * ctx.displayScale,
      y: (box.y2 / 100) * ctx.settings.height * ctx.displayScale,
    },
  };
}

// ============================================================================
// Keyframe-evaluated box helpers
// ============================================================================

/**
 * Get the keyframe-evaluated shape box. Falls back to base values for
 * properties without keyframes.
 */
export function getEvaluatedShapeBox(clip: ShapeClip, currentTime?: number): ShapeBox {
  const base = clip.shapeBox;
  if (currentTime == null || !clip.keyframes?.tracks?.length) return base;

  const localTime = currentTime - clip.startTime;
  const evaluator = new KeyframeEvaluator(clip.keyframes);
  const ex = evaluator.evaluate("x", localTime);
  const ey = evaluator.evaluate("y", localTime);
  const ew = evaluator.evaluate("width", localTime);
  const eh = evaluator.evaluate("height", localTime);

  if (Number.isNaN(ex) && Number.isNaN(ey) && Number.isNaN(ew) && Number.isNaN(eh)) return base;

  return {
    x: Number.isNaN(ex) ? base.x : ex,
    y: Number.isNaN(ey) ? base.y : ey,
    width: Number.isNaN(ew) ? base.width : ew,
    height: Number.isNaN(eh) ? base.height : eh,
  };
}

/**
 * Get the keyframe-evaluated line box. Falls back to base values for
 * properties without keyframes.
 */
export function getEvaluatedLineBox(clip: LineClip, currentTime?: number): LineBox {
  const base = clip.lineBox;
  if (currentTime == null || !clip.keyframes?.tracks?.length) return base;

  const localTime = currentTime - clip.startTime;
  const evaluator = new KeyframeEvaluator(clip.keyframes);
  const ex1 = evaluator.evaluate("x1", localTime);
  const ey1 = evaluator.evaluate("y1", localTime);
  const ex2 = evaluator.evaluate("x2", localTime);
  const ey2 = evaluator.evaluate("y2", localTime);

  if (Number.isNaN(ex1) && Number.isNaN(ey1) && Number.isNaN(ex2) && Number.isNaN(ey2)) return base;

  return {
    x1: Number.isNaN(ex1) ? base.x1 : ex1,
    y1: Number.isNaN(ey1) ? base.y1 : ey1,
    x2: Number.isNaN(ex2) ? base.x2 : ex2,
    y2: Number.isNaN(ey2) ? base.y2 : ey2,
  };
}

/**
 * Get the project-space center of a clip's bounding box.
 * Used for snap target collection.
 */
export function getClipProjectCenter(
  clip: EditorClip,
  evaluatedTransform: Partial<Transform>,
  ctx: BoundsContext,
): { x: number; y: number } | null {
  const bounds = getClipDisplayBounds(clip, evaluatedTransform, ctx);
  if (!bounds) return null;
  return {
    x: (bounds.x + bounds.width / 2) / ctx.displayScale,
    y: (bounds.y + bounds.height / 2) / ctx.displayScale,
  };
}

/**
 * Get the project-space edges of a clip's bounding box.
 */
export function getClipProjectEdges(
  clip: EditorClip,
  evaluatedTransform: Partial<Transform>,
  ctx: BoundsContext,
): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
} | null {
  const bounds = getClipDisplayBounds(clip, evaluatedTransform, ctx);
  if (!bounds) return null;
  const s = ctx.displayScale;
  return {
    left: bounds.x / s,
    right: (bounds.x + bounds.width) / s,
    top: bounds.y / s,
    bottom: (bounds.y + bounds.height) / s,
    centerX: (bounds.x + bounds.width / 2) / s,
    centerY: (bounds.y + bounds.height / 2) / s,
  };
}
