"use client";

import {
  secondsToFrames,
  type Transition,
  type CrossTransitionType,
  type TextStyle,
  type TextBox,
  type ShapeType,
  type ShapeStyle,
  type ShapeBox,
  type LineStyle,
  type LineBox,
} from "@tooscut/render-engine";
import { EyeIcon, EyeOffIcon, LockIcon, LockOpenIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { useVideoEditorStore, useTemporalStore } from "../../state/video-editor-store";
import { Button } from "../ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../ui/dialog";
import { TRACK_HEADER_WIDTH, RULER_HEIGHT } from "./constants";
import { TimelineStage } from "./timeline-stage";
import { computeSplitLayout, yToSectionTrackIndex } from "./track-layout";
import {
  useAssetStore,
  importFiles,
  handleNativeFileDrop,
  addAssetsToStores,
} from "./use-asset-store";

/**
 * Canvas-based timeline component.
 * Renders the entire timeline in a single Konva Stage for performance.
 */
export interface DropPreviewState {
  x: number;
  width: number;
  trackIndex: number;
  isValid: boolean;
}

export interface TransitionDropPreview {
  clipId: string;
  edge: "in" | "out";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CrossTransitionDropPreview {
  outgoingClipId: string;
  incomingClipId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function CanvasTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 300 });
  const [dropPreview, setDropPreview] = useState<DropPreviewState | null>(null);
  const [transitionDropPreview, setTransitionDropPreview] = useState<TransitionDropPreview | null>(
    null,
  );
  const [crossTransitionDropPreview, setCrossTransitionDropPreview] =
    useState<CrossTransitionDropPreview | null>(null);
  const [deleteTrackId, setDeleteTrackId] = useState<string | null>(null);
  const contextTrackIdRef = useRef<string | null>(null);
  const [contextTrackId, setContextTrackId] = useState<string | null>(null);

  // Store state for keyboard shortcuts
  const currentTime = useVideoEditorStore((s) => s.currentFrame);
  const duration = useVideoEditorStore((s) => s.durationFrames);
  const isPlaying = useVideoEditorStore((s) => s.isPlaying);
  const selectedClipIds = useVideoEditorStore((s) => s.selectedClipIds);
  const zoom = useVideoEditorStore((s) => s.zoom);
  const scrollX = useVideoEditorStore((s) => s.scrollX);
  const scrollY = useVideoEditorStore((s) => s.scrollY);
  const tracks = useVideoEditorStore((s) => s.tracks);
  const settings = useVideoEditorStore((s) => s.settings);
  const seekTo = useVideoEditorStore((s) => s.seekTo);
  const setIsPlaying = useVideoEditorStore((s) => s.setIsPlaying);
  const playbackSpeed = useVideoEditorStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useVideoEditorStore((s) => s.setPlaybackSpeed);
  const clearSelection = useVideoEditorStore((s) => s.clearSelection);
  const addClipToTrack = useVideoEditorStore((s) => s.addClipToTrack);
  const removeClip = useVideoEditorStore((s) => s.removeClip);
  const setSelectedClipIds = useVideoEditorStore((s) => s.setSelectedClipIds);
  const linkClipPair = useVideoEditorStore((s) => s.linkClipPair);

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

  const addTrack = useVideoEditorStore((s) => s.addTrack);
  const removeTrack = useVideoEditorStore((s) => s.removeTrack);
  const toggleTrackMuted = useVideoEditorStore((s) => s.toggleTrackMuted);
  const toggleTrackLocked = useVideoEditorStore((s) => s.toggleTrackLocked);
  const setActiveTool = useVideoEditorStore((s) => s.setActiveTool);
  const setClipTransitionIn = useVideoEditorStore((s) => s.setClipTransitionIn);
  const setClipTransitionOut = useVideoEditorStore((s) => s.setClipTransitionOut);
  const addCrossTransitionBetween = useVideoEditorStore((s) => s.addCrossTransitionBetween);
  const selectedTransition = useVideoEditorStore((s) => s.selectedTransition);
  const selectedCrossTransition = useVideoEditorStore((s) => s.selectedCrossTransition);
  const removeCrossTransitionById = useVideoEditorStore((s) => s.removeCrossTransitionById);
  const copySelectedClips = useVideoEditorStore((s) => s.copySelectedClips);
  const cutSelectedClips = useVideoEditorStore((s) => s.cutSelectedClips);
  const duplicateSelectedClips = useVideoEditorStore((s) => s.duplicateSelectedClips);
  const pasteClipsAtPlayhead = useVideoEditorStore((s) => s.pasteClipsAtPlayhead);
  const batchMoveClips = useVideoEditorStore((s) => s.batchMoveClips);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const trackHeightsMap = useVideoEditorStore((s) => s.trackHeights);

  // Assets are managed in a separate store for file handling
  const assets = useAssetStore((s) => s.assets);

  // Update dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width && entry.contentRect.height) {
          setDimensions({
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height),
          });
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial sizing
    const rect = containerRef.current.getBoundingClientRect();
    setDimensions({
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
    });

    return () => resizeObserver.disconnect();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement?.tagName === "INPUT" || activeElement?.tagName === "TEXTAREA") {
        return;
      }

      // Cmd/Ctrl+Z: Undo, Cmd/Ctrl+Shift+Z: Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      // Cmd/Ctrl+C: Copy selected clips
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        e.preventDefault();
        copySelectedClips();
        return;
      }

      // Cmd/Ctrl+X: Cut selected clips
      if ((e.metaKey || e.ctrlKey) && e.key === "x") {
        e.preventDefault();
        cutSelectedClips();
        return;
      }

      // Cmd/Ctrl+D: Duplicate selected clips
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelectedClips();
        return;
      }

      // Cmd/Ctrl+V: Paste clips at playhead
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        pasteClipsAtPlayhead();
        return;
      }

      // Space: Toggle play/pause (reset to 1x speed)
      if (e.key === " ") {
        e.preventDefault();
        if (isPlaying) {
          setIsPlaying(false);
        } else {
          setPlaybackSpeed(1);
          setIsPlaying(true);
        }
        return;
      }

      // J/K/L playback shortcuts
      // L: Play forward, press again to increase speed (1x -> 2x -> 4x -> 8x)
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        if (playbackSpeed <= 0) {
          // Was paused or in reverse, start forward at 1x
          setPlaybackSpeed(1);
          setIsPlaying(true);
        } else if (playbackSpeed < 8) {
          // Increase speed: 1x -> 2x -> 4x -> 8x
          setPlaybackSpeed(playbackSpeed * 2);
        }
        return;
      }

      // J: Play reverse, press again to increase reverse speed
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        if (playbackSpeed >= 0) {
          // Was paused or playing forward, start reverse at 1x
          setPlaybackSpeed(-1);
          setIsPlaying(true);
        } else if (playbackSpeed > -8) {
          // Increase reverse speed: -1x -> -2x -> -4x -> -8x
          setPlaybackSpeed(playbackSpeed * 2);
        }
        return;
      }

      // K: Pause. Hold K + tap L/J = step forward/backward one frame
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setIsPlaying(false);
        setPlaybackSpeed(1); // Reset speed to 1x
        return;
      }

      // Escape: Clear selection
      if (e.key === "Escape") {
        clearSelection();
      }

      // Delete/Backspace: Delete selected transition or selected clips
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();

        // If a cross transition is selected, remove it
        if (selectedCrossTransition) {
          removeCrossTransitionById(selectedCrossTransition);
          clearSelection();
          return;
        }

        // If a transition is selected, remove it
        if (selectedTransition) {
          if (selectedTransition.edge === "in") {
            setClipTransitionIn(selectedTransition.clipId, null);
          } else {
            setClipTransitionOut(selectedTransition.clipId, null);
          }
          clearSelection();
          return;
        }

        // Otherwise delete selected clips (and their linked clips)
        const clipsToDelete = new Set<string>();
        for (const clipId of selectedClipIds) {
          clipsToDelete.add(clipId);
          const clip = clips.find((c) => c.id === clipId);
          if (clip?.linkedClipId) {
            clipsToDelete.add(clip.linkedClipId);
          }
        }
        // Remove all clips
        for (const clipId of clipsToDelete) {
          removeClip(clipId);
        }
      }

      // Arrow keys
      const fpsFloat = settings.fps.numerator / settings.fps.denominator;

      // Left/Right with Shift or Alt: Nudge selected clips
      // Shift+Left/Right: Nudge by 1 frame
      // Alt+Left/Right: Nudge by 10 frames
      if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        (e.shiftKey || e.altKey) &&
        selectedClipIds.length > 0
      ) {
        e.preventDefault();
        const nudgeAmount = e.altKey ? 10 : 1;
        const direction = e.key === "ArrowLeft" ? -1 : 1;
        const moves = selectedClipIds.map((clipId) => {
          const clip = clips.find((c) => c.id === clipId);
          return {
            clipId,
            newStartTime: Math.max(0, (clip?.startTime ?? 0) + nudgeAmount * direction),
          };
        });
        batchMoveClips(moves);
        return;
      }

      // Left/Right without modifiers: Frame navigation (1 frame)
      if (e.key === "ArrowLeft" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const newFrame = Math.max(0, currentTime - 1);
        seekTo(newFrame);
        return;
      }
      if (e.key === "ArrowRight" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const newFrame = Math.min(duration, currentTime + 1);
        seekTo(newFrame);
        return;
      }

      // Up/Down arrows: Navigate between clips
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        // Get all video tracks sorted by z-order (higher index = higher in stack)
        const videoTracks = tracks
          .filter((t) => t.type === "video")
          .sort((a, b) => b.index - a.index);
        const audioTracks = tracks
          .filter((t) => t.type === "audio")
          .sort((a, b) => a.index - b.index);
        const allTrackIds = [...videoTracks.map((t) => t.id), ...audioTracks.map((t) => t.id)];

        if (selectedClipIds.length === 0) {
          // No clip selected: select first clip at playhead
          const clipsAtPlayhead = clips.filter(
            (c) => currentTime >= c.startTime && currentTime < c.startTime + c.duration,
          );
          if (clipsAtPlayhead.length > 0) {
            // Sort by track order and select the first one
            clipsAtPlayhead.sort(
              (a, b) => allTrackIds.indexOf(a.trackId) - allTrackIds.indexOf(b.trackId),
            );
            setSelectedClipIds([clipsAtPlayhead[0].id]);
          }
          return;
        }

        // Get the first selected clip
        const selectedClip = clips.find((c) => c.id === selectedClipIds[0]);
        if (!selectedClip) return;

        // Find clips on adjacent track
        const currentTrackIndex = allTrackIds.indexOf(selectedClip.trackId);
        const targetTrackIndex =
          e.key === "ArrowUp"
            ? Math.max(0, currentTrackIndex - 1)
            : Math.min(allTrackIds.length - 1, currentTrackIndex + 1);

        if (targetTrackIndex === currentTrackIndex) return;

        const targetTrackId = allTrackIds[targetTrackIndex];
        const clipsOnTargetTrack = clips.filter((c) => c.trackId === targetTrackId);

        if (clipsOnTargetTrack.length === 0) return;

        // Find the clip closest to the current playhead position
        let closestClip = clipsOnTargetTrack[0];
        let closestDistance = Math.abs(
          currentTime - (closestClip.startTime + closestClip.duration / 2),
        );

        for (const clip of clipsOnTargetTrack) {
          const distance = Math.abs(currentTime - (clip.startTime + clip.duration / 2));
          if (distance < closestDistance) {
            closestClip = clip;
            closestDistance = distance;
          }
        }

        setSelectedClipIds([closestClip.id]);
        return;
      }

      // Comma (,): Previous frame
      // Note: Shift+, produces "<" on most keyboards
      if (e.key === ",") {
        e.preventDefault();
        seekTo(Math.max(0, currentTime - 1));
        return;
      }

      // < (Shift+,): Jump back 1 second
      if (e.key === "<") {
        e.preventDefault();
        const newFrame = Math.max(0, currentTime - fpsFloat);
        seekTo(newFrame);
        return;
      }

      // Period (.): Next frame
      // Note: Shift+. produces ">" on most keyboards
      if (e.key === ".") {
        e.preventDefault();
        seekTo(Math.min(duration, currentTime + 1));
        return;
      }

      // > (Shift+.): Jump forward 1 second
      if (e.key === ">") {
        e.preventDefault();
        const newFrame = Math.min(duration, currentTime + fpsFloat);
        seekTo(newFrame);
        return;
      }

      // V: Select tool (only without modifiers)
      if ((e.key === "v" || e.key === "V") && !e.metaKey && !e.ctrlKey) {
        setActiveTool("select");
      }

      // C: Razor tool (only without modifiers)
      if ((e.key === "c" || e.key === "C") && !e.metaKey && !e.ctrlKey) {
        setActiveTool("razor");
      }

      // Home: Jump to start
      if (e.key === "Home") {
        e.preventDefault();
        seekTo(0);
      }

      // End: Jump to end
      if (e.key === "End") {
        e.preventDefault();
        seekTo(duration);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    currentTime,
    duration,
    isPlaying,
    playbackSpeed,
    selectedClipIds,
    clips,
    tracks,
    settings.fps,
    seekTo,
    setIsPlaying,
    setPlaybackSpeed,
    clearSelection,
    removeClip,
    setActiveTool,
    setSelectedClipIds,
    batchMoveClips,
    undo,
    redo,
    copySelectedClips,
    cutSelectedClips,
    duplicateSelectedClips,
    pasteClipsAtPlayhead,
    selectedTransition,
    setClipTransitionIn,
    setClipTransitionOut,
    selectedCrossTransition,
    removeCrossTransitionById,
  ]);

  // Combine tracks with full IDs for drop target calculation (ascending by index)
  const { _videoTracks, _audioTracks, allTracks } = useMemo(() => {
    const toTrack = (t: (typeof tracks)[0]) => ({
      id: t.id,
      fullId: t.id,
      type: t.type as "video" | "audio",
      name: t.name || `${t.type === "video" ? "Video" : "Audio"} ${t.index + 1}`,
      muted: t.muted,
      locked: t.locked,
      pairedTrackId: t.pairedTrackId,
    });
    const video = tracks
      .filter((t) => t.type === "video")
      .sort((a, b) => b.index - a.index)
      .map(toTrack);
    const audio = tracks
      .filter((t) => t.type === "audio")
      .sort((a, b) => a.index - b.index)
      .map(toTrack);
    return { _videoTracks: video, _audioTracks: audio, allTracks: [...video, ...audio] };
  }, [tracks]);

  const _splitLayout = useMemo(
    () => computeSplitLayout(_videoTracks, _audioTracks, trackHeightsMap),
    [_videoTracks, _audioTracks, trackHeightsMap],
  );

  const _sectionHeight = Math.floor((dimensions.height - RULER_HEIGHT) / 2);
  const _videoSectionTop = RULER_HEIGHT;
  const _audioSectionTop = RULER_HEIGHT + _sectionHeight;

  // Convert screen coordinates to timeline coordinates
  const xToFrame = useCallback(
    (x: number) => Math.max(0, (x - TRACK_HEADER_WIDTH + scrollX) / zoom),
    [zoom, scrollX],
  );

  // Video: bottom-aligned (V1 near divider), scroll reveals higher tracks from top
  const _videoContentH = _splitLayout.video.totalContentHeight;
  const _videoBaseY = _videoSectionTop + _sectionHeight - _videoContentH + scrollY;
  // Audio: top-aligned (A1 near divider), scroll reveals higher tracks from bottom
  const _audioBaseY = _audioSectionTop - scrollY;

  const yToTrackIndex = useCallback(
    (y: number) => {
      const numVideo = _splitLayout.videoTrackCount;
      if (y >= _videoSectionTop && y < _audioSectionTop) {
        const localY = y - _videoBaseY;
        return yToSectionTrackIndex(localY, _splitLayout.video);
      }
      if (y >= _audioSectionTop) {
        const localY = y - _audioBaseY;
        const idx = yToSectionTrackIndex(localY, _splitLayout.audio);
        return idx >= 0 ? idx + numVideo : -1;
      }
      return -1;
    },
    [_splitLayout, _videoSectionTop, _audioSectionTop, _videoBaseY, _audioBaseY],
  );

  const _trackIndexToY = useCallback(
    (index: number) => {
      const numVideo = _splitLayout.videoTrackCount;
      if (index < numVideo) {
        return _videoBaseY + (_splitLayout.video.trackYOffsets[index] ?? 0);
      }
      const audioIdx = index - numVideo;
      return _audioBaseY + (_splitLayout.audio.trackYOffsets[audioIdx] ?? 0);
    },
    [_splitLayout, _videoBaseY, _audioBaseY],
  );

  const _getTrackHeight = useCallback(
    (index: number) => {
      const numVideo = _splitLayout.videoTrackCount;
      if (index < numVideo) return _splitLayout.video.trackHeights[index] ?? 80;
      return _splitLayout.audio.trackHeights[index - numVideo] ?? 80;
    },
    [_splitLayout],
  );

  // Helper to find clip at a screen position
  const getClipAtScreenPosition = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const frame = Math.max(0, (x - TRACK_HEADER_WIDTH + scrollX) / zoom);
      const trackIndex = yToTrackIndex(y);

      if (trackIndex < 0 || trackIndex >= allTracks.length) return null;
      const track = allTracks[trackIndex];

      for (const clip of clips) {
        if (clip.trackId !== track.fullId) continue;
        if (clip.type === "audio") continue; // transitions don't apply to audio clips
        const clipEnd = clip.startTime + clip.duration;
        if (frame >= clip.startTime && frame <= clipEnd) {
          const fraction = (frame - clip.startTime) / clip.duration;
          const edge: "in" | "out" = fraction < 1 / 3 ? "in" : fraction > 2 / 3 ? "out" : "in";
          const clipX = TRACK_HEADER_WIDTH + clip.startTime * zoom - scrollX;
          const clipWidth = clip.duration * zoom;
          const clipY = _trackIndexToY(trackIndex) + 4;
          return { clip, trackIndex, edge, clipX, clipWidth, clipY };
        }
      }
      return null;
    },
    [clips, allTracks, zoom, scrollX, yToTrackIndex, _trackIndexToY],
  );

  // Extract transition duration from MIME types (encoded as application/x-transition-duration-{seconds})
  /** Extract transition duration from MIME type and convert from seconds to frames */
  const getTransitionDurationFromMime = useCallback(
    (types: readonly string[]): number => {
      const durationMime = types.find((t) => t.startsWith("application/x-transition-duration-"));
      let seconds = 0.5; // fallback
      if (durationMime) {
        const val = parseFloat(durationMime.replace("application/x-transition-duration-", ""));
        if (val > 0 && Number.isFinite(val)) seconds = val;
      }
      return secondsToFrames(seconds, settings.fps);
    },
    [settings.fps],
  );

  // Find adjacent clip boundary at screen position for cross transitions
  const getAdjacentClipBoundary = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const frame = Math.max(0, (x - TRACK_HEADER_WIDTH + scrollX) / zoom);
      const trackIndex = yToTrackIndex(y);

      if (trackIndex < 0 || trackIndex >= allTracks.length) return null;
      const track = allTracks[trackIndex];

      // Find clips on this track sorted by startTime
      const trackClips = clips
        .filter((c) => c.trackId === track.fullId && c.type !== "audio")
        .sort((a, b) => a.startTime - b.startTime);

      // Find the boundary between two adjacent clips closest to the cursor.
      // Only allow cross transitions between clips that are adjacent or nearly so (gap < 0.1s).
      const thresholdTime = 30 / zoom; // 30px tolerance in time units
      const maxGap = 1; // frames — clips further apart are not considered adjacent
      for (let i = 0; i < trackClips.length - 1; i++) {
        const outgoing = trackClips[i];
        const incoming = trackClips[i + 1];
        const outgoingEnd = outgoing.startTime + outgoing.duration;
        const gap = incoming.startTime - outgoingEnd;

        // Skip distant clips — cross transitions only between adjacent clips
        if (gap > maxGap) continue;

        const boundaryTime = outgoingEnd;

        // Check if cursor is near this boundary (within threshold of the boundary)
        if (Math.abs(frame - boundaryTime) < thresholdTime) {
          const boundaryX = TRACK_HEADER_WIDTH + boundaryTime * zoom - scrollX;
          const clipY = _trackIndexToY(trackIndex) + 4;
          return { outgoing, incoming, boundaryX, clipY, trackIndex };
        }
      }
      return null;
    },
    [clips, allTracks, zoom, scrollX, yToTrackIndex, _trackIndexToY],
  );

  // Use refs for drag handler deps to avoid stale closures with native event listeners
  const dragHandlerDepsRef = useRef({
    xToFrame,
    yToTrackIndex,
    allTracks,
    zoom,
    scrollX,
    getClipAtScreenPosition,
    getTransitionDurationFromMime,
    getAdjacentClipBoundary,
    getTrackHeight: _getTrackHeight,
  });
  dragHandlerDepsRef.current = {
    xToFrame,
    yToTrackIndex,
    allTracks,
    zoom,
    scrollX,
    getClipAtScreenPosition,
    getTransitionDurationFromMime,
    getAdjacentClipBoundary,
    getTrackHeight: _getTrackHeight,
  };

  // Native drag event listeners (bypasses React synthetic events for reliable Konva compatibility)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();

      const {
        xToFrame: _xToFrame,
        yToTrackIndex: _yToTrackIndex,
        allTracks: _allTracks,
        zoom: _zoom,
        scrollX: _scrollX,
        getClipAtScreenPosition: _getClipAtScreenPosition,
        getTransitionDurationFromMime: _getTransitionDurationFromMime,
        getAdjacentClipBoundary: _getAdjacentClipBoundary,
        getTrackHeight: _getTrackHeightRef,
      } = dragHandlerDepsRef.current;

      const hasTransitionType = e.dataTransfer!.types.includes("application/x-transition-type");
      const hasCrossTransitionType = e.dataTransfer!.types.includes(
        "application/x-cross-transition-type",
      );
      const hasAssetId = e.dataTransfer!.types.includes("application/x-asset-id");
      const hasTextTemplate = e.dataTransfer!.types.includes("application/x-text-template");
      const hasShapeTemplate = e.dataTransfer!.types.includes("application/x-shape-template");
      const hasLineTemplate = e.dataTransfer!.types.includes("application/x-line-template");

      // Handle clip transition drag-over (in/out on a single clip)
      if (hasTransitionType) {
        setDropPreview(null);
        setCrossTransitionDropPreview(null);
        const hit = _getClipAtScreenPosition(e.clientX, e.clientY);
        if (!hit) {
          setTransitionDropPreview(null);
          e.dataTransfer!.dropEffect = "none";
          return;
        }

        const defaultDuration = _getTransitionDurationFromMime(e.dataTransfer!.types);
        const previewWidth = Math.min(defaultDuration * _zoom, hit.clipWidth);
        const previewX = hit.edge === "in" ? hit.clipX : hit.clipX + hit.clipWidth - previewWidth;
        setTransitionDropPreview({
          clipId: hit.clip.id,
          edge: hit.edge,
          x: previewX,
          y: hit.clipY,
          width: previewWidth,
          height: _getTrackHeightRef(hit.trackIndex) - 8,
        });
        e.dataTransfer!.dropEffect = "copy";
        return;
      }

      // Handle cross transition drag-over (between two adjacent clips)
      if (hasCrossTransitionType) {
        setDropPreview(null);
        setTransitionDropPreview(null);
        const boundary = _getAdjacentClipBoundary(e.clientX, e.clientY);
        if (!boundary) {
          setCrossTransitionDropPreview(null);
          e.dataTransfer!.dropEffect = "none";
          return;
        }

        const defaultDuration = _getTransitionDurationFromMime(e.dataTransfer!.types);
        const halfWidth = (defaultDuration * _zoom) / 2;
        setCrossTransitionDropPreview({
          outgoingClipId: boundary.outgoing.id,
          incomingClipId: boundary.incoming.id,
          x: boundary.boundaryX - halfWidth,
          y: boundary.clipY,
          width: halfWidth * 2,
          height: _getTrackHeightRef(boundary.trackIndex) - 8,
        });
        e.dataTransfer!.dropEffect = "copy";
        return;
      }

      setTransitionDropPreview(null);
      setCrossTransitionDropPreview(null);

      const hasFiles = e.dataTransfer!.types.includes("Files");

      if (!hasAssetId && !hasTextTemplate && !hasShapeTemplate && !hasLineTemplate && !hasFiles) {
        setDropPreview(null);
        return;
      }

      // For OS file drops, show a generic preview (we don't know exact duration)
      if (hasFiles && !hasAssetId) {
        e.dataTransfer!.dropEffect = "copy";

        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const startTime = _xToFrame(x);
        const rawTrackIndex = _yToTrackIndex(y);

        // Find nearest video track (files are most likely video/image)
        const videoIndices = _allTracks
          .map((t, i) => (t.type === "video" ? i : -1))
          .filter((i) => i !== -1);

        if (videoIndices.length > 0) {
          let trackIndex = videoIndices[0];
          let minDist = Math.abs(rawTrackIndex - trackIndex);
          for (const idx of videoIndices) {
            const dist = Math.abs(rawTrackIndex - idx);
            if (dist < minDist) {
              minDist = dist;
              trackIndex = idx;
            }
          }

          const previewX = TRACK_HEADER_WIDTH + startTime * _zoom - _scrollX;
          // Use a default 5-second width for file drops
          const previewWidth = 5 * _zoom;
          setDropPreview({ x: previewX, width: previewWidth, trackIndex, isValid: true });
        }
        return;
      }

      // Text, shape, and line templates always go on video tracks
      const isAudioAsset =
        !hasTextTemplate &&
        !hasShapeTemplate &&
        !hasLineTemplate &&
        e.dataTransfer!.types.includes("application/x-asset-type-audio");
      const requiredTrackType = isAudioAsset ? "audio" : "video";

      // Get position relative to container
      const rect = el.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Calculate timeline position
      const startTime = _xToFrame(x);
      const rawTrackIndex = _yToTrackIndex(y);

      // Find compatible tracks
      const compatibleTrackIndices = _allTracks
        .map((t, i) => (t.type === requiredTrackType ? i : -1))
        .filter((i) => i !== -1);

      if (compatibleTrackIndices.length === 0) {
        setDropPreview(null);
        e.dataTransfer!.dropEffect = "none";
        return;
      }

      // Find the closest compatible track to where the user is hovering
      let trackIndex = compatibleTrackIndices[0];
      let minDistance = Math.abs(rawTrackIndex - trackIndex);

      for (const idx of compatibleTrackIndices) {
        const distance = Math.abs(rawTrackIndex - idx);
        if (distance < minDistance) {
          minDistance = distance;
          trackIndex = idx;
        }
      }

      // Calculate visual position
      const previewX = TRACK_HEADER_WIDTH + startTime * _zoom - _scrollX;

      // Extract duration from MIME types (encoded as application/x-asset-duration-{seconds})
      let previewWidth = 100;
      const durationMime = e.dataTransfer!.types.find((t: string) =>
        t.startsWith("application/x-asset-duration-"),
      );
      if (durationMime) {
        const durationStr = durationMime.replace("application/x-asset-duration-", "");
        const duration = parseFloat(durationStr);
        if (duration > 0 && Number.isFinite(duration)) {
          previewWidth = duration * _zoom;
        }
      }

      const preview = {
        x: previewX,
        width: previewWidth,
        trackIndex,
        isValid: true,
      };
      setDropPreview(preview);

      e.dataTransfer!.dropEffect = "copy";
    };

    const handleDragLeave = (e: DragEvent) => {
      // Only clear if actually leaving the container
      const rect = el.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setDropPreview(null);
        setTransitionDropPreview(null);
        setCrossTransitionDropPreview(null);
      }
    };

    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    return () => {
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
    };
  }, []);

  // Helper to find the nearest video track for a drop position
  const findNearestVideoTrack = useCallback(
    (rawTrackIndex: number) => {
      const videoTrackIndices = allTracks
        .map((t, i) => (t.type === "video" ? i : -1))
        .filter((i) => i !== -1);

      if (videoTrackIndices.length === 0) return null;

      let nearest = videoTrackIndices[0];
      let minDist = Math.abs(rawTrackIndex - nearest);
      for (const idx of videoTrackIndices) {
        const dist = Math.abs(rawTrackIndex - idx);
        if (dist < minDist) {
          minDist = dist;
          nearest = idx;
        }
      }
      return nearest;
    },
    [allTracks],
  );

  // Use ref for drop handler deps to avoid stale closures with native event listeners
  const dropHandlerDepsRef = useRef({
    assets,
    allTracks,
    clips,
    xToFrame,
    yToTrackIndex,
    addClipToTrack,
    setSelectedClipIds,
    linkClipPair,
    settings,
    findNearestVideoTrack,
    getClipAtScreenPosition,
    getAdjacentClipBoundary,
    setClipTransitionIn,
    setClipTransitionOut,
    addCrossTransitionBetween,
  });
  dropHandlerDepsRef.current = {
    assets,
    allTracks,
    clips,
    xToFrame,
    yToTrackIndex,
    addClipToTrack,
    setSelectedClipIds,
    linkClipPair,
    settings,
    findNearestVideoTrack,
    getClipAtScreenPosition,
    getAdjacentClipBoundary,
    setClipTransitionIn,
    setClipTransitionOut,
    addCrossTransitionBetween,
  };

  // Native drop event listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setDropPreview(null);
      setTransitionDropPreview(null);
      setCrossTransitionDropPreview(null);

      const d = dropHandlerDepsRef.current;

      // Handle clip transition drop (in/out)
      const transitionData = e.dataTransfer!.getData("application/x-transition-data");
      if (transitionData) {
        const hit = d.getClipAtScreenPosition(e.clientX, e.clientY);
        if (!hit) return;

        const transition = JSON.parse(transitionData) as Transition;
        // Convert duration from seconds (template) to frames (store)
        const transitionInFrames = {
          ...transition,
          duration: secondsToFrames(transition.duration, d.settings.fps),
        };
        if (hit.edge === "in") {
          d.setClipTransitionIn(hit.clip.id, transitionInFrames);
        } else {
          d.setClipTransitionOut(hit.clip.id, transitionInFrames);
        }
        d.setSelectedClipIds([hit.clip.id]);
        return;
      }

      // Handle cross transition drop (between two clips)
      const crossTransitionData = e.dataTransfer!.getData("application/x-cross-transition-data");
      if (crossTransitionData) {
        const boundary = d.getAdjacentClipBoundary(e.clientX, e.clientY);
        if (!boundary) return;

        const data = JSON.parse(crossTransitionData) as {
          type: CrossTransitionType;
          duration: number;
        };
        d.addCrossTransitionBetween(
          boundary.outgoing.id,
          boundary.incoming.id,
          data.type,
          secondsToFrames(data.duration, d.settings.fps),
        );
        return;
      }

      // Get drop position relative to container
      const rect = el.getBoundingClientRect();

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Auto-place at timeline start when the timeline is empty
      const startTime = d.clips.length === 0 ? 0 : d.xToFrame(x);
      const rawTrackIndex = d.yToTrackIndex(y);

      // Handle text template drop
      const textTemplateData = e.dataTransfer!.getData("application/x-text-template");
      if (textTemplateData) {
        const template = JSON.parse(textTemplateData) as {
          defaultDuration: number;
          name: string;
          text: string;
          style: TextStyle;
          box: TextBox;
        };
        const trackIndex = d.findNearestVideoTrack(rawTrackIndex);
        if (trackIndex === null) return;

        const track = d.allTracks[trackIndex];
        if (!track || track.type !== "video") return;

        const clipId = d.addClipToTrack({
          type: "text",
          trackId: track.fullId,
          startTime,
          duration: secondsToFrames(template.defaultDuration, d.settings.fps),
          name: template.name,
          speed: 1,
          text: template.text,
          textStyle: template.style,
          textBox: template.box,
        });

        d.setSelectedClipIds([clipId]);
        return;
      }

      // Handle shape template drop
      const shapeTemplateData = e.dataTransfer!.getData("application/x-shape-template");
      if (shapeTemplateData) {
        const template = JSON.parse(shapeTemplateData) as {
          defaultDuration: number;
          name: string;
          shape: ShapeType;
          style: ShapeStyle;
          box: ShapeBox;
        };
        const trackIndex = d.findNearestVideoTrack(rawTrackIndex);
        if (trackIndex === null) return;

        const track = d.allTracks[trackIndex];
        if (!track || track.type !== "video") return;

        const clipId = d.addClipToTrack({
          type: "shape",
          trackId: track.fullId,
          startTime,
          duration: secondsToFrames(template.defaultDuration, d.settings.fps),
          name: template.name,
          speed: 1,
          shape: template.shape,
          shapeStyle: template.style,
          shapeBox: template.box,
        });

        d.setSelectedClipIds([clipId]);
        return;
      }

      // Handle line template drop
      const lineTemplateData = e.dataTransfer!.getData("application/x-line-template");
      if (lineTemplateData) {
        const template = JSON.parse(lineTemplateData) as {
          defaultDuration: number;
          name: string;
          style: LineStyle;
          box: LineBox;
        };
        const trackIndex = d.findNearestVideoTrack(rawTrackIndex);
        if (trackIndex === null) return;

        const track = d.allTracks[trackIndex];
        if (!track || track.type !== "video") return;

        const clipId = d.addClipToTrack({
          type: "line",
          trackId: track.fullId,
          startTime,
          duration: secondsToFrames(template.defaultDuration, d.settings.fps),
          name: template.name,
          speed: 1,
          lineStyle: template.style,
          lineBox: template.box,
        });

        d.setSelectedClipIds([clipId]);
        return;
      }

      // Handle asset drop (from assets panel)
      const assetId = e.dataTransfer!.getData("application/x-asset-id");
      if (assetId) {
        const asset = d.assets.find((a) => a.id === assetId);
        if (!asset) return;

        const trackIndex = rawTrackIndex;

        // Validate track index
        if (trackIndex < 0 || trackIndex >= d.allTracks.length) return;

        const track = d.allTracks[trackIndex];

        // Check if asset type matches track type
        const assetTrackType = asset.type === "audio" ? "audio" : "video";
        if (assetTrackType !== track.type) return;

        const clipType =
          asset.type === "audio" ? "audio" : asset.type === "image" ? "image" : "video";

        // Calculate fit-to-screen transform for video/image clips
        let transform: { scale_x: number; scale_y: number } | undefined;
        if ((asset.type === "video" || asset.type === "image") && asset.width && asset.height) {
          const scaleX = d.settings.width / asset.width;
          const scaleY = d.settings.height / asset.height;
          const scale = Math.min(scaleX, scaleY);
          transform = { scale_x: scale, scale_y: scale };
        }

        // Convert asset duration from seconds (asset store) to frames (clip store)
        const durationFrames = secondsToFrames(asset.duration, d.settings.fps);

        // Image clips don't set assetDuration since they have no inherent duration limit
        const clipId = d.addClipToTrack({
          type: clipType,
          trackId: track.fullId,
          startTime,
          duration: durationFrames,
          name: asset.name,
          assetId: asset.id,
          speed: 1,
          assetDuration: clipType === "image" ? undefined : durationFrames,
          transform,
        });

        if (asset.type === "video" && track.pairedTrackId) {
          const audioTrack = d.allTracks.find((t) => t.fullId === track.pairedTrackId);
          if (audioTrack) {
            const audioClipId = d.addClipToTrack({
              type: "audio",
              trackId: audioTrack.fullId,
              startTime,
              duration: durationFrames,
              name: `${asset.name} (Audio)`,
              assetId: asset.id,
              speed: 1,
              assetDuration: durationFrames,
            });
            d.linkClipPair(clipId, audioClipId);
          }
        }

        d.setSelectedClipIds([clipId]);
        return;
      }

      // Handle file drop from OS (Finder / Explorer)
      if (e.dataTransfer!.files.length > 0) {
        handleNativeFileDrop(e, (files, handles) => {
          void (async () => {
            const imported = await importFiles(files, handles);

            let asset: (typeof imported)[number] | undefined;
            if (imported.length > 0) {
              addAssetsToStores(imported);
              asset = imported[0];
            } else {
              // File was already imported (dedup) — find existing asset by name+size
              const file = files[0];
              asset = useAssetStore
                .getState()
                .assets.find((a) => a.name === file.name && a.size === file.size);
            }
            if (!asset) return;
            const rect = el.getBoundingClientRect();

            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const d = dropHandlerDepsRef.current;
            const dropStartTime = d.clips.length === 0 ? 0 : d.xToFrame(x);
            const rawIdx = d.yToTrackIndex(y);

            const isAudio = asset.type === "audio";
            const requiredTrackType = isAudio ? "audio" : "video";
            const trackIndex = isAudio ? rawIdx : d.findNearestVideoTrack(rawIdx);
            if (trackIndex === null) return;
            if (trackIndex < 0 || trackIndex >= d.allTracks.length) return;

            const track = d.allTracks[trackIndex];
            if (track.type !== requiredTrackType) return;

            const clipType =
              asset.type === "audio" ? "audio" : asset.type === "image" ? "image" : "video";

            let transform: { scale_x: number; scale_y: number } | undefined;
            if ((asset.type === "video" || asset.type === "image") && asset.width && asset.height) {
              const scaleX = d.settings.width / asset.width;
              const scaleY = d.settings.height / asset.height;
              const scale = Math.min(scaleX, scaleY);
              transform = { scale_x: scale, scale_y: scale };
            }

            const fileDurationFrames = secondsToFrames(asset.duration, d.settings.fps);

            const newClipId = d.addClipToTrack({
              type: clipType,
              trackId: track.fullId,
              startTime: dropStartTime,
              duration: fileDurationFrames,
              name: asset.name,
              assetId: asset.id,
              speed: 1,
              assetDuration: clipType === "image" ? undefined : fileDurationFrames,
              transform,
            });

            if (asset.type === "video" && track.pairedTrackId) {
              const audioTrack = d.allTracks.find((t) => t.fullId === track.pairedTrackId);
              if (audioTrack) {
                const audioClipId = d.addClipToTrack({
                  type: "audio",
                  trackId: audioTrack.fullId,
                  startTime: dropStartTime,
                  duration: fileDurationFrames,
                  name: `${asset.name} (Audio)`,
                  assetId: asset.id,
                  speed: 1,
                  assetDuration: fileDurationFrames,
                });
                d.linkClipPair(newClipId, audioClipId);
              }
            }

            d.setSelectedClipIds([newClipId]);
          })();
        });
      }
    };

    el.addEventListener("drop", handleDrop);
    return () => el.removeEventListener("drop", handleDrop);
  }, []);

  const contextTrack = contextTrackId ? tracks.find((t) => t.id === contextTrackId) : null;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger
          className="relative block h-full w-full overflow-hidden"
          ref={containerRef}
        >
          {dimensions.width > 0 && dimensions.height > 0 && (
            <TimelineStage
              width={dimensions.width}
              height={dimensions.height}
              dropPreview={dropPreview}
              transitionDropPreview={transitionDropPreview}
              crossTransitionDropPreview={crossTransitionDropPreview}
              onTrackContextMenu={(trackId) => {
                contextTrackIdRef.current = trackId;
                setContextTrackId(trackId);
              }}
            />
          )}

          {/* Add track button (top-left corner) */}
          <Button
            size="sm"
            onClick={() => addTrack()}
            className="absolute top-2 left-2 z-10 h-6 px-2 py-0"
            title="Add track pair"
          >
            <PlusIcon className="size-3" /> Track
          </Button>
        </ContextMenuTrigger>

        {contextTrack && (
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => {
                toggleTrackMuted(contextTrack.id);
              }}
            >
              {contextTrack.muted ? <EyeIcon /> : <EyeOffIcon />}
              {contextTrack.muted
                ? contextTrack.type === "video"
                  ? "Show"
                  : "Unmute"
                : contextTrack.type === "video"
                  ? "Hide"
                  : "Mute"}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                toggleTrackLocked(contextTrack.id);
              }}
            >
              {contextTrack.locked ? <LockOpenIcon /> : <LockIcon />}
              {contextTrack.locked ? "Unlock" : "Lock"}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              disabled={tracks.length <= 2}
              onClick={() => {
                if (tracks.length <= 2) return;
                const pairedId = contextTrack.pairedTrackId;
                const hasClips = clips.some(
                  (c) => c.trackId === contextTrack.id || (pairedId && c.trackId === pairedId),
                );
                if (hasClips) {
                  setDeleteTrackId(contextTrack.id);
                } else {
                  removeTrack(contextTrack.id);
                }
              }}
            >
              <Trash2Icon />
              Delete Track
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>

      {/* Delete track confirmation dialog */}
      <Dialog
        open={deleteTrackId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTrackId(null);
        }}
      >
        <DialogPopup showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Track</DialogTitle>
            <DialogDescription>
              This track and its paired audio/video track contain clips. Deleting will remove both
              tracks and all their clips. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="bare">
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTrackId) {
                  removeTrack(deleteTrackId);
                  setDeleteTrackId(null);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
