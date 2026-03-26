import { useState, useCallback, useEffect } from "react";
import { Monitor, Smartphone, Square, RectangleHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { NumericInput } from "../ui/numeric-input";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { FRAME_RATE_PRESETS, type FrameRate } from "@tooscut/render-engine";
import { db } from "../../state/db";

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface ResolutionPreset {
  label: string;
  group: string;
  width: number;
  height: number;
  icon: typeof Monitor;
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  // Landscape
  { label: "4K UHD", group: "Landscape", width: 3840, height: 2160, icon: Monitor },
  { label: "1080p Full HD", group: "Landscape", width: 1920, height: 1080, icon: Monitor },
  { label: "720p HD", group: "Landscape", width: 1280, height: 720, icon: Monitor },

  // Vertical / Mobile
  { label: "1080×1920", group: "Portrait", width: 1080, height: 1920, icon: Smartphone },
  { label: "720×1280", group: "Portrait", width: 720, height: 1280, icon: Smartphone },

  // Square
  { label: "1080×1080", group: "Square", width: 1080, height: 1080, icon: Square },

  // Platform presets
  { label: "YouTube", group: "Platform", width: 1920, height: 1080, icon: RectangleHorizontal },
  { label: "YouTube Short", group: "Platform", width: 1080, height: 1920, icon: Smartphone },
  { label: "Instagram Reel", group: "Platform", width: 1080, height: 1920, icon: Smartphone },
  { label: "Instagram Post", group: "Platform", width: 1080, height: 1080, icon: Square },
  { label: "TikTok", group: "Platform", width: 1080, height: 1920, icon: Smartphone },
];

const GROUPS = ["Landscape", "Portrait", "Square", "Platform"] as const;

const FPS_OPTIONS: { label: string; value: FrameRate }[] = [
  { label: "60", value: FRAME_RATE_PRESETS["60"] },
  { label: "30", value: FRAME_RATE_PRESETS["30"] },
  { label: "25", value: FRAME_RATE_PRESETS["25"] },
  { label: "24", value: FRAME_RATE_PRESETS["24"] },
  { label: "29.97", value: FRAME_RATE_PRESETS["29.97"] },
  { label: "23.976", value: FRAME_RATE_PRESETS["23.976"] },
  { label: "59.94", value: FRAME_RATE_PRESETS["59.94"] },
];

/** Serialize a FrameRate to a string key for the select component */
function fpsToKey(fps: FrameRate): string {
  return `${fps.numerator}/${fps.denominator}`;
}

function findPresetIndex(width: number, height: number): string {
  const idx = RESOLUTION_PRESETS.findIndex((p) => p.width === width && p.height === height);
  return idx !== -1 ? String(idx) : "custom";
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  projectId,
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState("Untitled Project");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState<FrameRate>({ numerator: 30, denominator: 1 });
  const [preset, setPreset] = useState("1");

  const settings = useVideoEditorStore((s) => s.settings);
  const setSettings = useVideoEditorStore((s) => s.setSettings);

  // Sync local state from store and DB when dialog opens
  useEffect(() => {
    if (open) {
      setWidth(settings.width);
      setHeight(settings.height);
      setFps(settings.fps);
      setPreset(findPresetIndex(settings.width, settings.height));
      // Load project name from DB
      void db.projects.get(projectId).then((project) => {
        if (project) setName(project.name);
      });
    }
  }, [open, settings, projectId]);

  const handlePresetChange = useCallback((value: string) => {
    setPreset(value);
    if (value === "custom") return;
    const p = RESOLUTION_PRESETS[Number(value)];
    if (p) {
      setWidth(p.width);
      setHeight(p.height);
    }
  }, []);

  const handleWidthChange = useCallback((value: number) => {
    setWidth(Math.round(value));
    setPreset("custom");
  }, []);

  const handleHeightChange = useCallback((value: number) => {
    setHeight(Math.round(value));
    setPreset("custom");
  }, []);

  const handleSave = useCallback(() => {
    setSettings({ width, height, fps });
    // Save project name to DB
    const trimmed = name.trim() || "Untitled Project";
    void db.projects.update(projectId, { name: trimmed });
    onOpenChange(false);
  }, [width, height, fps, name, projectId, setSettings, onOpenChange]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            Configure resolution and frame rate for your project.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <div className="grid gap-4 py-4">
            {/* Project name */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project Name</label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Untitled Project"
              />
            </div>

            {/* Resolution preset */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Resolution</label>
              <Select value={preset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((group) => {
                    const items = RESOLUTION_PRESETS.map((p, i) => ({ ...p, index: i })).filter(
                      (p) => p.group === group,
                    );
                    if (items.length === 0) return null;
                    return (
                      <div key={group}>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          {group}
                        </div>
                        {items.map((p) => {
                          const Icon = p.icon;
                          return (
                            <SelectItem key={p.index} value={String(p.index)}>
                              <span className="flex items-center gap-2">
                                <Icon className="size-3.5 shrink-0" />
                                <span>{p.label}</span>
                                <span className="text-muted-foreground">
                                  {p.width}×{p.height}
                                </span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </div>
                    );
                  })}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Width / Height */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Width</label>
                <NumericInput
                  value={width}
                  onChange={handleWidthChange}
                  min={1}
                  max={7680}
                  step={1}
                  suffix="px"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Height</label>
                <NumericInput
                  value={height}
                  onChange={handleHeightChange}
                  min={1}
                  max={4320}
                  step={1}
                  suffix="px"
                />
              </div>
            </div>

            {/* Frame rate */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Frame Rate</label>
              <Select
                value={fpsToKey(fps)}
                onValueChange={(v) => {
                  const option = FPS_OPTIONS.find((o) => fpsToKey(o.value) === v);
                  if (option) setFps(option.value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frame rate" />
                </SelectTrigger>
                <SelectContent>
                  {FPS_OPTIONS.map((o) => (
                    <SelectItem key={fpsToKey(o.value)} value={fpsToKey(o.value)}>
                      {o.label} fps
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogPanel>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
