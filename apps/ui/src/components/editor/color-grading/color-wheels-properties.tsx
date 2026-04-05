import type { ColorWheels, ColorWheelValue } from "@tooscut/render-engine";

import { RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";

import { Button } from "../../ui/button";
import { ResetButton } from "../../ui/reset-button";
import { ColorWheel } from "./color-wheel";

interface ColorWheelsPropertiesProps {
  clipId: string;
  clipStartTime: number;
  wheels: ColorWheels;
  onWheelsChange: (wheels: Partial<ColorWheels>) => void;
}

const DEFAULT_WHEEL: ColorWheelValue = { angle: 0, distance: 0 };

/**
 * Color Wheels panel with Lift/Gamma/Gain controls.
 *
 * - Lift: Affects shadows (dark areas)
 * - Gamma: Affects midtones
 * - Gain: Affects highlights (bright areas)
 *
 * Each wheel has:
 * - Angle (color direction in degrees)
 * - Distance from center (color intensity)
 * - Luminance slider (brightness adjustment)
 */
function isWheelDirty(wheel: ColorWheelValue, luminance: number): boolean {
  return wheel.distance > 0.001 || Math.abs(luminance) > 0.001;
}

export function ColorWheelsProperties({ wheels, onWheelsChange }: ColorWheelsPropertiesProps) {
  // Handlers for lift wheel
  const handleLiftColorChange = useCallback(
    (angle: number, distance: number) => {
      onWheelsChange({ lift: { angle, distance } });
    },
    [onWheelsChange],
  );

  const handleLiftLuminanceChange = useCallback(
    (luminance: number) => {
      onWheelsChange({ lift_luminance: luminance });
    },
    [onWheelsChange],
  );

  // Handlers for gamma wheel
  const handleGammaColorChange = useCallback(
    (angle: number, distance: number) => {
      onWheelsChange({ gamma: { angle, distance } });
    },
    [onWheelsChange],
  );

  const handleGammaLuminanceChange = useCallback(
    (luminance: number) => {
      onWheelsChange({ gamma_luminance: luminance });
    },
    [onWheelsChange],
  );

  // Handlers for gain wheel
  const handleGainColorChange = useCallback(
    (angle: number, distance: number) => {
      onWheelsChange({ gain: { angle, distance } });
    },
    [onWheelsChange],
  );

  const handleGainLuminanceChange = useCallback(
    (luminance: number) => {
      onWheelsChange({ gain_luminance: luminance });
    },
    [onWheelsChange],
  );

  // Reset all wheels
  const handleResetAll = useCallback(() => {
    onWheelsChange({
      lift: DEFAULT_WHEEL,
      gamma: DEFAULT_WHEEL,
      gain: DEFAULT_WHEEL,
      lift_luminance: 0,
      gamma_luminance: 0,
      gain_luminance: 0,
    });
  }, [onWheelsChange]);

  // Reset individual wheel
  const handleResetLift = useCallback(() => {
    onWheelsChange({ lift: DEFAULT_WHEEL, lift_luminance: 0 });
  }, [onWheelsChange]);

  const handleResetGamma = useCallback(() => {
    onWheelsChange({ gamma: DEFAULT_WHEEL, gamma_luminance: 0 });
  }, [onWheelsChange]);

  const handleResetGain = useCallback(() => {
    onWheelsChange({ gain: DEFAULT_WHEEL, gain_luminance: 0 });
  }, [onWheelsChange]);

  const liftDirty = useMemo(
    () => isWheelDirty(wheels.lift, wheels.lift_luminance),
    [wheels.lift, wheels.lift_luminance],
  );
  const gammaDirty = useMemo(
    () => isWheelDirty(wheels.gamma, wheels.gamma_luminance),
    [wheels.gamma, wheels.gamma_luminance],
  );
  const gainDirty = useMemo(
    () => isWheelDirty(wheels.gain, wheels.gain_luminance),
    [wheels.gain, wheels.gain_luminance],
  );
  const anyDirty = liftDirty || gammaDirty || gainDirty;

  return (
    <div className="@container space-y-4">
      {/* Header with reset button */}
      <div className="flex h-6 items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Color Wheels</span>
        {anyDirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleResetAll}
            title="Reset all wheels"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset All
          </Button>
        )}
      </div>

      {/* Wheels — column below 320px, 3-col row above */}
      <div className="flex flex-col gap-4 @xs:grid @xs:grid-cols-3 @xs:gap-6">
        {/* Lift (Shadows) */}
        <div className="flex flex-col items-center">
          <ColorWheel
            label="Lift"
            angle={wheels.lift.angle}
            distance={wheels.lift.distance}
            luminance={wheels.lift_luminance}
            onColorChange={handleLiftColorChange}
            onLuminanceChange={handleLiftLuminanceChange}
            size={100}
          />
          <div className="mt-1 flex items-center gap-1">
            {liftDirty ? (
              <ResetButton onClick={handleResetLift} title="Reset lift" />
            ) : (
              <span className="block size-5 shrink-0" />
            )}
            <span className="text-xs text-muted-foreground">Shadows</span>
            <span className="block size-5 shrink-0" />
          </div>
        </div>

        {/* Gamma (Midtones) */}
        <div className="flex flex-col items-center">
          <ColorWheel
            label="Gamma"
            angle={wheels.gamma.angle}
            distance={wheels.gamma.distance}
            luminance={wheels.gamma_luminance}
            onColorChange={handleGammaColorChange}
            onLuminanceChange={handleGammaLuminanceChange}
            size={100}
          />
          <div className="mt-1 flex items-center gap-1">
            {gammaDirty ? (
              <ResetButton onClick={handleResetGamma} title="Reset gamma" />
            ) : (
              <span className="block size-5 shrink-0" />
            )}
            <span className="text-xs text-muted-foreground">Midtones</span>
            <span className="block size-5 shrink-0" />
          </div>
        </div>

        {/* Gain (Highlights) */}
        <div className="flex flex-col items-center">
          <ColorWheel
            label="Gain"
            angle={wheels.gain.angle}
            distance={wheels.gain.distance}
            luminance={wheels.gain_luminance}
            onColorChange={handleGainColorChange}
            onLuminanceChange={handleGainLuminanceChange}
            size={100}
          />
          <div className="mt-1 flex items-center gap-1">
            {gainDirty ? (
              <ResetButton onClick={handleResetGain} title="Reset gain" />
            ) : (
              <span className="block size-5 shrink-0" />
            )}
            <span className="text-xs text-muted-foreground">Highlights</span>
            <span className="block size-5 shrink-0" />
          </div>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-xs text-muted-foreground">
        Drag to adjust color. Double-click to reset. Shift+drag for saturation only.
      </p>
    </div>
  );
}
