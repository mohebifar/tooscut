import { EvaluatorManager } from "@tooscut/render-engine";
import { useEffect, useRef } from "react";

import { buildLayersForTime } from "../lib/layer-builder";
import { db } from "../state/db";
import { useVideoEditorStore } from "../state/video-editor-store";
import { getSharedCompositor } from "../workers/compositor-api";

function saveProject(projectId: string) {
  const { clips, tracks, crossTransitions, markers, assets, settings } =
    useVideoEditorStore.getState();
  const assetsToSave = assets.map((a) => ({
    ...a,
    url: "", // blob URLs aren't persistable; restored via file handle hydration
  }));
  return db.projects.update(projectId, {
    content: {
      tracks,
      clips,
      crossTransitions,
      markers,
      assets: assetsToSave,
    },
    settings,
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against overlapping db.projects.update() calls: if the debounce
  // fires again while a save is still in flight (slow IndexedDB, big
  // project), queue one follow-up save instead of racing a second write.
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);

  useEffect(() => {
    const runSave = (id: string) => {
      if (savingRef.current) {
        saveAgainRef.current = true;
        return;
      }
      savingRef.current = true;
      void saveProject(id)
        .catch((err) => console.error("[useAutoSave] Save failed:", err))
        .finally(() => {
          savingRef.current = false;
          if (saveAgainRef.current) {
            saveAgainRef.current = false;
            runSave(id);
          }
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
      () => {
        // Debounced project save (1s)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          runSave(projectId);
        }, 1000);

        // Debounced thumbnail generation (5s)
        if (thumbTimeoutRef.current) {
          clearTimeout(thumbTimeoutRef.current);
        }
        thumbTimeoutRef.current = setTimeout(() => {
          thumbTimeoutRef.current = null;
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
      // Flush any pending save immediately so changes aren't lost
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        runSave(projectId);
      }
      if (thumbTimeoutRef.current) {
        clearTimeout(thumbTimeoutRef.current);
        thumbTimeoutRef.current = null;
      }
    };
  }, [projectId]);
}
