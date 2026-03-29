"use client";

import Konva from "konva";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useStoreWithEqualityFn } from "zustand/traditional";

import type {
  CrossTransitionDropPreview,
  DropPreviewState,
  TransitionDropPreview,
} from "./canvas-timeline";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { ClipNode, type ClipNodeProps } from "./clip-node";
import { ClipRenderer, ClipRendererProps } from "./clip-renderer";
import {
  CLIP_PADDING,
  COLORS,
  MAX_ZOOM,
  MIN_ZOOM,
  RULER_HEIGHT,
  SNAP_THRESHOLD,
  TRACK_HEADER_WIDTH,
} from "./constants";
import { CrossTransitionOverlays } from "./cross-transition-overlays";
import { GridLinesTrackArea } from "./grid-lines-track-area";
import { findSnapTargets, snapFrame } from "./snap-utils";
import { TrackBackgrounds } from "./track-backgrounds";
import { TrackHeaders } from "./track-headers";
import { computeSplitLayout, yToSectionTrackIndex } from "./track-layout";
import {
  CrossTransitionResizeState,
  TimelineTrack,
  TransitionResizeState,
  TrimState,
} from "./types";
import { getThumbnailsForClip, useClipThumbnails } from "./use-clip-thumbnails";
import { useClipWaveforms } from "./use-clip-waveform";

interface TimelineStageProps {
  width: number;
  height: number;
  dropPreview?: DropPreviewState | null;
  transitionDropPreview?: TransitionDropPreview | null;
  crossTransitionDropPreview?: CrossTransitionDropPreview | null;
  onTrackContextMenu?: (trackId: string) => void;
}

/** Width in pixels of the transition resize hit zone */
const TRANSITION_HANDLE_THRESHOLD = 8;

/** Minimum distance from edge to start a trim operation */
const TRIM_THRESHOLD = 12;

/** Minimum pixel distance before a click becomes a drag */
const DRAG_THRESHOLD = 4;

interface DragState {
  clipId: string;
  startMouseX: number;
  startMouseY: number;
  originalStartTime: number;
  originalTrackId: string;
  originalTrackIndex: number;
  // Linked clip info for visual feedback during drag
  linkedClipId?: string;
  linkedOriginalTrackIndex?: number;
  // Multi-select drag (time-only, no track changes)
  isMulti?: boolean;
  multiClips?: Array<{
    clipId: string;
    originalStartTime: number;
    originalTrackId: string;
    originalTrackIndex: number;
    linkedClipId?: string;
    linkedOriginalTrackIndex?: number;
  }>;
}

/**
 * Get grid interval in frames based on zoom level (pixels per frame) and fps.
 * Returns frame counts for minor and major gridlines.
 */
function getGridInterval(
  pixelsPerFrame: number,
  fpsFloat: number,
): { minor: number; major: number } {
  const fps = Math.round(fpsFloat);
  const pps = pixelsPerFrame * fpsFloat;

  // Very high zoom: individual frames visible
  if (pps >= 600) return { minor: 1, major: Math.max(1, Math.round(fps / 6)) };
  if (pps >= 400) return { minor: 1, major: Math.max(1, Math.round(fps / 2)) };
  // High zoom: sub-second intervals
  if (pps >= 200) return { minor: Math.max(1, Math.round(fps / 10)), major: fps };
  if (pps >= 100) return { minor: Math.max(1, Math.round(fps / 2)), major: fps * 5 };
  // Medium zoom: second intervals
  if (pps >= 50) return { minor: fps, major: fps * 5 };
  if (pps >= 20) return { minor: fps * 2, major: fps * 10 };
  // Low zoom: multi-second intervals
  if (pps >= 10) return { minor: fps * 5, major: fps * 30 };
  if (pps >= 3) return { minor: fps * 10, major: fps * 60 };
  // Very low zoom: minute intervals
  return { minor: fps * 30, major: fps * 120 };
}

/**
 * Format a frame number as timecode. Adapts format based on magnitude:
 * - Short durations: SS:FF (e.g., "5:12")
 * - Medium: M:SS:FF (e.g., "2:05:12")
 * - Long: H:MM:SS (e.g., "1:02:05")
 */
