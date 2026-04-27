import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
import { useAssetStore } from "../../components/timeline/use-asset-store";
import { Button } from "../../components/ui/button";
import { useAudioEngine } from "../../hooks/use-audio-engine";
import { useAutoSave } from "../../hooks/use-auto-save";
import { hydrateLutAsset } from "../../lib/lut-manager";
import { getProject, type ProjectRow } from "../../lib/project-api";
import { TamsClient } from "../../lib/tams-client";
import { useTamsSettingsStore } from "../../state/tams-settings-store";
import { useVideoEditorStore } from "../../state/video-editor-store";

export const Route = createFileRoute("/editor/$projectId")({
  component: EditorPage,
  ssr: false,
  pendingComponent: EditorSkeleton,
  loader: async ({ params }) => {
    const project = (await getProject({ data: params.projectId })) as ProjectRow | null;
    if (!project) {
      throw redirect({ to: "/projects" });
    }
    return project;
  },
  validateSearch: (search: Record<string, unknown>) => ({
    new: search.new === true || search.new === "true",
  }),
});

function EditorPage() {
  const project = Route.useLoaderData();
  const { projectId } = Route.useParams();
  const { new: isNewProject } = Route.useSearch();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize audio engine for playback
  useAudioEngine();

  // Auto-save project changes
  useAutoSave(projectId);

  // Load project on mount
  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
      try {
        // Hydrate the Zustand store with project data
        const content = project.content as {
          tracks: any[];
          clips: any[];
          crossTransitions?: any[];
          assets: MediaAsset[];
        };
        useVideoEditorStore.getState().loadProject({
          tracks: content.tracks as any,
          clips: content.clips as any,
          crossTransitions: content.crossTransitions as any,
          assets: content.assets,
          settings: project.settings as any,
        });

        // Clear undo history so the empty initial state isn't in the stack
        useVideoEditorStore.temporal.getState().clear();

        const tamsConfig = useTamsSettingsStore.getState().tamsConfig;
        const store = useVideoEditorStore.getState();

        if (tamsConfig) {
          const client = new TamsClient(tamsConfig);
          for (const asset of store.assets) {
            if (cancelled) return;
            if (asset.url !== "") continue;

            try {
              const segments = await client.listFlowSegments(asset.id, { limit: 1 });
              const url = segments[0] ? client.getSegmentDownloadUrl(segments[0]) : null;
              if (url) {
                store.updateAssetUrl(asset.id, url);
              }
            } catch {
              // Non-fatal: flow may no longer exist in TAMS.
            }
          }
        }

        useAssetStore.getState().addAssets(
          store.assets.map((asset) => ({
            ...asset,
            duration: framesToSeconds(asset.duration, store.settings.fps),
            size: 0,
          })),
        );

        const lutAssets = store.assets.filter((asset) => asset.type === "lut");
        for (const lutAsset of lutAssets) {
          if (cancelled) return;
          await hydrateLutAsset(lutAsset);
        }

        if (!cancelled) {
          setLoading(false);
        }
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
  }, [project, projectId]);

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
