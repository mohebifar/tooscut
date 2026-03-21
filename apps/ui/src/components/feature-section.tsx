import { cn } from "@/lib/utils";
import type React from "react";
import {
  ZapIcon,
  LayersIcon,
  SlidersHorizontalIcon,
  MonitorIcon,
  WandSparklesIcon,
} from "lucide-react";

const features = [
  {
    id: "gpu-rendering",
    children: <GpuRenderingVisual />,
    className: "md:col-span-2",
  },
  {
    id: "timeline",
    children: <TimelineVisual />,
    className: "md:col-span-2",
  },
  {
    id: "keyframes",
    children: <KeyframeVisual />,
    className: "sm:col-span-2 md:col-span-2",
  },
  {
    id: "effects",
    children: <EffectsVisual />,
    className: "sm:col-span-2 md:col-span-3",
  },
  {
    id: "browser",
    children: <BrowserVisual />,
    className: "sm:col-span-2 md:col-span-3",
  },
];

export function FeatureSection() {
  return (
    <div
      id="features"
      className="relative mx-auto grid w-full max-w-5xl grid-cols-1 gap-3 px-4 sm:grid-cols-2 md:grid-cols-6"
    >
      {features.map((feature) => (
        <FeatureCard className={feature.className} key={feature.id}>
          {feature.children}
        </FeatureCard>
      ))}
    </div>
  );
}

function FeatureCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-background px-8 pt-8 pb-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

function FeatureTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-medium text-foreground text-lg", className)} {...props} />;
}

function FeatureDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

function GpuRenderingVisual() {
  return (
    <>
      <div className="relative mx-auto flex size-32 items-center justify-center rounded-full border-4 border-dashed bg-background shadow-xs outline outline-border outline-offset-4">
        <div className="absolute inset-0 z-10 scale-120 bg-radial from-foreground/20 via-foreground/5 to-transparent blur-xl" />
        <ZapIcon className="size-14 text-primary/90" />
      </div>

      <div className="relative mt-8 space-y-1.5 text-center">
        <FeatureTitle>GPU-Accelerated Rendering</FeatureTitle>
        <FeatureDescription>
          WebGPU-powered compositing via Rust/WASM delivers near-native performance for real-time
          previews and exports.
        </FeatureDescription>
      </div>
    </>
  );
}

function TimelineVisual() {
  return (
    <>
      <div className="relative mx-auto flex size-32 items-center justify-center rounded-full border bg-background shadow-xs outline outline-border outline-offset-4">
        <LayersIcon className="size-14 text-primary/90" />
        <div className="absolute inset-0 scale-120 bg-radial from-foreground/15 via-foreground/5 to-transparent blur-xl" />
      </div>

      <div className="relative mt-8 space-y-1.5 text-center">
        <FeatureTitle>Multi-Track Timeline</FeatureTitle>
        <FeatureDescription>
          Canvas-rendered timeline with unlimited video and audio tracks, linked clips, and
          cross-transitions.
        </FeatureDescription>
      </div>
    </>
  );
}

function KeyframeVisual() {
  return (
    <>
      <div className="min-h-32 flex items-center justify-center">
        <KeyframeCurveSvg className="w-full max-w-xs" />
      </div>
      <div className="relative z-10 mt-8 space-y-1.5 text-center">
        <FeatureTitle>Keyframe Animation</FeatureTitle>
        <FeatureDescription>
          Animate any property with bezier easing curves. Transform, opacity, effects — everything
          is keyframeable.
        </FeatureDescription>
      </div>
    </>
  );
}

