import { NumericInput } from "../ui/numeric-input";
import { KeyframeInput } from "./keyframe-input";
import { PropertySection, PropertyRow } from "./property-shared";

interface AudioPropertiesProps {
  clipId: string;
  clipStartTime: number;
  volume: number;
  speed: number;
  /** Fade-in duration in seconds. */
  fadeIn: number;
  /** Fade-out duration in seconds. */
  fadeOut: number;
  /** Half the clip's duration in seconds — fades can't exceed this. */
  maxFade: number;
  onVolumeChange: (value: number) => void;
  onSpeedChange: (value: number) => void;
  onFadeInChange: (seconds: number) => void;
  onFadeOutChange: (seconds: number) => void;
}

export function AudioProperties({
  clipId,
  clipStartTime,
  volume,
  speed,
  fadeIn,
  fadeOut,
  maxFade,
  onVolumeChange,
  onSpeedChange,
  onFadeInChange,
  onFadeOutChange,
}: AudioPropertiesProps) {
  return (
    <div className="space-y-4">
      <PropertySection title="Volume">
        <PropertyRow label="Level">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="volume"
            baseValue={volume}
            onChange={onVolumeChange}
            suffix="%"
            precision={0}
            step={0.01}
            min={0}
            max={2}
            displayMultiplier={100}
            defaultValue={1}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Speed">
        <PropertyRow
          label="Rate"
          isDirty={Math.abs(speed - 1) > 1e-6}
          onReset={() => onSpeedChange(1)}
        >
          <NumericInput
            value={speed}
            onChange={onSpeedChange}
            suffix="x"
            precision={2}
            step={0.25}
            min={0.1}
            max={16}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Fade">
        <PropertyRow label="Fade In" isDirty={fadeIn > 0} onReset={() => onFadeInChange(0)}>
          <NumericInput
            value={fadeIn}
            onChange={onFadeInChange}
            suffix="s"
            precision={2}
            step={0.1}
            min={0}
            max={maxFade}
          />
        </PropertyRow>
        <PropertyRow label="Fade Out" isDirty={fadeOut > 0} onReset={() => onFadeOutChange(0)}>
          <NumericInput
            value={fadeOut}
            onChange={onFadeOutChange}
            suffix="s"
            precision={2}
            step={0.1}
            min={0}
            max={maxFade}
          />
        </PropertyRow>
      </PropertySection>
    </div>
  );
}
