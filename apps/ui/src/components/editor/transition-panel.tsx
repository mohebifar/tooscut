import type { TransitionType, CrossTransitionType, EasingPreset } from "@tooscut/render-engine";
import {
  Sparkles,
  MoveLeft,
  MoveRight,
  MoveUp,
  MoveDown,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Droplets,
  Blend,
} from "lucide-react";

interface TransitionTemplate {
  id: string;
  name: string;
  type: TransitionType;
  icon: React.ComponentType<{ className?: string }>;
  defaultDuration: number;
  defaultEasing: EasingPreset;
}

interface CrossTransitionTemplate {
  id: string;
  name: string;
  type: CrossTransitionType;
  icon: React.ComponentType<{ className?: string }>;
  defaultDuration: number;
}

const TRANSITION_TEMPLATES: TransitionTemplate[] = [
  {
    id: "fade",
    name: "Fade",
    type: "Fade",
    icon: Sparkles,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "dissolve",
    name: "Dissolve",
    type: "Dissolve",
    icon: Droplets,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-left",
    name: "Slide Left",
    type: "SlideLeft",
    icon: MoveLeft,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-right",
    name: "Slide Right",
    type: "SlideRight",
    icon: MoveRight,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-up",
    name: "Slide Up",
    type: "SlideUp",
    icon: MoveUp,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-down",
    name: "Slide Down",
    type: "SlideDown",
    icon: MoveDown,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "zoom-in",
    name: "Zoom In",
    type: "ZoomIn",
    icon: ZoomIn,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "zoom-out",
    name: "Zoom Out",
    type: "ZoomOut",
    icon: ZoomOut,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "rotate-cw",
    name: "Rotate CW",
    type: "RotateCw",
    icon: RotateCw,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "rotate-ccw",
    name: "Rotate CCW",
    type: "RotateCcw",
    icon: RotateCcw,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "flip-h",
    name: "Flip H",
    type: "FlipH",
    icon: FlipHorizontal,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "flip-v",
    name: "Flip V",
    type: "FlipV",
    icon: FlipVertical,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "wipe-left",
    name: "Wipe Left",
    type: "WipeLeft",
    icon: ArrowLeft,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "wipe-right",
    name: "Wipe Right",
    type: "WipeRight",
    icon: ArrowRight,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "wipe-up",
    name: "Wipe Up",
    type: "WipeUp",
    icon: ArrowUp,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "wipe-down",
    name: "Wipe Down",
    type: "WipeDown",
    icon: ArrowDown,
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
];

const CROSS_TRANSITION_TEMPLATES: CrossTransitionTemplate[] = [
  {
    id: "cross-dissolve",
    name: "Cross Dissolve",
    type: "Dissolve",
    icon: Blend,
    defaultDuration: 0.5,
  },
  { id: "cross-fade", name: "Cross Fade", type: "Fade", icon: Sparkles, defaultDuration: 0.5 },
  {
    id: "cross-wipe-left",
    name: "Wipe Left",
    type: "WipeLeft",
    icon: ArrowLeft,
    defaultDuration: 0.5,
  },
  {
    id: "cross-wipe-right",
    name: "Wipe Right",
    type: "WipeRight",
    icon: ArrowRight,
    defaultDuration: 0.5,
  },
  { id: "cross-wipe-up", name: "Wipe Up", type: "WipeUp", icon: ArrowUp, defaultDuration: 0.5 },
  {
    id: "cross-wipe-down",
    name: "Wipe Down",
    type: "WipeDown",
    icon: ArrowDown,
    defaultDuration: 0.5,
  },
];

function TransitionCard({ template }: { template: TransitionTemplate }) {
  const Icon = template.icon;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-transition-type", template.type);
    // Encode duration in MIME type so dragOver can read it (getData is unavailable during dragOver)
    e.dataTransfer.setData(`application/x-transition-duration-${template.defaultDuration}`, "");
    e.dataTransfer.setData(
      "application/x-transition-data",
      JSON.stringify({
        type: template.type,
        duration: template.defaultDuration,
        easing: { preset: template.defaultEasing },
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className="group rounded-md border border-border bg-background p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:bg-primary/5 transition-colors"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{template.name}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{template.type}</div>
    </div>
  );
}

function CrossTransitionCard({ template }: { template: CrossTransitionTemplate }) {
  const Icon = template.icon;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-cross-transition-type", template.type);
    e.dataTransfer.setData(`application/x-transition-duration-${template.defaultDuration}`, "");
    e.dataTransfer.setData(
      "application/x-cross-transition-data",
      JSON.stringify({
        type: template.type,
        duration: template.defaultDuration,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      className="group rounded-md border border-border bg-background p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:bg-primary/5 transition-colors"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{template.name}</span>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">Cross</div>
    </div>
  );
}

export function TransitionPanel() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Drag onto the left or right edge of a clip</p>
        <div className="grid grid-cols-2 gap-2">
          {TRANSITION_TEMPLATES.map((template) => (
            <TransitionCard key={template.id} template={template} />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium">Cross Transitions</p>
        <p className="text-xs text-muted-foreground">
          Drag between two adjacent clips on the same track
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CROSS_TRANSITION_TEMPLATES.map((template) => (
            <CrossTransitionCard key={template.id} template={template} />
          ))}
        </div>
      </div>
    </div>
  );
}
