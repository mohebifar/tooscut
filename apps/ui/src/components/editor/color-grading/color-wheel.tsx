import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../../../lib/utils";
import { Slider } from "../../ui/slider";

interface ColorWheelProps {
  /** Label shown above the wheel */
  label: string;
  /** Current hue angle in degrees (0 to 360) */
  angle: number;
  /** Current distance from center (0 to 1) */
  distance: number;
  /** Luminance adjustment (-1 to 1) */
  luminance: number;
  /** Called when angle or distance changes */
  onColorChange: (angle: number, distance: number) => void;
  /** Called when luminance changes */
  onLuminanceChange: (luminance: number) => void;
  /** Size of the wheel in pixels */
  size?: number;
  /** Whether the wheel is disabled */
  disabled?: boolean;
}

/**
 * Color wheel for Lift/Gamma/Gain adjustment.
 *
 * A circular picker where:
 * - Angle = hue (color direction in degrees)
 * - Distance from center = color intensity (0-1)
 * - Luminance slider below for brightness adjustment
 *
 * Interactions:
 * - Click/drag to set color
 * - Double-click to reset to center
 * - Shift+drag constrains to current angle
 * - Ctrl+drag for fine adjustment
 */
export function ColorWheel({
  label,
  angle,
  distance,
  luminance,
  onColorChange,
  onLuminanceChange,
  size = 120,
  disabled = false,
}: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ angle: number; distance: number } | null>(null);

  // Convert degrees to radians for calculations
  const angleRad = (angle * Math.PI) / 180;

  // Draw the color wheel
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const wheelRadius = size / 2 - 4;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Draw color wheel using imageData for smooth gradients
    const imageData = ctx.createImageData(size * dpr, size * dpr);
    const data = imageData.data;

    for (let y = 0; y < size * dpr; y++) {
      for (let x = 0; x < size * dpr; x++) {
        const px = x / dpr - centerX;
        const py = y / dpr - centerY;
        const dist = Math.sqrt(px * px + py * py);

        if (dist <= wheelRadius) {
          const pixelAngle = Math.atan2(py, px);
          const sat = Math.min(dist / wheelRadius, 1);

          // Convert HSL to RGB (hue from angle, saturation from distance, lightness 0.5)
          const h = ((pixelAngle + Math.PI) / (2 * Math.PI)) * 360;
          const s = sat * 100;
          const l = 50;

          const [r, g, b] = hslToRgb(h, s, l);

          const idx = (y * size * dpr + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw outer ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, wheelRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw center crosshair
    ctx.beginPath();
    ctx.moveTo(centerX - 4, centerY);
    ctx.lineTo(centerX + 4, centerY);
    ctx.moveTo(centerX, centerY - 4);
    ctx.lineTo(centerX, centerY + 4);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw current position indicator
    const indicatorX = centerX + Math.cos(angleRad) * distance * wheelRadius;
    const indicatorY = centerY + Math.sin(angleRad) * distance * wheelRadius;

    // Indicator shadow
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fill();

    // Indicator
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 5, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner dot showing the actual color
    const [r, g, b] = hslToRgb(((angleRad + Math.PI) / (2 * Math.PI)) * 360, distance * 100, 50);
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fill();
  }, [size, angleRad, distance]);

  // Handle mouse/touch interactions
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.setPointerCapture(e.pointerId);
      setIsDragging(true);
      dragStartRef.current = { angle, distance };

      // Calculate position
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const wheelRadius = size / 2 - 4;

      const newAngleRad = Math.atan2(y, x);
      const dist = Math.sqrt(x * x + y * y);
      const newDist = Math.min(dist / wheelRadius, 1);

      // Convert radians to degrees
      const newAngleDeg = (newAngleRad * 180) / Math.PI;
      onColorChange(newAngleDeg, newDist);
    },
    [disabled, angle, distance, size, onColorChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || disabled) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const wheelRadius = size / 2 - 4;

      let newAngleRad = Math.atan2(y, x);
      let newDist = Math.sqrt(x * x + y * y) / wheelRadius;

      // Shift constrains to original angle (distance only)
      if (e.shiftKey && dragStartRef.current) {
        newAngleRad = (dragStartRef.current.angle * Math.PI) / 180;
      }

      // Ctrl for fine adjustment
      if (e.ctrlKey && dragStartRef.current) {
        const startAngleRad = (dragStartRef.current.angle * Math.PI) / 180;
        const deltaAngle = newAngleRad - startAngleRad;
        const deltaDist = newDist - dragStartRef.current.distance;
        newAngleRad = startAngleRad + deltaAngle * 0.1;
        newDist = dragStartRef.current.distance + deltaDist * 0.1;
      }

      newDist = Math.max(0, Math.min(1, newDist));

      // Convert radians to degrees
      const newAngleDeg = (newAngleRad * 180) / Math.PI;
      onColorChange(newAngleDeg, newDist);
    },
    [isDragging, disabled, size, onColorChange],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (disabled) return;
    // Reset to center
    onColorChange(0, 0);
  }, [disabled, onColorChange]);

  const handleLuminanceReset = useCallback(() => {
    onLuminanceChange(0);
  }, [onLuminanceChange]);

  return (
    <div className={cn("flex flex-col items-center gap-2", disabled && "opacity-50")}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>

      <div ref={containerRef} className="relative">
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          style={{ width: size, height: size }}
          className={cn("cursor-crosshair rounded-full", disabled && "cursor-not-allowed")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      {/* Luminance slider */}
      <div className="flex w-full items-center gap-2">
        <span className="text-[10px] text-muted-foreground">L</span>
        <Slider
          value={[luminance]}
          min={-1}
          max={1}
          step={0.01}
          onValueChange={([v]) => onLuminanceChange(v)}
          disabled={disabled}
          className="flex-1"
        />
        <button
          type="button"
          onClick={handleLuminanceReset}
          disabled={disabled}
          className="text-[10px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
          title="Reset luminance"
        >
          {luminance.toFixed(2)}
        </button>
      </div>
    </div>
  );
}

/**
 * Convert HSL to RGB.
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
