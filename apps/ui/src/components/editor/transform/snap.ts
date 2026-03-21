/**
 * Snapping system for transform overlay.
 *
 * Collects snap targets from canvas center/edges and other visible clips,
 * then finds the nearest snap and generates visual guides.
 */

import type { Transform } from "@tooscut/render-engine";
import type { EditorClip } from "../../../state/video-editor-store";
import type { MediaAsset } from "../../timeline/use-asset-store";
import type { SnapTarget, SnapGuide } from "./types";
import { getClipProjectEdges } from "./bounds";

/** Snap threshold in project pixels */
const SNAP_THRESHOLD = 8;

interface SnapContext {
  displayScale: number;
  settings: { width: number; height: number };
  assetMap: Map<string, MediaAsset>;
}

/**
 * Collect all snap targets (canvas + other clips).
 * Call once at drag start and cache for the drag session.
 */
export function collectSnapTargets(
  visibleClips: EditorClip[],
  draggedClipId: string,
  evaluatedTransforms: Map<string, Partial<Transform>>,
  ctx: SnapContext,
): SnapTarget[] {
  const targets: SnapTarget[] = [];
  const { width, height } = ctx.settings;

  // Canvas center
  targets.push({ value: width / 2, axis: "x", source: "canvas-center" });
  targets.push({ value: height / 2, axis: "y", source: "canvas-center" });

  // Canvas edges
  targets.push({ value: 0, axis: "x", source: "canvas-edge" });
  targets.push({ value: width, axis: "x", source: "canvas-edge" });
  targets.push({ value: 0, axis: "y", source: "canvas-edge" });
  targets.push({ value: height, axis: "y", source: "canvas-edge" });

  // Other visible clips' bounds
  for (const clip of visibleClips) {
    if (clip.id === draggedClipId || clip.type === "audio") continue;

    const transform = evaluatedTransforms.get(clip.id) ?? {};
    const edges = getClipProjectEdges(clip, transform, ctx);
    if (!edges) continue;

    targets.push({ value: edges.left, axis: "x", source: `clip-${clip.id}` });
    targets.push({ value: edges.right, axis: "x", source: `clip-${clip.id}` });
    targets.push({ value: edges.centerX, axis: "x", source: `clip-${clip.id}` });
    targets.push({ value: edges.top, axis: "y", source: `clip-${clip.id}` });
    targets.push({ value: edges.bottom, axis: "y", source: `clip-${clip.id}` });
    targets.push({ value: edges.centerY, axis: "y", source: `clip-${clip.id}` });
  }

  return targets;
}

interface SnapResult {
  /** Snapped position in project coords */
  x: number;
  y: number;
  /** Visual guides to render */
  guides: SnapGuide[];
}

/**
 * Find nearest snap for a moving clip given its proposed project-space edges.
 */
export function findSnap(
  proposedEdges: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    centerX: number;
    centerY: number;
  },
  targets: SnapTarget[],
  displayScale: number,
): SnapResult {
  const threshold = SNAP_THRESHOLD / displayScale;

  let bestSnapX: { delta: number; target: number } | null = null;
  let bestSnapY: { delta: number; target: number } | null = null;

  const xChecks = [proposedEdges.left, proposedEdges.centerX, proposedEdges.right];
  const yChecks = [proposedEdges.top, proposedEdges.centerY, proposedEdges.bottom];

  for (const target of targets) {
    if (target.axis === "x") {
      for (const check of xChecks) {
        const delta = target.value - check;
        if (Math.abs(delta) < threshold) {
          if (!bestSnapX || Math.abs(delta) < Math.abs(bestSnapX.delta)) {
            bestSnapX = { delta, target: target.value };
          }
        }
      }
    } else {
      for (const check of yChecks) {
        const delta = target.value - check;
        if (Math.abs(delta) < threshold) {
          if (!bestSnapY || Math.abs(delta) < Math.abs(bestSnapY.delta)) {
            bestSnapY = { delta, target: target.value };
          }
        }
      }
    }
  }

  const guides: SnapGuide[] = [];
  const x = bestSnapX ? bestSnapX.delta : 0;
  const y = bestSnapY ? bestSnapY.delta : 0;

  if (bestSnapX) {
    guides.push({
      type: "vertical",
      position: bestSnapX.target * displayScale,
    });
  }

  if (bestSnapY) {
    guides.push({
      type: "horizontal",
      position: bestSnapY.target * displayScale,
    });
  }

  return { x, y, guides };
}
