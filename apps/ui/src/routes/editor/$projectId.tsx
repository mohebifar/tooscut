import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { framesToSeconds } from "@tooscut/render-engine";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import type { MediaAsset } from "../../state/video-editor-store";

import { AssetPanel } from "../../components/editor/asset-panel";
import { KeyboardShortcutsModal } from "../../components/editor/keyboard-shortcuts-modal";
import { PlaybackControls } from "../../components/editor/playback-controls";
import { PreviewPanel } from "../../components/editor/preview-panel";
import { PropertiesPanel } from "../../components/editor/properties-panel";
import { TimelinePanel } from "../../components/editor/timeline-panel";
import { Toolbar } from "../../components/editor/toolbar";
import { VideoEditorLayout } from "../../components/editor/video-editor-layout";
import {
  useAssetStore,
  hydrateAssets,
  requestPermissionAndHydrate,
} from "../../components/timeline/use-asset-store";
import { Button } from "../../components/ui/button";
import { useAudioEngine } from "../../hooks/use-audio-engine";
import { useAutoSave } from "../../hooks/use-auto-save";
import { hydrateLutAsset } from "../../lib/lut-manager";
import { db } from "../../state/db";
import { useVideoEditorStore } from "../../state/video-editor-store";

export const Route = createFileRoute("/editor/$projectId")({
  component: EditorPage,
  ssr: false,
  pendingComponent: EditorSkeleton,
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === true || search.new === "true",
  }),
});

function EditorPage() {
  const { projectId } = Route.useParams();
  const { new: isNewProject } = Route.useSearch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPermissionIds, setPendingPermissionIds] = useState<string[]>([]);
  // Explicitly denied assets are recoverable (the handle is still there) but
  // distinct from "prompt" — surfaced with different copy so the user
  // understands they said no rather than the file being missing.
  const [deniedPermissionIds, setDeniedPermissionIds] = useState<string[]>([]);
  const [savedAssets, setSavedAssets] = useState<MediaAsset[]>([]);

  // Initialize audio engine for playback
  useAudioEngine();

  // Auto-save project changes
  useAutoSave(projectId);

  // The editor is a fixed h-screen layout — every scrollable region is an
  // internal overflow-auto container, and <html>/<body> never need to scroll.
  // Without this, opening a base-ui Dialog/Popover (e.g. Project Settings,
  // Keyboard Shortcuts) still runs its scroll-lock compensation logic, which
  // on platforms with reserved-space scrollbars (Windows/Linux, or macOS with
  // "Always show scrollbars") shrinks <body> by the scrollbar width to avoid
  // a layout shift that, here, was never going to happen — visible as an
  // unwanted gap on the right edge of the app for as long as the dialog is
  // open. base-ui's own scroll-lock bails out immediately if <html> already
  // computes overflow-y: hidden, so setting it here for the lifetime of the
  // editor route skips that compensation entirely.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, []);

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
          markers: project.content.markers,
          assets: project.content.assets,
          settings: project.settings,
        });

        // Clear undo history so the empty initial state isn't in the stack
        useVideoEditorStore.temporal.getState().clear();

        // Hydrate file handles: restore blob URLs from stored FileSystemFileHandles
        if (project.content.assets.length > 0) {
          const { hydrated, pendingIds, deniedIds } = await hydrateAssets(project.content.assets);
          if (cancelled) return;

          // Update the main editor store with restored blob URLs
          const store = useVideoEditorStore.getState();
          for (const asset of hydrated) {
            store.updateAssetUrl(asset.id, asset.url);
          }

          // Populate the UI asset store (with file objects for preview/thumbnails)
          // Hydrated assets have duration in frames (from editor store) — convert back to seconds
          if (hydrated.length > 0) {
            const fps = project.settings.fps;
            useAssetStore.getState().addAssets(
              hydrated.map((a) => ({
                ...a,
                duration: framesToSeconds(a.duration, fps),
              })),
            );
          }

          // If some assets need user permission (prompt) or were previously
          // denied, show the appropriate prompt
          if (pendingIds.length > 0 || deniedIds.length > 0) {
            setPendingPermissionIds(pendingIds);
            setDeniedPermissionIds(deniedIds);
            setSavedAssets(project.content.assets);
          }

          // Hydrate LUT assets (parse .cube files and upload to GPU)
          const lutAssets = project.content.assets.filter((a: MediaAsset) => a.type === "lut");
          for (const lutAsset of lutAssets) {
            if (cancelled) return;
            await hydrateLutAsset(lutAsset);
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
    const allIds = [...pendingPermissionIds, ...deniedPermissionIds];
    const { hydrated, deniedIds } = await requestPermissionAndHydrate(allIds, savedAssets);

    // Update both stores with the newly-granted assets
    const store = useVideoEditorStore.getState();
    for (const asset of hydrated) {
      store.updateAssetUrl(asset.id, asset.url);
    }
    if (hydrated.length > 0) {
      const fps = useVideoEditorStore.getState().settings.fps;
      useAssetStore.getState().addAssets(
        hydrated.map((a) => ({
          ...a,
          duration: framesToSeconds(a.duration, fps),
        })),
      );
    }

    setPendingPermissionIds([]);
    // Assets still denied after the retry stay in the "denied" bucket so the
    // prompt reappears with the same messaging rather than silently vanishing.
    setDeniedPermissionIds(deniedIds);
    if (deniedIds.length === 0) {
      setSavedAssets([]);
    }
  };

  return (
    <>
      <VideoEditorLayout
        toolbar={<Toolbar showSettingsOnMount={isNewProject} />}
        assetPanel={<AssetPanel />}
        previewPanel={<PreviewPanel />}
        propertiesPanel={<PropertiesPanel />}
        timeline={<TimelinePanel />}
        playbackControls={<PlaybackControls />}
      />

      {/* Keyboard shortcuts modal (press ? to open) */}
      <KeyboardShortcutsModal />

      {/* Permission prompt — must be triggered by user gesture */}
      {(pendingPermissionIds.length > 0 || deniedPermissionIds.length > 0) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-lg">
            {(() => {
              const total = pendingPermissionIds.length + deniedPermissionIds.length;
              return (
                <p className="mb-2 font-medium text-foreground">
                  {total} file{total > 1 ? "s" : ""} need access permission
                </p>
              );
            })()}
            <p className="mb-4 text-sm text-muted-foreground">
              {deniedPermissionIds.length > 0
                ? "Access was previously denied for some files. Grant access again to restore them, or they'll stay unavailable in this project."
                : "Your browser requires you to re-grant access to local files after a reload."}
            </p>
            <Button onClick={() => void handleGrantPermission()}>Grant Access</Button>
          </div>
        </div>
      )}

      {/* Overlay loading/error state so the canvas stays mounted (transferControlToOffscreen is one-shot) */}
      {(loading || error) && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <p className="text-lg text-destructive">{error}</p>
              <Button variant="link" onClick={() => void navigate({ to: "/projects" })}>
                Back to projects
              </Button>
            </div>
          ) : (
            <EditorSkeleton />
          )}
        </div>
      )}
    </>
  );
}

