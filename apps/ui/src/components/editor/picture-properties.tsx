import type { Effects } from "@tooscut/render-engine";

import { NumericInput } from "../ui/numeric-input";
import { KeyframeInput } from "./keyframe-input";
import { PropertySection, PropertyRow } from "./property-shared";

interface PicturePropertiesProps {
  clipId: string;
  clipStartTime: number;
  clipType: "video" | "image";
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  opacity: number;
  speed: number;
  onTransformChange: (key: string, value: number) => void;
  onEffectsChange: (key: keyof Effects, value: number) => void;
  onSpeedChange: (value: number) => void;
}

export function PictureProperties({
  clipId,
  clipStartTime,
  clipType,
  transform,
  opacity,
  speed,
  onTransformChange,
  onEffectsChange,
  onSpeedChange,
}: PicturePropertiesProps) {
  return (
    <div className="space-y-4">
      <PropertySection title="Position">
        <PropertyRow label="X">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="x"
            baseValue={transform.x}
            onChange={(v) => onTransformChange("x", v)}
            suffix="px"
            precision={0}
            step={1}
            defaultValue={960}
          />
        </PropertyRow>
        <PropertyRow label="Y">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="y"
            baseValue={transform.y}
            onChange={(v) => onTransformChange("y", v)}
            suffix="px"
            precision={0}
            step={1}
            defaultValue={540}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Scale">
        <PropertyRow label="X">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="scaleX"
            baseValue={transform.scaleX}
            onChange={(v) => onTransformChange("scaleX", v)}
            suffix="%"
            precision={0}
            step={0.01}
            min={0.01}
            max={5}
            displayMultiplier={100}
            defaultValue={1}
          />
        </PropertyRow>
        <PropertyRow label="Y">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="scaleY"
            baseValue={transform.scaleY}
            onChange={(v) => onTransformChange("scaleY", v)}
            suffix="%"
            precision={0}
            step={0.01}
            min={0.01}
            max={5}
            displayMultiplier={100}
            defaultValue={1}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Rotation">
        <PropertyRow label="Angle">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="rotation"
            baseValue={transform.rotation}
            onChange={(v) => onTransformChange("rotation", v)}
            suffix="°"
            precision={1}
            step={0.5}
            min={-360}
            max={360}
            defaultValue={0}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Opacity">
        <PropertyRow label="Opacity">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="opacity"
            baseValue={opacity}
            onChange={(v) => onEffectsChange("opacity", v)}
            suffix="%"
            precision={0}
            step={0.01}
            min={0}
            max={1}
            displayMultiplier={100}
            defaultValue={1}
          />
        </PropertyRow>
      </PropertySection>

      {clipType === "video" && (
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
      )}
    </div>
  );
}
