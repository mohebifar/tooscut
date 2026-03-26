/**
 * Core drag hook for the transform overlay.
 *
 * Handles move, resize, and rotate interactions on clips.
 * Uses refs for drag state to avoid re-renders during drag.
 * Updates the store on every mousemove via requestAnimationFrame throttle.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { KeyframeEvaluator, type Transform, type AnimatableProperty } from "@tooscut/render-engine";
import { useVideoEditorStore, type EditorClip } from "../../../state/video-editor-store";
import type { MediaAsset } from "../../timeline/use-asset-store";
import type { DragState, HandlePosition, SnapGuide, SnapTarget } from "./types";
import { getClipDisplayBounds, getEvaluatedLineBox, getEvaluatedShapeBox } from "./bounds";
import { collectSnapTargets, findSnap } from "./snap";

/**
 * For each resize handle, the normalized (0-1) position of the opposite
 * corner/edge that should stay fixed during the resize.
 */
const OPPOSITE_NORMALIZED: Record<string, [number, number]> = {
  nw: [1, 1],
  n: [0.5, 1],
  ne: [0, 1],
  e: [0, 0.5],
  se: [0, 0],
  s: [0.5, 0],
  sw: [1, 0],
  w: [1, 0.5],
};

interface UseTransformDragOptions {
  displayScale: number;
  settings: { width: number; height: number };
  assetMap: Map<string, MediaAsset>;
}

