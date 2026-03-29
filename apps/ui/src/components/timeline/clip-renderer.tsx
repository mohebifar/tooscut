import React from "react";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { ClipNode, type ClipNodeProps } from "./clip-node";
import { TimelineTrack } from "./types";

export interface ClipRendererProps {
  clips: ReturnType<typeof useVideoEditorStore.getState>["clips"];
  allTracks: TimelineTrack[];
  /** Only render clips on tracks of this type (for split video/audio sections) */
  section?: "video" | "audio";
  dragPreview: {
    clipId: string;
    x: number;
    y: number;
    trackIndex: number;
    linkedClipId?: string;
    linkedX?: number;
    linkedY?: number;
    linkedTrackIndex?: number;
    isMulti?: boolean;
    multiClips?: Array<{
      clipId: string;
      x: number;
      y: number;
      trackIndex: number;
    }>;
  } | null;
  trimPreview: {
    clipId: string;
    startTime: number;
    duration: number;
    inPoint?: number;
    linkedClipId?: string;
    linkedTrackIndex?: number;
    isMulti?: boolean;
    multiClips?: Array<{
      clipId: string;
      startTime: number;
      duration: number;
      inPoint?: number;
      trackIndex: number;
      linkedClipId?: string;
      linkedTrackIndex?: number;
    }>;
  } | null;
  buildClipNodeProps: (
    clip: ReturnType<typeof useVideoEditorStore.getState>["clips"][0],
    trackIndex: number,
    opts?: {
      isGhost?: boolean;
      overrideStartTime?: number;
      overrideDuration?: number;
      overrideInPoint?: number;
      overrideTrackIndex?: number;
    },
  ) => ClipNodeProps | null;
}

export const ClipRenderer = React.memo(function ClipRenderer({
  clips,
  allTracks,
  section,
  dragPreview,
  trimPreview,
  buildClipNodeProps,
}: ClipRendererProps) {
  return (
    <>
      {clips.map((clip) => {
        const trackIndex = allTracks.findIndex((t) => t.fullId === clip.trackId);
        if (trackIndex === -1) return null;

        // Filter clips by section
        if (section) {
          const track = allTracks[trackIndex];
          if (track.type !== section) return null;
        }

        // Multi-clip drag: all clips in multiClips are ghosts at original positions
        if (dragPreview?.isMulti && dragPreview.multiClips) {
          if (dragPreview.multiClips.some((mc) => mc.clipId === clip.id)) {
            const props = buildClipNodeProps(clip, trackIndex, { isGhost: true });
            if (!props) return null;
            return <ClipNode key={props.clipId + "-ghost"} {...props} />;
          }
        } else if (dragPreview) {
          // Single-clip drag: ghost the dragged clip and its linked clip
          if (dragPreview.clipId === clip.id) {
            const props = buildClipNodeProps(clip, trackIndex, { isGhost: true });
            if (!props) return null;
            return <ClipNode key={props.clipId + "-ghost"} {...props} />;
          }
          if (dragPreview.linkedClipId === clip.id) {
            const props = buildClipNodeProps(clip, trackIndex, { isGhost: true });
            if (!props) return null;
            return <ClipNode key={props.clipId + "-ghost"} {...props} />;
          }
        }

        // Multi-clip trim: use preview values for all clips in multiClips
        if (trimPreview?.isMulti && trimPreview.multiClips) {
          const mc = trimPreview.multiClips.find((m) => m.clipId === clip.id);
          if (mc) {
            const props = buildClipNodeProps(
              clip,
              mc.trackIndex >= 0 ? mc.trackIndex : trackIndex,
              {
                overrideStartTime: mc.startTime,
                overrideDuration: mc.duration,
                ...(mc.inPoint !== undefined ? { overrideInPoint: mc.inPoint } : {}),
              },
            );
            if (!props) return null;
            return <ClipNode key={props.clipId} {...props} />;
          }
          // Linked clips of multi-trimmed clips
          const linkedMc = trimPreview.multiClips.find((m) => m.linkedClipId === clip.id);
          if (linkedMc && linkedMc.linkedTrackIndex !== undefined) {
            const props = buildClipNodeProps(clip, linkedMc.linkedTrackIndex, {
              overrideStartTime: linkedMc.startTime,
              overrideDuration: linkedMc.duration,
              ...(linkedMc.inPoint !== undefined ? { overrideInPoint: linkedMc.inPoint } : {}),
            });
            if (!props) return null;
            return <ClipNode key={props.clipId} {...props} />;
          }
        } else if (trimPreview) {
          // Single-clip trim — apply startTime, duration, and inPoint (for left-trim)
          if (trimPreview.clipId === clip.id) {
            const props = buildClipNodeProps(clip, trackIndex, {
              overrideStartTime: trimPreview.startTime,
              overrideDuration: trimPreview.duration,
              ...(trimPreview.inPoint !== undefined
                ? { overrideInPoint: trimPreview.inPoint }
                : {}),
            });
            if (!props) return null;
            return <ClipNode key={props.clipId} {...props} />;
          }
          if (trimPreview.linkedClipId === clip.id && trimPreview.linkedTrackIndex !== undefined) {
            const props = buildClipNodeProps(clip, trimPreview.linkedTrackIndex, {
              overrideStartTime: trimPreview.startTime,
              overrideDuration: trimPreview.duration,
              ...(trimPreview.inPoint !== undefined
                ? { overrideInPoint: trimPreview.inPoint }
                : {}),
            });
            if (!props) return null;
            return <ClipNode key={props.clipId} {...props} />;
          }
        }

        const props = buildClipNodeProps(clip, trackIndex);
        if (!props) return null;
        return <ClipNode key={props.clipId} {...props} />;
      })}
    </>
  );
});
