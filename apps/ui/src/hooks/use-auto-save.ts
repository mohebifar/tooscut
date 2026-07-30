import { EvaluatorManager } from "@tooscut/render-engine";
import { useEffect } from "react";

import { buildLayersForTime } from "../lib/layer-builder";
import { db } from "../state/db";
import { useVideoEditorStore } from "../state/video-editor-store";
import { getSharedCompositor } from "../workers/compositor-api";

/**
 * The slice of store state a save persists. Captured at the moment a change
 * is observed rather than read from the global store when the write finally
 * executes — otherwise a queued/retried save could pick up a *different*
 * project's state after navigation and write it into this project's row.
 */
type SaveSnapshot = {
  clips: ReturnType<typeof useVideoEditorStore.getState>["clips"];
  tracks: ReturnType<typeof useVideoEditorStore.getState>["tracks"];
  crossTransitions: ReturnType<typeof useVideoEditorStore.getState>["crossTransitions"];
  markers: ReturnType<typeof useVideoEditorStore.getState>["markers"];
  assets: ReturnType<typeof useVideoEditorStore.getState>["assets"];
  settings: ReturnType<typeof useVideoEditorStore.getState>["settings"];
};

function persistSnapshot(projectId: string, snapshot: SaveSnapshot) {
  const assetsToSave = snapshot.assets.map((a) => ({
    ...a,
    url: "", // blob URLs aren't persistable; restored via file handle hydration
  }));
  return db.projects.update(projectId, {
    content: {
      tracks: snapshot.tracks,
      clips: snapshot.clips,
      crossTransitions: snapshot.crossTransitions,
      markers: snapshot.markers,
      assets: assetsToSave,
    },
    settings: snapshot.settings,
    updatedAt: Date.now(),
  });
}

const THUMB_MAX_WIDTH = 320;

/**
 * Generate a project thumbnail using the shared compositor.
 * Renders the frame at `currentTime` and stores a JPEG data URL in the DB.
 */
async function generateThumbnail(projectId: string): Promise<void> {
  const compositor = getSharedCompositor();
  if (!compositor?.isReady) return;

  const {
    clips,
    tracks,
    crossTransitions,
    settings,
    currentFrame: currentTime,
  } = useVideoEditorStore.getState();

  // Nothing to render if there are no clips
  if (clips.length === 0) return;

  // Compute thumbnail size preserving aspect ratio
  const aspect = settings.width / settings.height;
  const thumbWidth = Math.min(THUMB_MAX_WIDTH, settings.width);
  const thumbHeight = Math.round(thumbWidth / aspect);

  const evaluatorManager = new EvaluatorManager();

  try {
    const { frame } = buildLayersForTime({
      clips,
      tracks,
      crossTransitions,
      settings,
      timelineTime: currentTime,
      evaluatorManager,
    });

    const arrayBuffer = await compositor.captureThumbnail(frame, thumbWidth, thumbHeight);

    // Convert ArrayBuffer to data URL
    const blob = new Blob([arrayBuffer], { type: "image/jpeg" });
    const dataUrl = await blobToDataUrl(blob);

    await db.projects.update(projectId, { thumbnailDataUrl: dataUrl });
  } catch (err) {
    // Thumbnail generation is best-effort — don't break auto-save
    console.warn("[useAutoSave] Thumbnail generation failed:", err);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useAutoSave(projectId: string) {
  useEffect(() => {
    // All queue state is scoped to this effect (i.e. to this projectId) rather
    // than living in refs that survive a projectId change. Combined with
    // snapshotting state at observation time, that makes it structurally
    // impossible for a queued save to write another project's content here.
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let thumbTimer: ReturnType<typeof setTimeout> | null = null;
    let saving = false;
    // Latest observed state not yet written. Newer snapshots replace older
    // ones — only the most recent matters.
    let pending: SaveSnapshot | null = null;

    const flush = () => {
      if (saving || !pending) return;
      const snapshot = pending;
      pending = null;
      saving = true;
      void persistSnapshot(projectId, snapshot)
        .catch((err) => console.error("[useAutoSave] Save failed:", err))
        .finally(() => {
          saving = false;
          // A newer snapshot arrived while this write was in flight.
          if (pending) flush();
        });
    };

    const unsubscribe = useVideoEditorStore.subscribe(
      (state) => ({
        clips: state.clips,
        tracks: state.tracks,
        crossTransitions: state.crossTransitions,
        markers: state.markers,
        assets: state.assets,
        settings: state.settings,
      }),
      (snapshot) => {
        pending = snapshot;

        // Debounced project save (1s)
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          flush();
        }, 1000);

        // Debounced thumbnail generation (5s)
        if (thumbTimer) clearTimeout(thumbTimer);
        thumbTimer = setTimeout(() => {
          thumbTimer = null;
          void generateThumbnail(projectId);
        }, 5000);
      },
      {
        equalityFn: (a, b) =>
          a.clips === b.clips &&
          a.tracks === b.tracks &&
          a.crossTransitions === b.crossTransitions &&
          a.markers === b.markers &&
          a.assets === b.assets &&
          a.settings === b.settings,
      },
    );

    return () => {
      unsubscribe();
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (thumbTimer) {
        clearTimeout(thumbTimer);
        thumbTimer = null;
      }
      // Write any un-persisted change immediately. Safe even after navigation:
      // `pending` holds state captured while THIS project was active, so it
      // can only ever be written back to this projectId.
      flush();
    };
  }, [projectId]);
}
