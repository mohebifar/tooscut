import type {
  Effects,
  LineStyle,
  LineBox,
  LineHeadType,
  LineStrokeStyle,
} from "@tooscut/render-engine";

import type { LineClip } from "../../state/video-editor-store";

import { ColorInput } from "../ui/color-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { KeyframeInput } from "./keyframe-input";
import { PropertySection, PropertyRow } from "./property-shared";

interface LinePropertiesProps {
  clip: LineClip;
  onUpdateStyle: (clipId: string, style: Partial<LineStyle>) => void;
  onUpdateBox: (clipId: string, box: Partial<LineBox>) => void;
  onUpdateEffects: (clipId: string, effects: Partial<Effects>) => void;
}

export function LineProperties({
  clip,
  onUpdateStyle,
  onUpdateBox,
  onUpdateEffects,
}: LinePropertiesProps) {
  const { lineStyle: style, lineBox: box } = clip;
  const opacity = clip.effects?.opacity ?? 1;

  return (
    <div className="space-y-4">
      <PropertySection title="Stroke">
        <PropertyRow label="Color">
          <ColorInput
            value={style.stroke}
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
            precision={1}
            step={0.5}
            min={0.5}
            max={100}
            defaultValue={2}
          />
        </PropertyRow>
        <PropertyRow label="Style">
          <Select
            value={style.stroke_style}
            onValueChange={(v) => onUpdateStyle(clip.id, { stroke_style: v as LineStrokeStyle })}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Solid">Solid</SelectItem>
              <SelectItem value="Dashed">Dashed</SelectItem>
              <SelectItem value="Dotted">Dotted</SelectItem>
            </SelectContent>
          </Select>
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Endpoints">
        <PropertyRow label="Start">
          <Select
            value={style.start_head.type}
            onValueChange={(v) =>
              onUpdateStyle(clip.id, {
                start_head: { ...style.start_head, type: v as LineHeadType },
              })
            }
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None">None</SelectItem>
              <SelectItem value="Arrow">Arrow</SelectItem>
              <SelectItem value="Circle">Circle</SelectItem>
              <SelectItem value="Square">Square</SelectItem>
              <SelectItem value="Diamond">Diamond</SelectItem>
            </SelectContent>
          </Select>
        </PropertyRow>
        <PropertyRow label="End">
          <Select
            value={style.end_head.type}
            onValueChange={(v) =>
              onUpdateStyle(clip.id, {
                end_head: { ...style.end_head, type: v as LineHeadType },
              })
            }
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None">None</SelectItem>
              <SelectItem value="Arrow">Arrow</SelectItem>
              <SelectItem value="Circle">Circle</SelectItem>
              <SelectItem value="Square">Square</SelectItem>
              <SelectItem value="Diamond">Diamond</SelectItem>
            </SelectContent>
          </Select>
        </PropertyRow>
        <PropertyRow label="Head Size">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="strokeWidth"
            baseValue={style.end_head.size}
            onChange={(v) =>
              onUpdateStyle(clip.id, {
                start_head: { ...style.start_head, size: v },
                end_head: { ...style.end_head, size: v },
              })
            }
            suffix="px"
            precision={0}
            step={1}
            min={1}
            max={100}
            defaultValue={10}
            showKeyframeButton={false}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Position">
        <PropertyRow label="X1">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="x1"
            baseValue={box.x1}
            onChange={(v) => onUpdateBox(clip.id, { x1: v })}
            suffix="%"
            precision={1}
            step={0.5}
            defaultValue={25}
          />
        </PropertyRow>
        <PropertyRow label="Y1">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="y1"
            baseValue={box.y1}
            onChange={(v) => onUpdateBox(clip.id, { y1: v })}
            suffix="%"
            precision={1}
            step={0.5}
            defaultValue={50}
          />
        </PropertyRow>
        <PropertyRow label="X2">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="x2"
            baseValue={box.x2}
            onChange={(v) => onUpdateBox(clip.id, { x2: v })}
            suffix="%"
            precision={1}
            step={0.5}
            defaultValue={75}
          />
        </PropertyRow>
        <PropertyRow label="Y2">
          <KeyframeInput
            clipId={clip.id}
            clipStartTime={clip.startTime}
            property="y2"
            baseValue={box.y2}
            onChange={(v) => onUpdateBox(clip.id, { y2: v })}
            suffix="%"
            precision={1}
            step={0.5}
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
