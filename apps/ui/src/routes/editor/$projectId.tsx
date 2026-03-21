import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { VideoEditorLayout } from "../../components/editor/video-editor-layout";
import { AssetPanel } from "../../components/editor/asset-panel";
import { PreviewPanel } from "../../components/editor/preview-panel";
import { PropertiesPanel } from "../../components/editor/properties-panel";
import { TimelinePanel } from "../../components/editor/timeline-panel";
import { PlaybackControls } from "../../components/editor/playback-controls";
import { Toolbar } from "../../components/editor/toolbar";
import { Button } from "../../components/ui/button";
import { useAudioEngine } from "../../hooks/use-audio-engine";
import { useAutoSave } from "../../hooks/use-auto-save";
import { useVideoEditorStore } from "../../state/video-editor-store";
import {
  useAssetStore,
  hydrateAssets,
  requestPermissionAndHydrate,
} from "../../components/timeline/use-asset-store";
import { db } from "../../state/db";
import type { MediaAsset } from "../../state/video-editor-store";

export const Route = createFileRoute("/editor/$projectId")({
  component: EditorPage,
});

function EditorPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPermissionIds, setPendingPermissionIds] = useState<string[]>([]);
  const [savedAssets, setSavedAssets] = useState<MediaAsset[]>([]);

  // Initialize audio engine for playback
  useAudioEngine();

  // Auto-save project changes
  useAutoSave(projectId);

  // Load project on mount
  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      try {
        const project = await db.projects.get(projectId);
        if (cancelled) return;

        if (!project) {
          setError("Project not found");
          setLoading(false);
          return;
        }

        // Hydrate the Zustand store with project data
        useVideoEditorStore.getState().loadProject({
          tracks: project.content.tracks,
          clips: project.content.clips,
          crossTransitions: project.content.crossTransitions,
          assets: project.content.assets,
          settings: project.settings,
        });

        // Clear undo history so the empty initial state isn't in the stack
        useVideoEditorStore.temporal.getState().clear();

        // Hydrate file handles: restore blob URLs from stored FileSystemFileHandles
        if (project.content.assets.length > 0) {
          const { hydrated, pendingIds } = await hydrateAssets(project.content.assets);
          if (cancelled) return;

          // Update the main editor store with restored blob URLs
          const store = useVideoEditorStore.getState();
          for (const asset of hydrated) {
            store.updateAssetUrl(asset.id, asset.url);
          }

          // Populate the UI asset store (with file objects for preview/thumbnails)
          if (hydrated.length > 0) {
            useAssetStore.getState().addAssets(hydrated);
          }

          // If some assets need user permission, show prompt
          if (pendingIds.length > 0) {
            setPendingPermissionIds(pendingIds);
            setSavedAssets(project.content.assets);
          }
        }

        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load project:", err);
          setError("Failed to load project");
          setLoading(false);
        }
      }
    }

    void loadProject();

    return () => {
      cancelled = true;
      // Reset store when leaving the editor
      useVideoEditorStore.getState().resetStore();
      useVideoEditorStore.temporal.getState().clear();
      useAssetStore.getState().clearAssets();
    };
  }, [projectId]);

  const handleGrantPermission = async () => {
    const hydrated = await requestPermissionAndHydrate(pendingPermissionIds, savedAssets);

    // Update both stores with the newly-granted assets
    const store = useVideoEditorStore.getState();
    for (const asset of hydrated) {
      store.updateAssetUrl(asset.id, asset.url);
    }
    if (hydrated.length > 0) {
      useAssetStore.getState().addAssets(hydrated);
    }

    setPendingPermissionIds([]);
    setSavedAssets([]);
  };

  return (
    <>
      <VideoEditorLayout
        toolbar={<Toolbar />}
        assetPanel={<AssetPanel />}
        previewPanel={<PreviewPanel />}
        propertiesPanel={<PropertiesPanel />}
        timeline={<TimelinePanel />}
        playbackControls={<PlaybackControls />}
      />

      {/* Permission prompt — must be triggered by user gesture */}
      {pendingPermissionIds.length > 0 && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md text-center shadow-lg">
            <p className="text-foreground font-medium mb-2">
              {pendingPermissionIds.length} file{pendingPermissionIds.length > 1 ? "s" : ""} need
              access permission
            </p>
            <p className="text-muted-foreground text-sm mb-4">
              Your browser requires you to re-grant access to local files after a reload.
            </p>
            <Button onClick={handleGrantPermission}>Grant Access</Button>
          </div>
        </div>
      )}

      {/* Overlay loading/error state so the canvas stays mounted (transferControlToOffscreen is one-shot) */}
      {(loading || error) && (
        <div className="fixed inset-0 z-50 bg-background flex items-center justify-center flex-col gap-4">
          {error ? (
            <>
              <p className="text-destructive text-lg">{error}</p>
              <Button variant="link" onClick={() => navigate({ to: "/" })}>
                Back to projects
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">Loading project...</p>
          )}
        </div>
      )}
    </>
  );
}
