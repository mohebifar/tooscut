/**
 * HSL Qualifier node properties editor.
 *
 * Provides controls for:
 * - Hue selection (center, width, softness)
 * - Saturation selection (center, width, softness)
 * - Luminance selection (center, width, softness)
 * - Invert toggle
 * - Correction to apply within the qualified region (reuses PrimaryCorrectionProperties)
 */

import type { HslQualifier, PrimaryCorrection } from "@tooscut/render-engine";

import { useCallback, useMemo } from "react";

import { useVideoEditorStore } from "../../../state/video-editor-store";
import { Slider } from "../../ui/slider";
import { Toggle } from "../../ui/toggle";
import { PrimaryCorrectionProperties } from "./primary-correction";

// ============================================================================
// Types
// ============================================================================

interface QualifierPropertiesProps {
  clipId: string;
  clipStartTime: number;
  qualifier: HslQualifier;
  correction: PrimaryCorrection;
  onQualifierChange: (key: keyof HslQualifier, value: number | boolean) => void;
  onCorrectionChange: (
    key: keyof PrimaryCorrection,
    value: number | [number, number, number],
  ) => void;
}

// ============================================================================
// Hue Bar Visual
// ============================================================================

/**
 * A horizontal bar showing the hue spectrum with an indicator for the current
 * center position and width range.
 */
