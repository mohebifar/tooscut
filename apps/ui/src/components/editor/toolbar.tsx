import { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Undo2, Redo2, MousePointer2, Scissors, DownloadIcon, ChevronLeft } from "lucide-react";
import { useState, useCallback, useRef, useEffect } from "react";

import { Route } from "../../routes/editor/$projectId";
import { db } from "../../state/db";
import { useVideoEditorStore, useTemporalStore } from "../../state/video-editor-store";
import { importFilesWithPicker, addAssetsToStores } from "../timeline/use-asset-store";
import { Button } from "../ui/button";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "../ui/menubar";
import { Separator } from "../ui/separator";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { ExportDialog } from "./export-dialog";
import { ProjectSettingsDialog } from "./project-settings-dialog";

interface ToolbarProps {
  /** Open the settings dialog on mount (for new projects) */
  showSettingsOnMount?: boolean;
}

export function Toolbar({ showSettingsOnMount }: ToolbarProps) {
  const { projectId } = Route.useParams();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const navigate = useNavigate();

  // Auto-open settings dialog for new projects
  useEffect(() => {
    if (showSettingsOnMount) {
      setSettingsDialogOpen(true);
    }
  }, [showSettingsOnMount]);

  const handleSettingsDialogChange = useCallback(
    (open: boolean) => {
      setSettingsDialogOpen(open);
      // Clear the "new" search param when closing
      if (!open && showSettingsOnMount) {
        void navigate({
          to: "/editor/$projectId",
          params: { projectId },
          search: {} as any, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
          replace: true,
        });
      }
    },
    [showSettingsOnMount, navigate, projectId],
  );
  const activeTool = useVideoEditorStore((s) => s.activeTool);
  const setActiveTool = useVideoEditorStore((s) => s.setActiveTool);
  const clips = useVideoEditorStore((s) => s.clips);
  const selectedClipIds = useVideoEditorStore((s) => s.selectedClipIds);
  const selectedTransition = useVideoEditorStore((s) => s.selectedTransition);
  const selectedCrossTransition = useVideoEditorStore((s) => s.selectedCrossTransition);
  const zoom = useVideoEditorStore((s) => s.zoom);
  const setZoom = useVideoEditorStore((s) => s.setZoom);
  const setSelectedClipIds = useVideoEditorStore((s) => s.setSelectedClipIds);
  const clearSelection = useVideoEditorStore((s) => s.clearSelection);
  const removeClip = useVideoEditorStore((s) => s.removeClip);
  const removeCrossTransitionById = useVideoEditorStore((s) => s.removeCrossTransitionById);
  const setClipTransitionIn = useVideoEditorStore((s) => s.setClipTransitionIn);
  const setClipTransitionOut = useVideoEditorStore((s) => s.setClipTransitionOut);
  const clipboard = useVideoEditorStore((s) => s.clipboard);
  const copySelectedClips = useVideoEditorStore((s) => s.copySelectedClips);
  const pasteClipsAtPlayhead = useVideoEditorStore((s) => s.pasteClipsAtPlayhead);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const canUndo = useTemporalStore((s) => s.pastStates.length > 0);
  const canRedo = useTemporalStore((s) => s.futureStates.length > 0);

  const hasSelection =
    selectedClipIds.length > 0 || selectedTransition !== null || selectedCrossTransition !== null;

  const handleExportClick = useCallback(() => {
    setExportDialogOpen(true);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (selectedCrossTransition) {
      removeCrossTransitionById(selectedCrossTransition);
      clearSelection();
      return;
    }

    if (selectedTransition) {
      if (selectedTransition.edge === "in") {
        setClipTransitionIn(selectedTransition.clipId, null);
      } else {
        setClipTransitionOut(selectedTransition.clipId, null);
      }
      clearSelection();
      return;
    }

    const clipsToDelete = new Set<string>();
    for (const clipId of selectedClipIds) {
      clipsToDelete.add(clipId);
      const clip = clips.find((c) => c.id === clipId);
      if (clip?.linkedClipId) {
        clipsToDelete.add(clip.linkedClipId);
      }
    }
    for (const clipId of clipsToDelete) {
      removeClip(clipId);
    }
  }, [
    selectedCrossTransition,
    selectedTransition,
    selectedClipIds,
    clips,
    removeCrossTransitionById,
    clearSelection,
    setClipTransitionIn,
    setClipTransitionOut,
    removeClip,
  ]);
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <Link to="/projects">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Back to Projects</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* File/Edit/View menus */}
        <Menubar className="h-auto border-none bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger className="h-7 px-2 py-1 text-xs data-[state=open]:bg-accent">
              File
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => void navigate({ to: "/projects" })}>
                New Project
                <MenubarShortcut>⌘N</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => void navigate({ to: "/projects" })}>
                Open Project
                <MenubarShortcut>⌘O</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                Save
                <MenubarShortcut>⌘S</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>Save As...</MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onClick={() => {
                  void (async () => {
                    const assets = await importFilesWithPicker();
                    if (assets.length > 0) addAssetsToStores(assets);
                  })();
                }}
              >
                Import Media
                <MenubarShortcut>⌘I</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={handleExportClick}>
                Export
                <MenubarShortcut>⌘E</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => setSettingsDialogOpen(true)}>
                Project Settings
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="h-7 px-2 py-1 text-xs data-[state=open]:bg-accent">
              Edit
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled={!canUndo} onClick={() => undo()}>
                Undo
                <MenubarShortcut>⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!canRedo} onClick={() => redo()}>
                Redo
                <MenubarShortcut>⇧⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                Cut
                <MenubarShortcut>⌘X</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={selectedClipIds.length === 0} onClick={copySelectedClips}>
                Copy
                <MenubarShortcut>⌘C</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={clipboard.length === 0} onClick={pasteClipsAtPlayhead}>
                Paste
                <MenubarShortcut>⌘V</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!hasSelection} onClick={handleDeleteSelected}>
                Delete
                <MenubarShortcut>⌫</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={clips.length === 0}
                onClick={() => setSelectedClipIds(clips.map((c) => c.id))}
              >
                Select All
                <MenubarShortcut>⌘A</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!hasSelection} onClick={clearSelection}>
                Deselect All
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className="h-7 px-2 py-1 text-xs data-[state=open]:bg-accent">
              View
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setZoom(Math.min(500, zoom * 1.2))}>Zoom In</MenubarItem>
              <MenubarItem onClick={() => setZoom(Math.max(1, zoom / 1.2))}>Zoom Out</MenubarItem>
              <MenubarItem disabled>Fit to Window</MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>Show Timeline</MenubarItem>
              <MenubarItem disabled>Show Properties</MenubarItem>
              <MenubarItem disabled>Show Assets</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>

        <Separator orientation="vertical" className="mx-2 h-5" />

        <ToolbarProjectName />

        <Separator orientation="vertical" className="mx-2 h-5" />

        {/* Undo/Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!canUndo}
              onClick={() => undo()}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Undo (⌘Z)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!canRedo}
              onClick={() => redo()}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Redo (⇧⌘Z)</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-2 h-5" />

        {/* Tools */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              className="h-7 w-7 p-0"
              pressed={activeTool === "select"}
              onPressedChange={() => setActiveTool("select")}
            >
              <MousePointer2 className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>
            <p>Select Tool (V)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              className="h-7 w-7 p-0"
              pressed={activeTool === "razor"}
              onPressedChange={() => setActiveTool("razor")}
            >
              <Scissors className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>
            <p>Razor Tool (C)</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Export button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="default" size="sm" className="h-7 text-xs" onClick={handleExportClick}>
              <DownloadIcon className="mr-1 h-4 w-4" />
              Export
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Export Project (⌘E)</p>
          </TooltipContent>
        </Tooltip>

        {/* Dialogs */}
        <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />
        <ProjectSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={handleSettingsDialogChange}
          projectId={projectId}
        />
      </div>
    </TooltipProvider>
  );
}

function ToolbarProjectName() {
  const { projectId } = Route.useParams();
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  if (!project) return null;

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== project.name) {
      void db.projects.update(project.id, { name: trimmed });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-40 border-b border-ring bg-transparent text-xs text-foreground outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="max-w-48 cursor-text truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => {
        setValue(project.name);
        setEditing(true);
      }}
    >
      {project.name}
    </button>
  );
}
