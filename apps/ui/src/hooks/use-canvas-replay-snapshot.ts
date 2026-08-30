import { EvaluatorManager } from "@tooscut/render-engine";
import { useEffect, type RefObject } from "react";

import { buildLayersForTime } from "../lib/layer-builder";
import { useVideoEditorStore } from "../state/video-editor-store";
import { getSharedCompositor } from "../workers/compositor-api";

// Snapshot cadence and size. Kept low: the snapshot exists only so session
// replay has a real image to record, not for the user, who sees the live
// canvas at full rate.
const SNAPSHOT_INTERVAL_MS = 2000;
const SNAPSHOT_MAX_WIDTH = 320;

/**
 * Mirror the preview canvas into a DOM `<img>` for session replay.
 *
 * The preview `<canvas>` is transferred to a worker with
 * transferControlToOffscreen(), so its pixels never live on the main thread.
 * Session replay (rrweb) therefore records the stage blank. This hook renders
 * the same frame the worker already draws into a small JPEG data URL on a low
 * cadence and writes it to `imgRef`, giving replay a faithful image to capture.
 *
 * The snapshot is skipped while the frame has not changed, so an idle editor
 * stops emitting near-identical images into the replay stream.
 */
export function useCanvasReplaySnapshot(
  imgRef: RefObject<HTMLImageElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;
    // The frame reflected by the last snapshot. New array identities from an
    // edit, or a new frame number from scrubbing/playback, mean a re-capture.
    let lastFrame = -1;
    let lastClips: unknown = null;
    let lastTracks: unknown = null;
    let lastCrossTransitions: unknown = null;
    const evaluatorManager = new EvaluatorManager();

    const capture = async () => {
      if (inFlight) return;
      const img = imgRef.current;
      if (!img) return;

      const compositor = getSharedCompositor();
      if (!compositor?.isReady || compositor.crashed) return;

      const { clips, tracks, crossTransitions, settings, currentFrame, isPlaying } =
        useVideoEditorStore.getState();
      if (clips.length === 0) return;

      // Don't capture during playback. The readback is serialized ahead of the
      // live render on the shared worker queue, so a snapshot mid-playback
      // stutters the preview; replay keeps the last still until playback stops.
      if (isPlaying) return;

      // Skip when nothing that affects the frame has changed — an idle editor
      // should not flood replay with copies of the same image.
      if (
        currentFrame === lastFrame &&
        clips === lastClips &&
        tracks === lastTracks &&
        crossTransitions === lastCrossTransitions
      ) {
        return;
      }

      const aspect = settings.width / settings.height;
      const thumbWidth = Math.min(SNAPSHOT_MAX_WIDTH, settings.width);
      const thumbHeight = Math.round(thumbWidth / aspect);

      inFlight = true;
      try {
        const { frame } = buildLayersForTime({
          clips,
          tracks,
          crossTransitions,
          settings,
          timelineTime: currentFrame,
          evaluatorManager,
        });

        const buffer = await compositor.captureThumbnail(frame, thumbWidth, thumbHeight);
        if (cancelled) return;

        const dataUrl = await blobToDataUrl(new Blob([buffer], { type: "image/jpeg" }));
        if (cancelled) return;

        img.src = dataUrl;
        lastFrame = currentFrame;
        lastClips = clips;
        lastTracks = tracks;
        lastCrossTransitions = crossTransitions;
      } catch {
        // Best-effort — replay visibility must never break the editor.
      } finally {
        inFlight = false;
      }
    };

    void capture();
    const interval = setInterval(() => void capture(), SNAPSHOT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, imgRef]);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
