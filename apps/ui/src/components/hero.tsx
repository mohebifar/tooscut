import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  SkipBack,
  ChevronsLeft,
  Play,
  ChevronsRight,
  SkipForward,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

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
            "text-balance font-medium text-4xl text-foreground leading-tight md:text-5xl",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out",
          )}
        >
          Professional video editing, right in your browser
        </h1>

        <p
          className={cn(
            "text-muted-foreground text-sm tracking-wider sm:text-lg md:text-xl",
            "fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out",
          )}
        >
          A powerful NLE editor with GPU compositing, keyframe animation, and real-time preview. No
          installs required.
        </p>

        <div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
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
            "mask-b-from-60% relative mt-8 -mr-56 overflow-hidden px-2 sm:mt-12 sm:mr-0 md:mt-20",
            "fade-in slide-in-from-bottom-5 animate-in fill-mode-backwards delay-100 duration-1000 ease-out",
          )}
        >
          <div className="relative inset-shadow-2xs inset-shadow-foreground/10 mx-auto max-w-5xl overflow-hidden rounded-lg border bg-background p-2 shadow-xl ring-1 ring-card dark:inset-shadow-foreground/20 dark:inset-shadow-xs">
            <EditorMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function EditorMockup() {
  return (
    <div className="aspect-video rounded-lg border bg-neutral-950 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-red-500/60" />
            <div className="size-2.5 rounded-full bg-yellow-500/60" />
            <div className="size-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[10px] text-neutral-500 ml-2">Tooscut Editor</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-neutral-500">
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Export</span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Asset panel */}
        <div className="w-[15%] border-r border-neutral-800 p-2 hidden sm:block">
          <div className="text-[9px] text-neutral-500 mb-2 font-medium">Assets</div>
          <div className="space-y-1.5">
            {["/hero-asset-video.jpg", "/hero-asset-1.jpg", "/hero-asset-2.jpg"].map((src) => (
              <div key={src} className="aspect-video rounded bg-neutral-800/60 overflow-hidden">
                <img src={src} alt="" className="size-full object-cover" draggable={false} />
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-3">
            <div className="w-full max-w-[80%] aspect-video rounded overflow-hidden relative">
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
          <div className="flex items-center justify-center gap-2 py-1.5 border-t border-neutral-800">
            <SkipBack className="size-2.5 text-neutral-500" />
            <ChevronsLeft className="size-2.5 text-neutral-500" />
            <Play className="size-3 text-neutral-400" />
            <ChevronsRight className="size-2.5 text-neutral-500" />
            <SkipForward className="size-2.5 text-neutral-500" />
            <span className="text-[9px] text-neutral-600 font-mono ml-1">00:00:12.15</span>
          </div>
        </div>

        {/* Properties panel */}
        <div className="w-[18%] border-l border-neutral-800 p-2 hidden md:block">
          <div className="text-[9px] text-neutral-500 mb-2 font-medium">Properties</div>
          <div className="space-y-2">
            {[
              { label: "Position", value: "960, 540" },
              { label: "Scale", value: "100%" },
              { label: "Rotation", value: "0.0°" },
              { label: "Opacity", value: "100%" },
            ].map((prop) => (
              <div key={prop.label} className="flex items-center justify-between">
                <span className="text-[8px] text-neutral-600">{prop.label}</span>
                <span className="text-[8px] text-neutral-400 font-mono">{prop.value}</span>
              </div>
            ))}
            <div className="border-t border-neutral-800 pt-2 mt-2">
              <div className="text-[9px] text-neutral-500 mb-1.5 font-medium">Effects</div>
              {[
                { label: "Brightness", value: 72 },
                { label: "Contrast", value: 58 },
                { label: "Blur", value: 0 },
              ].map((fx) => (
                <div key={fx.label} className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-neutral-600">{fx.label}</span>
                  <span className="text-[8px] text-neutral-400 font-mono">{fx.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="border-t border-neutral-800 h-[25%] flex flex-col">
        {/* Ruler */}
        <div className="flex items-center h-5 border-b border-neutral-800/60 px-2">
          <div className="w-[12%] sm:w-[15%]" />
          <div className="flex-1 flex items-end">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-start">
                <div className={cn("w-px bg-neutral-700", i % 4 === 0 ? "h-2.5" : "h-1.5")} />
                {i % 4 === 0 && <span className="text-[7px] text-neutral-600 mt-px">{i}s</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Tracks */}
        <div className="flex-1 flex flex-col px-2 py-1 gap-0.5 overflow-hidden">
          {/* Video Track 1 */}
          <div className="flex items-center gap-0 flex-1 min-h-0">
            <div className="w-[12%] sm:w-[15%] text-[8px] text-neutral-500 pr-1 truncate">V1</div>
            <div className="flex-1 flex gap-0.5 items-center h-full">
              <div className="h-full rounded-sm border border-indigo-500/30 flex-[3] min-w-0 overflow-hidden">
                <img
                  src="/hero-asset-video.jpg"
                  alt=""
                  className="size-full object-cover opacity-60"
                  draggable={false}
                />
              </div>
              <div className="h-full rounded-sm border border-violet-500/30 flex-[2] min-w-0 overflow-hidden">
                <img
                  src="/hero-asset-1.jpg"
                  alt=""
                  className="size-full object-cover opacity-60"
                  draggable={false}
                />
              </div>
              <div className="h-full rounded-sm border border-indigo-500/30 flex-[4] min-w-0 overflow-hidden">
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
          <div className="flex items-center gap-0 flex-1 min-h-0">
            <div className="w-[12%] sm:w-[15%] text-[8px] text-neutral-500 pr-1 truncate">V2</div>
            <div className="flex-1 flex gap-0.5 items-center h-full">
              <div className="flex-[2]" />
              <div className="h-full rounded-sm border border-emerald-500/30 flex-[3] min-w-0 overflow-hidden">
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
          <div className="flex items-center gap-0 flex-1 min-h-0">
            <div className="w-[12%] sm:w-[15%] text-[8px] text-neutral-500 pr-1 truncate">A1</div>
            <div className="flex-1 flex gap-0.5 items-center h-full">
              <div className="h-full rounded-sm bg-amber-500/20 border border-amber-500/25 flex-[3] min-w-0 flex items-center px-1">
                <svg
                  className="w-full h-[60%] text-amber-500/40"
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
              <div className="h-full rounded-sm bg-amber-500/20 border border-amber-500/25 flex-[2] min-w-0 flex items-center px-1">
                <svg
                  className="w-full h-[60%] text-amber-500/40"
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
              <div className="h-full rounded-sm bg-amber-500/20 border border-amber-500/25 flex-[4] min-w-0 flex items-center px-1">
                <svg
                  className="w-full h-[60%] text-amber-500/40"
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
          <div className="absolute left-[35%] top-0 -translate-y-full w-px h-[calc(100%+60px)] bg-red-500/60 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