function HueBar({ center, width, softness }: { center: number; width: number; softness: number }) {
  // Compute the normalized position (0-1) of center on the bar
  const centerNorm = center / 360;
  // Width as fraction of the full 360 range
  const widthNorm = width / 360;
  const softnessNorm = (softness * width) / 360;

  return (
    <div className="relative mb-2 h-4 overflow-hidden rounded">
      {/* Hue spectrum background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
        }}
      />
      {/* Dark overlay outside the selected range */}
      <div className="absolute inset-0 bg-black/60" />
      {/* Selected range highlight */}
      <div
        className="absolute inset-y-0 rounded"
        style={{
          left: `${((centerNorm - widthNorm / 2 - softnessNorm + 1) % 1) * 100}%`,
          width: `${(widthNorm + softnessNorm * 2) * 100}%`,
          background: "linear-gradient(to right, transparent, white 15%, white 85%, transparent)",
          opacity: 0.3,
        }}
      />
      {/* Center marker */}
      <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${centerNorm * 100}%` }} />
    </div>
  );
}

// ============================================================================
// Qualifier Dimension Section
// ============================================================================

interface QualifierDimensionProps {
  label: string;
  centerValue: number;
  widthValue: number;
  softnessValue: number;
  centerMin: number;
  centerMax: number;
  centerStep: number;
  widthMin: number;
  widthMax: number;
  widthStep: number;
  onCenterChange: (value: number) => void;
  onWidthChange: (value: number) => void;
  onSoftnessChange: (value: number) => void;
  /** Optional visual element to render above the sliders */
  visual?: React.ReactNode;
  /** Format function for displaying center value */
  formatCenter?: (value: number) => string;
  /** Format function for displaying width value */
  formatWidth?: (value: number) => string;
}

function QualifierDimension({
  label,
  centerValue,
  widthValue,
  softnessValue,
  centerMin,
  centerMax,
  centerStep,
  widthMin,
  widthMax,
  widthStep,
  onCenterChange,
  onWidthChange,
  onSoftnessChange,
  visual,
  formatCenter,
  formatWidth,
}: QualifierDimensionProps) {
  const handlePointerDown = useCallback(() => {
    useVideoEditorStore.temporal.getState().pause();
  }, []);

  const handleValueCommit = useCallback(() => {
    useVideoEditorStore.temporal.getState().resume();
  }, []);

  const centerDisplay = formatCenter ? formatCenter(centerValue) : centerValue.toFixed(2);
  const widthDisplay = formatWidth ? formatWidth(widthValue) : widthValue.toFixed(2);
  const softnessDisplay = softnessValue.toFixed(2);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      {visual}
      <div className="space-y-1.5">
        {/* Center */}
        <div className="flex items-center gap-2">
          <span className="w-14 text-[11px] text-muted-foreground">Center</span>
          <Slider
            min={centerMin}
            max={centerMax}
            step={centerStep}
            value={[centerValue]}
            onValueChange={([v]) => onCenterChange(v)}
            onPointerDown={handlePointerDown}
            onValueCommit={handleValueCommit}
            className="flex-1"
          />
          <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">
            {centerDisplay}
          </span>
        </div>
        {/* Width */}
        <div className="flex items-center gap-2">
          <span className="w-14 text-[11px] text-muted-foreground">Width</span>
          <Slider
            min={widthMin}
            max={widthMax}
            step={widthStep}
            value={[widthValue]}
            onValueChange={([v]) => onWidthChange(v)}
            onPointerDown={handlePointerDown}
            onValueCommit={handleValueCommit}
            className="flex-1"
          />
          <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">
            {widthDisplay}
          </span>
        </div>
        {/* Softness */}
        <div className="flex items-center gap-2">
          <span className="w-14 text-[11px] text-muted-foreground">Softness</span>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[softnessValue]}
            onValueChange={([v]) => onSoftnessChange(v)}
            onPointerDown={handlePointerDown}
            onValueCommit={handleValueCommit}
            className="flex-1"
          />
          <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">
            {softnessDisplay}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function QualifierProperties({
  clipId,
  clipStartTime,
  qualifier,
  correction,
  onQualifierChange,
  onCorrectionChange,
}: QualifierPropertiesProps) {
  const hueVisual = useMemo(
    () => (
      <HueBar
        center={qualifier.hue_center}
        width={qualifier.hue_width}
        softness={qualifier.hue_softness}
      />
    ),
    [qualifier.hue_center, qualifier.hue_width, qualifier.hue_softness],
  );

  return (
    <div className="space-y-4">
      {/* Qualifier Controls */}
      <div className="space-y-4">
        {/* Hue */}
        <QualifierDimension
          label="Hue"
          centerValue={qualifier.hue_center}
          widthValue={qualifier.hue_width}
          softnessValue={qualifier.hue_softness}
          centerMin={0}
          centerMax={360}
          centerStep={1}
          widthMin={0}
          widthMax={180}
          widthStep={1}
          onCenterChange={(v) => onQualifierChange("hue_center", v)}
          onWidthChange={(v) => onQualifierChange("hue_width", v)}
          onSoftnessChange={(v) => onQualifierChange("hue_softness", v)}
          visual={hueVisual}
          formatCenter={(v) => `${Math.round(v)}\u00B0`}
          formatWidth={(v) => `${Math.round(v)}\u00B0`}
        />

        {/* Saturation */}
        <QualifierDimension
          label="Saturation"
          centerValue={qualifier.saturation_center}
          widthValue={qualifier.saturation_width}
          softnessValue={qualifier.saturation_softness}
          centerMin={0}
          centerMax={1}
          centerStep={0.01}
          widthMin={0}
          widthMax={1}
          widthStep={0.01}
          onCenterChange={(v) => onQualifierChange("saturation_center", v)}
          onWidthChange={(v) => onQualifierChange("saturation_width", v)}
          onSoftnessChange={(v) => onQualifierChange("saturation_softness", v)}
        />

        {/* Luminance */}
        <QualifierDimension
          label="Luminance"
          centerValue={qualifier.luminance_center}
          widthValue={qualifier.luminance_width}
          softnessValue={qualifier.luminance_softness}
          centerMin={0}
          centerMax={1}
          centerStep={0.01}
          widthMin={0}
          widthMax={1}
          widthStep={0.01}
          onCenterChange={(v) => onQualifierChange("luminance_center", v)}
          onWidthChange={(v) => onQualifierChange("luminance_width", v)}
          onSoftnessChange={(v) => onQualifierChange("luminance_softness", v)}
        />

        {/* Invert toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Invert Selection</span>
          <Toggle
            size="sm"
            pressed={qualifier.invert}
            onPressedChange={(pressed) => onQualifierChange("invert", pressed)}
            className="h-6 px-2 text-[11px] data-[state=on]:bg-pink-500/20 data-[state=on]:text-pink-400"
          >
            {qualifier.invert ? "On" : "Off"}
          </Toggle>
        </div>
      </div>

      {/* Correction applied to qualified region */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground">
          Correction (applied to selected region)
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
