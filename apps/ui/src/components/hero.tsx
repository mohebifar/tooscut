import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  SkipBack,
  ChevronsLeft,
  Play,
  ChevronsRight,
  SkipForward,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  return (
    <section className="mx-auto w-full max-w-5xl overflow-hidden pt-16">
      {/* Shades */}
      <div aria-hidden="true" className="absolute inset-0 size-full overflow-hidden">
        <div
          className={cn(
            "absolute inset-0 isolate -z-10",
            "bg-[radial-gradient(20%_80%_at_20%_0%,--theme(--color-foreground/.1),transparent)]",
          )}
        />
      </div>
      <div className="relative z-10 flex max-w-2xl flex-col gap-5 px-4">
        <h1
          className={cn(
            "text-4xl leading-tight font-medium text-balance text-foreground md:text-5xl",
            "animate-in delay-100 duration-500 ease-out fill-mode-backwards slide-in-from-bottom-10 fade-in",
          )}
        >
          Professional video editing, right in your browser
        </h1>

        <p
          className={cn(
            "text-sm tracking-wider text-muted-foreground sm:text-lg md:text-xl",
            "animate-in delay-200 duration-500 ease-out fill-mode-backwards slide-in-from-bottom-10 fade-in",
          )}
        >
          A powerful NLE editor with GPU compositing, keyframe animation, and real-time preview. No
          installs required.
        </p>

        <div className="flex w-fit animate-in items-center justify-center gap-3 pt-2 delay-300 duration-500 ease-out fill-mode-backwards slide-in-from-bottom-10 fade-in">
          <Button variant="outline" asChild>
            <a href="https://github.com/mohebifar/tooscut" target="_blank" rel="noopener">
              View Source
            </a>
          </Button>
          <Button asChild>
            <Link to="/projects">
              Start Editing
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>
      <div className="relative">
        <div
          className={cn(
            "absolute -inset-x-20 inset-y-0 -translate-y-1/3 scale-120 rounded-full",
            "bg-[radial-gradient(ellipse_at_center,theme(--color-foreground/.1),transparent,transparent)]",
            "blur-[50px]",
          )}
        />
        <div
          className={cn(
            "relative mt-8 -mr-56 overflow-hidden mask-b-from-60% px-2 sm:mt-12 sm:mr-0 md:mt-20",
            "animate-in delay-100 duration-1000 ease-out fill-mode-backwards slide-in-from-bottom-5 fade-in",
          )}
        >
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-lg border bg-background p-2 shadow-xl ring-1 inset-shadow-2xs ring-card inset-shadow-foreground/10 dark:inset-shadow-xs dark:inset-shadow-foreground/20">
            <EditorMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function EditorMockup() {
  return (
    <div className="flex aspect-video flex-col overflow-hidden rounded-lg border bg-neutral-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-500/60" />
            <div className="size-2.5 rounded-full bg-yellow-500/60" />
            <div className="size-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="ml-2 text-[10px] text-neutral-500">Tooscut Editor</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-neutral-500">
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Export</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-h-0 flex-1">
        {/* Asset panel */}
        <div className="hidden w-[15%] border-r border-neutral-800 p-2 sm:block">
          <div className="mb-2 text-[9px] font-medium text-neutral-500">Assets</div>
          <div className="space-y-1.5">
            {["/hero-asset-video.jpg", "/hero-asset-1.jpg", "/hero-asset-2.jpg"].map((src) => (
              <div key={src} className="aspect-video overflow-hidden rounded bg-neutral-800/60">
                <img src={src} alt="" className="size-full object-cover" draggable={false} />
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center p-3">
            <div className="relative aspect-video w-full max-w-[80%] overflow-hidden rounded">
              <video
                src="/hero-preview.mp4"
                className="size-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                poster="/hero-preview.jpg"
              />
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center justify-center gap-2 border-t border-neutral-800 py-1.5">
            <SkipBack className="size-2.5 text-neutral-500" />
            <ChevronsLeft className="size-2.5 text-neutral-500" />
            <Play className="size-3 text-neutral-400" />
            <ChevronsRight className="size-2.5 text-neutral-500" />
            <SkipForward className="size-2.5 text-neutral-500" />
            <span className="ml-1 font-mono text-[9px] text-neutral-600">00:00:12.15</span>
          </div>
        </div>

        {/* Properties panel */}
        <div className="hidden w-[18%] border-l border-neutral-800 p-2 md:block">
          <div className="mb-2 text-[9px] font-medium text-neutral-500">Properties</div>
          <div className="space-y-2">
            {[
              { label: "Position", value: "960, 540" },
              { label: "Scale", value: "100%" },
              { label: "Rotation", value: "0.0°" },
              { label: "Opacity", value: "100%" },
            ].map((prop) => (
              <div key={prop.label} className="flex items-center justify-between">
                <span className="text-[8px] text-neutral-600">{prop.label}</span>
                <span className="font-mono text-[8px] text-neutral-400">{prop.value}</span>
              </div>
            ))}
            <div className="mt-2 border-t border-neutral-800 pt-2">
              <div className="mb-1.5 text-[9px] font-medium text-neutral-500">Effects</div>
              {[
                { label: "Brightness", value: 72 },
                { label: "Contrast", value: 58 },
                { label: "Blur", value: 0 },
              ].map((fx) => (
                <div key={fx.label} className="mb-1 flex items-center justify-between">
                  <span className="text-[8px] text-neutral-600">{fx.label}</span>
                  <span className="font-mono text-[8px] text-neutral-400">{fx.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex h-[25%] flex-col border-t border-neutral-800">
        {/* Ruler */}
        <div className="flex h-5 items-center border-b border-neutral-800/60 px-2">
          <div className="w-[12%] sm:w-[15%]" />
          <div className="flex flex-1 items-end">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-start">
                <div className={cn("w-px bg-neutral-700", i % 4 === 0 ? "h-2.5" : "h-1.5")} />
                {i % 4 === 0 && <span className="mt-px text-[7px] text-neutral-600">{i}s</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Tracks */}
        <div className="flex flex-1 flex-col gap-0.5 overflow-hidden px-2 py-1">
          {/* Video Track 1 */}
          <div className="flex min-h-0 flex-1 items-center gap-0">
            <div className="w-[12%] truncate pr-1 text-[8px] text-neutral-500 sm:w-[15%]">V1</div>
            <div className="flex h-full flex-1 items-center gap-0.5">
              <div className="h-full min-w-0 flex-[3] overflow-hidden rounded-sm border border-indigo-500/30">
                <img
                  src="/hero-asset-video.jpg"
                  alt=""
                  className="size-full object-cover opacity-60"
                  draggable={false}
                />
              </div>
              <div className="h-full min-w-0 flex-[2] overflow-hidden rounded-sm border border-violet-500/30">
                <img
                  src="/hero-asset-1.jpg"
                  alt=""
                  className="size-full object-cover opacity-60"
                  draggable={false}
                />
              </div>
              <div className="h-full min-w-0 flex-[4] overflow-hidden rounded-sm border border-indigo-500/30">
                <img
                  src="/hero-asset-2.jpg"
                  alt=""
                  className="size-full object-cover opacity-60"
                  draggable={false}
                />
              </div>
            </div>
          </div>
          {/* Video Track 2 */}
          <div className="flex min-h-0 flex-1 items-center gap-0">
            <div className="w-[12%] truncate pr-1 text-[8px] text-neutral-500 sm:w-[15%]">V2</div>
            <div className="flex h-full flex-1 items-center gap-0.5">
              <div className="flex-[2]" />
              <div className="h-full min-w-0 flex-[3] overflow-hidden rounded-sm border border-emerald-500/30">
                <img
                  src="/hero-asset-1.jpg"
                  alt=""
                  className="size-full object-cover opacity-50"
                  draggable={false}
                />
              </div>
              <div className="flex-[4]" />
            </div>
          </div>
          {/* Audio Track */}
          <div className="flex min-h-0 flex-1 items-center gap-0">
            <div className="w-[12%] truncate pr-1 text-[8px] text-neutral-500 sm:w-[15%]">A1</div>
            <div className="flex h-full flex-1 items-center gap-0.5">
              <div className="flex h-full min-w-0 flex-[3] items-center rounded-sm border border-amber-500/25 bg-amber-500/20 px-1">
                <svg
                  className="h-[60%] w-full text-amber-500/40"
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0,10 Q5,2 10,10 Q15,18 20,10 Q25,4 30,10 Q35,16 40,10 Q45,3 50,10 Q55,17 60,10 Q65,5 70,10 Q75,15 80,10 Q85,6 90,10 Q95,14 100,10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <div className="flex h-full min-w-0 flex-[2] items-center rounded-sm border border-amber-500/25 bg-amber-500/20 px-1">
                <svg
                  className="h-[60%] w-full text-amber-500/40"
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0,10 Q10,5 20,10 Q30,15 40,10 Q50,6 60,10 Q70,14 80,10 Q90,7 100,10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <div className="flex h-full min-w-0 flex-[4] items-center rounded-sm border border-amber-500/25 bg-amber-500/20 px-1">
                <svg
                  className="h-[60%] w-full text-amber-500/40"
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0,10 Q3,3 6,10 Q9,17 12,10 Q15,4 18,10 Q21,16 24,10 Q27,5 30,10 Q33,15 36,10 Q39,6 42,10 Q45,14 48,10 Q51,7 54,10 Q57,13 60,10 Q63,8 66,10 Q69,12 72,10 Q75,9 78,10 Q81,11 84,10 Q87,10 90,10 Q93,10 96,10 L100,10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Playhead indicator */}
        <div className="relative h-0">
          <div className="pointer-events-none absolute top-0 left-[35%] h-[calc(100%+60px)] w-px -translate-y-full bg-red-500/60" />
        </div>
      </div>
    </div>
  );
}
