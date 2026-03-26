import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { addTrackPair, type EditableTrack } from "@tooscut/render-engine";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, Film, Clock, Monitor, TriangleAlert, Smartphone } from "lucide-react";
import { useState, useRef, useEffect } from "react";

import { LogoIcon } from "../components/logo";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { db, type LocalProject } from "../state/db";

export const Route = createFileRoute("/projects")({ component: ProjectChooser });

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;

  return date.toLocaleDateString();
}

function isChromiumBrowser(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  // Chrome/Chromium-based browsers have "Chrome/" in UA but not "Edg/" false positive — Edge is also Chromium
  // Key non-Chromium browsers: Firefox (Gecko), Safari (without Chrome token)
  const hasChrome = /Chrome\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  // Safari has "Safari/" but NOT "Chrome/" in the UA
  const isSafariOnly = /Safari\//.test(ua) && !hasChrome;
  return hasChrome || (!isFirefox && !isSafariOnly);
}

function ProjectChooser() {
  const navigate = useNavigate();
  const projects = useLiveQuery(() => db.projects.orderBy("updatedAt").reverse().toArray());
  const [deleteTarget, setDeleteTarget] = useState<LocalProject | null>(null);
  const [showBrowserWarning, setShowBrowserWarning] = useState(() => !isChromiumBrowser());
  const [showMobileWarning, setShowMobileWarning] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  );

  const handleCreateProject = async () => {
    const id = generateId();
    const videoTrackId = generateId();
    const audioTrackId = generateId();
    const { tracks } = addTrackPair([] as EditableTrack[], videoTrackId, audioTrackId);

    const project: LocalProject = {
      id,
      name: "Untitled Project",
      settings: { width: 1920, height: 1080, fps: { numerator: 30, denominator: 1 } },
      content: {
        tracks,
        clips: [],
        assets: [],
      },
      thumbnailDataUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.projects.add(project);
    void navigate({
      to: "/editor/$projectId",
      params: { projectId: id },
      search: { new: true } as Record<string, unknown>,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const assetIds = deleteTarget.content.assets.map((a) => a.id);
    await db.projects.delete(deleteTarget.id);
    if (assetIds.length > 0) {
      await db.fileHandles.bulkDelete(assetIds);
    }
    setDeleteTarget(null);
  };

  const handleOpenProject = (projectId: string) => {
    void navigate({
      to: "/editor/$projectId",
      params: { projectId },
      search: { new: false } as Record<string, unknown>,
    });
  };

  if (projects === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoIcon className="size-5" />
            <span className="font-semibold tracking-tight text-foreground">Tooscut</span>
          </Link>
          {projects.length > 0 && (
            <Button onClick={() => void handleCreateProject()} size="sm">
              <Plus className="size-3.5" />
              New Project
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {showMobileWarning && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-yellow-400" />
            <div className="flex-1">
              <p className="font-medium text-yellow-100">Designed for desktop</p>
              <p className="mt-0.5 text-yellow-300/80">
                This editor is designed for desktop use. For the best experience, please visit on a
                desktop computer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileWarning(false)}
              className="shrink-0 text-yellow-400 transition-colors hover:text-yellow-200"
            >
              &times;
            </button>
          </div>
        )}

        {showBrowserWarning && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-yellow-400" />
            <div className="flex-1">
              <p className="font-medium text-yellow-100">Browser not fully supported</p>
              <p className="mt-0.5 text-yellow-300/80">
                This editor relies on WebGPU for rendering, which currently works best in Chrome or
                other Chromium-based browsers. You may experience issues in your current browser.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBrowserWarning(false)}
              className="shrink-0 text-yellow-400 transition-colors hover:text-yellow-200"
            >
              &times;
            </button>
          </div>
        )}

        {projects.length > 0 && (
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-foreground">Projects</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </p>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="mt-24">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Film className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>
                  Create your first project to start editing video.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => void handleCreateProject()}>
                  <Plus className="size-4" />
                  New Project
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={handleOpenProject}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </main>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: LocalProject;
  onOpen: (id: string) => void;
  onDelete: (project: LocalProject) => void;
}) {
  return (
    <div
      onClick={() => onOpen(project.id)}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-ring hover:shadow-md"
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted">
        {project.thumbnailDataUrl ? (
          <img
            src={project.thumbnailDataUrl}
            alt={project.name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground/50">
            <Film className="size-8" />
          </div>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-2 right-2 size-7 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project);
          }}
        >
          <Trash2 className="size-3.5 text-destructive-foreground" />
        </Button>
      </div>

      <div className="px-3.5 py-3">
        <ProjectName project={project} />
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {formatDate(project.updatedAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Monitor className="size-3" />
            {project.settings.width}x{project.settings.height}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProjectName({ project }: { project: LocalProject }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== project.name) {
      void db.projects.update(project.id, { name: trimmed });
    } else {
      setValue(project.name);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="w-full border-b border-ring bg-transparent text-sm font-medium text-foreground outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue(project.name);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <h3
      className="truncate text-sm font-medium text-foreground"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setValue(project.name);
        setEditing(true);
      }}
    >
      {project.name}
    </h3>
  );
}
