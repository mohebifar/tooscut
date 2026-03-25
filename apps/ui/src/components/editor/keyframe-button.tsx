/**
 * KeyframeButton - Diamond toggle button with navigation controls.
 *
 * Shows keyframe state:
 * - Empty diamond: No keyframes for this property
 * - Half-filled diamond: Property has keyframes, but playhead is not at one
 * - Filled diamond: Playhead is at a keyframe
 *
 * Click to add/remove keyframe at current time.
 * Use the curve editor in the timeline to adjust easing.
 */

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { useVideoEditorStore } from "../../state/video-editor-store";
import type { AnimatableProperty } from "@tooscut/render-engine";
import {
  isAtKeyframe,
  isPropertyKeyframed,
  getAdjacentKeyframeTimes,
  getKeyframeIndexAtTime,
} from "../../lib/keyframe-utils";

interface KeyframeButtonProps {
  clipId: string;
  property: AnimatableProperty;
  /** Current value of the property (for adding new keyframes) */
  currentValue: number;
  /** Callback when resetting to default (called after removing all keyframes) */
  onReset?: () => void;
  /** Clip start time (for calculating absolute time) */
  clipStartTime: number;
}

/**
 * Diamond icon for keyframe state visualization.
 */
function DiamondIcon({
  filled,
  halfFilled,
  className,
}: {
  filled?: boolean;
  halfFilled?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {filled ? (
        <path
          d="M6 1L11 6L6 11L1 6L6 1Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ) : halfFilled ? (
        <>
          <path d="M6 1L11 6L6 11L1 6L6 1Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M6 3L3 6L6 9L6 3Z" fill="currentColor" />
        </>
      ) : (
        <path d="M6 1L11 6L6 11L1 6L6 1Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      )}
    </svg>
  );
}

export function KeyframeButton({
  clipId,
  property,
  currentValue,
  onReset,
  clipStartTime,
}: KeyframeButtonProps) {
  const currentTime = useVideoEditorStore((s) => s.currentFrame);
  const clips = useVideoEditorStore((s) => s.clips);
  const addKeyframe = useVideoEditorStore((s) => s.addKeyframe);
  const deleteKeyframe = useVideoEditorStore((s) => s.deleteKeyframe);
  const removeAllKeyframes = useVideoEditorStore((s) => s.removeAllKeyframes);
  const seekTo = useVideoEditorStore((s) => s.seekTo);

  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return null;

  // Calculate clip-relative time
  const clipRelativeTime = Math.max(0, currentTime - clipStartTime);

  const hasKeyframes = isPropertyKeyframed(clip.keyframes, property);
  const atKeyframe = isAtKeyframe(clip.keyframes, property, clipRelativeTime);
  const keyframeIndex = getKeyframeIndexAtTime(clip.keyframes, property, clipRelativeTime);
  const [prevTime, nextTime] = getAdjacentKeyframeTimes(clip.keyframes, property, clipRelativeTime);

  const handleDiamondClick = () => {
    if (atKeyframe && keyframeIndex !== -1) {
      // Delete keyframe at current time
      deleteKeyframe(clipId, property, keyframeIndex);
    } else {
      // Add keyframe at current time
      addKeyframe(clipId, property, clipRelativeTime, currentValue);
    }
  };

  const handlePrevClick = () => {
    if (prevTime !== null) {
      seekTo(clipStartTime + prevTime);
    }
  };

  const handleNextClick = () => {
    if (nextTime !== null) {
      seekTo(clipStartTime + nextTime);
    }
  };

  const handleResetClick = () => {
    removeAllKeyframes(clipId, property);
    onReset?.();
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* Previous keyframe button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-5 w-5 p-0", prevTime === null && "cursor-default opacity-30")}
        onClick={handlePrevClick}
        disabled={prevTime === null}
        title="Previous keyframe"
      >
        <ChevronLeft className="h-3 w-3" />
      </Button>

      {/* Diamond toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-5 w-5 p-0",
          atKeyframe && "text-yellow-500",
          hasKeyframes && !atKeyframe && "text-yellow-500/60",
        )}
        onClick={handleDiamondClick}
        title={atKeyframe ? "Remove keyframe" : "Add keyframe"}
      >
        <DiamondIcon filled={atKeyframe} halfFilled={hasKeyframes && !atKeyframe} />
      </Button>

      {/* Next keyframe button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-5 w-5 p-0", nextTime === null && "cursor-default opacity-30")}
        onClick={handleNextClick}
        disabled={nextTime === null}
        title="Next keyframe"
      >
        <ChevronRight className="h-3 w-3" />
      </Button>

      {/* Reset button - only show when property has keyframes */}
      {hasKeyframes && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
          onClick={handleResetClick}
          title="Remove all keyframes"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
