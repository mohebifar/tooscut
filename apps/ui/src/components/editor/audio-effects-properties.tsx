import type { AudioEffectsParams } from "@tooscut/render-engine";

import { useCallback } from "react";

import { Button } from "../ui/button";
import { NumericInput } from "../ui/numeric-input";
import { EqVisualizer } from "./eq-visualizer";
import { KeyframeInput } from "./keyframe-input";
import { PropertyRow } from "./property-shared";

interface AudioEffectsPropertiesProps {
  clipId: string;
  clipStartTime: number;
  audioEffects?: AudioEffectsParams;
  onToggleEffect: (effectType: keyof AudioEffectsParams, enabled: boolean) => void;
  onUpdateEffect: (effectType: keyof AudioEffectsParams, params: Record<string, number>) => void;
}

function EffectToggle({
  label,
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        className="h-5 px-2 text-[10px]"
        onClick={() => onToggle(!enabled)}
      >
        {enabled ? "On" : "Off"}
      </Button>
    </div>
  );
}

export function AudioEffectsProperties({
  clipId,
  clipStartTime,
  audioEffects,
  onToggleEffect,
  onUpdateEffect,
}: AudioEffectsPropertiesProps) {
  const eqEnabled = audioEffects?.eq != null;
  const compEnabled = audioEffects?.compressor != null;
  const gateEnabled = audioEffects?.noiseGate != null;
  const reverbEnabled = audioEffects?.reverb != null;

  const handleEqChange = useCallback(
    (key: string, value: number) => onUpdateEffect("eq", { [key]: value }),
    [onUpdateEffect],
  );

  const handleCompChange = useCallback(
    (key: string, value: number) => onUpdateEffect("compressor", { [key]: value }),
    [onUpdateEffect],
  );

  const handleGateChange = useCallback(
    (key: string, value: number) => onUpdateEffect("noiseGate", { [key]: value }),
    [onUpdateEffect],
  );

  const handleReverbChange = useCallback(
    (key: string, value: number) => onUpdateEffect("reverb", { [key]: value }),
    [onUpdateEffect],
  );

  return (
    <div className="space-y-4">
      {/* EQ */}
      <div className="space-y-2">
        <EffectToggle
          label="Equalizer"
          enabled={eqEnabled}
          onToggle={(v) => onToggleEffect("eq", v)}
        />
        {eqEnabled && (
          <EqVisualizer
            lowGain={audioEffects?.eq?.lowGain ?? 0}
            midGain={audioEffects?.eq?.midGain ?? 0}
            highGain={audioEffects?.eq?.highGain ?? 0}
            lowFreq={audioEffects?.eq?.lowFreq ?? 200}
            midFreq={audioEffects?.eq?.midFreq ?? 1000}
            highFreq={audioEffects?.eq?.highFreq ?? 5000}
            onGainChange={(band, value) => handleEqChange(band, value)}
            onFreqChange={(band, value) => handleEqChange(band, value)}
          />
        )}
      </div>

      {/* Compressor */}
      <div className="space-y-2">
        <EffectToggle
          label="Compressor"
          enabled={compEnabled}
          onToggle={(v) => onToggleEffect("compressor", v)}
        />
        {compEnabled && (
          <div className="space-y-2">
            <PropertyRow label="Threshold">
              <KeyframeInput
                clipId={clipId}
                clipStartTime={clipStartTime}
                property="compressorThreshold"
                baseValue={audioEffects?.compressor?.threshold ?? -20}
                onChange={(v) => handleCompChange("threshold", v)}
                suffix="dB"
                precision={1}
                step={1}
                min={-60}
                max={0}
                defaultValue={-20}
              />
            </PropertyRow>
            <PropertyRow
              label="Ratio"
              isDirty={Math.abs((audioEffects?.compressor?.ratio ?? 4) - 4) > 1e-6}
              onReset={() => handleCompChange("ratio", 4)}
            >
              <NumericInput
                value={audioEffects?.compressor?.ratio ?? 4}
                onChange={(v) => handleCompChange("ratio", v)}
                suffix=":1"
                precision={1}
                step={0.5}
                min={1}
                max={20}
              />
            </PropertyRow>
            <PropertyRow
              label="Attack"
              isDirty={Math.abs((audioEffects?.compressor?.attack ?? 10) - 10) > 1e-6}
              onReset={() => handleCompChange("attack", 10)}
            >
              <NumericInput
                value={audioEffects?.compressor?.attack ?? 10}
                onChange={(v) => handleCompChange("attack", v)}
                suffix="ms"
                precision={1}
                step={1}
                min={0.1}
                max={200}
              />
            </PropertyRow>
            <PropertyRow
              label="Release"
              isDirty={Math.abs((audioEffects?.compressor?.release ?? 100) - 100) > 1e-6}
              onReset={() => handleCompChange("release", 100)}
            >
              <NumericInput
                value={audioEffects?.compressor?.release ?? 100}
                onChange={(v) => handleCompChange("release", v)}
                suffix="ms"
                precision={0}
                step={10}
                min={10}
                max={2000}
              />
            </PropertyRow>
            <PropertyRow
              label="Makeup"
              isDirty={Math.abs((audioEffects?.compressor?.makeupGain ?? 0) - 0) > 1e-6}
              onReset={() => handleCompChange("makeupGain", 0)}
            >
              <NumericInput
                value={audioEffects?.compressor?.makeupGain ?? 0}
                onChange={(v) => handleCompChange("makeupGain", v)}
                suffix="dB"
                precision={1}
                step={0.5}
                min={0}
                max={24}
              />
            </PropertyRow>
          </div>
        )}
      </div>

      {/* Noise Gate */}
      <div className="space-y-2">
        <EffectToggle
          label="Noise Gate"
          enabled={gateEnabled}
          onToggle={(v) => onToggleEffect("noiseGate", v)}
        />
        {gateEnabled && (
          <div className="space-y-2">
            <PropertyRow label="Threshold">
              <KeyframeInput
                clipId={clipId}
                clipStartTime={clipStartTime}
                property="noiseGateThreshold"
                baseValue={audioEffects?.noiseGate?.threshold ?? -40}
                onChange={(v) => handleGateChange("threshold", v)}
                suffix="dB"
                precision={1}
                step={1}
                min={-80}
                max={0}
                defaultValue={-40}
              />
            </PropertyRow>
            <PropertyRow
              label="Attack"
              isDirty={Math.abs((audioEffects?.noiseGate?.attack ?? 1) - 1) > 1e-6}
              onReset={() => handleGateChange("attack", 1)}
            >
              <NumericInput
                value={audioEffects?.noiseGate?.attack ?? 1}
                onChange={(v) => handleGateChange("attack", v)}
                suffix="ms"
                precision={1}
                step={0.5}
                min={0.1}
                max={100}
              />
            </PropertyRow>
            <PropertyRow
              label="Release"
              isDirty={Math.abs((audioEffects?.noiseGate?.release ?? 50) - 50) > 1e-6}
              onReset={() => handleGateChange("release", 50)}
            >
              <NumericInput
                value={audioEffects?.noiseGate?.release ?? 50}
                onChange={(v) => handleGateChange("release", v)}
                suffix="ms"
                precision={0}
                step={5}
                min={5}
                max={500}
              />
            </PropertyRow>
          </div>
        )}
      </div>

      {/* Reverb */}
      <div className="space-y-2">
        <EffectToggle
          label="Reverb"
          enabled={reverbEnabled}
          onToggle={(v) => onToggleEffect("reverb", v)}
        />
        {reverbEnabled && (
          <div className="space-y-2">
            <PropertyRow
              label="Room Size"
              isDirty={Math.abs((audioEffects?.reverb?.roomSize ?? 0.5) - 0.5) > 1e-6}
              onReset={() => handleReverbChange("roomSize", 0.5)}
            >
              <NumericInput
                value={audioEffects?.reverb?.roomSize ?? 0.5}
                onChange={(v) => handleReverbChange("roomSize", v)}
                precision={2}
                step={0.05}
                min={0}
                max={1}
              />
            </PropertyRow>
            <PropertyRow
              label="Damping"
              isDirty={Math.abs((audioEffects?.reverb?.damping ?? 0.5) - 0.5) > 1e-6}
              onReset={() => handleReverbChange("damping", 0.5)}
            >
              <NumericInput
                value={audioEffects?.reverb?.damping ?? 0.5}
                onChange={(v) => handleReverbChange("damping", v)}
                precision={2}
                step={0.05}
                min={0}
                max={1}
              />
            </PropertyRow>
            <PropertyRow
              label="Width"
              isDirty={Math.abs((audioEffects?.reverb?.width ?? 1) - 1) > 1e-6}
              onReset={() => handleReverbChange("width", 1)}
            >
              <NumericInput
                value={audioEffects?.reverb?.width ?? 1}
                onChange={(v) => handleReverbChange("width", v)}
                precision={2}
                step={0.05}
                min={0}
                max={1}
              />
            </PropertyRow>
            <PropertyRow label="Dry/Wet">
              <KeyframeInput
                clipId={clipId}
                clipStartTime={clipStartTime}
                property="reverbDryWet"
                baseValue={audioEffects?.reverb?.dryWet ?? 0.3}
                onChange={(v) => handleReverbChange("dryWet", v)}
                precision={2}
                step={0.05}
                min={0}
                max={1}
                defaultValue={0.3}
              />
            </PropertyRow>
          </div>
        )}
      </div>
    </div>
  );
}
