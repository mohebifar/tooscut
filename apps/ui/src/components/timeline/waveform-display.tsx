import { Shape } from "react-konva";
import type Konva from "konva";

interface WaveformDisplayProps {
  x: number;
  y: number;
  width: number;
  height: number;
  waveformData: number[];
  inPoint: number;
  outPoint: number;
  duration: number;
  color?: string;
  clipColor?: string;
}

// Target bar width in pixels for consistent visual density
const TARGET_BAR_WIDTH = 2;
const BAR_GAP = 1;

/**
 * Resample waveform data to a target number of bars.
 * Uses peak values when downsampling for better visual representation.
 */
function resampleWaveform(data: number[], targetBars: number): number[] {
  if (data.length === 0) return [];
  if (data.length <= targetBars) {
    // Upsample: repeat samples to fill gaps
    const result: number[] = [];
    const step = data.length / targetBars;
    for (let i = 0; i < targetBars; i++) {
      const index = Math.min(Math.floor(i * step), data.length - 1);
      result.push(data[index]);
    }
    return result;
  }

  // Downsample: use RMS of each bucket so wide buckets don't saturate to 1.0
  const result: number[] = [];
  const samplesPerBar = data.length / targetBars;

  for (let i = 0; i < targetBars; i++) {
    const start = Math.floor(i * samplesPerBar);
    const end = Math.min(Math.floor((i + 1) * samplesPerBar), data.length);

    let sumSq = 0;
    for (let j = start; j < end; j++) {
      sumSq += data[j] * data[j];
    }
    result.push(Math.sqrt(sumSq / (end - start)));
  }

  return result;
}

/**
 * Renders an audio waveform visualization using Konva Shape.
 * Supports trimming via inPoint/outPoint.
 * Resamples waveform data to maintain consistent bar widths regardless of zoom.
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
  color = "rgba(255, 255, 255, 0.6)",
  clipColor = "rgba(255, 255, 255, 0.3)",
}: WaveformDisplayProps) {
  if (!waveformData || waveformData.length === 0) {
    return null;
  }

  // Calculate which portion of waveform to display based on inPoint/outPoint
  const sourceDuration = duration;
  const startRatio = inPoint / sourceDuration;
  const endRatio = outPoint / sourceDuration;

  const startIndex = Math.floor(startRatio * waveformData.length);
  const endIndex = Math.ceil(endRatio * waveformData.length);
  const visibleData = waveformData.slice(startIndex, endIndex);

  if (visibleData.length === 0) {
    return null;
  }

  // Calculate target number of bars based on display width
  const targetBars = Math.max(1, Math.floor(width / (TARGET_BAR_WIDTH + BAR_GAP)));

  const resampledData = resampleWaveform(visibleData, targetBars);

  const sceneFunc = (context: Konva.Context) => {
    const ctx = context._context;
    const barCount = resampledData.length;
    const barWidth = width / barCount;
    const centerY = height / 2;
    const maxHeight = height * 0.8;

    ctx.beginPath();

    // Draw waveform as mirrored bars
    for (let i = 0; i < barCount; i++) {
      const value = resampledData[i];
      const barHeight = Math.max(1, value * maxHeight);
      const barX = x + i * barWidth + barWidth / 2;

      ctx.moveTo(barX, y + centerY - barHeight / 2);
      ctx.lineTo(barX, y + centerY + barHeight / 2);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, Math.min(TARGET_BAR_WIDTH, barWidth * 0.8));
    ctx.lineCap = "round";
    ctx.stroke();

    // Fill center line
    ctx.beginPath();
    ctx.moveTo(x, y + centerY);
    ctx.lineTo(x + width, y + centerY);
    ctx.strokeStyle = clipColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  return <Shape x={0} y={0} sceneFunc={sceneFunc} listening={false} />;
}
