/**
 * Transform overlay for the preview panel.
 *
 * Renders an SVG overlay on top of the WebGPU canvas that provides:
 * - Click-to-select for visible clips
 * - Bounding box + handles for selected clips
 * - Snap guides during drag
 * - Move, resize, and rotate interactions
 */

import { useCallback, useMemo } from "react";
import { KeyframeEvaluator, type Transform } from "@tooscut/render-engine";
import { useVideoEditorStore, type EditorClip } from "../../../state/video-editor-store";
import { useAssetStore, type MediaAsset } from "../../timeline/use-asset-store";
import { getClipDisplayBounds } from "./bounds";
import { HandleRenderer, LineHandleRenderer } from "./handle-renderer";
import { ClickableAreas } from "./clickable-areas";
import { GuideRenderer } from "./guide-renderer";
import { useTransformDrag } from "./use-transform-drag";
import type { HandlePosition, DisplayBounds } from "./types";

interface TransformOverlayProps {
  displayWidth: number;
  displayHeight: number;
}

export function TransformOverlay({ displayWidth, displayHeight }: TransformOverlayProps) {
  const settings = useVideoEditorStore((s) => s.settings);
  const clips = useVideoEditorStore((s) => s.clips);
  const currentTime = useVideoEditorStore((s) => s.currentFrame);
  const selectedClipIds = useVideoEditorStore((s) => s.selectedClipIds);
  const setSelectedClipIds = useVideoEditorStore((s) => s.setSelectedClipIds);
  const tracks = useVideoEditorStore((s) => s.tracks);

  const assets = useAssetStore((s) => s.assets);
  const assetMap = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const asset of assets) {
      map.set(asset.id, asset);
    }
    return map;
  }, [assets]);

  const displayScale = settings.width > 0 ? displayWidth / settings.width : 1;

  const { activeGuides, startMove, startResize, startRotate } = useTransformDrag({
    displayScale,
    settings,
    assetMap,
  });

  /**
   * Get the evaluated transform for a clip at the current time.
   */
  const getEvaluatedTransform = useCallback(
    (clip: EditorClip): Partial<Transform> => {
      if (clip.type === "audio") return {};
      const base = clip.transform ?? {};
      if (!clip.keyframes?.tracks?.length) return base;

      const localTime = currentTime - clip.startTime;
      const evaluator = new KeyframeEvaluator(clip.keyframes);
      const keyframed = evaluator.evaluateTransform(localTime);
      return { ...base, ...keyframed };
    },
    [currentTime],
  );

  // Get visible clips (non-audio, on non-muted tracks, at current time)
  const mutedTrackIds = useMemo(
    () => new Set(tracks.filter((t) => t.muted).map((t) => t.id)),
    [tracks],
  );

  const visibleItems = useMemo(() => {
    const items: { clipId: string; bounds: DisplayBounds; rotation: number; clip: EditorClip }[] =
      [];

    const ctx = { displayScale, settings, assetMap };

    for (const clip of clips) {
      if (clip.type === "audio") continue;
      if (mutedTrackIds.has(clip.trackId)) continue;
      if (currentTime < clip.startTime || currentTime >= clip.startTime + clip.duration) continue;

      const transform = getEvaluatedTransform(clip);
      const bounds = getClipDisplayBounds(clip, transform, ctx, currentTime);
      if (!bounds) continue;

      const rotation = transform.rotation ?? 0;
      items.push({ clipId: clip.id, bounds, rotation, clip });
    }

    return items;
  }, [clips, currentTime, displayScale, settings, assetMap, mutedTrackIds, getEvaluatedTransform]);

  const handleSelect = useCallback(
    (clipId: string) => {
      setSelectedClipIds([clipId]);
    },
    [setSelectedClipIds],
  );

  const handleDeselect = useCallback(() => {
    setSelectedClipIds([]);
  }, [setSelectedClipIds]);

  const handleResizeOrRotateStart = useCallback(
    (e: React.MouseEvent, clipId: string, handle: HandlePosition) => {
      if (handle === "rotation") {
        startRotate(e, clipId);
      } else {
        startResize(e, clipId, handle);
      }
    },
    [startResize, startRotate],
  );

  // Selected items with their bounds
  const selectedItems = useMemo(() => {
    return visibleItems.filter((item) => selectedClipIds.includes(item.clipId));
  }, [visibleItems, selectedClipIds]);

  return (
    <svg
      data-transform-overlay
      className="absolute inset-0"
      width={displayWidth}
      height={displayHeight}
      overflow="visible"
      onMouseDown={(e) => {
        // Click on empty space deselects
        if (e.target === e.currentTarget) {
          handleDeselect();
        }
      }}
    >
      {/* Snap guides */}
      <GuideRenderer
        guides={activeGuides}
        displayWidth={displayWidth}
        displayHeight={displayHeight}
      />

      {/* Clickable areas for non-selected clips */}
      <ClickableAreas
        items={visibleItems}
        selectedClipIds={selectedClipIds}
        onSelect={handleSelect}
      />

      {/* Handle renderers for selected clips */}
      {selectedItems.map((item) => {
        if (item.clip.type === "line") {
          return (
            <LineHandleRenderer
              key={item.clipId}
              clip={item.clip}
              displayScale={displayScale}
              settings={settings}
              currentTime={currentTime}
              onEndpointDragStart={(e, handle) => handleResizeOrRotateStart(e, item.clipId, handle)}
              onMoveDragStart={(e) => startMove(e, item.clipId)}
            />
          );
        }

        const supportsRotation = item.clip.type === "video" || item.clip.type === "image";
        return (
          <HandleRenderer
            key={item.clipId}
            bounds={item.bounds}
            rotation={item.rotation}
            showRotation={supportsRotation}
            onDragStart={(e, handle) => handleResizeOrRotateStart(e, item.clipId, handle)}
            onMoveDragStart={(e) => startMove(e, item.clipId)}
          />
        );
      })}
    </svg>
  );
}
