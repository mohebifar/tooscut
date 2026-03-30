import type { Effects } from "@tooscut/render-engine";

import { useMemo, useState } from "react";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { NumericInput } from "../ui/numeric-input";
import { KeyframeInput } from "./keyframe-input";
import { PropertySection, PropertyRow, LinkablePropertySection } from "./property-shared";

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
  const [scaleLinked, setScaleLinked] = useState(true);

  // Compute fit-to-screen scale from the clip's asset dimensions
  const clips = useVideoEditorStore((s) => s.clips);
  const assets = useVideoEditorStore((s) => s.assets);
  const settings = useVideoEditorStore((s) => s.settings);

  const fitScale = useMemo(() => {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip || (clip.type !== "video" && clip.type !== "image")) return 1;
    const asset = assets.find((a) => a.id === clip.assetId);
    if (!asset?.width || !asset?.height) return 1;
    return Math.min(settings.width / asset.width, settings.height / asset.height);
  }, [clipId, clips, assets, settings.width, settings.height]);

  const handleScaleXChange = (value: number) => {
    if (scaleLinked) {
      const ratio = value / transform.scaleX;
      onTransformChange("scaleX", value);
      onTransformChange("scaleY", transform.scaleY * ratio);
    } else {
      onTransformChange("scaleX", value);
    }
  };

  const handleScaleYChange = (value: number) => {
    if (scaleLinked) {
      const ratio = value / transform.scaleY;
      onTransformChange("scaleY", value);
      onTransformChange("scaleX", transform.scaleX * ratio);
    } else {
      onTransformChange("scaleY", value);
    }
  };

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

      <LinkablePropertySection title="Scale" linked={scaleLinked} onLinkedChange={setScaleLinked}>
        <PropertyRow label="X">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="scaleX"
            baseValue={transform.scaleX}
            onChange={handleScaleXChange}
            onReset={() => {
              onTransformChange("scaleX", fitScale);
              if (scaleLinked) onTransformChange("scaleY", fitScale);
            }}
            suffix="%"
            precision={0}
            step={0.01}
            min={0.01}
            max={5}
            displayMultiplier={100}
            defaultValue={fitScale}
          />
        </PropertyRow>
        <PropertyRow label="Y">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="scaleY"
            baseValue={transform.scaleY}
            onChange={handleScaleYChange}
            onReset={() => {
              onTransformChange("scaleY", fitScale);
              if (scaleLinked) onTransformChange("scaleX", fitScale);
            }}
            suffix="%"
            precision={0}
            step={0.01}
            min={0.01}
            max={5}
            displayMultiplier={100}
            defaultValue={fitScale}
          />
        </PropertyRow>
      </LinkablePropertySection>

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
      )}
    </div>
  );
}
