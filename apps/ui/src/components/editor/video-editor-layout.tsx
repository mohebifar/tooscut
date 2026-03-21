import type { ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Toggle } from "../ui/toggle";
import { Eye, Move } from "lucide-react";
import { useVideoEditorStore } from "../../state/video-editor-store";

interface VideoEditorLayoutProps {
  /** Left panel - Asset library */
  assetPanel: ReactNode;
  /** Center panel - Video preview with canvas */
  previewPanel: ReactNode;
  /** Right panel - Properties/inspector */
  propertiesPanel: ReactNode;
  /** Bottom panel - Multi-track timeline */
  timeline: ReactNode;
  /** Playback controls (play/pause, seek, time display) */
  playbackControls: ReactNode;
  /** Toolbar (tools, zoom, etc.) */
  toolbar?: ReactNode;
}

/**
 * 4-panel layout for video editor (Premiere Pro-like).
 *
 * Structure:
 * ┌──────────────┬──────────────────────┬──────────────┐
 * │   Assets     │   Video Preview      │  Properties  │
 * │   Panel      │   (Canvas)           │   Panel      │
 * │              │   + Controls         │              │
 * ├──────────────┴──────────────────────┴──────────────┤
 * │                  Timeline                          │
 * └────────────────────────────────────────────────────┘
 */
export function VideoEditorLayout({
  assetPanel,
  previewPanel,
  propertiesPanel,
  timeline,
  playbackControls,
  toolbar,
}: VideoEditorLayoutProps) {
  return (
    <div className="flex h-screen flex-col m-0 select-none bg-background">
      {/* Menubar/toolbar row */}
      {toolbar && <div className="shrink-0">{toolbar}</div>}

      <ResizablePanelGroup orientation="vertical" className="flex-1">
        {/* Top row: Assets | Preview | Properties */}
        <ResizablePanel defaultSize={60} minSize={200}>
          <ResizablePanelGroup orientation="horizontal">
            {/* Asset Panel */}
            <ResizablePanel defaultSize={20} minSize={350}>
              <div className="bg-card h-full overflow-auto">{assetPanel}</div>
            </ResizablePanel>

            <ResizableHandle withHandle orientation="horizontal" />

            {/* Preview Panel */}
            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="bg-background flex h-full flex-col">
                {/* Video Preview Canvas */}
                <div className="flex-1 overflow-hidden">{previewPanel}</div>

                {/* Preview Mode Toggle */}
                <PreviewModeToggle />

                {/* Playback Controls */}
                <div className="bg-card shrink-0 border-t border-border">{playbackControls}</div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle orientation="horizontal" />

            {/* Properties Panel */}
            <ResizablePanel defaultSize={25} minSize={15}>
              <div className="bg-card h-full overflow-auto">{propertiesPanel}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle orientation="vertical" />

        {/* Bottom row: Timeline */}
        <ResizablePanel defaultSize={40} minSize={100}>
          <div className="bg-card h-full overflow-hidden border-t border-border">{timeline}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function PreviewModeToggle() {
  const previewMode = useVideoEditorStore((s) => s.previewMode);
  const setPreviewMode = useVideoEditorStore((s) => s.setPreviewMode);

  return (
    <div className="shrink-0 flex justify-center border-t border-border bg-card py-0.5">
      <div className="flex gap-0.5 rounded-md p-0.5">
        <Toggle
          size="sm"
          className="h-6 w-6 p-0"
          pressed={previewMode === "view"}
          onPressedChange={() => setPreviewMode("view")}
        >
          <Eye className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle
          size="sm"
          className="h-6 w-6 p-0"
          pressed={previewMode === "transform"}
          onPressedChange={() => setPreviewMode("transform")}
        >
          <Move className="h-3.5 w-3.5" />
        </Toggle>
      </div>
    </div>
  );
}