function EffectsVisual() {
  return (
    <div className="grid h-full sm:grid-cols-2">
      <div className="relative z-10 space-y-6 py-0 pe-2">
        <div className="flex size-12 items-center justify-center rounded-full border bg-card shadow-xs outline outline-border/80 outline-offset-2">
          <WandSparklesIcon className="size-5 text-primary/80" />
        </div>
        <div className="space-y-2">
          <FeatureTitle className="text-base">Real-Time Effects</FeatureTitle>
          <FeatureDescription>
            Apply brightness, contrast, saturation, blur, and hue rotation — all GPU-computed with
            instant preview.
          </FeatureDescription>
        </div>
      </div>
      <div className="relative flex items-center justify-center mt-4 sm:mt-0">
        <div className="grid grid-cols-2 gap-2 w-full max-w-48">
          {[
            { name: "Brightness", value: 72, color: "bg-amber-500/40" },
            { name: "Contrast", value: 58, color: "bg-blue-500/40" },
            { name: "Saturation", value: 85, color: "bg-emerald-500/40" },
            { name: "Blur", value: 25, color: "bg-purple-500/40" },
          ].map((effect) => (
            <div key={effect.name} className="rounded-lg border bg-card p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">{effect.name}</div>
              <div className="h-1.5 rounded-full bg-neutral-800">
                <div
                  className={cn("h-1.5 rounded-full", effect.color)}
                  style={{ width: `${effect.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrowserVisual() {
  return (
    <div className="grid h-full sm:grid-cols-2">
      <div className="space-y-6 pb-4 sm:pb-0">
        <div className="flex size-12 items-center justify-center rounded-full border bg-card shadow-xs outline outline-border/80 outline-offset-2">
          <MonitorIcon className="size-5 text-primary/80" />
        </div>
        <div className="space-y-2">
          <FeatureTitle className="text-base">Zero Install, Full Power</FeatureTitle>
          <FeatureDescription>
            Everything runs in the browser. Your media stays local with the File System Access API —
            nothing leaves your machine.
          </FeatureDescription>
        </div>
      </div>
      <div className="relative flex items-center justify-center">
        <div className="relative w-full max-w-48 aspect-square">
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-muted-foreground/20 animate-[spin_20s_linear_infinite]" />
          <div className="absolute inset-4 rounded-full border border-muted-foreground/10 animate-[spin_15s_linear_infinite_reverse]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-1">
              <SlidersHorizontalIcon className="size-6 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground/60">Local-first</span>
            </div>
          </div>
          {[
            { label: "WebGPU", angle: 0 },
            { label: "WASM", angle: 90 },
            { label: "Web Audio", angle: 180 },
            { label: "File API", angle: 270 },
          ].map((item) => (
            <div
              key={item.label}
              className="absolute"
              style={{
                top: `${50 - 42 * Math.cos((item.angle * Math.PI) / 180)}%`,
                left: `${50 + 42 * Math.sin((item.angle * Math.PI) / 180)}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div className="rounded-full border bg-card px-2 py-0.5 text-[9px] text-muted-foreground shadow-sm whitespace-nowrap">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KeyframeCurveSvg(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 300 100" xmlns="http://www.w3.org/2000/svg" {...props}>
      {/* Grid lines */}
      {[20, 40, 60, 80].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="300"
          y2={y}
          className="stroke-muted-foreground/10"
          strokeWidth="0.5"
        />
      ))}
      {/* Bezier curve */}
      <path
        className="text-primary"
        d="M 20,80 C 60,80 80,20 150,20 S 240,80 280,20"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      {/* Area under curve */}
      <path
        d="M 20,80 C 60,80 80,20 150,20 S 240,80 280,20 L 280,100 L 20,100 Z"
        fill="url(#keyframeGradient)"
      />
      {/* Keyframe diamonds */}
      {[
        { x: 20, y: 80 },
        { x: 150, y: 20 },
        { x: 280, y: 20 },
      ].map((point, i) => (
        <g key={i}>
          <rect
            x={point.x - 5}
            y={point.y - 5}
            width="10"
            height="10"
            rx="1"
            className="fill-primary stroke-primary-foreground"
            strokeWidth="1"
            transform={`rotate(45, ${point.x}, ${point.y})`}
          />
        </g>
      ))}
      {/* Bezier handles */}
      <line
        x1="20"
        y1="80"
        x2="80"
        y2="80"
        className="stroke-muted-foreground/30"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      <circle cx="80" cy="80" r="3" className="fill-muted-foreground/40" />
      <line
        x1="150"
        y1="20"
        x2="80"
        y2="20"
        className="stroke-muted-foreground/30"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      <circle cx="80" cy="20" r="3" className="fill-muted-foreground/40" />

      <defs>
        <linearGradient
          id="keyframeGradient"
          x1="0"
          y1="0"
          x2="0"
          y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop className="text-primary/15" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" className="text-background" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
