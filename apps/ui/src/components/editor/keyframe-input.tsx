/**
 * KeyframeInput - NumericInput wrapper with keyframe awareness.
 *
 * Behavior:
 * - Displays evaluated value at current time (not base value) when keyframed
 * - If at keyframe: updates the keyframe value
 * - If keyframed but not at keyframe: auto-adds new keyframe at current time
 * - If not keyframed: updates base value via onChange
 */

import { NumericInput } from "../ui/numeric-input";
import { KeyframeButton } from "./keyframe-button";
import { useVideoEditorStore } from "../../state/video-editor-store";
import type { AnimatableProperty } from "@tooscut/render-engine";
import {
  evaluateKeyframe,
  isAtKeyframe,
  isPropertyKeyframed,
  getKeyframeIndexAtTime,
} from "../../lib/keyframe-utils";

interface KeyframeInputProps {
  clipId: string;
  property: AnimatableProperty;
  /** Base value of the property (used when not keyframed) */
  baseValue: number;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step size for adjustments */
  step?: number;
  /** Number of decimal places */
  precision?: number;
  /** Suffix to display (e.g., 'px', '%', '°') */
  suffix?: string;
  /** Called when base value changes (when not keyframed) */
  onChange: (value: number) => void;
  /** Default value for reset */
  defaultValue?: number;
  /** Clip start time (for calculating absolute time) */
  clipStartTime: number;
  /** Whether to show the keyframe button */
  showKeyframeButton?: boolean;
  /** Optional display transformation (e.g., * 100 for percentages) */
  displayMultiplier?: number;
  /** Additional class names for the container */
  className?: string;
}

export function KeyframeInput({
  clipId,
  property,
  baseValue,
  min,
  max,
  step = 1,
  precision = 0,
  suffix,
  onChange,
  defaultValue,
  clipStartTime,
  showKeyframeButton = true,
  displayMultiplier = 1,
  className,
}: KeyframeInputProps) {
  const currentTime = useVideoEditorStore((s) => s.currentFrame);
  const clips = useVideoEditorStore((s) => s.clips);
  const addKeyframe = useVideoEditorStore((s) => s.addKeyframe);
  const updateKeyframe = useVideoEditorStore((s) => s.updateKeyframe);

  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return null;

  // Calculate clip-relative time
  const clipRelativeTime = Math.max(0, currentTime - clipStartTime);

  const hasKeyframes = isPropertyKeyframed(clip.keyframes, property);
  const atKeyframe = isAtKeyframe(clip.keyframes, property, clipRelativeTime);

  // Determine the displayed value
  let displayValue: number;
  if (hasKeyframes) {
    const evaluated = evaluateKeyframe(clip.keyframes, property, clipRelativeTime);
    displayValue = evaluated !== null ? evaluated : baseValue;
  } else {
    displayValue = baseValue;
  }

  // Apply display multiplier (e.g., for showing 100 instead of 1 for scale)
  const displayedValue = displayValue * displayMultiplier;

  const handleChange = (newDisplayValue: number) => {
    // Convert back from display value
    const newValue = newDisplayValue / displayMultiplier;

    if (!hasKeyframes) {
      // Not keyframed - update base value
      onChange(newValue);
    } else if (atKeyframe) {
      // At a keyframe - update the keyframe value
      const index = getKeyframeIndexAtTime(clip.keyframes, property, clipRelativeTime);
      if (index !== -1) {
        updateKeyframe(clipId, property, index, { value: newValue });
      }
    } else {
      // Keyframed but not at keyframe - auto-add new keyframe
      addKeyframe(clipId, property, clipRelativeTime, newValue);
    }
  };

  const handleReset = () => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  // Convert min/max to display values if provided
  const displayMin = min !== undefined ? min * displayMultiplier : undefined;
  const displayMax = max !== undefined ? max * displayMultiplier : undefined;
  const displayStep = step * displayMultiplier;

  // Store actual value for keyframe button (not display value)
  const currentActualValue = displayValue;

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <NumericInput
        value={displayedValue}
        onChange={handleChange}
        min={displayMin}
        max={displayMax}
        step={displayStep}
        precision={precision}
        suffix={suffix}
      />
      {showKeyframeButton && (
        <KeyframeButton
          clipId={clipId}
          property={property}
          currentValue={currentActualValue}
          onReset={handleReset}
          clipStartTime={clipStartTime}
        />
      )}
    </div>
  );
}
