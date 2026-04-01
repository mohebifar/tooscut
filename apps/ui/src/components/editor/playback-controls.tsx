import { type FrameRate } from "@tooscut/render-engine";
import { Play, Pause, SkipBack, SkipForward, ChevronsLeft, ChevronsRight } from "lucide-react";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

/**
 * Format a frame number as timecode HH:MM:SS:FF
 */
function formatTimecode(frame: number, fps: FrameRate): string {
  const fpsFloat = fps.numerator / fps.denominator;
  const totalSeconds = frame / fpsFloat;
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const ff = Math.floor(frame % fpsFloat);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${ff.toString().padStart(2, "0")}`;
}

export function PlaybackControls() {
  const currentFrame = useVideoEditorStore((s) => s.currentFrame);
  const durationFrames = useVideoEditorStore((s) => s.durationFrames);
  const isPlaying = useVideoEditorStore((s) => s.isPlaying);
  const playbackSpeed = useVideoEditorStore((s) => s.playbackSpeed);
  const seekTo = useVideoEditorStore((s) => s.seekTo);
  const setIsPlaying = useVideoEditorStore((s) => s.setIsPlaying);
  const setPlaybackSpeed = useVideoEditorStore((s) => s.setPlaybackSpeed);
  const settings = useVideoEditorStore((s) => s.settings);

  const handleJumpToStart = () => seekTo(0);
  const handleStepBackward = () => seekTo(Math.max(0, currentFrame - 1));
  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setPlaybackSpeed(1);
      setIsPlaying(true);
    }
  };
  const handleStepForward = () => seekTo(Math.min(durationFrames, currentFrame + 1));
  const handleJumpToEnd = () => seekTo(durationFrames);

  // Format speed for display (e.g., "2x", "-4x", "REV")
  const speedLabel =
    playbackSpeed === 1 || !isPlaying ? null : `${playbackSpeed > 0 ? "" : ""}${playbackSpeed}x`;

  // Reverse playback indicator
  const isReverse = playbackSpeed < 0 && isPlaying;

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

        {/* Speed indicator (shown when not 1x during playback) */}
        {speedLabel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={`ml-2 rounded px-2 py-0.5 font-mono text-sm font-medium ${
                  isReverse
                    ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                    : "bg-primary/20 text-primary"
                }`}
              >
                {speedLabel}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isReverse
                  ? "Reverse playback (no audio, may be slow)"
                  : `Playback speed: ${playbackSpeed}x`}
              </p>
              <p className="text-xs text-muted-foreground">L = faster, J = reverse, K = pause</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Time display */}
        <div className="ml-4 font-mono text-sm text-muted-foreground">
          {formatTimecode(currentFrame, settings.fps)} /{" "}
          {formatTimecode(durationFrames, settings.fps)}
        </div>
      </div>
    </TooltipProvider>
  );
}
