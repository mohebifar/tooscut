import type { Effects } from "@tooscut/render-engine";

import { KeyframeInput } from "./keyframe-input";
import { PropertySection, PropertyRow } from "./property-shared";

interface EffectPropertiesProps {
  clipId: string;
  clipStartTime: number;
  effects: {
    brightness: number;
    contrast: number;
    saturation: number;
    hueRotate: number;
    blur: number;
  };
  onEffectsChange: (key: keyof Effects, value: number) => void;
}

export function EffectProperties({
  clipId,
  clipStartTime,
  effects,
  onEffectsChange,
}: EffectPropertiesProps) {
  return (
    <div className="space-y-4">
      <PropertySection title="Color">
        <PropertyRow label="Brightness">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="brightness"
            baseValue={effects.brightness}
            onChange={(v) => onEffectsChange("brightness", v)}
            suffix="%"
            precision={0}
            step={0.01}
            min={0}
            max={3}
            displayMultiplier={100}
            defaultValue={1}
          />
        </PropertyRow>
        <PropertyRow label="Contrast">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="contrast"
            baseValue={effects.contrast}
            onChange={(v) => onEffectsChange("contrast", v)}
            suffix="%"
            precision={0}
            step={0.01}
            min={0}
            max={3}
            displayMultiplier={100}
            defaultValue={1}
          />
        </PropertyRow>
        <PropertyRow label="Saturation">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="saturation"
            baseValue={effects.saturation}
            onChange={(v) => onEffectsChange("saturation", v)}
            suffix="%"
            precision={0}
            step={0.01}
            min={0}
            max={3}
            displayMultiplier={100}
            defaultValue={1}
          />
        </PropertyRow>
        <PropertyRow label="Hue Rotate">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="hueRotate"
            baseValue={effects.hueRotate}
            onChange={(v) => onEffectsChange("hue_rotate", v)}
            suffix="°"
            precision={0}
            step={1}
            min={-180}
            max={180}
            defaultValue={0}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Blur">
        <PropertyRow label="Blur">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="blur"
            baseValue={effects.blur}
            onChange={(v) => onEffectsChange("blur", v)}
            suffix="px"
            precision={1}
            step={0.5}
            min={0}
            max={100}
            defaultValue={0}
          />
        </PropertyRow>
      </PropertySection>
    </div>
  );
}
