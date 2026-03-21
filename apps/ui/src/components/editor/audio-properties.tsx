import { NumericInput } from "../ui/numeric-input";
import { KeyframeInput } from "./keyframe-input";
import { PropertySection, PropertyRow } from "./property-shared";

interface AudioPropertiesProps {
  clipId: string;
  clipStartTime: number;
  volume: number;
  speed: number;
  onVolumeChange: (value: number) => void;
  onSpeedChange: (value: number) => void;
}

export function AudioProperties({
  clipId,
  clipStartTime,
  volume,
  speed,
  onVolumeChange,
  onSpeedChange,
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
        <PropertyRow label="Rate">
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
    </div>
  );
}
