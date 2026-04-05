import type { ReactNode } from "react";

import { Eye, Move } from "lucide-react";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Toggle } from "../ui/toggle";

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
    <div className="m-0 flex h-screen flex-col bg-background select-none">
      {/* Menubar/toolbar row */}
      {toolbar && <div className="shrink-0">{toolbar}</div>}

      <ResizablePanelGroup orientation="vertical" className="flex-1">
        {/* Top row: Assets | Preview | Properties */}
        <ResizablePanel defaultSize={60} minSize={200}>
          <ResizablePanelGroup orientation="horizontal">
            {/* Asset Panel */}
            <ResizablePanel defaultSize={20} minSize={350}>
              <div className="h-full overflow-auto bg-card">{assetPanel}</div>
            </ResizablePanel>

            <ResizableHandle withHandle orientation="horizontal" />

            {/* Preview Panel */}
            <ResizablePanel defaultSize={55} minSize={30}>
              <div className="flex h-full flex-col bg-background">
                {/* Video Preview Canvas */}
                <div className="flex-1 overflow-hidden">{previewPanel}</div>

                {/* Preview Mode Toggle */}
                <PreviewModeToggle />

                {/* Playback Controls */}
                <div className="shrink-0 border-t border-border bg-card">{playbackControls}</div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle orientation="horizontal" />

            {/* Properties Panel */}
            <ResizablePanel defaultSize={25} minSize={15}>
              <div className="h-full overflow-auto bg-card">{propertiesPanel}</div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle orientation="vertical" />

        {/* Bottom row: Timeline */}
        <ResizablePanel defaultSize={40} minSize={100}>
          <div className="h-full overflow-hidden border-t border-border bg-card">{timeline}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function PreviewModeToggle() {
  const previewMode = useVideoEditorStore((s) => s.previewMode);
  const setPreviewMode = useVideoEditorStore((s) => s.setPreviewMode);
  const previewZoom = useVideoEditorStore((s) => s.previewZoom);
  const setPreviewZoom = useVideoEditorStore((s) => s.setPreviewZoom);

  const zoomItems = [
    { label: "Fit", value: "fit" },
    { label: "25%", value: "25" },
    { label: "50%", value: "50" },
    { label: "100%", value: "100" },
    { label: "200%", value: "200" },
    ...(typeof previewZoom === "number" && ![25, 50, 100, 200].includes(previewZoom)
      ? [{ label: `${previewZoom}%`, value: String(previewZoom) }]
      : []),
  ];

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-2 py-0.5">
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

      <Select
        value={previewZoom === "fit" ? "fit" : String(previewZoom)}
        onValueChange={(value) => {
          setPreviewZoom(value === "fit" ? "fit" : Number(value));
        }}
        items={zoomItems}
      >
        <SelectTrigger className="h-6! py-0">
          <SelectValue placeholder="Zoom" />
        </SelectTrigger>
        <SelectContent>
          {zoomItems.map((item) =>
            item ? (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ) : null,
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
