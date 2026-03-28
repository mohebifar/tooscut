import React from "react";
import { Group, Rect } from "react-konva";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { CLIP_PADDING, TRACK_HEIGHT } from "./constants";
import { TimelineTrack } from "./types";

interface CrossTransitionOverlaysProps {
  crossTransitions: ReturnType<typeof useVideoEditorStore.getState>["crossTransitions"];
  clips: ReturnType<typeof useVideoEditorStore.getState>["clips"];
  allTracks: TimelineTrack[];
  frameToX: (frame: number) => number;
  trackIndexToY: (index: number) => number;
  zoom: number;
  crossTransitionHover: string | null;
  crossTransitionResizePreview: {
    transitionId: string;
    duration: number;
    overlapStart: number;
    overlapEnd: number;
  } | null;
}

export const CrossTransitionOverlays = React.memo(function CrossTransitionOverlays({
  crossTransitions,
  clips,
  allTracks,
  frameToX,
  trackIndexToY,
  zoom,
  crossTransitionHover,
  crossTransitionResizePreview,
}: CrossTransitionOverlaysProps) {
  const selectedCrossTransition = useVideoEditorStore((s) => s.selectedCrossTransition);
  return (
    <>
      {crossTransitions.map((ct) => {
        const outgoing = clips.find((c) => c.id === ct.outgoingClipId);
        const incoming = clips.find((c) => c.id === ct.incomingClipId);
        if (!outgoing || !incoming) return null;
        const trackIndex = allTracks.findIndex((t) => t.fullId === outgoing.trackId);
        if (trackIndex === -1) return null;

        // Use actual clip overlap region for positioning.
        // During resize preview, use the projected overlap from the preview state.
        const isResizing = crossTransitionResizePreview?.transitionId === ct.id;
        const overlapStart = isResizing
          ? crossTransitionResizePreview.overlapStart
          : incoming.startTime;
        const overlapEnd = isResizing
          ? crossTransitionResizePreview.overlapEnd
          : outgoing.startTime + outgoing.duration;
        const ctX = frameToX(overlapStart);
        const ctWidth = (overlapEnd - overlapStart) * zoom;
        const ctY = trackIndexToY(trackIndex) + CLIP_PADDING;
        const ctHeight = TRACK_HEIGHT - CLIP_PADDING * 2;
        const isSelected = selectedCrossTransition === ct.id;
        const isHovered = crossTransitionHover === ct.id;

        // Find linked audio track for the overlay
        const outgoingLinkedId = outgoing.linkedClipId;
        const audioTrackIndex =
          outgoingLinkedId != null
            ? (() => {
                const linkedClip = clips.find(
                  (c) => c.id === outgoingLinkedId || c.linkedClipId === outgoing.id,
                );
                if (!linkedClip) return -1;
                return allTracks.findIndex((t) => t.fullId === linkedClip.trackId);
              })()
            : -1;

        return (
          <Group key={ct.id}>
            {/* Video track overlay */}
            <Rect
              x={ctX}
              y={ctY}
              width={ctWidth}
              height={ctHeight}
              fill="rgba(168, 85, 247, 0.45)"
              stroke={isSelected ? "#ffffff" : "rgba(168, 85, 247, 0.6)"}
              strokeWidth={isSelected ? 2 : 1}
              cornerRadius={4}
              listening={false}
            />
            {/* Left resize handle */}
            {(isHovered || isSelected) && (
              <Rect
                x={ctX}
                y={ctY + 4}
                width={2}
                height={ctHeight - 8}
                fill="#fff"
                opacity={0.8}
                listening={false}
              />
            )}
            {/* Right resize handle */}
            {(isHovered || isSelected) && (
              <Rect
                x={ctX + ctWidth - 2}
                y={ctY + 4}
                width={2}
                height={ctHeight - 8}
                fill="#fff"
                opacity={0.8}
                listening={false}
              />
            )}
            {/* Audio track overlay (cross-fade) */}
            {audioTrackIndex !== -1 && (
              <Rect
                x={ctX}
                y={trackIndexToY(audioTrackIndex) + CLIP_PADDING}
                width={ctWidth}
                height={ctHeight}
                fill="rgba(168, 85, 247, 0.35)"
                stroke={isSelected ? "#ffffff" : "rgba(168, 85, 247, 0.4)"}
                strokeWidth={isSelected ? 2 : 1}
                cornerRadius={4}
                listening={false}
              />
            )}
          </Group>
        );
      })}
    </>
  );
});
