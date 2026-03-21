import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { Play, Pause, SkipBack, SkipForward, ChevronsLeft, ChevronsRight } from "lucide-react";

/**
 * Format time as HH:MM:SS.ms
 */
function formatTimecode(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function PlaybackControls() {
  const currentTime = useVideoEditorStore((s) => s.currentTime);
  const duration = useVideoEditorStore((s) => s.duration);
  const isPlaying = useVideoEditorStore((s) => s.isPlaying);
  const seekTo = useVideoEditorStore((s) => s.seekTo);
  const setIsPlaying = useVideoEditorStore((s) => s.setIsPlaying);

  const frameTime = 1 / 30;

  const handleJumpToStart = () => seekTo(0);
  const handleStepBackward = () => seekTo(Math.max(0, currentTime - frameTime));
  const handlePlayPause = () => setIsPlaying(!isPlaying);
  const handleStepForward = () => seekTo(Math.min(duration, currentTime + frameTime));
  const handleJumpToEnd = () => seekTo(duration);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center justify-center gap-2 py-2">
        {/* Jump to start */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleJumpToStart}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Jump to Start (Home)</p>
          </TooltipContent>
        </Tooltip>

        {/* Step backward */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleStepBackward}>
              <SkipBack className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Previous Frame (,)</p>
          </TooltipContent>
        </Tooltip>

        {/* Play/Pause */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="icon"
              className="size-10 rounded-full"
              onClick={handlePlayPause}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isPlaying ? "Pause (Space)" : "Play (Space)"}</p>
          </TooltipContent>
        </Tooltip>

        {/* Step forward */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleStepForward}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Next Frame (.)</p>
          </TooltipContent>
        </Tooltip>

        {/* Jump to end */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleJumpToEnd}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Jump to End (End)</p>
          </TooltipContent>
        </Tooltip>

        {/* Time display */}
        <div className="ml-4 font-mono text-sm text-muted-foreground">
          {formatTimecode(currentTime)} / {formatTimecode(duration)}
        </div>
      </div>
    </TooltipProvider>
  );
}
