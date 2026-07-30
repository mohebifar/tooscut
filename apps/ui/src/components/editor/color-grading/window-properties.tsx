/**
 * Power Window node properties editor.
 *
 * The window mask (circle/ellipse, rectangle, gradient) and its shader
 * evaluation already exist in the compositor (see power_window_mask() /
 * apply_window() in crates/compositor/src/pipeline.rs) — this component is
 * the missing piece that lets a user actually create and shape one.
 *
 * Polygon windows are intentionally not exposed here: the shader currently
 * falls back to a fixed default circle for that shape variant, so exposing
 * point-editing UI for it would silently produce the wrong mask.
 */

import type { PowerWindow, PowerWindowShape, PrimaryCorrection } from "@tooscut/render-engine";

import { useCallback } from "react";

import { useVideoEditorStore } from "../../../state/video-editor-store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Toggle } from "../../ui/toggle";
import { PrimaryCorrectionProperties } from "./primary-correction";

// ============================================================================
// Types
// ============================================================================

interface WindowPropertiesProps {
  clipId: string;
  clipStartTime: number;
  window: PowerWindow;
  correction: PrimaryCorrection;
  onWindowChange: (updates: Partial<PowerWindow>) => void;
  onCorrectionChange: (
    key: keyof PrimaryCorrection,
    value: number | [number, number, number],
  ) => void;
}

type EditableShapeKind = "Circle" | "Rectangle" | "Gradient";

const SHAPE_OPTIONS: { value: EditableShapeKind; label: string }[] = [
  { value: "Circle", label: "Ellipse" },
  { value: "Rectangle", label: "Rectangle" },
  { value: "Gradient", label: "Gradient" },
];

function shapeKind(shape: PowerWindowShape): EditableShapeKind {
  if ("Circle" in shape) return "Circle";
  if ("Rectangle" in shape) return "Rectangle";
  if ("Gradient" in shape) return "Gradient";
  // Polygon — not editable here; the shader falls back to a circle for it too.
  return "Circle";
}

function defaultShapeFor(kind: EditableShapeKind): PowerWindowShape {
  switch (kind) {
    case "Circle":
      return { Circle: { radius_x: 0.25, radius_y: 0.25 } };
    case "Rectangle":
      return { Rectangle: { width: 0.4, height: 0.3, corner_radius: 0.02 } };
    case "Gradient":
      return { Gradient: { angle: 0 } };
  }
}

// ============================================================================
// Slider row (pause/resume-aware, matching the rest of color-grading UI)
// ============================================================================

function WindowSliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  const handlePointerDown = useCallback(() => {
    useVideoEditorStore.temporal.getState().pause();
  }, []);
  const handleValueCommit = useCallback(() => {
    useVideoEditorStore.temporal.getState().resume();
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[11px] text-muted-foreground">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        onPointerDown={handlePointerDown}
        onValueCommit={handleValueCommit}
        className="flex-1"
      />
      <span className="w-12 text-right text-[11px] text-muted-foreground tabular-nums">
        {format ? format(value) : value.toFixed(2)}
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function WindowProperties({
  clipId,
  clipStartTime,
  window,
  correction,
  onWindowChange,
  onCorrectionChange,
}: WindowPropertiesProps) {
  const kind = shapeKind(window.shape);

  const handleShapeKindChange = useCallback(
    (nextKind: string | null) => {
      if (!nextKind) return;
      onWindowChange({ shape: defaultShapeFor(nextKind as EditableShapeKind) });
    },
    [onWindowChange],
  );

  const updateShapeField = useCallback(
    (field: string, value: number) => {
      if ("Circle" in window.shape) {
        onWindowChange({ shape: { Circle: { ...window.shape.Circle, [field]: value } } });
      } else if ("Rectangle" in window.shape) {
        onWindowChange({ shape: { Rectangle: { ...window.shape.Rectangle, [field]: value } } });
      } else if ("Gradient" in window.shape) {
        onWindowChange({ shape: { Gradient: { ...window.shape.Gradient, [field]: value } } });
      }
    },
    [window.shape, onWindowChange],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">Shape</h4>
        <Select value={kind} onValueChange={handleShapeKindChange} items={SHAPE_OPTIONS}>
          <SelectTrigger size="sm" className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHAPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {kind === "Circle" && "Circle" in window.shape && (
          <div className="space-y-1.5">
            <WindowSliderRow
              label="Radius X"
              value={window.shape.Circle.radius_x}
              min={0.01}
              max={1}
              step={0.01}
              onChange={(v) => updateShapeField("radius_x", v)}
            />
            <WindowSliderRow
              label="Radius Y"
              value={window.shape.Circle.radius_y}
              min={0.01}
              max={1}
              step={0.01}
              onChange={(v) => updateShapeField("radius_y", v)}
            />
          </div>
        )}

        {kind === "Rectangle" && "Rectangle" in window.shape && (
          <div className="space-y-1.5">
            <WindowSliderRow
              label="Width"
              value={window.shape.Rectangle.width}
              min={0.01}
              max={2}
              step={0.01}
              onChange={(v) => updateShapeField("width", v)}
            />
            <WindowSliderRow
              label="Height"
              value={window.shape.Rectangle.height}
              min={0.01}
              max={2}
              step={0.01}
              onChange={(v) => updateShapeField("height", v)}
            />
            <WindowSliderRow
              label="Corner Radius"
              value={window.shape.Rectangle.corner_radius}
              min={0}
              max={0.5}
              step={0.005}
              onChange={(v) => updateShapeField("corner_radius", v)}
            />
          </div>
        )}

        {kind === "Gradient" && "Gradient" in window.shape && (
          <WindowSliderRow
            label="Angle"
            value={window.shape.Gradient.angle}
            min={0}
            max={360}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(v) => updateShapeField("angle", v)}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">Position &amp; Size</h4>
        <WindowSliderRow
          label="Center X"
          value={window.center_x}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onWindowChange({ center_x: v })}
        />
        <WindowSliderRow
          label="Center Y"
          value={window.center_y}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onWindowChange({ center_y: v })}
        />
        <WindowSliderRow
          label="Scale X"
          value={window.scale_x}
          min={0.05}
          max={4}
          step={0.01}
          onChange={(v) => onWindowChange({ scale_x: v })}
        />
        <WindowSliderRow
          label="Scale Y"
          value={window.scale_y}
          min={0.05}
          max={4}
          step={0.01}
          onChange={(v) => onWindowChange({ scale_y: v })}
        />
        <WindowSliderRow
          label="Rotation"
          value={window.rotation}
          min={0}
          max={360}
          step={1}
          format={(v) => `${Math.round(v)}°`}
          onChange={(v) => onWindowChange({ rotation: v })}
        />
      </div>

      <div className="space-y-1.5">
        <h4 className="text-xs font-medium text-muted-foreground">Edge Softness</h4>
        <WindowSliderRow
          label="Inner"
          value={window.softness_inner}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onWindowChange({ softness_inner: v })}
        />
        <WindowSliderRow
          label="Outer"
          value={window.softness_outer}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onWindowChange({ softness_outer: v })}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Invert</span>
        <Toggle
          size="sm"
          pressed={window.invert}
          onPressedChange={(pressed) => onWindowChange({ invert: pressed })}
          className="h-6 px-2 text-[11px] data-[state=on]:bg-pink-500/20 data-[state=on]:text-pink-400"
        >
          {window.invert ? "On" : "Off"}
        </Toggle>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground">
          Correction (applied inside the window)
        </h4>
        <PrimaryCorrectionProperties
          clipId={clipId}
          clipStartTime={clipStartTime}
          correction={correction}
          onCorrectionChange={onCorrectionChange}
        />
      </div>
    </div>
  );
}