function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} style={style} />;
}

function EditorSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-background select-none">
      {/* Toolbar skeleton */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <SkeletonBlock className="h-5 w-5 rounded" />
        <SkeletonBlock className="h-5 w-20" />
        <div className="flex-1" />
        <SkeletonBlock className="h-5 w-16" />
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Asset panel */}
        <div className="flex w-62.5 flex-col gap-3 border-r border-border bg-card p-3">
          <SkeletonBlock className="h-5 w-24" />
          <SkeletonBlock className="h-8 w-full" />
          <div className="mt-1 grid grid-cols-2 gap-2">
            <SkeletonBlock className="aspect-video" />
            <SkeletonBlock className="aspect-video" />
            <SkeletonBlock className="aspect-video" />
            <SkeletonBlock className="aspect-video" />
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex flex-1 flex-col bg-background">
          <div className="flex flex-1 items-center justify-center p-6">
            <SkeletonBlock className="aspect-video w-full max-w-160" />
          </div>
          <div className="flex h-10 shrink-0 items-center justify-center gap-3 border-t border-border bg-card px-4">
            <SkeletonBlock className="h-5 w-5 rounded-full" />
            <SkeletonBlock className="h-5 w-5 rounded-full" />
            <SkeletonBlock className="h-5 w-5 rounded-full" />
            <SkeletonBlock className="ml-2 h-4 w-24" />
          </div>
        </div>

        {/* Properties panel */}
        <div className="flex w-60 flex-col gap-3 border-l border-border bg-card p-3">
          <SkeletonBlock className="h-5 w-20" />
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-8 w-3/4" />
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="flex h-62.5 flex-col gap-2 border-t border-border bg-card p-3">
        <div className="mb-1 flex items-center gap-2">
          <SkeletonBlock className="h-4 w-32" />
          <div className="flex-1" />
          <SkeletonBlock className="h-4 w-16" />
        </div>
        {/* Track rows */}
        {[...Array<undefined>(3)].map((_, i) => (
          <div key={i} className="flex h-12 items-center gap-2">
            <SkeletonBlock className="h-full w-30 shrink-0" />
            <SkeletonBlock className="h-full flex-1" style={{ maxWidth: `${60 - i * 15}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
