import { useCallback, useEffect, useRef } from "react";

import { getAudioEngine } from "../../hooks/use-audio-engine";

/** dB range for the meter */
const DB_MIN = -60;
const DB_MAX = 0;

/** Tick marks in dB */
const TICK_MARKS = [0, -6, -12, -18, -24, -36, -48];

/** Convert dB to a 0–1 fraction for display */
function dbToFraction(db: number): number {
  if (db <= DB_MIN) return 0;
  if (db >= DB_MAX) return 1;
  return (db - DB_MIN) / (DB_MAX - DB_MIN);
}

/** Color for a given dB level */
function levelColor(db: number): string {
  if (db > -3) return "#ef4444"; // red — clipping
  if (db > -6) return "#f97316"; // orange — hot
  if (db > -12) return "#eab308"; // yellow — warm
  return "#22c55e"; // green — normal
}

const BAR_WIDTH = 6;
const GAP = 3;
const LABEL_WIDTH = 16;
const PADDING_X = 4;
const METER_WIDTH = PADDING_X + LABEL_WIDTH + GAP + BAR_WIDTH + GAP + BAR_WIDTH + PADDING_X;

export function AudioMeter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const peakLRef = useRef(-Infinity);
  const peakRRef = useRef(-Infinity);
  const peakDecayRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    // Resize canvas buffer if needed
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    // Get levels from the audio engine
    const engine = getAudioEngine();
    const levels = engine?.getLevels() ?? { left: -Infinity, right: -Infinity };

    // Peak hold with decay
    const now = performance.now();
    if (levels.left > peakLRef.current) {
      peakLRef.current = levels.left;
      peakDecayRef.current = now;
    }
    if (levels.right > peakRRef.current) {
      peakRRef.current = levels.right;
      peakDecayRef.current = now;
    }
    // Decay peaks after 1.5s hold
    if (now - peakDecayRef.current > 1500) {
      peakLRef.current = Math.max(levels.left, peakLRef.current - 0.5);
      peakRRef.current = Math.max(levels.right, peakRRef.current - 0.5);
    }

    // Clear
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const meterTop = 8;
    const meterBottom = displayHeight - 8;
    const meterHeight = meterBottom - meterTop;

    const barX1 = PADDING_X + LABEL_WIDTH + GAP;
    const barX2 = barX1 + BAR_WIDTH + GAP;

    // Draw tick marks and labels
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "right";

    for (const tick of TICK_MARKS) {
      const frac = dbToFraction(tick);
      const y = meterBottom - frac * meterHeight;

      // Tick line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX1, Math.round(y) + 0.5);
      ctx.lineTo(barX2 + BAR_WIDTH, Math.round(y) + 0.5);
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillText(tick === 0 ? " 0" : String(tick), PADDING_X + LABEL_WIDTH - 1, y + 3);
    }

    // Draw bar backgrounds
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(barX1, meterTop, BAR_WIDTH, meterHeight);
    ctx.fillRect(barX2, meterTop, BAR_WIDTH, meterHeight);

    // Draw level bars with gradient segments
    const drawBar = (x: number, db: number, peakDb: number) => {
      const frac = dbToFraction(db);
      if (frac <= 0) return;

      const barHeight = frac * meterHeight;
      const barY = meterBottom - barHeight;

      // Draw segmented bar
      const segmentHeight = 2;
      const segmentGap = 1;
      for (let y = meterBottom - segmentHeight; y >= barY; y -= segmentHeight + segmentGap) {
        const segDb = DB_MIN + ((meterBottom - y) / meterHeight) * (DB_MAX - DB_MIN);
        ctx.fillStyle = levelColor(segDb);
        ctx.fillRect(x, y, BAR_WIDTH, segmentHeight);
      }

      // Peak indicator
      const peakFrac = dbToFraction(peakDb);
      if (peakFrac > 0) {
        const peakY = meterBottom - peakFrac * meterHeight;
        ctx.fillStyle = levelColor(peakDb);
        ctx.fillRect(x, peakY, BAR_WIDTH, 2);
      }
    };

    drawBar(barX1, levels.left, peakLRef.current);
    drawBar(barX2, levels.right, peakRRef.current);

    // Channel labels at bottom
    ctx.font = "8px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillText("L", barX1 + BAR_WIDTH / 2, displayHeight - 0.5);
    ctx.fillText("R", barX2 + BAR_WIDTH / 2, displayHeight - 0.5);

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    // Always run the animation loop so we see decay even after stopping
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div
      className="flex h-full shrink-0 items-stretch border-l border-neutral-700 bg-neutral-900"
      style={{ width: METER_WIDTH }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
