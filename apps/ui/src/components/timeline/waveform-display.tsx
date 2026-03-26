import { Shape } from "react-konva";
import type Konva from "konva";

interface WaveformDisplayProps {
  x: number;
  y: number;
  width: number;
  height: number;
  waveformData: number[];
  /** Start of visible region in seconds */
  inPoint: number;
  /** End of visible region in seconds */
  outPoint: number;
  /** Total source duration in seconds */
  duration: number;
  color?: string;
}

/**
 * Renders an audio waveform as a mirrored filled area chart.
 *
 * Draws every data point at its natural time position (no resampling)
 * so the waveform shape stays stable during trim drags — only the
 * visible window shifts, never the point positions.
 */
export function WaveformDisplay({
  x,
  y,
  width,
  height,
  waveformData,
  inPoint,
  outPoint,
  duration,
  color = "rgba(255, 255, 255, 0.5)",
}: WaveformDisplayProps) {
  if (!waveformData || waveformData.length === 0 || duration <= 0) {
    return null;
  }

  const visibleDuration = outPoint - inPoint;
  if (visibleDuration <= 0) return null;

  // Find the range of data indices that fall within the visible window
  const startIdx = Math.max(0, Math.floor((inPoint / duration) * waveformData.length));
  const endIdx = Math.min(
    waveformData.length,
    Math.ceil((outPoint / duration) * waveformData.length),
  );
  if (endIdx <= startIdx) return null;

  const sceneFunc = (context: Konva.Context) => {
    const ctx = context._context;
    const centerY = y + height / 2;
    const maxAmp = height * 0.4;

    ctx.beginPath();

    // Top half (left to right) — each point at its natural time position
    for (let i = startIdx; i < endIdx; i++) {
      const t = (i / waveformData.length) * duration; // time in seconds
      const px = x + ((t - inPoint) / visibleDuration) * width;
      const py = centerY - waveformData[i] * maxAmp;
      if (i === startIdx) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    // Bottom half (right to left, mirrored)
    for (let i = endIdx - 1; i >= startIdx; i--) {
      const t = (i / waveformData.length) * duration;
      const px = x + ((t - inPoint) / visibleDuration) * width;
      const py = centerY + waveformData[i] * maxAmp;
      ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  return <Shape x={0} y={0} sceneFunc={sceneFunc} listening={false} />;
}
