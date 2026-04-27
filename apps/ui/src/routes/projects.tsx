import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { addTrackPair, type EditableTrack } from "@tooscut/render-engine";
import {
  Archive,
  Clock,
  Film,
  Monitor,
  Plus,
  RotateCcw,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import {
  createProject,
  deleteProject,
  getMe,
  listActiveProjects,
  listArchivedProjects,
  setProjectArchived,
  upsertProject,
  type ProjectRow,
} from "../lib/project-api";

export const Route = createFileRoute("/projects")({
  component: ProjectChooser,
  loader: async () => {
    const [me, active, archived] = (await Promise.all([
      getMe(),
      listActiveProjects(),
      listArchivedProjects(),
    ])) as [
      { sub: string; name: string; email: string },
      ProjectRow[],
      ProjectRow[],
    ];
    return { me, active, archived };
  },
});

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
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
  const hasChrome = /Chrome\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const isSafariOnly = /Safari\//.test(ua) && !hasChrome;
  return hasChrome || (!isFirefox && !isSafariOnly);
}

function ProjectChooser() {
  const { me, active, archived } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [showBrowserWarning, setShowBrowserWarning] = useState(() => !isChromiumBrowser());
  const [showMobileWarning, setShowMobileWarning] = useState(
    () =>
      typeof navigator !== "undefined" &&
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  );

  const handleCreateProject = async () => {
    const id = generateId();
    const videoTrackId1 = generateId();
    const audioTrackId1 = generateId();
    const { tracks: tracks1 } = addTrackPair([] as EditableTrack[], videoTrackId1, audioTrackId1);
    const videoTrackId2 = generateId();
    const audioTrackId2 = generateId();
    const { tracks } = addTrackPair(tracks1, videoTrackId2, audioTrackId2);

    await createProject({
      data: {
        id,
        name: "Untitled Project",
        settings: { width: 1920, height: 1080, fps: { numerator: 30, denominator: 1 } },
        content: {
          tracks,
          clips: [],
          crossTransitions: [],
          assets: [],
        },
      },
    });

    void navigate({
      to: "/editor/$projectId",
      params: { projectId: id },
      search: { new: true } as never,
    });
  };

  const handleArchive = async (id: string) => {
    await setProjectArchived({ data: { id, archived: true } });
    await router.invalidate();
    setTab("active");
  };

  const handleUnarchive = async (id: string) => {
    await setProjectArchived({ data: { id, archived: false } });
    await router.invalidate();
    setTab("archived");
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteProject({ data: deleteTarget.id });
    setDeleteTarget(null);
    await router.invalidate();
  };

  const handleOpenProject = (projectId: string) => {
    void navigate({
      to: "/editor/$projectId",
      params: { projectId },
      search: { new: false } as never,
    });
  };

  const projects = tab === "active" ? active : archived;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <button
            type="button"
            className="flex items-center gap-2.5"
            onClick={() => void navigate({ to: "/" })}
          >
            <LogoIcon className="size-5" />
            <span className="font-semibold tracking-tight text-foreground">Tooscut</span>
          </button>
          <div className="flex items-center gap-3">
            {me.name ? <span className="text-sm text-muted-foreground">{me.name}</span> : null}
            <Button onClick={() => void handleCreateProject()} size="sm">
              <Plus className="size-3.5" />
              New Project
            </Button>
          </div>
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
                other Chromium-based browsers.
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

        <div className="mb-6 flex gap-4 border-b border-border">
          <button
            type="button"
            className={
              tab === "active"
                ? "border-b-2 border-primary pb-2 text-sm font-medium"
                : "pb-2 text-sm text-muted-foreground"
            }
            onClick={() => setTab("active")}
          >
            Active ({active.length})
          </button>
          <button
            type="button"
            className={
              tab === "archived"
                ? "border-b-2 border-primary pb-2 text-sm font-medium"
                : "pb-2 text-sm text-muted-foreground"
            }
            onClick={() => setTab("archived")}
          >
            Archived ({archived.length})
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="mt-24">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {tab === "active" ? <Film className="size-4" /> : <Archive className="size-4" />}
                </EmptyMedia>
                <EmptyTitle>{tab === "active" ? "No active projects" : "No archived projects"}</EmptyTitle>
                <EmptyDescription>
                  {tab === "active"
                    ? "Create your first project to start editing video."
                    : "Archived projects will appear here."}
                </EmptyDescription>
              </EmptyHeader>
              {tab === "active" ? (
                <EmptyContent>
                  <Button onClick={() => void handleCreateProject()}>
                    <Plus className="size-4" />
                    New Project
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isArchived={tab === "archived"}
                onOpen={handleOpenProject}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
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
  isArchived,
  onOpen,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  project: ProjectRow;
  isArchived: boolean;
  onOpen: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (project: ProjectRow) => void;
}) {
  return (
    <div
      onClick={() => onOpen(project.id)}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-ring hover:shadow-md"
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted">
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.name}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground/50">
            <Film className="size-8" />
          </div>
        )}

        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {isArchived ? (
            <Button
              variant="secondary"
              size="icon"
              className="size-7 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onUnarchive(project.id);
              }}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="icon"
              className="size-7 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(project.id);
              }}
            >
              <Archive className="size-3.5" />
            </Button>
          )}
          {isArchived ? (
            <Button
              variant="destructive"
              size="icon"
              className="size-7 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project);
              }}
            >
              <Trash2 className="size-3.5 text-destructive-foreground" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="px-3.5 py-3">
        <ProjectName project={project} />
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {formatDate(project.updated_at)}
          </span>
          <ProjectResolution settings={project.settings} />
        </div>
      </div>
    </div>
  );
}

function ProjectResolution({ settings }: { settings: unknown }) {
  const width =
    typeof settings === "object" && settings !== null && "width" in settings
      ? Number((settings as { width?: unknown }).width)
      : null;
  const height =
    typeof settings === "object" && settings !== null && "height" in settings
      ? Number((settings as { height?: unknown }).height)
      : null;

  if (!width || !height) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Monitor className="size-3" />
      {width}x{height}
    </span>
  );
}

function ProjectName({ project }: { project: ProjectRow }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(project.name);
  const [value, setValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(project.name);
    setValue(project.name);
  }, [project.name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== displayName) {
      void upsertProject({ data: { id: project.id, name: trimmed } });
      setDisplayName(trimmed);
      setValue(trimmed);
    } else {
      setValue(displayName);
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
            setValue(displayName);
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
        setValue(displayName);
        setEditing(true);
      }}
    >
      {displayName}
    </h3>
  );
}