export function useTransformDrag({ displayScale, settings, assetMap }: UseTransformDragOptions) {
  const dragStateRef = useRef<DragState | null>(null);
  const snapTargetsRef = useRef<SnapTarget[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);

  const ctx = { displayScale, settings, assetMap };

  /**
   * Get the evaluated (base + keyframe) transform for a clip at the current time.
   */
  const getEvaluatedTransform = useCallback((clip: EditorClip): Partial<Transform> => {
    if (clip.type === "audio") return {};
    const base = clip.transform ?? {};
    if (!clip.keyframes?.tracks?.length) return base;

    const currentTime = useVideoEditorStore.getState().currentFrame;
    const localTime = currentTime - clip.startTime;
    const evaluator = new KeyframeEvaluator(clip.keyframes);
    const keyframed = evaluator.evaluateTransform(localTime);
    return { ...base, ...keyframed };
  }, []);

  /**
   * Check if a clip has keyframes for a given property.
   */
  const hasKeyframes = useCallback((clip: EditorClip, property: string): boolean => {
    if (!clip.keyframes?.tracks) return false;
    return clip.keyframes.tracks.some((t) => t.property === property);
  }, []);

  /**
   * Map from AnimatableProperty names (camelCase) to Transform field names (snake_case).
   * Keyframe property names use camelCase, but the Transform interface uses snake_case.
   */
  const PROPERTY_TO_TRANSFORM_FIELD: Record<string, keyof Transform> = {
    x: "x",
    y: "y",
    scaleX: "scale_x",
    scaleY: "scale_y",
    rotation: "rotation",
    anchorX: "anchor_x",
    anchorY: "anchor_y",
  };

  /**
   * Update a clip's transform property, using addKeyframe if keyframed.
   */
  const updateTransformProperty = useCallback(
    (clip: EditorClip, property: AnimatableProperty, value: number) => {
      const store = useVideoEditorStore.getState();
      if (hasKeyframes(clip, property)) {
        const localTime = store.currentFrame - clip.startTime;
        store.addKeyframe(clip.id, property, localTime, value);
      } else {
        const field = PROPERTY_TO_TRANSFORM_FIELD[property] ?? property;
        store.updateClipTransform(clip.id, { [field]: value });
      }
    },
    [hasKeyframes],
  );

  /**
   * Update a line clip's box property, using addKeyframe if keyframed.
   */
  const updateLineBoxProperty = useCallback(
    (clip: EditorClip, property: AnimatableProperty, value: number) => {
      const store = useVideoEditorStore.getState();
      if (hasKeyframes(clip, property)) {
        const localTime = store.currentFrame - clip.startTime;
        store.addKeyframe(clip.id, property, localTime, value);
      } else {
        store.updateClipLineBox(clip.id, { [property]: value });
      }
    },
    [hasKeyframes],
  );

  /**
   * Update a shape clip's box property, using addKeyframe if keyframed.
   */
  const updateShapeBoxProperty = useCallback(
    (clip: EditorClip, property: AnimatableProperty, value: number) => {
      const store = useVideoEditorStore.getState();
      if (hasKeyframes(clip, property)) {
        const localTime = store.currentFrame - clip.startTime;
        store.addKeyframe(clip.id, property, localTime, value);
      } else {
        store.updateClipShapeBox(clip.id, { [property]: value });
      }
    },
    [hasKeyframes],
  );

  /**
   * Capture the keyframe-evaluated start box for a line or shape clip.
   */
  const captureStartBoxes = useCallback((clip: EditorClip, currentTime: number) => {
    let startPercentageBox: DragState["startPercentageBox"];
    let startLineBox: DragState["startLineBox"];

    if (clip.type === "text") {
      startPercentageBox = { ...clip.textBox };
    } else if (clip.type === "shape") {
      const evaluated = getEvaluatedShapeBox(clip, currentTime);
      startPercentageBox = { ...evaluated };
    } else if (clip.type === "line") {
      const evaluated = getEvaluatedLineBox(clip, currentTime);
      startLineBox = { ...evaluated };
    }

    return { startPercentageBox, startLineBox };
  }, []);

  const startMove = useCallback(
    (e: React.MouseEvent, clipId: string) => {
      const state = useVideoEditorStore.getState();
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip || clip.type === "audio") return;

      const evaluatedTransform = getEvaluatedTransform(clip);
      const bounds = getClipDisplayBounds(clip, evaluatedTransform, ctx, state.currentFrame);
      if (!bounds) return;

      // Collect snap targets
      const visibleClips = state.getVisibleClipsAtTime(state.currentFrame);
      const transforms = new Map<string, Partial<Transform>>();
      for (const c of visibleClips) {
        if (c.type !== "audio") transforms.set(c.id, getEvaluatedTransform(c));
      }
      snapTargetsRef.current = collectSnapTargets(visibleClips, clipId, transforms, ctx);

      const { startPercentageBox, startLineBox } = captureStartBoxes(clip, state.currentFrame);

      dragStateRef.current = {
        dragType: "move",
        startX: e.clientX,
        startY: e.clientY,
        startTransform: evaluatedTransform,
        startBox: { ...bounds },
        startAngle: 0,
        startRotation: evaluatedTransform.rotation ?? 0,
        clipId,
        clipType: clip.type,
        startPercentageBox,
        startLineBox,
      };

      e.preventDefault();
    },
    [ctx, getEvaluatedTransform, captureStartBoxes],
  );

  const startResize = useCallback(
    (e: React.MouseEvent, clipId: string, handle: HandlePosition) => {
      const state = useVideoEditorStore.getState();
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip || clip.type === "audio") return;

      const evaluatedTransform = getEvaluatedTransform(clip);
      const bounds = getClipDisplayBounds(clip, evaluatedTransform, ctx, state.currentFrame);
      if (!bounds) return;

      const { startPercentageBox, startLineBox } = captureStartBoxes(clip, state.currentFrame);

      dragStateRef.current = {
        dragType: "resize",
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startTransform: evaluatedTransform,
        startBox: { ...bounds },
        startAngle: 0,
        startRotation: evaluatedTransform.rotation ?? 0,
        clipId,
        clipType: clip.type,
        startPercentageBox,
        startLineBox,
      };

      e.preventDefault();
    },
    [ctx, getEvaluatedTransform, captureStartBoxes],
  );

  const startRotate = useCallback(
    (e: React.MouseEvent, clipId: string) => {
      const state = useVideoEditorStore.getState();
      const clip = state.clips.find((c) => c.id === clipId);
      if (!clip || clip.type === "audio") return;

      const evaluatedTransform = getEvaluatedTransform(clip);
      const bounds = getClipDisplayBounds(clip, evaluatedTransform, ctx, state.currentFrame);
      if (!bounds) return;

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      // We need to get canvas rect to convert client coords to display coords
      // The SVG overlay occupies the same space as the canvas
      const svg = (e.target as Element).closest("svg");
      const svgRect = svg?.getBoundingClientRect();
      if (!svgRect) return;

      const mouseDisplayX = e.clientX - svgRect.left;
      const mouseDisplayY = e.clientY - svgRect.top;
      const startAngle = Math.atan2(mouseDisplayY - centerY, mouseDisplayX - centerX);

      dragStateRef.current = {
        dragType: "rotate",
        handle: "rotation",
        startX: e.clientX,
        startY: e.clientY,
        startTransform: evaluatedTransform,
        startBox: { ...bounds },
        startAngle,
        startRotation: evaluatedTransform.rotation ?? 0,
        clipId,
        clipType: clip.type,
      };

      e.preventDefault();
    },
    [ctx, getEvaluatedTransform],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      if (rafIdRef.current !== null) return;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const d = dragStateRef.current;
        if (!d) return;

        const state = useVideoEditorStore.getState();
        const clip = state.clips.find((c) => c.id === d.clipId);
        if (!clip) return;

        if (d.dragType === "move") {
          handleMove(e, d, clip);
        } else if (d.dragType === "resize") {
          handleResize(e, d, clip);
        } else if (d.dragType === "rotate") {
          handleRotate(e, d, clip);
        }
      });
    };

    const handleMouseUp = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      dragStateRef.current = null;
      snapTargetsRef.current = [];
      setActiveGuides([]);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [displayScale, settings, assetMap]);

  const handleMove = (e: MouseEvent, drag: DragState, clip: EditorClip) => {
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.clipType === "line") {
      const pctDx = (dx / displayScale / settings.width) * 100;
      const pctDy = (dy / displayScale / settings.height) * 100;

      const startBox = drag.startLineBox!;
      updateLineBoxProperty(clip, "x1", startBox.x1 + pctDx);
      updateLineBoxProperty(clip, "y1", startBox.y1 + pctDy);
      updateLineBoxProperty(clip, "x2", startBox.x2 + pctDx);
      updateLineBoxProperty(clip, "y2", startBox.y2 + pctDy);
      return;
    }

    if (drag.clipType === "text" || drag.clipType === "shape") {
      // Convert screen delta to percentage
      const pctDx = (dx / displayScale / settings.width) * 100;
      const pctDy = (dy / displayScale / settings.height) * 100;

      const startBox = drag.startPercentageBox!;
      let newX = startBox.x + pctDx;
      let newY = startBox.y + pctDy;

      // Snap for text/shape: convert current edges to project space, snap, convert back
      const projLeft = (newX / 100) * settings.width;
      const projTop = (newY / 100) * settings.height;
      const projRight = projLeft + (startBox.width / 100) * settings.width;
      const projBottom = projTop + (startBox.height / 100) * settings.height;
      const projCenterX = (projLeft + projRight) / 2;
      const projCenterY = (projTop + projBottom) / 2;

      const snap = findSnap(
        {
          left: projLeft,
          right: projRight,
          top: projTop,
          bottom: projBottom,
          centerX: projCenterX,
          centerY: projCenterY,
        },
        snapTargetsRef.current,
        displayScale,
      );

      newX += (snap.x / settings.width) * 100;
      newY += (snap.y / settings.height) * 100;
      setActiveGuides(snap.guides);

      if (clip.type === "text") {
        const store = useVideoEditorStore.getState();
        store.updateClipTextBox(clip.id, { x: newX, y: newY });
      } else if (clip.type === "shape") {
        updateShapeBoxProperty(clip, "x", newX);
        updateShapeBoxProperty(clip, "y", newY);
      }
    } else {
      // Media clip (video/image) — update transform x/y
      const projectDx = dx / displayScale;
      const projectDy = dy / displayScale;

      let newX = (drag.startTransform.x ?? settings.width / 2) + projectDx;
      let newY = (drag.startTransform.y ?? settings.height / 2) + projectDy;

      // Get current edges for snapping
      const asset = assetMap.get((clip as { assetId: string }).assetId);
      if (asset?.width && asset?.height) {
        const scaleX = drag.startTransform.scale_x ?? 1;
        const scaleY = drag.startTransform.scale_y ?? 1;
        const anchorX = drag.startTransform.anchor_x ?? 0.5;
        const anchorY = drag.startTransform.anchor_y ?? 0.5;
        const layerW = asset.width * scaleX;
        const layerH = asset.height * scaleY;

        const left = newX - anchorX * layerW;
        const top = newY - anchorY * layerH;
        const right = left + layerW;
        const bottom = top + layerH;
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;

        const snap = findSnap(
          { left, right, top, bottom, centerX, centerY },
          snapTargetsRef.current,
          displayScale,
        );

        newX += snap.x;
        newY += snap.y;
        setActiveGuides(snap.guides);
      }

      updateTransformProperty(clip, "x", newX);
      updateTransformProperty(clip, "y", newY);
    }
  };

  const handleResize = (e: MouseEvent, drag: DragState, clip: EditorClip) => {
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const handle = drag.handle!;

    if (drag.clipType === "line" && (handle === "p1" || handle === "p2")) {
      const pctDx = (dx / displayScale / settings.width) * 100;
      const pctDy = (dy / displayScale / settings.height) * 100;
      const startBox = drag.startLineBox!;

      if (handle === "p1") {
        updateLineBoxProperty(clip, "x1", startBox.x1 + pctDx);
        updateLineBoxProperty(clip, "y1", startBox.y1 + pctDy);
      } else {
        updateLineBoxProperty(clip, "x2", startBox.x2 + pctDx);
        updateLineBoxProperty(clip, "y2", startBox.y2 + pctDy);
      }
      return;
    }

    if (drag.clipType === "text" || drag.clipType === "shape") {
      const startBox = drag.startPercentageBox!;
      const pctDx = (dx / displayScale / settings.width) * 100;
      const pctDy = (dy / displayScale / settings.height) * 100;

      let newX = startBox.x;
      let newY = startBox.y;
      let newW = startBox.width;
      let newH = startBox.height;

      // Horizontal resize
      if (handle.includes("w")) {
        newX = startBox.x + pctDx;
        newW = startBox.width - pctDx;
      } else if (handle.includes("e")) {
        newW = startBox.width + pctDx;
      }

      // Vertical resize
      if (handle.includes("n")) {
        newY = startBox.y + pctDy;
        newH = startBox.height - pctDy;
      } else if (handle.includes("s")) {
        newH = startBox.height + pctDy;
      }

      // Enforce minimum size
      if (newW < 1) {
        newW = 1;
        newX = startBox.x + startBox.width - 1;
      }
      if (newH < 1) {
        newH = 1;
        newY = startBox.y + startBox.height - 1;
      }

      if (clip.type === "text") {
        const store = useVideoEditorStore.getState();
        store.updateClipTextBox(clip.id, { x: newX, y: newY, width: newW, height: newH });
      } else if (clip.type === "shape") {
        updateShapeBoxProperty(clip, "x", newX);
        updateShapeBoxProperty(clip, "y", newY);
        updateShapeBoxProperty(clip, "width", newW);
        updateShapeBoxProperty(clip, "height", newH);
      }
    } else {
      // Media clip — update scale + position to keep opposite edge/corner fixed
      const asset = assetMap.get((clip as { assetId: string }).assetId);
      if (!asset?.width || !asset?.height) return;

      const startScaleX = drag.startTransform.scale_x ?? 1;
      const startScaleY = drag.startTransform.scale_y ?? 1;

      // Convert screen dx/dy to scale delta
      const scaleDx = dx / displayScale / asset.width;
      const scaleDy = dy / displayScale / asset.height;

      let newScaleX = startScaleX;
      let newScaleY = startScaleY;

      if (handle.includes("e")) {
        newScaleX = startScaleX + scaleDx;
      } else if (handle.includes("w")) {
        newScaleX = startScaleX - scaleDx;
      }

      if (handle.includes("s")) {
        newScaleY = startScaleY + scaleDy;
      } else if (handle.includes("n")) {
        newScaleY = startScaleY - scaleDy;
      }

      // Shift constrains aspect ratio
      if (e.shiftKey) {
        const avgScale = (newScaleX + newScaleY) / 2;
        const ratio = startScaleX / startScaleY;
        if (handle === "n" || handle === "s") {
          newScaleX = newScaleY * ratio;
        } else if (handle === "e" || handle === "w") {
          newScaleY = newScaleX / ratio;
        } else {
          // Corner handle
          newScaleX = avgScale * Math.sqrt(ratio);
          newScaleY = avgScale / Math.sqrt(ratio);
        }
      }

      // Enforce minimum scale
      newScaleX = Math.max(0.01, newScaleX);
      newScaleY = Math.max(0.01, newScaleY);

      // Compute position adjustment to keep the opposite edge/corner fixed.
      // The compositor transform chain: anchor-to-origin → scale → rotate → translate.
      // To keep the opposite point stationary after scale change, we solve for the
      // new position that places it at the same canvas location.
      const anchorX = drag.startTransform.anchor_x ?? 0.5;
      const anchorY = drag.startTransform.anchor_y ?? 0.5;
      const opposite = OPPOSITE_NORMALIZED[handle];
      // Distance from anchor to fixed point in raw asset pixels
      const fpRelX = (opposite[0] - anchorX) * asset.width;
      const fpRelY = (opposite[1] - anchorY) * asset.height;

      const rotRad = (drag.startRotation * Math.PI) / 180;
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      const dsx = newScaleX - startScaleX;
      const dsy = newScaleY - startScaleY;

      const startPosX = drag.startTransform.x ?? settings.width / 2;
      const startPosY = drag.startTransform.y ?? settings.height / 2;

      // Position offset derived from: fixed_point_canvas = pos + R * S * (fp - anchor)
      // Setting equal before/after: new_pos = old_pos + R * (old_S - new_S) * (fp - anchor)
      const newPosX = startPosX - cosR * dsx * fpRelX - sinR * dsy * fpRelY;
      const newPosY = startPosY + sinR * dsx * fpRelX - cosR * dsy * fpRelY;

      updateTransformProperty(clip, "scaleX", newScaleX);
      updateTransformProperty(clip, "scaleY", newScaleY);
      updateTransformProperty(clip, "x", newPosX);
      updateTransformProperty(clip, "y", newPosY);
    }
  };

  const handleRotate = (e: MouseEvent, drag: DragState, _clip: EditorClip) => {
    const bounds = drag.startBox;
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    const svg = document.querySelector("[data-transform-overlay]");
    const svgRect = svg?.getBoundingClientRect();
    if (!svgRect) return;

    const mouseDisplayX = e.clientX - svgRect.left;
    const mouseDisplayY = e.clientY - svgRect.top;
    const currentAngle = Math.atan2(mouseDisplayY - centerY, mouseDisplayX - centerX);

    const deltaAngle = currentAngle - drag.startAngle;
    // Convert radians to degrees. Negate because atan2 is CCW-positive
    // but the compositor convention is clockwise-positive.
    let newRotation = drag.startRotation - (deltaAngle * 180) / Math.PI;

    // Shift snaps to 15-degree increments
    if (e.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15;
    }

    const store = useVideoEditorStore.getState();
    const clip = store.clips.find((c) => c.id === drag.clipId);
    if (!clip) return;

    updateTransformProperty(clip, "rotation", newRotation);
  };

  return {
    activeGuides,
    isDragging: dragStateRef.current !== null,
    startMove,
    startResize,
    startRotate,
  };
}
