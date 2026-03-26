import type { Effects, ShapeStyle, ShapeBox } from "@tooscut/render-engine";

import type { ShapeClip } from "../../state/video-editor-store";

import { ColorInput } from "../ui/color-input";
import { NumericInput } from "../ui/numeric-input";
import { KeyframeInput } from "./keyframe-input";
import { PropertySection, PropertyRow } from "./property-shared";

interface ShapePropertiesProps {
  clip: ShapeClip;
  onUpdateStyle: (clipId: string, style: Partial<ShapeStyle>) => void;
  onUpdateBox: (clipId: string, box: Partial<ShapeBox>) => void;
  onUpdateEffects: (clipId: string, effects: Partial<Effects>) => void;
}

export function ShapeProperties({
  clip,
  onUpdateStyle,
  onUpdateBox,
  onUpdateEffects,
}: ShapePropertiesProps) {
  const { shapeStyle: style, shapeBox: box } = clip;
  const opacity = clip.effects?.opacity ?? 1;

  return (
    <div className="space-y-4">
      <PropertySection title="Fill">
        <PropertyRow label="Color">
          <ColorInput
            value={style.fill}
            onChange={(color) => onUpdateStyle(clip.id, { fill: color })}
            showAlpha
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Stroke">
        <PropertyRow label="Color">
          <ColorInput
            value={style.stroke ?? [1, 1, 1, 1]}
            onChange={(color) => onUpdateStyle(clip.id, { stroke: color })}
            showAlpha
          />
        </PropertyRow>
        <PropertyRow label="Width">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="strokeWidth"
            baseValue={style.stroke_width}
            onChange={(v) => onUpdateStyle(clip.id, { stroke_width: v })}
            suffix="px"
            precision={0}
            step={1}
            min={0}
            max={100}
            defaultValue={0}
          />
        </PropertyRow>
      </PropertySection>

      {clip.shape === "Rectangle" && (
        <PropertySection title="Corner Radius">
          <PropertyRow label="Radius">
            <KeyframeInput
              clipId={clip.id}
              clipStartTime={clip.startTime}
              property="cornerRadius"
              baseValue={style.corner_radius}
              onChange={(v) => onUpdateStyle(clip.id, { corner_radius: v })}
              suffix="px"
              precision={0}
              step={1}
              min={0}
              defaultValue={0}
            />
          </PropertyRow>
        </PropertySection>
      )}

      {clip.shape === "Polygon" && (
        <PropertySection title="Polygon">
          <PropertyRow label="Sides">
            <NumericInput
              value={style.sides ?? 6}
              onChange={(v) => onUpdateStyle(clip.id, { sides: Math.round(v) })}
              precision={0}
              step={1}
              min={3}
              max={32}
            />
          </PropertyRow>
        </PropertySection>
      )}

      <PropertySection title="Position & Size">
        <PropertyRow label="X">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="x"
            baseValue={box.x}
            onChange={(v) => onUpdateBox(clip.id, { x: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={0}
            max={100}
            defaultValue={25}
          />
        </PropertyRow>
        <PropertyRow label="Y">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="y"
            baseValue={box.y}
            onChange={(v) => onUpdateBox(clip.id, { y: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={0}
            max={100}
            defaultValue={25}
          />
        </PropertyRow>
        <PropertyRow label="Width">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="width"
            baseValue={box.width}
            onChange={(v) => onUpdateBox(clip.id, { width: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={1}
            max={100}
            defaultValue={50}
          />
        </PropertyRow>
        <PropertyRow label="Height">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="height"
            baseValue={box.height}
            onChange={(v) => onUpdateBox(clip.id, { height: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={1}
            max={100}
            defaultValue={50}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Opacity">
        <PropertyRow label="Opacity">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="opacity"
            baseValue={opacity}
            onChange={(v) => onUpdateEffects(clip.id, { opacity: v })}
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
    </div>
  );
}
