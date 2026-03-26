import type { Transition, TransitionType, EasingPreset } from "@tooscut/render-engine";

import { useCallback } from "react";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Slider } from "../ui/slider";
import { PropertySection, PropertyRow } from "./property-shared";

const TRANSITION_TYPES: { value: TransitionType; label: string }[] = [
  { value: "None", label: "None" },
  { value: "Fade", label: "Fade" },
  { value: "Dissolve", label: "Dissolve" },
  { value: "WipeLeft", label: "Wipe Left" },
  { value: "WipeRight", label: "Wipe Right" },
  { value: "WipeUp", label: "Wipe Up" },
  { value: "WipeDown", label: "Wipe Down" },
  { value: "SlideLeft", label: "Slide Left" },
  { value: "SlideRight", label: "Slide Right" },
  { value: "SlideUp", label: "Slide Up" },
  { value: "SlideDown", label: "Slide Down" },
  { value: "ZoomIn", label: "Zoom In" },
  { value: "ZoomOut", label: "Zoom Out" },
  { value: "RotateCw", label: "Rotate CW" },
  { value: "RotateCcw", label: "Rotate CCW" },
  { value: "FlipH", label: "Flip H" },
  { value: "FlipV", label: "Flip V" },
];

const EASING_PRESETS: { value: EasingPreset; label: string }[] = [
  { value: "Linear", label: "Linear" },
  { value: "EaseIn", label: "Ease In" },
  { value: "EaseOut", label: "Ease Out" },
  { value: "EaseInOut", label: "Ease In Out" },
];

function makeTransition(type: TransitionType, duration: number, easing: EasingPreset): Transition {
  return {
    type,
    duration,
    easing: { preset: easing },
  };
}

interface TransitionSectionProps {
  label: string;
  transition?: Transition;
  onChange: (transition: Transition | null) => void;
}

function TransitionSection({ label, transition, onChange }: TransitionSectionProps) {
  const type = transition?.type ?? "None";
  const duration = transition?.duration ?? 0.5;
  const easing = transition?.easing?.preset ?? "EaseInOut";

  const handleTypeChange = useCallback(
    (newType: string) => {
      if (newType === "None") {
        onChange(null);
      } else {
        onChange(makeTransition(newType as TransitionType, duration, easing));
      }
    },
    [duration, easing, onChange],
  );

  const handleDurationChange = useCallback(
    (values: number[]) => {
      if (type === "None") return;
      onChange(makeTransition(type, values[0], easing));
    },
    [type, easing, onChange],
  );

  const handleEasingChange = useCallback(
    (newEasing: string) => {
      if (type === "None") return;
      onChange(makeTransition(type, duration, newEasing as EasingPreset));
    },
    [type, duration, onChange],
  );

  return (
    <PropertySection title={label}>
      <PropertyRow label="Type">
        <Select value={type} onValueChange={handleTypeChange}>
          <SelectTrigger size="sm" className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSITION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {type !== "None" && (
        <>
          <PropertyRow label="Duration">
            <div className="flex items-center gap-2">
              <Slider
                min={0.1}
                max={3}
                step={0.1}
                value={[duration]}
                onValueChange={handleDurationChange}
                className="w-20"
              />
              <span className="w-8 text-right text-xs text-muted-foreground">
                {duration.toFixed(1)}s
              </span>
            </div>
          </PropertyRow>
          <PropertyRow label="Easing">
            <Select value={easing} onValueChange={handleEasingChange}>
              <SelectTrigger size="sm" className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EASING_PRESETS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertyRow>
        </>
      )}
    </PropertySection>
  );
}

interface TransitionPropertiesProps {
  clipId: string;
  transitionIn?: Transition;
  transitionOut?: Transition;
}

export function TransitionProperties({
  clipId,
  transitionIn,
  transitionOut,
}: TransitionPropertiesProps) {
  const setClipTransitionIn = useVideoEditorStore((s) => s.setClipTransitionIn);
  const setClipTransitionOut = useVideoEditorStore((s) => s.setClipTransitionOut);

  const handleTransitionInChange = useCallback(
    (t: Transition | null) => setClipTransitionIn(clipId, t),
    [clipId, setClipTransitionIn],
  );

  const handleTransitionOutChange = useCallback(
    (t: Transition | null) => setClipTransitionOut(clipId, t),
    [clipId, setClipTransitionOut],
  );

  return (
    <div className="space-y-4">
      <TransitionSection
        label="Transition In"
        transition={transitionIn}
        onChange={handleTransitionInChange}
      />
      <TransitionSection
        label="Transition Out"
        transition={transitionOut}
        onChange={handleTransitionOutChange}
      />
    </div>
  );
}
