"use client";

import { secondsToFrames, type Transition, type CrossTransitionType } from "@tooscut/render-engine";
import { PlusIcon } from "lucide-react";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";

import { useVideoEditorStore, useTemporalStore } from "../../state/video-editor-store";
import { Button } from "../ui/button";
import { TRACK_HEADER_WIDTH, RULER_HEIGHT, TRACK_HEIGHT } from "./constants";
import { TimelineStage } from "./timeline-stage";
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
  const clearSelection = useVideoEditorStore((s) => s.clearSelection);
  const addClipToTrack = useVideoEditorStore((s) => s.addClipToTrack);
  const removeClip = useVideoEditorStore((s) => s.removeClip);
  const setSelectedClipIds = useVideoEditorStore((s) => s.setSelectedClipIds);
  const linkClipPair = useVideoEditorStore((s) => s.linkClipPair);
  const clips = useVideoEditorStore((s) => s.clips);
  const addTrack = useVideoEditorStore((s) => s.addTrack);
  const setActiveTool = useVideoEditorStore((s) => s.setActiveTool);
  const setClipTransitionIn = useVideoEditorStore((s) => s.setClipTransitionIn);
  const setClipTransitionOut = useVideoEditorStore((s) => s.setClipTransitionOut);
  const addCrossTransitionBetween = useVideoEditorStore((s) => s.addCrossTransitionBetween);
  const selectedTransition = useVideoEditorStore((s) => s.selectedTransition);
  const selectedCrossTransition = useVideoEditorStore((s) => s.selectedCrossTransition);
  const removeCrossTransitionById = useVideoEditorStore((s) => s.removeCrossTransitionById);
  const copySelectedClips = useVideoEditorStore((s) => s.copySelectedClips);
  const pasteClipsAtPlayhead = useVideoEditorStore((s) => s.pasteClipsAtPlayhead);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);

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

      // Cmd/Ctrl+V: Paste clips at playhead
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        pasteClipsAtPlayhead();
        return;
      }

      // Space: Toggle play/pause
      if (e.key === " ") {
        e.preventDefault();
        setIsPlaying(!isPlaying);
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

      // Arrow keys: Frame navigation (1/30 second per frame)
      const frameTime = 1 / 30;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newTime = Math.max(0, currentTime - (e.shiftKey ? 1 : frameTime));
        seekTo(newTime);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const newTime = Math.min(duration, currentTime + (e.shiftKey ? 1 : frameTime));
        seekTo(newTime);
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
    selectedClipIds,
    clips,
    seekTo,
    setIsPlaying,
    clearSelection,
    removeClip,
    setActiveTool,
    undo,
    redo,
    copySelectedClips,
    pasteClipsAtPlayhead,
    selectedTransition,
    setClipTransitionIn,
    setClipTransitionOut,
    selectedCrossTransition,
    removeCrossTransitionById,
  ]);

  // Combine tracks with full IDs for drop target calculation
  const videoTracksFiltered = tracks
    .filter((t) => t.type === "video")
    .sort((a, b) => b.index - a.index);
  const audioTracksFiltered = tracks
    .filter((t) => t.type === "audio")
    .sort((a, b) => a.index - b.index);
  const allTracks = useMemo(
    () => [
      ...videoTracksFiltered.map((t) => ({
        id: t.id,
        fullId: t.id,
        type: "video" as const,
        name: t.name || `Video ${t.index + 1}`,
        index: t.index,
        pairedTrackId: t.pairedTrackId,
      })),
      ...audioTracksFiltered.map((t) => ({
        id: t.id,
        fullId: t.id,
        type: "audio" as const,
        name: t.name || `Audio ${t.index + 1}`,
        index: t.index,
        pairedTrackId: t.pairedTrackId,
      })),
    ],
    [videoTracksFiltered, audioTracksFiltered],
  );

  // Convert screen coordinates to timeline coordinates
  const xToFrame = useCallback(
    (x: number) => Math.max(0, (x - TRACK_HEADER_WIDTH + scrollX) / zoom),
    [zoom, scrollX],
  );

  const yToTrackIndex = useCallback(
    (y: number) => Math.floor((y - RULER_HEIGHT + scrollY) / TRACK_HEIGHT),
    [scrollY],
  );

  // Helper to find clip at a screen position
  const getClipAtScreenPosition = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const frame = Math.max(0, (x - TRACK_HEADER_WIDTH + scrollX) / zoom);
      const trackIndex = Math.floor((y - RULER_HEIGHT + scrollY) / TRACK_HEIGHT);

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
          const clipY = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollY + 4;
          return { clip, trackIndex, edge, clipX, clipWidth, clipY };
        }
      }
      return null;
    },
    [clips, allTracks, zoom, scrollX, scrollY],
  );

  // Extract transition duration from MIME types (encoded as application/x-transition-duration-{seconds})
  const getTransitionDurationFromMime = useCallback((types: readonly string[]): number => {
    const durationMime = types.find((t) => t.startsWith("application/x-transition-duration-"));
    if (durationMime) {
      const val = parseFloat(durationMime.replace("application/x-transition-duration-", ""));
      if (val > 0 && Number.isFinite(val)) return val;
    }
    return 0.5; // fallback
  }, []);

  // Find adjacent clip boundary at screen position for cross transitions
  const getAdjacentClipBoundary = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const frame = Math.max(0, (x - TRACK_HEADER_WIDTH + scrollX) / zoom);
      const trackIndex = Math.floor((y - RULER_HEIGHT + scrollY) / TRACK_HEIGHT);

      if (trackIndex < 0 || trackIndex >= allTracks.length) return null;
      const track = allTracks[trackIndex];

      // Find clips on this track sorted by startTime
      const trackClips = clips
        .filter((c) => c.trackId === track.fullId && c.type !== "audio")
        .sort((a, b) => a.startTime - b.startTime);

      // Find the boundary between two adjacent clips closest to the cursor.
      // Only allow cross transitions between clips that are adjacent or nearly so (gap < 0.1s).
      const thresholdTime = 30 / zoom; // 30px tolerance in time units
      const maxGap = 0.1; // seconds — clips further apart are not considered adjacent
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
          const clipY = RULER_HEIGHT + trackIndex * TRACK_HEIGHT - scrollY + 4;
          return { outgoing, incoming, boundaryX, clipY, trackIndex };
        }
      }
      return null;
    },
    [clips, allTracks, zoom, scrollX, scrollY],
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
          height: TRACK_HEIGHT - 8,
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
          height: TRACK_HEIGHT - 8,
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
        if (hit.edge === "in") {
          d.setClipTransitionIn(hit.clip.id, transition);
        } else {
          d.setClipTransitionOut(hit.clip.id, transition);
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
          data.duration,
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
          style: Record<string, unknown>;
          box: Record<string, unknown>;
        };
        const trackIndex = d.findNearestVideoTrack(rawTrackIndex);
        if (trackIndex === null) return;

        const track = d.allTracks[trackIndex];
        if (!track || track.type !== "video") return;

        const clipId = d.addClipToTrack({
          type: "text",
          trackId: track.fullId,
          startTime,
          duration: template.defaultDuration,
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
          shape: string;
          style: Record<string, unknown>;
          box: Record<string, unknown>;
        };
        const trackIndex = d.findNearestVideoTrack(rawTrackIndex);
        if (trackIndex === null) return;

        const track = d.allTracks[trackIndex];
        if (!track || track.type !== "video") return;

        const clipId = d.addClipToTrack({
          type: "shape",
          trackId: track.fullId,
          startTime,
          duration: template.defaultDuration,
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
          style: Record<string, unknown>;
          box: Record<string, unknown>;
        };
        const trackIndex = d.findNearestVideoTrack(rawTrackIndex);
        if (trackIndex === null) return;

        const track = d.allTracks[trackIndex];
        if (!track || track.type !== "video") return;

        const clipId = d.addClipToTrack({
          type: "line",
          trackId: track.fullId,
          startTime,
          duration: template.defaultDuration,
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

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {dimensions.width > 0 && dimensions.height > 0 && (
        <TimelineStage
          width={dimensions.width}
          height={dimensions.height}
          dropPreview={dropPreview}
          transitionDropPreview={transitionDropPreview}
          crossTransitionDropPreview={crossTransitionDropPreview}
        />
      )}

      {/* Add track button (top-left corner) */}
      <Button
        size="sm"
        onClick={() => addTrack()}
        className="absolute top-2 left-2 z-10 h-6 px-2 py-0"
        title="Add track pair"
      >
        <PlusIcon className="size-2" /> Track
      </Button>
    </div>
  );
}
