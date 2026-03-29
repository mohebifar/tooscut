import type { TransitionType, CrossTransitionType, EasingPreset } from "@tooscut/render-engine";

import { useRef } from "react";

interface TransitionTemplate {
  id: string;
  name: string;
  type: TransitionType;
  defaultDuration: number;
  defaultEasing: EasingPreset;
}

interface CrossTransitionTemplate {
  id: string;
  name: string;
  type: CrossTransitionType;
  defaultDuration: number;
}

/**
 * Map from TransitionType to the WebM filename in /transitions/.
 * Cross transitions reuse the same video files.
 */
function getTransitionVideoUrl(type: TransitionType | CrossTransitionType): string {
  return `/transitions/${type}.webm`;
}

const TRANSITION_TEMPLATES: TransitionTemplate[] = [
  { id: "fade", name: "Fade", type: "Fade", defaultDuration: 0.5, defaultEasing: "EaseInOut" },
  {
    id: "dissolve",
    name: "Dissolve",
    type: "Dissolve",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-left",
    name: "Slide Left",
    type: "SlideLeft",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-right",
    name: "Slide Right",
    type: "SlideRight",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-up",
    name: "Slide Up",
    type: "SlideUp",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "slide-down",
    name: "Slide Down",
    type: "SlideDown",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "zoom-in",
    name: "Zoom In",
    type: "ZoomIn",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "zoom-out",
    name: "Zoom Out",
    type: "ZoomOut",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "rotate-cw",
    name: "Rotate CW",
    type: "RotateCw",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "rotate-ccw",
    name: "Rotate CCW",
    type: "RotateCcw",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  { id: "flip-h", name: "Flip H", type: "FlipH", defaultDuration: 0.5, defaultEasing: "EaseInOut" },
  { id: "flip-v", name: "Flip V", type: "FlipV", defaultDuration: 0.5, defaultEasing: "EaseInOut" },
  {
    id: "wipe-left",
    name: "Wipe Left",
    type: "WipeLeft",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "wipe-right",
    name: "Wipe Right",
    type: "WipeRight",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "wipe-up",
    name: "Wipe Up",
    type: "WipeUp",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
  {
    id: "wipe-down",
    name: "Wipe Down",
    type: "WipeDown",
    defaultDuration: 0.5,
    defaultEasing: "EaseInOut",
  },
];

const CROSS_TRANSITION_TEMPLATES: CrossTransitionTemplate[] = [
  { id: "cross-dissolve", name: "Cross Dissolve", type: "Dissolve", defaultDuration: 0.5 },
  { id: "cross-fade", name: "Cross Fade", type: "Fade", defaultDuration: 0.5 },
  { id: "cross-wipe-left", name: "Wipe Left", type: "WipeLeft", defaultDuration: 0.5 },
  { id: "cross-wipe-right", name: "Wipe Right", type: "WipeRight", defaultDuration: 0.5 },
  { id: "cross-wipe-up", name: "Wipe Up", type: "WipeUp", defaultDuration: 0.5 },
  { id: "cross-wipe-down", name: "Wipe Down", type: "WipeDown", defaultDuration: 0.5 },
];

function useVideoHover() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const onMouseEnter = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      void video.play();
    }
  };

  const onMouseLeave = () => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
  };

  return { videoRef, onMouseEnter, onMouseLeave };
}

function TransitionCard({ template }: { template: TransitionTemplate }) {
  const { videoRef, onMouseEnter, onMouseLeave } = useVideoHover();

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
      className="group cursor-grab overflow-hidden rounded-md border border-border bg-background transition-colors hover:border-primary/50 active:cursor-grabbing"
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <video
        ref={videoRef}
        src={getTransitionVideoUrl(template.type)}
        className="pointer-events-none aspect-video w-full rounded-sm object-cover"
        muted
        loop
        playsInline
      />
      <div className="px-2 py-1.5">
        <span className="text-xs font-medium">{template.name}</span>
      </div>
    </div>
  );
}

function CrossTransitionCard({ template }: { template: CrossTransitionTemplate }) {
  const { videoRef, onMouseEnter, onMouseLeave } = useVideoHover();

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
      className="group cursor-grab overflow-hidden rounded-md border border-border bg-background transition-colors hover:border-primary/50 active:cursor-grabbing"
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <video
        ref={videoRef}
        src={getTransitionVideoUrl(template.type)}
        className="pointer-events-none aspect-video w-full rounded-sm object-cover"
        muted
        loop
        playsInline
      />
      <div className="px-2 py-1.5">
        <span className="text-xs font-medium">{template.name}</span>
      </div>
    </div>
  );
}

export function TransitionPanel() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Drag onto the left or right edge of a clip</p>
        <div className="grid grid-cols-3 gap-2">
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
        <div className="grid grid-cols-3 gap-2">
          {CROSS_TRANSITION_TEMPLATES.map((template) => (
            <CrossTransitionCard key={template.id} template={template} />
          ))}
        </div>
      </div>
    </div>
  );
}
