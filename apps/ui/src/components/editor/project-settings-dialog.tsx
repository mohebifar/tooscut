import { FRAME_RATE_PRESETS, type FrameRate } from "@tooscut/render-engine";
import { Monitor, Smartphone, Square, RectangleHorizontal } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

import { db } from "../../state/db";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";
import { NumericInput } from "../ui/numeric-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

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
  value: string;
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  // Landscape
  { label: "4K UHD", group: "Landscape", width: 3840, height: 2160, icon: Monitor, value: "0" },
  {
    label: "1080p Full HD",
    group: "Landscape",
    width: 1920,
    height: 1080,
    icon: Monitor,
    value: "1",
  },
  { label: "720p HD", group: "Landscape", width: 1280, height: 720, icon: Monitor, value: "2" },

  // Vertical / Mobile
  {
    label: "1080×1920",
    group: "Portrait",
    width: 1080,
    height: 1920,
    icon: Smartphone,
    value: "3",
  },
  { label: "720×1280", group: "Portrait", width: 720, height: 1280, icon: Smartphone, value: "4" },

  // Square
  { label: "1080×1080", group: "Square", width: 1080, height: 1080, icon: Square, value: "5" },

  // Platform presets
  {
    label: "YouTube",
    group: "Platform",
    width: 1920,
    height: 1080,
    icon: RectangleHorizontal,
    value: "6",
  },
  {
    label: "YouTube Short",
    group: "Platform",
    width: 1080,
    height: 1920,
    icon: Smartphone,
    value: "7",
  },
  {
    label: "Instagram Reel",
    group: "Platform",
    width: 1080,
    height: 1920,
    icon: Smartphone,
    value: "8",
  },
  {
    label: "Instagram Post",
    group: "Platform",
    width: 1080,
    height: 1080,
    icon: Square,
    value: "9",
  },
  { label: "TikTok", group: "Platform", width: 1080, height: 1920, icon: Smartphone, value: "10" },
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

const FPS_OPTIONS_ITEMS = FPS_OPTIONS.map((item) => ({
  label: `${item.label} fps`,
  value: fpsToKey(item.value),
}));

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

  const handlePresetChange = useCallback((value: string | null) => {
    if (!value) return;
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
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Untitled Project"
              />
            </div>

            {/* Resolution preset */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Resolution</label>
              <Select
                value={preset}
                onValueChange={handlePresetChange}
                items={[
                  ...RESOLUTION_PRESETS,
                  {
                    label: "Custom",
                    value: "-1",
                  },
                ]}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent className="w-fit">
                  {GROUPS.map((group) => {
                    const items = RESOLUTION_PRESETS.filter((p) => p.group === group);
                    if (items.length === 0) return null;
                    return (
                      <SelectGroup key={group}>
                        <SelectLabel>{group}</SelectLabel>
                        {items.map((p) => {
                          const Icon = p.icon;
                          return (
                            <SelectItem key={p.value} value={String(p.value)}>
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
                      </SelectGroup>
                    );
                  })}
                  <SelectGroup>
                    <SelectItem value="-1">Custom</SelectItem>
                  </SelectGroup>
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
                items={FPS_OPTIONS_ITEMS}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frame rate" />
                </SelectTrigger>
                <SelectContent>
                  {FPS_OPTIONS_ITEMS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
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
