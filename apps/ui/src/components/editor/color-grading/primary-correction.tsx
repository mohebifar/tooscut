import type { PrimaryCorrection } from "@tooscut/render-engine";

import { KeyframeInput } from "../keyframe-input";
import { PropertySection, PropertyRow } from "../property-shared";

interface PrimaryCorrectionPropertiesProps {
  clipId: string;
  clipStartTime: number;
  correction: PrimaryCorrection;
  onCorrectionChange: (
    key: keyof PrimaryCorrection,
    value: number | [number, number, number],
  ) => void;
}

/**
 * Primary color correction controls (CDL-based).
 *
 * Includes:
 * - Exposure (EV stops)
 * - Temperature (warm/cool)
 * - Tint (green/magenta)
 * - Saturation
 * - Highlights/Shadows recovery
 * - Advanced CDL (Slope/Offset/Power per channel)
 */
export function PrimaryCorrectionProperties({
  clipId,
  clipStartTime,
  correction,
  onCorrectionChange,
}: PrimaryCorrectionPropertiesProps) {
  return (
    <div className="space-y-4">
      {/* Basic Adjustments */}
      <PropertySection title="Basic">
        <PropertyRow label="Exposure">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="cgExposure"
            baseValue={correction.exposure}
            onChange={(v) => onCorrectionChange("exposure", v)}
            suffix=" EV"
            precision={2}
            step={0.1}
            min={-4}
            max={4}
            defaultValue={0}
          />
        </PropertyRow>
        <PropertyRow label="Temperature">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="cgTemperature"
            baseValue={correction.temperature}
            onChange={(v) => onCorrectionChange("temperature", v)}
            suffix=" K"
            precision={0}
            step={100}
            min={-5000}
            max={5000}
            defaultValue={0}
          />
        </PropertyRow>
        <PropertyRow label="Tint">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="cgTint"
            baseValue={correction.tint}
            onChange={(v) => onCorrectionChange("tint", v)}
            precision={0}
            step={1}
            min={-100}
            max={100}
            defaultValue={0}
          />
        </PropertyRow>
        <PropertyRow label="Saturation">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="cgSaturation"
            baseValue={correction.saturation}
            onChange={(v) => onCorrectionChange("saturation", v)}
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

      {/* Tone */}
      <PropertySection title="Tone">
        <PropertyRow label="Highlights">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="cgHighlights"
            baseValue={correction.highlights}
            onChange={(v) => onCorrectionChange("highlights", v)}
            precision={0}
            step={0.01}
            min={-1}
            max={1}
            displayMultiplier={100}
            defaultValue={0}
          />
        </PropertyRow>
        <PropertyRow label="Shadows">
          <KeyframeInput
            clipId={clipId}
            clipStartTime={clipStartTime}
            property="cgShadows"
            baseValue={correction.shadows}
            onChange={(v) => onCorrectionChange("shadows", v)}
            precision={0}
            step={0.01}
            min={-1}
            max={1}
            displayMultiplier={100}
            defaultValue={0}
          />
        </PropertyRow>
      </PropertySection>

      {/* CDL Advanced (collapsed by default in future) */}
      <CdlAdvancedSection
        clipId={clipId}
        clipStartTime={clipStartTime}
        correction={correction}
        onCorrectionChange={onCorrectionChange}
      />
    </div>
  );
}

interface CdlAdvancedSectionProps {
  clipId: string;
  clipStartTime: number;
  correction: PrimaryCorrection;
  onCorrectionChange: (
    key: keyof PrimaryCorrection,
    value: number | [number, number, number],
  ) => void;
}

/**
 * Advanced CDL controls (Slope, Offset, Power per channel).
 * These map directly to the ASC-CDL standard.
 */
function CdlAdvancedSection({
  clipId,
  clipStartTime,
  correction,
  onCorrectionChange,
}: CdlAdvancedSectionProps) {
  // Helper to update a single channel of a 3-element array
  const updateChannel = (key: "slope" | "offset" | "power", channel: 0 | 1 | 2, value: number) => {
    const current = [...correction[key]] as [number, number, number];
    current[channel] = value;
    onCorrectionChange(key, current);
  };

  const channelLabels = ["R", "G", "B"] as const;

  return (
    <PropertySection title="CDL (Advanced)">
      {/* Slope (Gain) */}
      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">Slope (Gain)</span>
        <div className="grid grid-cols-3 gap-2">
          {channelLabels.map((label, i) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-center text-[10px] text-muted-foreground">{label}</span>
              <KeyframeInput
                clipId={clipId}
                clipStartTime={clipStartTime}
                property={`cgSlope${label}` as "cgSlopeR" | "cgSlopeG" | "cgSlopeB"}
                baseValue={correction.slope[i]}
                onChange={(v) => updateChannel("slope", i as 0 | 1 | 2, v)}
                precision={2}
                step={0.01}
                min={0}
                max={4}
                defaultValue={1}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Offset (Lift) */}
      <div className="mt-2 space-y-1">
        <span className="text-xs text-muted-foreground">Offset (Lift)</span>
        <div className="grid grid-cols-3 gap-2">
          {channelLabels.map((label, i) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-center text-[10px] text-muted-foreground">{label}</span>
              <KeyframeInput
                clipId={clipId}
                clipStartTime={clipStartTime}
                property={`cgOffset${label}` as "cgOffsetR" | "cgOffsetG" | "cgOffsetB"}
                baseValue={correction.offset[i]}
                onChange={(v) => updateChannel("offset", i as 0 | 1 | 2, v)}
                precision={3}
                step={0.001}
                min={-1}
                max={1}
                defaultValue={0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Power (Gamma) */}
      <div className="mt-2 space-y-1">
        <span className="text-xs text-muted-foreground">Power (Gamma)</span>
        <div className="grid grid-cols-3 gap-2">
          {channelLabels.map((label, i) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-center text-[10px] text-muted-foreground">{label}</span>
              <KeyframeInput
                clipId={clipId}
                clipStartTime={clipStartTime}
                property={`cgPower${label}` as "cgPowerR" | "cgPowerG" | "cgPowerB"}
                baseValue={correction.power[i]}
                onChange={(v) => updateChannel("power", i as 0 | 1 | 2, v)}
                precision={2}
                step={0.01}
                min={0.1}
                max={4}
                defaultValue={1}
              />
            </div>
          ))}
        </div>
      </div>
    </PropertySection>
  );
}
