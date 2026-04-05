import type { ColorWheels, ColorWheelValue } from "@tooscut/render-engine";

import { RotateCcw } from "lucide-react";
import { useCallback } from "react";

import { Button } from "../../ui/button";
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

  return (
    <div className="space-y-4">
      {/* Header with reset button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Color Wheels</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleResetAll}
          title="Reset all wheels"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Reset
        </Button>
      </div>

      {/* Three wheels in a row */}
      <div className="grid grid-cols-3 gap-2">
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
          <button
            type="button"
            onClick={handleResetLift}
            className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Reset lift"
          >
            Shadows
          </button>
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
          <button
            type="button"
            onClick={handleResetGamma}
            className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Reset gamma"
          >
            Midtones
          </button>
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
          <button
            type="button"
            onClick={handleResetGain}
            className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Reset gain"
          >
            Highlights
          </button>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-[10px] text-muted-foreground">
        Drag to adjust color. Double-click to reset. Shift+drag for saturation only.
      </p>
    </div>
  );
}