function formatFrameTimecode(frame: number, fpsFloat: number): string {
  const totalSeconds = frame / fpsFloat;
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const ff = Math.round(frame % fpsFloat);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }
  return `${secs}:${ff.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Memoized sub-components extracted from TimelineStage JSX
// ---------------------------------------------------------------------------

interface DragPreviewClipsProps {
  clips: ReturnType<typeof useVideoEditorStore.getState>["clips"];
  allTracks: TimelineTrack[];
  section: "video" | "audio";
  dragPreview: ClipRendererProps["dragPreview"];
  buildClipNodeProps: ClipRendererProps["buildClipNodeProps"];
  xToFrame: (x: number) => number;
}

const DragPreviewClips = React.memo(function DragPreviewClips({
  clips,
  allTracks,
  section,
  dragPreview,
  buildClipNodeProps,
  xToFrame,
}: DragPreviewClipsProps) {
  if (!dragPreview) return null;

  const renderClipPreview = (clipId: string, trackIndex: number, x: number, keySuffix: string) => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return null;
    const track = allTracks[trackIndex];
    if (track && track.type !== section) return null;
    const newStartTime = xToFrame(x);
    const props = buildClipNodeProps(clip, trackIndex, {
      overrideStartTime: newStartTime,
      overrideTrackIndex: trackIndex,
    });
    if (!props) return null;
    return <ClipNode key={props.clipId + keySuffix} {...props} />;
  };

  return (
    <>
      {dragPreview.isMulti && dragPreview.multiClips
        ? dragPreview.multiClips.map((mc) =>
            renderClipPreview(mc.clipId, mc.trackIndex, mc.x, "-drag"),
          )
        : renderClipPreview(dragPreview.clipId, dragPreview.trackIndex, dragPreview.x, "-drag")}

      {/* Drag preview for linked clip (single-clip drag only) */}
      {!dragPreview.isMulti &&
        dragPreview.linkedClipId &&
        dragPreview.linkedX !== undefined &&
        dragPreview.linkedTrackIndex !== undefined &&
        renderClipPreview(
          dragPreview.linkedClipId,
          dragPreview.linkedTrackIndex,
          dragPreview.linkedX,
          "-drag-linked",
        )}
    </>
  );
});

const SnapLines = React.memo(function SnapLines({
  snapLines,
  frameToX,
  width,
  height,
}: {
  snapLines: number[];
  frameToX: (frame: number) => number;
  width: number;
  height: number;
}) {
  return (
    <>
      {snapLines.map((snapTime) => {
        const sx = frameToX(snapTime);
        if (sx < TRACK_HEADER_WIDTH || sx > width) return null;
        return (
          <Line
            key={`snap-${snapTime}`}
            points={[sx, RULER_HEIGHT, sx, height]}
            stroke={COLORS.snapLine}
            strokeWidth={1}
            dash={[4, 4]}
          />
        );
      })}
    </>
  );
});

/**
 * Playhead component that subscribes to currentFrame independently,
 * so playhead updates during playback don't re-render the entire timeline.
 */
const Playhead = React.memo(function Playhead({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const currentFrame = useVideoEditorStore((s) => s.currentFrame);
  const zoom = useVideoEditorStore((s) => s.zoom);
  const scrollX = useVideoEditorStore((s) => s.scrollX);

  const playheadX = TRACK_HEADER_WIDTH + currentFrame * zoom - scrollX;

  if (playheadX < TRACK_HEADER_WIDTH || playheadX > width) return null;

  return (
    <Group>
      {/* Playhead head (triangle) */}
      <Line
        points={[
          playheadX - 6,
          0,
          playheadX + 6,
          0,
          playheadX + 6,
          10,
          playheadX,
          18,
          playheadX - 6,
          10,
        ]}
        closed
        fill={COLORS.playhead}
      />
      {/* Playhead line */}
      <Line
        points={[playheadX, RULER_HEIGHT - 24, playheadX, height]}
        stroke={COLORS.playheadLine}
        strokeWidth={2}
      />
    </Group>
  );
});

const RulerMarkers = React.memo(function RulerMarkers({
  gridLines,
  fpsFloat,
}: {
  gridLines: Array<{ x: number; isMajor: boolean; frame: number }>;
  fpsFloat: number;
}) {
  return (
    <>
      {gridLines.map((line, i) => {
        const fps = Math.round(fpsFloat);
        const isOnSecondBoundary = fps > 0 && line.frame % fps === 0;
        // Show text only on major lines that fall on a whole-second boundary
        const showLabel = line.isMajor && isOnSecondBoundary;
        // Major sub-second lines get a medium tick (between major and minor height)
        const tickTop = showLabel ? 20 : line.isMajor ? 25 : 30;

        return (
          <Group key={i}>
            <Line
              points={[line.x, tickTop, line.x, RULER_HEIGHT]}
              stroke={line.isMajor ? COLORS.rulerMajorLine : COLORS.rulerMinorLine}
              strokeWidth={1}
            />
            {showLabel && (
              <Text
                x={line.x + 4}
                y={8}
                text={formatFrameTimecode(line.frame, fpsFloat)}
                fontSize={10}
                fill={COLORS.rulerText}
              />
            )}
          </Group>
        );
      })}
    </>
  );
});

export function TimelineStage({
  width,
  height,
  dropPreview,
  transitionDropPreview,
  crossTransitionDropPreview,
  onTrackContextMenu,
}: TimelineStageProps) {
  const stageRef = useRef<Konva.Stage>(null);

  // Interaction state refs (using refs for high-frequency updates)
  const isDraggingPlayheadRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const trimStateRef = useRef<TrimState | null>(null);
  const snapTargetsRef = useRef<number[]>([]);
  const transitionResizeRef = useRef<TransitionResizeState | null>(null);
  const crossTransitionResizeRef = useRef<CrossTransitionResizeState | null>(null);
  /** Tracks whether a mouseDown on an already-selected clip should narrow selection on mouseUp (if no drag occurred) */
  const clickWithoutDragRef = useRef(false);
  const marqueeRef = useRef<{ startX: number; startY: number } | null>(null);
  const middlePanRef = useRef<{
    startX: number;
    startY: number;
    scrollX: number;
    scrollY: number;
  } | null>(null);

  // Visual state for re-rendering during drag
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    clipId: string;
    x: number;
    y: number;
    trackIndex: number;
    // Linked clip preview position
    linkedClipId?: string;
    linkedX?: number;
    linkedY?: number;
    linkedTrackIndex?: number;
    // Multi-clip drag previews
    isMulti?: boolean;
    multiClips?: Array<{
      clipId: string;
      x: number;
      y: number;
      trackIndex: number;
    }>;
  } | null>(null);

  const [trimPreview, setTrimPreview] = useState<{
    clipId: string;
    startTime: number;
    duration: number;
    /** Updated inPoint for left-trim preview (frames) */
    inPoint?: number;
    // Linked clip preview
    linkedClipId?: string;
    linkedTrackIndex?: number;
    // Multi-clip trim previews
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
  } | null>(null);

  // Hover state for trim handles
  const [trimHover, setTrimHover] = useState<{
    clipId: string;
    edge: "left" | "right";
  } | null>(null);

  // Transition resize preview
  const [transitionResizePreview, setTransitionResizePreview] = useState<{
    clipId: string;
    edge: "in" | "out";
    duration: number;
  } | null>(null);

  // Cross transition resize preview (ref mirrors state for mouseUp access)
  const [crossTransitionResizePreview, setCrossTransitionResizePreviewState] = useState<{
    transitionId: string;
    duration: number;
    /** Projected overlap start time during resize preview */
    overlapStart: number;
    /** Projected overlap end time during resize preview */
    overlapEnd: number;
  } | null>(null);
  const crossTransitionResizePreviewRef = useRef<{
    transitionId: string;
    duration: number;
    overlapStart: number;
    overlapEnd: number;
  } | null>(null);
  const setCrossTransitionResizePreview = useCallback(
    (
      value: {
        transitionId: string;
        duration: number;
        overlapStart: number;
        overlapEnd: number;
      } | null,
    ) => {
      crossTransitionResizePreviewRef.current = value;
      setCrossTransitionResizePreviewState(value);
    },
    [],
  );

  // Cross transition hover (for resize handles)
  const [crossTransitionHover, setCrossTransitionHover] = useState<string | null>(null);

  // Transition overlay hover
  const [transitionHover, setTransitionHover] = useState<{
    clipId: string;
    edge: "in" | "out";
  } | null>(null);

  // Cursor state
  const [cursor, setCursor] = useState<string>("default");

  // Snap lines for visual feedback
  const [snapLines, setSnapLines] = useState<number[]>([]);

  // Razor tool preview
  const [razorPreview, setRazorPreview] = useState<{
    x: number;
    trackY: number;
    trackHeight: number;
  } | null>(null);

  // Track height resize state
  const trackResizeRef = useRef<{
    trackIndex: number;
    trackId: string;
    startY: number;
    originalHeight: number;
    /** Video tracks resize from top edge (drag up = grow), audio from bottom (drag down = grow) */
    invertDelta: boolean;
  } | null>(null);

  // Track zoom gesture — skip expensive drawing during continuous zoom
  const [isZooming, setIsZooming] = useState(false);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevZoomRef = useRef(0);

  // Store state
  const zoom = useVideoEditorStore((s) => s.zoom);

  // Detect zoom gestures — set isZooming=true during continuous zoom, clear after 150ms idle
  if (prevZoomRef.current !== 0 && prevZoomRef.current !== zoom) {
    if (!isZooming) setIsZooming(true);
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => setIsZooming(false), 150);
  }
  prevZoomRef.current = zoom;

  const scrollX = useVideoEditorStore((s) => s.scrollX);
  const scrollY = useVideoEditorStore((s) => s.scrollY);
  const duration = useVideoEditorStore((s) => s.durationFrames);
  const fps = useVideoEditorStore((s) => s.settings.fps);
  const fpsFloat = fps.numerator / fps.denominator;
  const tracks = useVideoEditorStore((s) => s.tracks);

  const clips = useStoreWithEqualityFn(
    useVideoEditorStore,
    (s) => s.clips,
    (a, b) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const ac = a[i];
        const bc = b[i];
        if (ac !== bc) {
          return false;
        }
      }

      return true;
    },
  );
  const selectedClipIds = useVideoEditorStore((s) => s.selectedClipIds);

  // Actions
  const setZoom = useVideoEditorStore((s) => s.setZoom);
  const setScrollX = useVideoEditorStore((s) => s.setScrollX);
  const setScrollY = useVideoEditorStore((s) => s.setScrollY);
  const trackHeightsMap = useVideoEditorStore((s) => s.trackHeights);
  const setTrackHeight = useVideoEditorStore((s) => s.setTrackHeight);
  const seekTo = useVideoEditorStore((s) => s.seekTo);
  const setSelectedClipIds = useVideoEditorStore((s) => s.setSelectedClipIds);
  const clearSelection = useVideoEditorStore((s) => s.clearSelection);
  const moveClipTimeAndTrack = useVideoEditorStore((s) => s.moveClipTimeAndTrack);
  const batchMoveClips = useVideoEditorStore((s) => s.batchMoveClips);
  const trimLeft = useVideoEditorStore((s) => s.trimLeft);
  const trimRight = useVideoEditorStore((s) => s.trimRight);
  const batchTrimClips = useVideoEditorStore((s) => s.batchTrimClips);
  const activeTool = useVideoEditorStore((s) => s.activeTool);
  const splitClipAtTime = useVideoEditorStore((s) => s.splitClipAtTime);
  const setClipTransitionIn = useVideoEditorStore((s) => s.setClipTransitionIn);
  const setClipTransitionOut = useVideoEditorStore((s) => s.setClipTransitionOut);
  const selectedTransition = useVideoEditorStore((s) => s.selectedTransition);
  const setSelectedTransition = useVideoEditorStore((s) => s.setSelectedTransition);
  const crossTransitions = useVideoEditorStore((s) => s.crossTransitions);
  const setSelectedCrossTransition = useVideoEditorStore((s) => s.setSelectedCrossTransition);
  const updateCrossTransitionDuration = useVideoEditorStore((s) => s.updateCrossTransitionDuration);

  // Build track arrays:
  // - Video: sorted descending by index (V3 on top, V1 at bottom near divider)
  // - Audio: sorted ascending by index (A1 on top near divider, A3 at bottom)
  // This creates the traditional NLE "butterfly" layout where V1 and A1 are adjacent.
  // allTracks = [...videoTracks, ...audioTracks]
  const { videoTracks, audioTracks, allTracks } = useMemo(() => {
    const toTimelineTrack = (t: (typeof tracks)[0]): TimelineTrack => ({
      id: t.id,
      fullId: t.id,
      type: t.type,
      name: t.name || `${t.type === "video" ? "Video" : "Audio"} ${t.index + 1}`,
      muted: t.muted,
      locked: t.locked,
    });
    const video = tracks
      .filter((t) => t.type === "video")
      .sort((a, b) => b.index - a.index)
      .map(toTimelineTrack);
    const audio = tracks
      .filter((t) => t.type === "audio")
      .sort((a, b) => a.index - b.index)
      .map(toTimelineTrack);
    return { videoTracks: video, audioTracks: audio, allTracks: [...video, ...audio] };
  }, [tracks]);

  // Memoize clips data for thumbnail hook to prevent infinite loops
  const thumbnailClips = useMemo(
    () =>
      clips.map((c) => ({
        id: c.id,
        type: c.type,
        assetId: "assetId" in c ? c.assetId : undefined,
        startTime: c.startTime,
        duration: c.duration,
        inPoint: c.inPoint,
        speed: c.speed,
      })),
    [clips],
  );

  // Video clip thumbnails
  const thumbnailData = useClipThumbnails({
    clips: thumbnailClips,
    zoom,
    trackHeaderWidth: TRACK_HEADER_WIDTH,
    viewportWidth: width,
  });

  // Audio clip waveforms
  const waveformMap = useClipWaveforms(thumbnailClips);

  // Coordinate conversion
  // Coordinate conversion
  const frameToX = useCallback(
    (time: number) => TRACK_HEADER_WIDTH + time * zoom - scrollX,
    [zoom, scrollX],
  );

  const xToFrame = useCallback(
    (x: number) => (x - TRACK_HEADER_WIDTH + scrollX) / zoom,
    [zoom, scrollX],
  );

  // Compute split layout (video section + audio section with mirrored heights)
  const splitLayout = useMemo(
    () => computeSplitLayout(videoTracks, audioTracks, trackHeightsMap),
    [videoTracks, audioTracks, trackHeightsMap],
  );

  // Each section gets half the available height below the ruler
  const sectionHeight = Math.floor((height - RULER_HEIGHT) / 2);
  const videoSectionTop = RULER_HEIGHT;
  const audioSectionTop = RULER_HEIGHT + sectionHeight;

  // Video section is bottom-aligned: V1 sits at the bottom near the divider.
  // Scrolling (increasing scrollY) reveals higher-numbered tracks from the top.
  // videoBaseY is the Y offset of the video content group.
  const videoContentH = splitLayout.video.totalContentHeight;
  const videoBaseY = videoSectionTop + sectionHeight - videoContentH + scrollY;

  // Audio section is top-aligned: A1 sits at the top near the divider.
  // Scrolling reveals higher-numbered tracks from the bottom.
  const audioBaseY = audioSectionTop - scrollY;

  /**
   * Convert an allTracks index to screen Y.
   * Video tracks (indices 0..videoTrackCount-1) render in the top section (bottom-aligned).
   * Audio tracks (indices videoTrackCount..end) render in the bottom section (top-aligned).
   */
  const trackIndexToY = useCallback(
    (index: number) => {
      const numVideo = splitLayout.videoTrackCount;
      if (index < numVideo) {
        return videoBaseY + (splitLayout.video.trackYOffsets[index] ?? 0);
      }
      const audioIdx = index - numVideo;
      return audioBaseY + (splitLayout.audio.trackYOffsets[audioIdx] ?? 0);
    },
    [splitLayout, videoBaseY, audioBaseY],
  );

  /**
   * Convert screen Y to an allTracks index.
   * Returns -1 if outside any track.
   */
  const yToTrackIndex = useCallback(
    (y: number) => {
      const numVideo = splitLayout.videoTrackCount;
      if (y >= videoSectionTop && y < audioSectionTop) {
        // In video section — content is bottom-aligned
        const localY = y - videoBaseY;
        const idx = yToSectionTrackIndex(localY, splitLayout.video);
        return idx;
      }
      if (y >= audioSectionTop) {
        // In audio section — content is top-aligned
        const localY = y - audioBaseY;
        const idx = yToSectionTrackIndex(localY, splitLayout.audio);
        return idx >= 0 ? idx + numVideo : -1;
      }
      return -1;
    },
    [splitLayout, videoSectionTop, audioSectionTop, videoBaseY, audioBaseY],
  );

  const getTrackHeight = useCallback(
    (index: number) => {
      const numVideo = splitLayout.videoTrackCount;
      if (index < numVideo) {
        return splitLayout.video.trackHeights[index] ?? 80;
      }
      return splitLayout.audio.trackHeights[index - numVideo] ?? 80;
    },
    [splitLayout],
  );

  // Calculate content dimensions
  const contentWidth = TRACK_HEADER_WIDTH + Math.max(duration, 60) * zoom;
  // Total scrollable height within each section (used for scroll bounds)
  const sectionContentHeight = Math.max(
    splitLayout.video.totalContentHeight,
    splitLayout.audio.totalContentHeight,
  );

  // Generate grid lines for ruler (in frames)
  const gridLines = useMemo(() => {
    const { minor, major } = getGridInterval(zoom, fpsFloat);
    // Ensure minor is at least 1 frame
    const minorStep = Math.max(1, minor);
    const majorStep = Math.max(1, major);
    const lines: Array<{ x: number; isMajor: boolean; frame: number }> = [];
    const startFrame = Math.floor(scrollX / zoom / minorStep) * minorStep;
    const endFrame = Math.ceil((scrollX + width) / zoom / minorStep) * minorStep;
    const maxFrame = Math.max(duration, Math.round(60 * fpsFloat));

    for (let f = startFrame; f <= endFrame && f <= maxFrame + minorStep; f += minorStep) {
      if (f < 0) continue;
      const x = frameToX(f);
      if (x < TRACK_HEADER_WIDTH || x > width) continue;
      lines.push({ x, isMajor: majorStep > 0 && f % majorStep === 0, frame: f });
    }
    return lines;
  }, [scrollX, zoom, width, duration, fpsFloat, frameToX]);

  // Handle wheel for zoom/scroll
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      const evt = e.evt;
      evt.preventDefault();

      if (evt.metaKey || evt.ctrlKey) {
        // Zoom centered around mouse pointer
        const stage = e.target.getStage();
        const pointerPos = stage?.getPointerPosition();
        const mouseX = pointerPos?.x ?? width / 2;

        const zoomDelta = evt.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * zoomDelta));

        // Keep the time under the mouse at the same screen position
        const timeAtMouse = (mouseX - TRACK_HEADER_WIDTH + scrollX) / zoom;
        const newScrollX = Math.max(0, timeAtMouse * newZoom - (mouseX - TRACK_HEADER_WIDTH));

        setZoom(newZoom);
        setScrollX(newScrollX);
      } else {
        // Scroll: deltaY scrolls tracks vertically, deltaX scrolls time horizontally.
        // Shift+wheel swaps: deltaY scrolls horizontally.
        if (evt.shiftKey) {
          const horizontalDelta = evt.deltaY;
          if (Math.abs(horizontalDelta) > 0) {
            const newScrollX = Math.max(
              0,
              Math.min(contentWidth - width, scrollX + horizontalDelta),
            );
            setScrollX(newScrollX);
          }
        } else {
          if (Math.abs(evt.deltaY) > 0) {
            // Video section is bottom-aligned, so scrolling is inverted:
            // scroll down (deltaY > 0) in video section should decrease scrollY
            // to reveal higher-numbered tracks from the top.
            // Audio section scrolls normally.
            const maxScrollY = Math.max(0, sectionContentHeight - sectionHeight);
            const stage = e.target.getStage();
            const pointerPos = stage?.getPointerPosition();
            const pointerY = pointerPos?.y ?? 0;
            const inVideoSection = pointerY >= videoSectionTop && pointerY < audioSectionTop;
            const effectiveDelta = inVideoSection ? -evt.deltaY : evt.deltaY;
            const newScrollY = Math.max(0, Math.min(maxScrollY, scrollY + effectiveDelta));
            setScrollY(newScrollY);
          }
          if (Math.abs(evt.deltaX) > 0) {
            const newScrollX = Math.max(0, Math.min(contentWidth - width, scrollX + evt.deltaX));
            setScrollX(newScrollX);
          }
        }
      }
    },
    [
      zoom,
      scrollX,
      scrollY,
      contentWidth,
      sectionContentHeight,
      sectionHeight,
      width,
      setZoom,
      setScrollX,
      setScrollY,
      videoSectionTop,
      audioSectionTop,
    ],
  );

  // Get clip at position
  const getClipAtPosition = useCallback(
    (x: number, y: number) => {
      const trackIndex = yToTrackIndex(y);
      if (trackIndex < 0 || trackIndex >= allTracks.length) return null;

      const track = allTracks[trackIndex];
      const frame = xToFrame(x);

      for (const clip of clips) {
        if (clip.trackId !== track.fullId) continue;

        const clipEnd = clip.startTime + clip.duration;
        if (frame >= clip.startTime && frame <= clipEnd) {
          return { clip, trackIndex };
        }
      }

      return null;
    },
    [clips, allTracks, xToFrame, yToTrackIndex],
  );

  // Determine if mouse is near a trim handle
  const getTrimEdge = useCallback(
    (x: number, clipStartX: number, clipWidth: number): "left" | "right" | null => {
      const distFromLeft = x - clipStartX;
      const distFromRight = clipStartX + clipWidth - x;

      if (distFromLeft >= 0 && distFromLeft < TRIM_THRESHOLD) {
        return "left";
      }
      if (distFromRight >= 0 && distFromRight < TRIM_THRESHOLD) {
        return "right";
      }
      return null;
    },
    [],
  );

  // Check if mouse is on a transition resize handle (the inner edge of a transition overlay)
  const getTransitionResizeEdge = useCallback(
    (
      x: number,
      clipStartX: number,
      clipWidth: number,
      clip: { transitionIn?: { duration: number }; transitionOut?: { duration: number } },
    ): "in" | "out" | null => {
      if (clip.transitionIn && clip.transitionIn.duration > 0) {
        const handleX = clipStartX + clip.transitionIn.duration * zoom;
        if (Math.abs(x - handleX) < TRANSITION_HANDLE_THRESHOLD) {
          return "in";
        }
      }
      if (clip.transitionOut && clip.transitionOut.duration > 0) {
        const handleX = clipStartX + clipWidth - clip.transitionOut.duration * zoom;
        if (Math.abs(x - handleX) < TRANSITION_HANDLE_THRESHOLD) {
          return "out";
        }
      }
      return null;
    },
    [zoom],
  );

  // Compute cross transition rect bounds for hit testing.
  // The overlap region is always [incoming.startTime, outgoing.startTime + outgoing.duration].
  const getCrossTransitionAtPosition = useCallback(
    (x: number, y: number) => {
      for (const ct of crossTransitions) {
        const outgoing = clips.find((c) => c.id === ct.outgoingClipId);
        const incoming = clips.find((c) => c.id === ct.incomingClipId);
        if (!outgoing || !incoming) continue;
        const trackIndex = allTracks.findIndex((t) => t.fullId === outgoing.trackId);
        if (trackIndex === -1) continue;

        // Use actual clip overlap region
        const overlapStart = incoming.startTime;
        const overlapEnd = outgoing.startTime + outgoing.duration;
        const ctX = frameToX(overlapStart);
        const ctWidth = (overlapEnd - overlapStart) * zoom;
        const ctY = trackIndexToY(trackIndex) + CLIP_PADDING;
        const ctHeight = getTrackHeight(trackIndex) - CLIP_PADDING * 2;

        if (x >= ctX && x <= ctX + ctWidth && y >= ctY && y <= ctY + ctHeight) {
          // Check if near left or right edge for resize
          const EDGE_THRESHOLD = 8;
          let edge: "left" | "right" | null = null;
          if (x - ctX < EDGE_THRESHOLD) edge = "left";
          else if (ctX + ctWidth - x < EDGE_THRESHOLD) edge = "right";

          return { ct, edge, outgoing, incoming };
        }
      }
      return null;
    },
    [crossTransitions, clips, allTracks, frameToX, trackIndexToY, getTrackHeight, zoom],
  );

  // Handle mouse down on stage
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Middle mouse button - start panning
      if (e.evt.button === 1) {
        e.evt.preventDefault();
        middlePanRef.current = { startX: pos.x, startY: pos.y, scrollX, scrollY };
        setCursor("grabbing");
        return;
      }

      // Clicking on ruler - start playhead drag
      if (pos.y < RULER_HEIGHT && pos.x > TRACK_HEADER_WIDTH) {
        isDraggingPlayheadRef.current = true;
        const frame = Math.max(0, Math.min(duration, xToFrame(pos.x)));
        seekTo(frame);
        return;
      }

      // Check if clicking on a track resize handle
      // Video tracks: top edge (away from divider). Audio tracks: bottom edge.
      if (pos.x < TRACK_HEADER_WIDTH && pos.y > RULER_HEIGHT) {
        const RESIZE_ZONE = 6;
        const numVideo = splitLayout.videoTrackCount;
        for (let i = 0; i < allTracks.length; i++) {
          const isVideo = i < numVideo;
          const trackY = trackIndexToY(i);
          const edgeY = isVideo ? trackY : trackY + getTrackHeight(i);
          if (Math.abs(pos.y - edgeY) <= RESIZE_ZONE) {
            trackResizeRef.current = {
              trackIndex: i,
              trackId: allTracks[i].id,
              startY: pos.y,
              originalHeight: getTrackHeight(i),
              invertDelta: isVideo,
            };
            setCursor("ns-resize");
            return;
          }
        }
      }

      // Check if clicking on a cross transition overlay (before clip check)
      if (activeTool === "select") {
        const ctHit = getCrossTransitionAtPosition(pos.x, pos.y);
        if (ctHit) {
          const { ct, edge, outgoing, incoming } = ctHit;
          if (edge) {
            // Start cross transition resize — compute per-side max extensions
            // Total max outgoing = current extension past boundary + remaining source material
            const currentExtendOut = outgoing.startTime + outgoing.duration - ct.boundary;
            const availableMoreOut =
              outgoing.type === "video" || outgoing.type === "audio"
                ? Math.max(
                    0,
                    ((outgoing.assetDuration ?? outgoing.duration) -
                      (outgoing.inPoint + outgoing.duration * (outgoing.speed ?? 1))) /
                      (outgoing.speed ?? 1),
                  )
                : Infinity;
            const totalMaxOut = currentExtendOut + availableMoreOut;

            const currentExtendIn = ct.boundary - incoming.startTime;
            const availableMoreIn =
              incoming.type === "video" || incoming.type === "audio"
                ? Math.max(0, incoming.inPoint / (incoming.speed ?? 1))
                : Infinity;
            const totalMaxIn = currentExtendIn + availableMoreIn;

            const maxDuration = totalMaxOut + totalMaxIn;
            crossTransitionResizeRef.current = {
              transitionId: ct.id,
              edge,
              startMouseX: pos.x,
              originalDuration: ct.duration,
              maxDuration,
              boundary: ct.boundary,
              totalMaxOut,
              totalMaxIn,
            };
            setSelectedCrossTransition(ct.id);
            return;
          }
          // Click on body - select
          setSelectedCrossTransition(ct.id);
          return;
        }
      }

      // Check if clicking on a clip
      const clipInfo = getClipAtPosition(pos.x, pos.y);
      if (clipInfo) {
        const { clip, trackIndex } = clipInfo;
        const track = allTracks[trackIndex];
        const isModifierHeld = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
        const isAlreadySelected = selectedClipIds.includes(clip.id);
        const isMultiSelected = selectedClipIds.length > 1;

        // Check if the track is locked - don't allow interaction
        if (track?.locked) {
          // Still allow selection but not drag/trim
          if (isModifierHeld) {
            if (isAlreadySelected) {
              setSelectedClipIds(selectedClipIds.filter((id) => id !== clip.id));
            } else {
              setSelectedClipIds([...selectedClipIds, clip.id]);
            }
          } else {
            setSelectedClipIds([clip.id]);
          }
          return;
        }

        // Modifier click: toggle selection only, don't start drag/trim
        if (isModifierHeld) {
          if (isAlreadySelected) {
            setSelectedClipIds(selectedClipIds.filter((id) => id !== clip.id));
          } else {
            setSelectedClipIds([...selectedClipIds, clip.id]);
          }
          return;
        }

        // Razor tool: split clip at click position
        if (activeTool === "razor") {
          const splitTime = xToFrame(pos.x);
          splitClipAtTime(clip.id, splitTime);
          return;
        }

        const clipX = frameToX(clip.startTime);
        const clipWidth = clip.duration * zoom;

        // Check for transition resize handle or transition body click
        const clipTransitions =
          "transitionIn" in clip || "transitionOut" in clip
            ? { transitionIn: clip.transitionIn, transitionOut: clip.transitionOut }
            : {};
        const transitionEdge = getTransitionResizeEdge(pos.x, clipX, clipWidth, clipTransitions);
        if (transitionEdge) {
          const transitionDuration =
            transitionEdge === "in"
              ? (clipTransitions.transitionIn?.duration ?? 0)
              : (clipTransitions.transitionOut?.duration ?? 0);
          transitionResizeRef.current = {
            clipId: clip.id,
            edge: transitionEdge,
            startMouseX: pos.x,
            originalDuration: transitionDuration,
            clipDuration: clip.duration,
          };
          setSelectedTransition({ clipId: clip.id, edge: transitionEdge });
          return;
        }

        // Check if clicking inside a transition overlay body (select it)
        if (clipTransitions.transitionIn && clipTransitions.transitionIn.duration > 0) {
          const transInEndX = clipX + clipTransitions.transitionIn.duration * zoom;
          if (pos.x >= clipX && pos.x <= transInEndX) {
            setSelectedTransition({ clipId: clip.id, edge: "in" });
            return;
          }
        }
        if (clipTransitions.transitionOut && clipTransitions.transitionOut.duration > 0) {
          const transOutStartX = clipX + clipWidth - clipTransitions.transitionOut.duration * zoom;
          if (pos.x >= transOutStartX && pos.x <= clipX + clipWidth) {
            setSelectedTransition({ clipId: clip.id, edge: "out" });
            return;
          }
        }

        // Check for trim handle
        const trimEdge = getTrimEdge(pos.x, clipX, clipWidth);

        // Determine if we should do multi-clip operations
        const doMulti = isAlreadySelected && isMultiSelected;

        if (trimEdge) {
          if (doMulti) {
            // Multi-select trim: build state for all selected clips
            const excludeIds = new Set<string>();
            const multiClips: NonNullable<TrimState["multiClips"]> = [];
            for (const selId of selectedClipIds) {
              const selClip = clips.find((c) => c.id === selId);
              if (!selClip) continue;
              const selTrack = allTracks.find((t) => t.fullId === selClip.trackId);
              if (selTrack?.locked) continue;
              excludeIds.add(selId);
              const selLinked = clips.find(
                (c) => c.linkedClipId === selId || c.id === selClip.linkedClipId,
              );
              if (selLinked) excludeIds.add(selLinked.id);
              const selLinkedTrackIndex = selLinked
                ? allTracks.findIndex((t) => t.fullId === selLinked.trackId)
                : undefined;
              multiClips.push({
                clipId: selId,
                originalStartTime: selClip.startTime,
                originalDuration: selClip.duration,
                originalInPoint: selClip.inPoint,
                speed: selClip.speed,
                assetDuration: selClip.type === "image" ? undefined : selClip.assetDuration,
                hasAsset:
                  selClip.type === "video" || selClip.type === "audio" || selClip.type === "image",
                linkedClipId: selLinked?.id,
                linkedTrackIndex: selLinkedTrackIndex,
              });
            }
            snapTargetsRef.current = findSnapTargets(
              clips,
              excludeIds,
              useVideoEditorStore.getState().currentFrame,
            );
            // Use anchor clip for the primary trim state fields
            const anchorLinked = clips.find(
              (c) => c.linkedClipId === clip.id || c.id === clip.linkedClipId,
            );
            const anchorLinkedTrackIndex = anchorLinked
              ? allTracks.findIndex((t) => t.fullId === anchorLinked.trackId)
              : undefined;
            trimStateRef.current = {
              clipId: clip.id,
              edge: trimEdge,
              startMouseX: pos.x,
              originalStartTime: clip.startTime,
              originalDuration: clip.duration,
              originalInPoint: clip.inPoint,
              speed: clip.speed,
              assetDuration: clip.type === "image" ? undefined : clip.assetDuration,
              hasAsset: clip.type === "video" || clip.type === "audio" || clip.type === "image",
              linkedClipId: anchorLinked?.id,
              linkedTrackIndex: anchorLinkedTrackIndex,
              isMulti: true,
              multiClips,
            };
          } else {
            // Single-clip trim (existing behavior)
            const linkedClipForTrim = clips.find(
              (c) => c.linkedClipId === clip.id || c.id === clip.linkedClipId,
            );
            const linkedTrackIndexForTrim = linkedClipForTrim
              ? allTracks.findIndex((t) => t.fullId === linkedClipForTrim.trackId)
              : undefined;
            const excludeIds = new Set([clip.id]);
            if (linkedClipForTrim) excludeIds.add(linkedClipForTrim.id);
            snapTargetsRef.current = findSnapTargets(
              clips,
              excludeIds,
              useVideoEditorStore.getState().currentFrame,
            );
            trimStateRef.current = {
              clipId: clip.id,
              edge: trimEdge,
              startMouseX: pos.x,
              originalStartTime: clip.startTime,
              originalDuration: clip.duration,
              originalInPoint: clip.inPoint,
              speed: clip.speed,
              assetDuration: clip.type === "image" ? undefined : clip.assetDuration,
              hasAsset: clip.type === "video" || clip.type === "audio" || clip.type === "image",
              linkedClipId: linkedClipForTrim?.id,
              linkedTrackIndex: linkedTrackIndexForTrim,
            };
            setSelectedClipIds([clip.id]);
          }
          return;
        }

        // Start drag
        if (doMulti) {
          // Multi-select drag: track whether this was just a click (to narrow selection on mouseUp)
          clickWithoutDragRef.current = true;

          // Build multi-clip drag state for all selected clips
          const excludeIds = new Set<string>();
          const multiClips: NonNullable<DragState["multiClips"]> = [];
          for (const selId of selectedClipIds) {
            const selClip = clips.find((c) => c.id === selId);
            if (!selClip) continue;
            const selTrack = allTracks.find((t) => t.fullId === selClip.trackId);
            if (selTrack?.locked) continue;
            const selTrackIndex = allTracks.findIndex((t) => t.fullId === selClip.trackId);
            excludeIds.add(selId);
            const selLinked = clips.find(
              (c) => c.linkedClipId === selId || c.id === selClip.linkedClipId,
            );
            if (selLinked) excludeIds.add(selLinked.id);
            const selLinkedTrackIndex = selLinked
              ? allTracks.findIndex((t) => t.fullId === selLinked.trackId)
              : undefined;
            multiClips.push({
              clipId: selId,
              originalStartTime: selClip.startTime,
              originalTrackId: selClip.trackId,
              originalTrackIndex: selTrackIndex,
              linkedClipId: selLinked?.id,
              linkedOriginalTrackIndex: selLinkedTrackIndex,
            });
          }
          snapTargetsRef.current = findSnapTargets(
            clips,
            excludeIds,
            useVideoEditorStore.getState().currentFrame,
          );

          const linkedClip = clips.find(
            (c) => c.linkedClipId === clip.id || c.id === clip.linkedClipId,
          );
          const linkedTrackIndex = linkedClip
            ? allTracks.findIndex((t) => t.fullId === linkedClip.trackId)
            : undefined;

          dragStateRef.current = {
            clipId: clip.id,
            startMouseX: pos.x,
            startMouseY: pos.y,
            originalStartTime: clip.startTime,
            originalTrackId: clip.trackId,
            originalTrackIndex: trackIndex,
            linkedClipId: linkedClip?.id,
            linkedOriginalTrackIndex: linkedTrackIndex,
            isMulti: true,
            multiClips,
          };
        } else {
          // Single-clip drag (existing behavior)
          const linkedClip = clips.find(
            (c) => c.linkedClipId === clip.id || c.id === clip.linkedClipId,
          );
          const linkedTrackIndex = linkedClip
            ? allTracks.findIndex((t) => t.fullId === linkedClip.trackId)
            : undefined;
          const excludeIds = new Set([clip.id]);
          if (linkedClip) excludeIds.add(linkedClip.id);
          snapTargetsRef.current = findSnapTargets(
            clips,
            excludeIds,
            useVideoEditorStore.getState().currentFrame,
          );

          dragStateRef.current = {
            clipId: clip.id,
            startMouseX: pos.x,
            startMouseY: pos.y,
            originalStartTime: clip.startTime,
            originalTrackId: clip.trackId,
            originalTrackIndex: trackIndex,
            linkedClipId: linkedClip?.id,
            linkedOriginalTrackIndex: linkedTrackIndex,
          };
          setSelectedClipIds([clip.id]);
        }
        return;
      }

      // Empty space click - start marquee selection (left button + select tool only)
      if (
        e.evt.button === 0 &&
        activeTool === "select" &&
        pos.x > TRACK_HEADER_WIDTH &&
        pos.y > RULER_HEIGHT
      ) {
        marqueeRef.current = { startX: pos.x, startY: pos.y };
        clearSelection();
      } else if (e.evt.button === 0) {
        clearSelection();
      }
    },
    [
      duration,
      xToFrame,
      zoom,
      frameToX,
      getClipAtPosition,
      getTrimEdge,
      seekTo,
      setSelectedClipIds,
      clearSelection,
      clips,
      allTracks,
      activeTool,
      splitClipAtTime,
      getTransitionResizeEdge,
      setSelectedTransition,
      getCrossTransitionAtPosition,
      setSelectedCrossTransition,
      selectedClipIds,
      scrollX,
      scrollY,
      splitLayout.videoTrackCount,
      getTrackHeight,
      trackIndexToY,
    ],
  );

  // Handle mouse move
  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Middle mouse panning
      if (middlePanRef.current) {
        const dx = pos.x - middlePanRef.current.startX;
        const dy = pos.y - middlePanRef.current.startY;
        setScrollX(Math.max(0, middlePanRef.current.scrollX - dx));
        setScrollY(Math.max(0, middlePanRef.current.scrollY - dy));
        return;
      }

      // Track height resize
      if (trackResizeRef.current) {
        const rawDelta = pos.y - trackResizeRef.current.startY;
        // Video: dragging up (negative delta) increases height; audio: dragging down increases
        const delta = trackResizeRef.current.invertDelta ? -rawDelta : rawDelta;
        const newHeight = Math.max(
          40,
          Math.min(300, trackResizeRef.current.originalHeight + delta),
        );
        setTrackHeight(trackResizeRef.current.trackId, newHeight);
        return;
      }

      // Playhead dragging
      if (isDraggingPlayheadRef.current) {
        const frame = Math.max(0, Math.min(duration, xToFrame(pos.x)));
        seekTo(frame);
        return;
      }

      // Clip trimming
      if (trimStateRef.current) {
        const trimState = trimStateRef.current;
        const {
          clipId,
          edge,
          startMouseX,
          originalStartTime,
          originalDuration,
          originalInPoint,
          speed,
          assetDuration,
          hasAsset,
          linkedClipId,
          linkedTrackIndex,
        } = trimState;
        const deltaX = pos.x - startMouseX;
        const deltaTime = deltaX / zoom;

        const thresholdTime = SNAP_THRESHOLD / zoom;

        if (trimState.isMulti && trimState.multiClips) {
          // Multi-clip trim: compute delta from anchor, apply to all with individual clamping
          if (edge === "left") {
            // Compute snapped delta from anchor clip
            let anchorNewStart: number;
            if (hasAsset) {
              const newInPoint = originalInPoint + deltaTime * speed;
              const clampedInPoint = Math.max(0, newInPoint);
              const actualDelta = (clampedInPoint - originalInPoint) / speed;
              anchorNewStart = Math.max(0, originalStartTime + actualDelta);
            } else {
              anchorNewStart = Math.max(0, originalStartTime + deltaTime);
            }
            const snapResult = snapFrame(anchorNewStart, snapTargetsRef.current, thresholdTime);
            anchorNewStart = snapResult.frame;
            setSnapLines(snapResult.snapLines);
            const anchorDelta = anchorNewStart - originalStartTime;

            const multiPreviews: NonNullable<typeof trimPreview>["multiClips"] = [];
            for (const mc of trimState.multiClips) {
              let clipNewStart: number;
              if (mc.hasAsset) {
                const newInPoint = mc.originalInPoint + anchorDelta * mc.speed;
                const clampedInPoint = Math.max(0, newInPoint);
                const clampedDelta = (clampedInPoint - mc.originalInPoint) / mc.speed;
                clipNewStart = Math.max(0, mc.originalStartTime + clampedDelta);
              } else {
                clipNewStart = Math.max(0, mc.originalStartTime + anchorDelta);
              }
              const clipNewDuration = mc.originalStartTime + mc.originalDuration - clipNewStart;
              if (clipNewDuration < 1) continue;
              const clipTrackIndex = allTracks.findIndex(
                (t) => t.fullId === clips.find((c) => c.id === mc.clipId)?.trackId,
              );
              multiPreviews.push({
                clipId: mc.clipId,
                startTime: clipNewStart,
                duration: clipNewDuration,
                inPoint: mc.originalInPoint + (clipNewStart - mc.originalStartTime) * mc.speed,
                trackIndex: clipTrackIndex,
                linkedClipId: mc.linkedClipId,
                linkedTrackIndex: mc.linkedTrackIndex,
              });
            }

            const anchorNewDuration = originalStartTime + originalDuration - anchorNewStart;
            if (anchorNewDuration >= 1) {
              setTrimPreview({
                clipId,
                startTime: anchorNewStart,
                duration: anchorNewDuration,
                inPoint: originalInPoint + (anchorNewStart - originalStartTime) * speed,
                linkedClipId,
                linkedTrackIndex,
                isMulti: true,
                multiClips: multiPreviews,
              });
            }
          } else {
            // Right trim multi
            let anchorMaxDuration = Infinity;
            if (assetDuration !== undefined) {
              anchorMaxDuration = (assetDuration - originalInPoint) / speed;
            }
            let anchorNewDuration = Math.max(
              0.1,
              Math.min(anchorMaxDuration, originalDuration + deltaTime),
            );
            const endTime = originalStartTime + anchorNewDuration;
            const snapResult = snapFrame(endTime, snapTargetsRef.current, thresholdTime);
            anchorNewDuration = Math.max(
              0.1,
              Math.min(anchorMaxDuration, snapResult.frame - originalStartTime),
            );
            setSnapLines(snapResult.snapLines);
            const anchorDelta = anchorNewDuration - originalDuration;

            const multiPreviews: NonNullable<typeof trimPreview>["multiClips"] = [];
            for (const mc of trimState.multiClips) {
              let clipMaxDuration = Infinity;
              if (mc.assetDuration !== undefined) {
                clipMaxDuration = (mc.assetDuration - mc.originalInPoint) / mc.speed;
              }
              const clipNewDuration = Math.max(
                0.1,
                Math.min(clipMaxDuration, mc.originalDuration + anchorDelta),
              );
              const clipTrackIndex = allTracks.findIndex(
                (t) => t.fullId === clips.find((c) => c.id === mc.clipId)?.trackId,
              );
              multiPreviews.push({
                clipId: mc.clipId,
                startTime: mc.originalStartTime,
                duration: clipNewDuration,
                trackIndex: clipTrackIndex,
                linkedClipId: mc.linkedClipId,
                linkedTrackIndex: mc.linkedTrackIndex,
              });
            }

            setTrimPreview({
              clipId,
              startTime: originalStartTime,
              duration: anchorNewDuration,
              linkedClipId,
              linkedTrackIndex,
              isMulti: true,
              multiClips: multiPreviews,
            });
          }
        } else {
          // Single-clip trim (existing behavior)
          if (edge === "left") {
            let newStartTime: number;

            if (hasAsset) {
              const newInPoint = originalInPoint + deltaTime * speed;
              const clampedInPoint = Math.max(0, newInPoint);
              const actualDelta = (clampedInPoint - originalInPoint) / speed;
              newStartTime = Math.max(0, originalStartTime + actualDelta);
            } else {
              newStartTime = Math.max(0, originalStartTime + deltaTime);
            }

            const snapResult = snapFrame(newStartTime, snapTargetsRef.current, thresholdTime);
            newStartTime = snapResult.frame;
            setSnapLines(snapResult.snapLines);

            const newDuration = originalStartTime + originalDuration - newStartTime;

            if (newDuration >= 1) {
              const newInPoint = originalInPoint + (newStartTime - originalStartTime) * speed;
              setTrimPreview({
                clipId,
                startTime: newStartTime,
                duration: newDuration,
                inPoint: newInPoint,
                linkedClipId,
                linkedTrackIndex,
              });
            }
          } else {
            let maxDuration = Infinity;
            if (assetDuration !== undefined) {
              maxDuration = (assetDuration - originalInPoint) / speed;
            }

            let newDuration = Math.max(1, Math.min(maxDuration, originalDuration + deltaTime));

            const endTime = originalStartTime + newDuration;
            const snapResult = snapFrame(endTime, snapTargetsRef.current, thresholdTime);
            newDuration = snapResult.frame - originalStartTime;
            newDuration = Math.max(1, Math.min(maxDuration, newDuration));
            setSnapLines(snapResult.snapLines);

            setTrimPreview({
              clipId,
              startTime: originalStartTime,
              duration: newDuration,
              linkedClipId,
              linkedTrackIndex,
            });
          }
        }
        return;
      }

      // Transition resize
      if (transitionResizeRef.current) {
        const { clipId, edge, startMouseX, originalDuration, clipDuration } =
          transitionResizeRef.current;
        const deltaX = pos.x - startMouseX;
        const deltaTime = deltaX / zoom;

        let newDuration: number;
        if (edge === "in") {
          newDuration = Math.max(1, Math.min(clipDuration * 0.9, originalDuration + deltaTime));
        } else {
          newDuration = Math.max(1, Math.min(clipDuration * 0.9, originalDuration - deltaTime));
        }

        setTransitionResizePreview({ clipId, edge, duration: newDuration });
        return;
      }

      // Cross transition resize — symmetric from center
      if (crossTransitionResizeRef.current) {
        const {
          transitionId,
          edge,
          startMouseX,
          originalDuration,
          maxDuration,
          boundary,
          totalMaxOut,
          totalMaxIn,
        } = crossTransitionResizeRef.current;
        const deltaTime = (pos.x - startMouseX) / zoom;

        // Both edges grow/shrink symmetrically: dragging either edge by deltaTime
        // changes the full duration by 2x deltaTime.
        let durationDelta: number;
        if (edge === "left") {
          durationDelta = -deltaTime * 2;
        } else {
          durationDelta = deltaTime * 2;
        }
        const newDuration = Math.max(1, Math.min(maxDuration, originalDuration + durationDelta));
        const newHalf = newDuration / 2;

        // Project the overlap region: each side extends from boundary, clamped per-side
        const projExtendOut = Math.min(newHalf, totalMaxOut);
        const projExtendIn = Math.min(newHalf, totalMaxIn);

        setCrossTransitionResizePreview({
          transitionId,
          duration: newDuration,
          overlapStart: boundary - projExtendIn,
          overlapEnd: boundary + projExtendOut,
        });
        return;
      }

      // Clip dragging
      if (dragStateRef.current) {
        const dragState = dragStateRef.current;
        const {
          clipId,
          startMouseX,
          startMouseY,
          originalStartTime,
          originalTrackIndex,
          linkedClipId,
          linkedOriginalTrackIndex,
        } = dragState;

        // Don't start visual drag until mouse moves beyond threshold
        const dx = pos.x - startMouseX;
        const dy = pos.y - startMouseY;
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
          return;
        }

        // Once we start dragging, this is no longer a simple click
        clickWithoutDragRef.current = false;

        // Get the clip to check its type for track compatibility
        const clip = clips.find((c) => c.id === clipId);
        if (!clip) return;

        const deltaX = pos.x - startMouseX;
        const deltaTime = deltaX / zoom;
        const thresholdTime = SNAP_THRESHOLD / zoom;

        if (dragState.isMulti && dragState.multiClips) {
          // Multi-clip drag: time-only movement, no track changes

          // Compute time delta: snap across all selected clip edges
          let bestSnapDelta = deltaTime;
          let bestSnapLines: number[] = [];
          let bestSnapDist = Infinity;

          for (const mc of dragState.multiClips) {
            const mcClip = clips.find((c) => c.id === mc.clipId);
            if (!mcClip) continue;

            const mcNewStart = mc.originalStartTime + deltaTime;
            const mcNewEnd = mcNewStart + mcClip.duration;

            // Check left edge snap
            const leftSnap = snapFrame(mcNewStart, snapTargetsRef.current, thresholdTime);
            if (leftSnap.snapLines.length > 0) {
              const dist = Math.abs(leftSnap.frame - mcNewStart);
              if (dist < bestSnapDist) {
                bestSnapDist = dist;
                bestSnapDelta = deltaTime + (leftSnap.frame - mcNewStart);
                bestSnapLines = leftSnap.snapLines;
              }
            }

            // Check right edge snap
            const rightSnap = snapFrame(mcNewEnd, snapTargetsRef.current, thresholdTime);
            if (rightSnap.snapLines.length > 0) {
              const dist = Math.abs(rightSnap.frame - mcNewEnd);
              if (dist < bestSnapDist) {
                bestSnapDist = dist;
                bestSnapDelta = deltaTime + (rightSnap.frame - mcNewEnd);
                bestSnapLines = rightSnap.snapLines;
              }
            }
          }

          setSnapLines(bestSnapLines);

          // Clamp: no clip goes below t=0
          let minNewStart = Infinity;
          for (const mc of dragState.multiClips) {
            minNewStart = Math.min(minNewStart, mc.originalStartTime + bestSnapDelta);
          }
          if (minNewStart < 0) {
            bestSnapDelta -= minNewStart;
          }

          // Build multi-clip preview positions
          const multiPreviews: Array<{
            clipId: string;
            x: number;
            y: number;
            trackIndex: number;
          }> = [];

          for (const mc of dragState.multiClips) {
            const mcClip = clips.find((c) => c.id === mc.clipId);
            if (!mcClip) continue;
            const mcNewStart = mc.originalStartTime + bestSnapDelta;
            multiPreviews.push({
              clipId: mc.clipId,
              x: frameToX(mcNewStart),
              y: trackIndexToY(mc.originalTrackIndex) + CLIP_PADDING,
              trackIndex: mc.originalTrackIndex,
            });

            // Add linked clip preview (if linked clip is not in selection)
            if (
              mc.linkedClipId &&
              mc.linkedOriginalTrackIndex !== undefined &&
              !dragState.multiClips.some((m) => m.clipId === mc.linkedClipId)
            ) {
              multiPreviews.push({
                clipId: mc.linkedClipId,
                x: frameToX(mcNewStart),
                y: trackIndexToY(mc.linkedOriginalTrackIndex) + CLIP_PADDING,
                trackIndex: mc.linkedOriginalTrackIndex,
              });
            }
          }

          // Use anchor clip for the primary preview fields
          const anchorNewStart = originalStartTime + bestSnapDelta;
          setDragPreview({
            clipId,
            x: frameToX(anchorNewStart),
            y: trackIndexToY(originalTrackIndex) + CLIP_PADDING,
            trackIndex: originalTrackIndex,
            isMulti: true,
            multiClips: multiPreviews,
          });
        } else {
          // Single-clip drag (existing behavior with track changes)
          const isAudioClip = clip.type === "audio";
          const compatibleTrackType = isAudioClip ? "audio" : "video";

          const compatibleTrackIndices = allTracks
            .map((t, i) => (t.type === compatibleTrackType ? i : -1))
            .filter((i) => i !== -1);

          if (compatibleTrackIndices.length === 0) return;

          // Use absolute mouse position to find target track (supports variable heights)
          const rawTargetIndex = yToTrackIndex(pos.y);
          const deltaTrackIndex = rawTargetIndex >= 0 ? rawTargetIndex - originalTrackIndex : 0;

          let newStartTime = Math.max(0, originalStartTime + deltaTime);

          const leftSnap = snapFrame(newStartTime, snapTargetsRef.current, thresholdTime);
          const rightEdge = newStartTime + clip.duration;
          const rightSnap = snapFrame(rightEdge, snapTargetsRef.current, thresholdTime);

          const leftDist = Math.abs(leftSnap.frame - newStartTime);
          const rightDist = Math.abs(rightSnap.frame - rightEdge);

          if (leftSnap.snapLines.length > 0 || rightSnap.snapLines.length > 0) {
            if (leftSnap.snapLines.length > 0 && rightSnap.snapLines.length > 0) {
              if (leftDist <= rightDist) {
                newStartTime = leftSnap.frame;
                setSnapLines(leftSnap.snapLines);
              } else {
                newStartTime = rightSnap.frame - clip.duration;
                setSnapLines(rightSnap.snapLines);
              }
            } else if (leftSnap.snapLines.length > 0) {
              newStartTime = leftSnap.frame;
              setSnapLines(leftSnap.snapLines);
            } else {
              newStartTime = rightSnap.frame - clip.duration;
              setSnapLines(rightSnap.snapLines);
            }
          } else {
            setSnapLines([]);
          }

          newStartTime = Math.max(0, newStartTime);

          const effectiveTargetIndex = originalTrackIndex + deltaTrackIndex;
          let newTrackIndex = compatibleTrackIndices[0];
          let minDistance = Math.abs(effectiveTargetIndex - newTrackIndex);

          for (const idx of compatibleTrackIndices) {
            const distance = Math.abs(effectiveTargetIndex - idx);
            if (distance < minDistance) {
              minDistance = distance;
              newTrackIndex = idx;
            }
          }

          const newX = frameToX(newStartTime);
          const newY = trackIndexToY(newTrackIndex) + CLIP_PADDING;

          let linkedX: number | undefined;
          let linkedY: number | undefined;
          let linkedTrackIndex: number | undefined;

          if (linkedClipId && linkedOriginalTrackIndex !== undefined) {
            const linkedCompatibleTrackType = isAudioClip ? "video" : "audio";
            const linkedCompatibleTrackIndices = allTracks
              .map((t, i) => (t.type === linkedCompatibleTrackType ? i : -1))
              .filter((i) => i !== -1);

            if (linkedCompatibleTrackIndices.length > 0) {
              // Video is sorted descending, audio ascending — invert delta for linked track
              const linkedRawTargetIndex = linkedOriginalTrackIndex - deltaTrackIndex;
              linkedTrackIndex = linkedCompatibleTrackIndices[0];
              let linkedMinDistance = Math.abs(linkedRawTargetIndex - linkedTrackIndex);

              for (const idx of linkedCompatibleTrackIndices) {
                const distance = Math.abs(linkedRawTargetIndex - idx);
                if (distance < linkedMinDistance) {
                  linkedMinDistance = distance;
                  linkedTrackIndex = idx;
                }
              }

              linkedX = frameToX(newStartTime);
              linkedY = trackIndexToY(linkedTrackIndex) + CLIP_PADDING;
            }
          }

          setDragPreview({
            clipId,
            x: newX,
            y: newY,
            trackIndex: newTrackIndex,
            linkedClipId,
            linkedX,
            linkedY,
            linkedTrackIndex,
          });
        }
        return;
      }

      // Marquee selection
      if (marqueeRef.current) {
        const { startX, startY } = marqueeRef.current;
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          const rect = {
            x: Math.min(startX, pos.x),
            y: Math.min(startY, pos.y),
            width: Math.abs(dx),
            height: Math.abs(dy),
          };
          setMarqueeRect(rect);
          setCursor("crosshair");

          // Find clips whose screen rects intersect the marquee
          const ids: string[] = [];
          for (const clip of clips) {
            const trackIndex = allTracks.findIndex((t) => t.fullId === clip.trackId);
            if (trackIndex === -1) continue;
            const cx = frameToX(clip.startTime);
            const cy = trackIndexToY(trackIndex) + CLIP_PADDING;
            const cw = clip.duration * zoom;
            const ch = getTrackHeight(trackIndex) - CLIP_PADDING * 2;
            // AABB intersection
            if (
              cx + cw > rect.x &&
              cx < rect.x + rect.width &&
              cy + ch > rect.y &&
              cy < rect.y + rect.height
            ) {
              ids.push(clip.id);
            }
          }
          setSelectedClipIds(ids);
        }
        return;
      }

      // Update cursor and trim hover state based on hover position
      if (pos.y > RULER_HEIGHT && pos.x > TRACK_HEADER_WIDTH) {
        // Check cross transition hover first
        const ctHit = getCrossTransitionAtPosition(pos.x, pos.y);
        if (ctHit && activeTool === "select") {
          if (ctHit.edge) {
            setCursor("ew-resize");
          } else {
            setCursor("pointer");
          }
          setCrossTransitionHover(ctHit.ct.id);
          setTrimHover(null);
          setTransitionHover(null);
          setRazorPreview(null);
        } else {
          setCrossTransitionHover(null);

          const clipInfo = getClipAtPosition(pos.x, pos.y);
          if (clipInfo) {
            const { clip, trackIndex } = clipInfo;
            const track = allTracks[trackIndex];

            // If track is locked, show not-allowed cursor
            if (track?.locked) {
              setCursor("not-allowed");
              setTrimHover(null);
              setRazorPreview(null);
            } else if (activeTool === "razor") {
              // Razor tool: show crosshair cursor and cut preview line
              setCursor("crosshair");
              setTrimHover(null);
              const trackY = trackIndexToY(trackIndex);
              setRazorPreview({
                x: pos.x,
                trackY: trackY + CLIP_PADDING,
                trackHeight: getTrackHeight(trackIndex) - CLIP_PADDING * 2,
              });
            } else {
              const clipX = frameToX(clip.startTime);
              const clipWidth = clip.duration * zoom;

              // Check transition resize handles first
              const hoverClipTransitions =
                "transitionIn" in clip || "transitionOut" in clip
                  ? { transitionIn: clip.transitionIn, transitionOut: clip.transitionOut }
                  : {};
              const transEdge = getTransitionResizeEdge(
                pos.x,
                clipX,
                clipWidth,
                hoverClipTransitions,
              );
              if (transEdge) {
                setCursor("ew-resize");
                setTrimHover(null);
                setTransitionHover({ clipId: clip.id, edge: transEdge });
              } else {
                setTransitionHover(null);
                const trimEdge = getTrimEdge(pos.x, clipX, clipWidth);

                if (trimEdge) {
                  setCursor("ew-resize");
                  setTrimHover({ clipId: clip.id, edge: trimEdge });
                } else {
                  setCursor("grab");
                  setTrimHover(null);
                }
              }
              setRazorPreview(null);
            }
          } else {
            setCursor(activeTool === "razor" ? "crosshair" : "default");
            setTrimHover(null);
            setTransitionHover(null);
            setRazorPreview(null);
          }
        } // close cross transition else
      } else if (pos.x < TRACK_HEADER_WIDTH && pos.y > RULER_HEIGHT) {
        // Check for track resize hover — video: top edge, audio: bottom edge
        const RESIZE_ZONE = 6;
        const numVideo = splitLayout.videoTrackCount;
        let isResizeHover = false;
        for (let i = 0; i < allTracks.length; i++) {
          const isVideo = i < numVideo;
          const trackY = trackIndexToY(i);
          const edgeY = isVideo ? trackY : trackY + getTrackHeight(i);
          if (Math.abs(pos.y - edgeY) <= RESIZE_ZONE) {
            setCursor("ns-resize");
            isResizeHover = true;
            break;
          }
        }
        if (!isResizeHover) {
          setCursor("default");
        }
        setTrimHover(null);
        setTransitionHover(null);
        setCrossTransitionHover(null);
        setRazorPreview(null);
      } else {
        setCursor("default");
        setTrimHover(null);
        setTransitionHover(null);
        setCrossTransitionHover(null);
        setRazorPreview(null);
      }
    },
    [
      duration,
      zoom,
      xToFrame,
      frameToX,
      trackIndexToY,
      allTracks,
      clips,
      getClipAtPosition,
      getTrimEdge,
      getTransitionResizeEdge,
      getCrossTransitionAtPosition,
      seekTo,
      activeTool,
      setSelectedClipIds,
      setScrollX,
      setScrollY,
      setCrossTransitionResizePreview,
      yToTrackIndex,
      setTrackHeight,
      getTrackHeight,
      splitLayout.videoTrackCount,
    ],
  );

  // Handle mouse up
  const handleStageMouseUp = useCallback(() => {
    // End track height resize
    if (trackResizeRef.current) {
      trackResizeRef.current = null;
      setCursor("default");
      return;
    }

    // End middle mouse panning
    if (middlePanRef.current) {
      middlePanRef.current = null;
      setCursor("default");
      return;
    }

    // End marquee selection
    if (marqueeRef.current) {
      marqueeRef.current = null;
      setMarqueeRect(null);
      return;
    }

    // End playhead drag
    isDraggingPlayheadRef.current = false;

    // Commit trim operation
    if (trimStateRef.current) {
      if (trimPreview) {
        const trimState = trimStateRef.current;
        if (trimState.isMulti && trimPreview.isMulti && trimPreview.multiClips) {
          // Multi-clip trim: batch commit
          const trims = trimPreview.multiClips.map((mc) => ({
            clipId: mc.clipId,
            newStartTime: mc.startTime,
            newDuration: mc.duration,
          }));
          batchTrimClips(trimState.edge, trims);
        } else {
          // Single-clip trim
          const { clipId, edge } = trimState;
          if (edge === "left") {
            trimLeft(clipId, trimPreview.startTime);
          } else {
            trimRight(clipId, trimPreview.duration);
          }
        }
        setTrimPreview(null);
      }
      trimStateRef.current = null;
      snapTargetsRef.current = [];
      setSnapLines([]);
    }

    // Commit transition resize
    if (transitionResizeRef.current) {
      if (transitionResizePreview) {
        const { clipId, edge } = transitionResizeRef.current;
        const clip = clips.find((c) => c.id === clipId);
        if (clip && ("transitionIn" in clip || "transitionOut" in clip)) {
          const existing = edge === "in" ? clip.transitionIn : clip.transitionOut;
          if (existing) {
            const updated = { ...existing, duration: transitionResizePreview.duration };
            if (edge === "in") {
              setClipTransitionIn(clipId, updated);
            } else {
              setClipTransitionOut(clipId, updated);
            }
          }
        }
        setTransitionResizePreview(null);
      }
      transitionResizeRef.current = null;
    }

    // Commit cross transition resize
    if (crossTransitionResizeRef.current) {
      const preview = crossTransitionResizePreviewRef.current;
      if (preview) {
        updateCrossTransitionDuration(preview.transitionId, preview.duration);
        setCrossTransitionResizePreview(null);
      }
      crossTransitionResizeRef.current = null;
    }

    // Commit drag operation (only if threshold was exceeded)
    if (dragStateRef.current) {
      if (dragPreview) {
        const dragState = dragStateRef.current;
        if (dragState.isMulti && dragPreview.isMulti && dragPreview.multiClips) {
          // Multi-clip drag: batch commit
          // Only include selected clips (not linked), the store handles linked clips
          const selectedIds = new Set((dragState.multiClips ?? []).map((mc) => mc.clipId));
          const moves = dragPreview.multiClips
            .filter((mc) => selectedIds.has(mc.clipId))
            .map((mc) => ({
              clipId: mc.clipId,
              newStartTime: xToFrame(mc.x),
            }));
          batchMoveClips(moves);
        } else {
          // Single-clip drag
          const { clipId } = dragState;
          const newTrack = allTracks[dragPreview.trackIndex];
          const newStartTime = xToFrame(dragPreview.x);

          if (newTrack) {
            moveClipTimeAndTrack(clipId, newStartTime, newTrack.fullId);
          }
        }

        setDragPreview(null);
      } else if (clickWithoutDragRef.current && dragStateRef.current) {
        // mouseUp without drag on an already-selected clip in multi-select: narrow to single
        setSelectedClipIds([dragStateRef.current.clipId]);
      }
      dragStateRef.current = null;
      clickWithoutDragRef.current = false;
      snapTargetsRef.current = [];
      setSnapLines([]);
    }
  }, [
    trimPreview,
    dragPreview,
    transitionResizePreview,
    allTracks,
    clips,
    xToFrame,
    moveClipTimeAndTrack,
    batchMoveClips,
    trimLeft,
    trimRight,
    batchTrimClips,
    setClipTransitionIn,
    setClipTransitionOut,
    updateCrossTransitionDuration,
    setSelectedClipIds,
    setCrossTransitionResizePreview,
  ]);

  // Get clip color based on type
  const getClipColor = useCallback((type: string, isPreview = false) => {
    const alpha = isPreview ? "80" : "";
    switch (type) {
      case "video":
        return COLORS.clipVideo + alpha;
      case "audio":
        return COLORS.clipAudio + alpha;
      case "image":
        return COLORS.clipImage + alpha;
      case "text":
        return COLORS.clipText + alpha;
      case "shape":
        return COLORS.clipShape + alpha;
      default:
        return COLORS.clipVideo + alpha;
    }
  }, []);

  // Build props for a ClipNode given a clip and track index
  const buildClipNodeProps = useCallback(
    (
      clip: (typeof clips)[0],
      trackIndex: number,
      opts?: {
        isGhost?: boolean;
        overrideStartTime?: number;
        overrideDuration?: number;
        overrideInPoint?: number;
        overrideTrackIndex?: number;
      },
    ): ClipNodeProps | null => {
      const effectiveStartTime = opts?.overrideStartTime ?? clip.startTime;
      const effectiveDuration = opts?.overrideDuration ?? clip.duration;
      const effectiveInPoint = opts?.overrideInPoint ?? clip.inPoint;
      const effectiveTrackIndex = opts?.overrideTrackIndex ?? trackIndex;
      const isGhost = opts?.isGhost ?? false;

      // Content-space position within the track's section
      const trackH = getTrackHeight(effectiveTrackIndex);
      const numVideo = splitLayout.videoTrackCount;
      const isVideoTrack = effectiveTrackIndex < numVideo;
      const sectionIdx = isVideoTrack ? effectiveTrackIndex : effectiveTrackIndex - numVideo;
      const sectionLayout = isVideoTrack ? splitLayout.video : splitLayout.audio;
      const x = effectiveStartTime * zoom;
      const y = (sectionLayout.trackYOffsets[sectionIdx] ?? 0) + CLIP_PADDING;
      const clipWidth = effectiveDuration * zoom;

      // Visibility culling (screen-space check)
      const sectionTop = isVideoTrack ? videoSectionTop : audioSectionTop;
      const baseY = isVideoTrack ? videoBaseY : audioBaseY;
      const screenX = x + TRACK_HEADER_WIDTH - scrollX;
      const screenY = y + baseY;
      if (screenX + clipWidth < TRACK_HEADER_WIDTH || screenX > width) return null;
      if (screenY + trackH < sectionTop || screenY > sectionTop + sectionHeight) return null;

      const isSelected = selectedClipIds.includes(clip.id);
      const hasLinkedClip =
        clips.some((c) => c.linkedClipId === clip.id) || clip.linkedClipId !== undefined;

      const thumbnails =
        (clip.type === "video" || clip.type === "image") && thumbnailData
          ? getThumbnailsForClip(thumbnailData, clip.id)
          : [];

      const clipAssetId = "assetId" in clip ? clip.assetId : undefined;
      const wf = clip.type === "audio" && clipAssetId ? waveformMap.get(clipAssetId) : undefined;

      // transitionIn/transitionOut only exist on VisualClipBase descendants (not AudioClip)
      const clipTransitionIn = "transitionIn" in clip ? clip.transitionIn : undefined;
      const clipTransitionOut = "transitionOut" in clip ? clip.transitionOut : undefined;

      // Resolve transition durations (with resize preview overrides)
      let transitionInDuration = clipTransitionIn?.duration;
      let transitionOutDuration = clipTransitionOut?.duration;
      if (transitionResizePreview?.clipId === clip.id) {
        if (transitionResizePreview.edge === "in")
          transitionInDuration = transitionResizePreview.duration;
        if (transitionResizePreview.edge === "out")
          transitionOutDuration = transitionResizePreview.duration;
      }

      // Viewport bounds in content-space for internal culling of thumbnails/waveform
      const viewportLeft = scrollX - TRACK_HEADER_WIDTH;
      const viewportRight = viewportLeft + width;

      return {
        clipId: clip.id,
        clipType: clip.type,
        startTime: effectiveStartTime,
        duration: effectiveDuration,
        inPoint: effectiveInPoint,
        speed: clip.speed ?? 1,
        name: clip.name,
        assetId: clipAssetId,
        text: clip.type === "text" ? (clip as any).text : undefined,
        shape: clip.type === "shape" ? (clip as any).shape : undefined,
        transitionIn: clipTransitionIn,
        transitionOut: clipTransitionOut,
        x,
        y,
        clipWidth,
        clipHeight: trackH - CLIP_PADDING * 2,
        viewportLeft,
        viewportRight,
        isSelected,
        isGhost,
        isLocked: allTracks[effectiveTrackIndex]?.locked ?? false,
        hasLinkedClip,
        clipColor: getClipColor(clip.type, isGhost),
        trimHoverEdge: trimHover?.clipId === clip.id ? trimHover.edge : null,
        isTrimming: trimPreview?.clipId === clip.id,
        trimEdge:
          trimPreview?.clipId === clip.id && trimStateRef.current
            ? trimStateRef.current.edge
            : null,
        transitionInDuration,
        transitionOutDuration,
        isTransitionInHovered:
          transitionHover?.clipId === clip.id && transitionHover?.edge === "in",
        isTransitionOutHovered:
          transitionHover?.clipId === clip.id && transitionHover?.edge === "out",
        isTransitionInSelected:
          selectedTransition?.clipId === clip.id && selectedTransition?.edge === "in",
        isTransitionOutSelected:
          selectedTransition?.clipId === clip.id && selectedTransition?.edge === "out",
        isTransitionResizing: transitionResizeRef.current?.clipId === clip.id,
        thumbnails,
        waveformData: wf?.data,
        waveformDuration: wf?.duration,
        isZooming,
        zoom,
        fps,
      };
    },
    [
      clips,
      selectedClipIds,
      trimHover,
      trimPreview,
      transitionResizePreview,
      transitionHover,
      selectedTransition,
      thumbnailData,
      waveformMap,
      zoom,
      width,
      scrollX,
      allTracks,
      getClipColor,
      isZooming,
      fps,
      splitLayout,
      videoBaseY,
      audioBaseY,
      videoSectionTop,
      audioSectionTop,
      sectionHeight,
      getTrackHeight,
    ],
  );

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      style={{ cursor }}
      onWheel={handleWheel}
      onMouseDown={handleStageMouseDown}
      onMouseMove={handleStageMouseMove}
      onMouseUp={handleStageMouseUp}
      onMouseLeave={handleStageMouseUp}
    >
      <Layer perfectDrawEnabled={false}>
        {/* Background */}
        <Rect x={0} y={0} width={width} height={height} fill={COLORS.background} />

        {/* Track backgrounds */}
        <TrackBackgrounds
          tracks={allTracks}
          trackIndexToY={trackIndexToY}
          splitLayout={splitLayout}
          width={width}
          videoSectionTop={videoSectionTop}
          audioSectionTop={audioSectionTop}
          sectionHeight={sectionHeight}
        />

        {/* Grid lines in track area */}
        <GridLinesTrackArea gridLines={gridLines} height={height} />

        {/* Video section — clipped viewport */}
        <Group
          clipX={TRACK_HEADER_WIDTH}
          clipY={videoSectionTop}
          clipWidth={width - TRACK_HEADER_WIDTH}
          clipHeight={sectionHeight}
        >
          <Group x={TRACK_HEADER_WIDTH - scrollX} y={videoBaseY} listening={false}>
            <ClipRenderer
              clips={clips}
              allTracks={allTracks}
              section="video"
              dragPreview={dragPreview}
              trimPreview={trimPreview}
              buildClipNodeProps={buildClipNodeProps}
            />
          </Group>
          <CrossTransitionOverlays
            crossTransitions={crossTransitions}
            clips={clips}
            allTracks={allTracks}
            frameToX={frameToX}
            trackIndexToY={trackIndexToY}
            getTrackHeight={getTrackHeight}
            zoom={zoom}
            crossTransitionHover={crossTransitionHover}
            crossTransitionResizePreview={crossTransitionResizePreview}
          />
          <Group x={TRACK_HEADER_WIDTH - scrollX} y={videoBaseY} listening={false}>
            <DragPreviewClips
              clips={clips}
              allTracks={allTracks}
              section="video"
              dragPreview={dragPreview}
              buildClipNodeProps={buildClipNodeProps}
              xToFrame={xToFrame}
            />
          </Group>
        </Group>

        {/* Audio section — clipped viewport */}
        <Group
          clipX={TRACK_HEADER_WIDTH}
          clipY={audioSectionTop}
          clipWidth={width - TRACK_HEADER_WIDTH}
          clipHeight={sectionHeight}
        >
          <Group x={TRACK_HEADER_WIDTH - scrollX} y={audioBaseY} listening={false}>
            <ClipRenderer
              clips={clips}
              allTracks={allTracks}
              section="audio"
              dragPreview={dragPreview}
              trimPreview={trimPreview}
              buildClipNodeProps={buildClipNodeProps}
            />
          </Group>
          <Group x={TRACK_HEADER_WIDTH - scrollX} y={audioBaseY} listening={false}>
            <DragPreviewClips
              clips={clips}
              allTracks={allTracks}
              section="audio"
              dragPreview={dragPreview}
              buildClipNodeProps={buildClipNodeProps}
              xToFrame={xToFrame}
            />
          </Group>
        </Group>
      </Layer>

      {/* Second Layer — ruler, playhead, snap lines, selection, drops, headers */}
      <Layer perfectDrawEnabled={false}>
        {/* Snap lines */}
        <SnapLines snapLines={snapLines} frameToX={frameToX} width={width} height={height} />

        {/* Marquee selection rectangle */}
        {marqueeRect && (
          <Rect
            x={marqueeRect.x}
            y={marqueeRect.y}
            width={marqueeRect.width}
            height={marqueeRect.height}
            fill={COLORS.selection}
            stroke={COLORS.selectionBorder}
            strokeWidth={1}
            listening={false}
          />
        )}

        {/* Razor cut preview line */}
        {razorPreview && (
          <Line
            points={[
              razorPreview.x,
              razorPreview.trackY,
              razorPreview.x,
              razorPreview.trackY + razorPreview.trackHeight,
            ]}
            stroke="#ff4444"
            strokeWidth={2}
          />
        )}

        {/* Asset drop preview */}
        {dropPreview && (
          <Rect
            x={dropPreview.x}
            y={trackIndexToY(dropPreview.trackIndex) + 4}
            width={dropPreview.width}
            height={getTrackHeight(dropPreview.trackIndex) - 8}
            fill={dropPreview.isValid ? "rgba(59, 130, 246, 0.2)" : "rgba(239, 68, 68, 0.2)"}
            stroke={dropPreview.isValid ? "#3b82f6" : "#ef4444"}
            strokeWidth={2}
            dash={[6, 4]}
            cornerRadius={4}
            listening={false}
          />
        )}

        {/* Transition drop preview */}
        {transitionDropPreview && (
          <Rect
            x={transitionDropPreview.x}
            y={transitionDropPreview.y}
            width={transitionDropPreview.width}
            height={transitionDropPreview.height}
            fill="rgba(250, 204, 21, 0.25)"
            stroke="#facc15"
            strokeWidth={2}
            cornerRadius={4}
            listening={false}
          />
        )}

        {/* Cross transition drop preview */}
        {crossTransitionDropPreview && (
          <Rect
            x={crossTransitionDropPreview.x}
            y={crossTransitionDropPreview.y}
            width={crossTransitionDropPreview.width}
            height={crossTransitionDropPreview.height}
            fill="rgba(192, 132, 252, 0.25)"
            stroke="#c084fc"
            strokeWidth={2}
            cornerRadius={4}
            listening={false}
          />
        )}

        {/* Ruler background */}
        <Rect x={0} y={0} width={width} height={RULER_HEIGHT} fill={COLORS.ruler} />

        {/* Ruler time markers */}
        <RulerMarkers gridLines={gridLines} fpsFloat={fpsFloat} />

        {/* Track headers background */}
        <Rect
          x={0}
          y={0}
          width={TRACK_HEADER_WIDTH}
          height={height}
          fill={COLORS.headerBackground}
        />

        {/* Track headers — clipped per section */}
        <Group
          clipX={0}
          clipY={videoSectionTop}
          clipWidth={TRACK_HEADER_WIDTH}
          clipHeight={sectionHeight}
        >
          <TrackHeaders
            tracks={allTracks}
            trackIndexToY={trackIndexToY}
            splitLayout={splitLayout}
            section="video"
            sectionTop={videoSectionTop}
            sectionHeight={sectionHeight}
            onContextMenu={onTrackContextMenu ?? (() => {})}
          />
        </Group>
        <Group
          clipX={0}
          clipY={audioSectionTop}
          clipWidth={TRACK_HEADER_WIDTH}
          clipHeight={sectionHeight}
        >
          <TrackHeaders
            tracks={allTracks}
            trackIndexToY={trackIndexToY}
            splitLayout={splitLayout}
            section="audio"
            sectionTop={audioSectionTop}
            sectionHeight={sectionHeight}
            onContextMenu={onTrackContextMenu ?? (() => {})}
          />
        </Group>

        {/* Section divider line between video and audio */}
        <Rect
          x={0}
          y={audioSectionTop - 1}
          width={width}
          height={2}
          fill="#444444"
          listening={false}
        />

        {/* Corner piece (top-left) */}
        <Rect
          x={0}
          y={0}
          width={TRACK_HEADER_WIDTH}
          height={RULER_HEIGHT}
          fill={COLORS.headerBackground}
        />

        {/* Separator line below ruler/header */}
        <Rect
          x={0}
          y={RULER_HEIGHT - 1}
          width={width}
          height={1}
          fill="#444444"
          listening={false}
        />

        {/* Playhead */}
        <Playhead width={width} height={height} />
      </Layer>
    </Stage>
  );
}
