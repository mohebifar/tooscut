import { useCallback, useEffect, useRef } from "react";

import { getAudioEngine } from "../../hooks/use-audio-engine";

/**
 * 3-band parametric EQ visualizer with:
 *  - Canvas-based frequency response curve (no SVG stretching)
 *  - Draggable dot handles on the graph (x = freq, y = gain)
 *  - Live FFT spectrum behind the EQ curve
 *  - Vertical gain sliders + frequency knobs below
 */

interface EqVisualizerProps {
  lowGain: number;
  midGain: number;
  highGain: number;
  lowFreq: number;
  midFreq: number;
  highFreq: number;
  onGainChange: (band: "lowGain" | "midGain" | "highGain", value: number) => void;
  onFreqChange: (band: "lowFreq" | "midFreq" | "highFreq", value: number) => void;
}

const DB_MIN = -24;
const DB_MAX = 24;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const SPECTRUM_DB_MIN = -90;
const SPECTRUM_DB_MAX = -10;

const BAND_COLORS = {
  low: "#ef4444",
  mid: "#22c55e",
  high: "#3b82f6",
} as const;

type BandKey = "low" | "mid" | "high";

const GAIN_KEYS: Record<BandKey, "lowGain" | "midGain" | "highGain"> = {
  low: "lowGain",
  mid: "midGain",
  high: "highGain",
};
const FREQ_KEYS: Record<BandKey, "lowFreq" | "midFreq" | "highFreq"> = {
  low: "lowFreq",
  mid: "midFreq",
  high: "highFreq",
};
const FREQ_LIMITS: Record<BandKey, { min: number; max: number; step: number }> = {
  low: { min: 20, max: 2000, step: 10 },
  mid: { min: 100, max: 10000, step: 50 },
  high: { min: 1000, max: 20000, step: 100 },
};

// --- Math helpers ---

function freqToX(freq: number, width: number): number {
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
}

function xToFreq(x: number, width: number): number {
  const logMin = Math.log10(FREQ_MIN);
  const logMax = Math.log10(FREQ_MAX);
  const logFreq = logMin + (x / width) * (logMax - logMin);
  return Math.max(FREQ_MIN, Math.min(FREQ_MAX, 10 ** logFreq));
}

function dbToY(db: number, height: number): number {
  return ((DB_MAX - db) / (DB_MAX - DB_MIN)) * height;
}

function yToDb(y: number, height: number): number {
  return DB_MAX - (y / height) * (DB_MAX - DB_MIN);
}

function computeEqResponse(
  freq: number,
  lowGain: number,
  midGain: number,
  highGain: number,
  lowFreq: number,
  midFreq: number,
  highFreq: number,
): number {
  const lowOctaves = Math.log2(freq / lowFreq);
  const lowWeight = 1 / (1 + Math.exp(lowOctaves * 3));
  const highOctaves = Math.log2(freq / highFreq);
  const highWeight = 1 / (1 + Math.exp(-highOctaves * 3));
  const midOctaves = Math.log2(freq / midFreq);
  const midQ = 1.5;
  const midWeight = Math.exp((-midOctaves * midOctaves) / (2 * midQ * midQ));
  return lowGain * lowWeight + midGain * midWeight + highGain * highWeight;
}

// --- Frequency Response Canvas ---

const CURVE_HEIGHT = 140;
const DOT_RADIUS = 7;
const DOT_HIT_RADIUS = 14;

function FrequencyResponseCanvas({
  lowGain,
  midGain,
  highGain,
  lowFreq,
  midFreq,
  highFreq,
  onGainChange,
  onFreqChange,
}: EqVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{
    band: BandKey;
    startX: number;
    startY: number;
    startFreq: number;
    startGain: number;
  } | null>(null);
  const hoveredRef = useRef<BandKey | null>(null);

  // Keep current values in refs for the draw loop
  const valuesRef = useRef({ lowGain, midGain, highGain, lowFreq, midFreq, highFreq });
  valuesRef.current = { lowGain, midGain, highGain, lowFreq, midFreq, highFreq };

  // Spectrum buffer (reused across frames)
  const spectrumBufRef = useRef<Float32Array | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const v = valuesRef.current;

    // --- Background ---
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 6);
    ctx.fill();

    // --- Grid ---
    ctx.lineWidth = 0.5;
    const gridDbs = [-12, 0, 12];
    const gridFreqs = [100, 1000, 10000];

    ctx.font = "9px ui-monospace, monospace";
    for (const db of gridDbs) {
      const y = dbToY(db, h);
      ctx.strokeStyle = db === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)";
      ctx.setLineDash(db === 0 ? [] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.textAlign = "left";
      ctx.fillText(db > 0 ? `+${db}` : `${db}`, 4, y - 3);
    }
    for (const freq of gridFreqs) {
      const x = freqToX(freq, w);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.textAlign = "center";
      ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, x, h - 4);
    }

    // --- Live FFT spectrum ---
    const engine = getAudioEngine();
    const info = engine?.getAnalyserInfo();
    if (engine && info) {
      const fftData = engine.getFrequencyData();
      if (fftData) {
        spectrumBufRef.current = fftData;

        ctx.beginPath();
        ctx.moveTo(0, h);

        const binCount = info.binCount;
        const nyquist = info.sampleRate / 2;

        // Walk x pixels and map to frequency, then to the right FFT bin
        const step = Math.max(1, Math.floor(w / 200));
        for (let px = 0; px <= w; px += step) {
          const freq = xToFreq(px, w);
          const bin = Math.round((freq / nyquist) * binCount);
          if (bin >= binCount) break;
          const dbVal = fftData[bin];
          // Map spectrum dB range to 0..h
          const frac = Math.max(
            0,
            Math.min(1, (dbVal - SPECTRUM_DB_MIN) / (SPECTRUM_DB_MAX - SPECTRUM_DB_MIN)),
          );
          const y = h - frac * h;
          ctx.lineTo(px, y);
        }

        ctx.lineTo(w, h);
        ctx.closePath();

        // Gradient fill
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "rgba(168, 162, 255, 0.25)");
        grad.addColorStop(1, "rgba(168, 162, 255, 0.02)");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    // --- EQ response curve ---
    const steps = 256;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const logFreq = Math.log10(FREQ_MIN) + t * (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN));
      const freq = 10 ** logFreq;
      const db = computeEqResponse(
        freq,
        v.lowGain,
        v.midGain,
        v.highGain,
        v.lowFreq,
        v.midFreq,
        v.highFreq,
      );
      const x = t * w;
      const y = dbToY(db, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Fill under curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = "rgba(168, 162, 255, 0.06)";
    ctx.fill();

    // Stroke curve
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const logFreq = Math.log10(FREQ_MIN) + t * (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN));
      const freq = 10 ** logFreq;
      const db = computeEqResponse(
        freq,
        v.lowGain,
        v.midGain,
        v.highGain,
        v.lowFreq,
        v.midFreq,
        v.highFreq,
      );
      const x = t * w;
      const y = dbToY(db, h);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(168, 162, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- Band dots ---
    const bands: { key: BandKey; freq: number; gain: number; color: string }[] = [
      { key: "low", freq: v.lowFreq, gain: v.lowGain, color: BAND_COLORS.low },
      { key: "mid", freq: v.midFreq, gain: v.midGain, color: BAND_COLORS.mid },
      { key: "high", freq: v.highFreq, gain: v.highGain, color: BAND_COLORS.high },
    ];

    for (const band of bands) {
      const bx = freqToX(band.freq, w);
      const by = dbToY(
        computeEqResponse(
          band.freq,
          v.lowGain,
          v.midGain,
          v.highGain,
          v.lowFreq,
          v.midFreq,
          v.highFreq,
        ),
        h,
      );
      const isHovered = hoveredRef.current === band.key;
      const isDragged = dragRef.current?.band === band.key;
      const r = isHovered || isDragged ? DOT_RADIUS + 2 : DOT_RADIUS;

      // Glow
      ctx.shadowColor = band.color;
      ctx.shadowBlur = isDragged ? 12 : isHovered ? 8 : 4;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = band.color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner ring
      ctx.beginPath();
      ctx.arc(bx, by, r - 2, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a2e";
      ctx.fill();

      // Center dot
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = band.color;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // --- Hit testing ---
  const hitTest = useCallback((clientX: number, clientY: number): BandKey | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const v = valuesRef.current;

    const bands: { key: BandKey; freq: number }[] = [
      { key: "low", freq: v.lowFreq },
      { key: "mid", freq: v.midFreq },
      { key: "high", freq: v.highFreq },
    ];

    let closest: BandKey | null = null;
    let closestDist = DOT_HIT_RADIUS;

    for (const band of bands) {
      const bx = freqToX(band.freq, w);
      const by = dbToY(
        computeEqResponse(
          band.freq,
          v.lowGain,
          v.midGain,
          v.highGain,
          v.lowFreq,
          v.midFreq,
          v.highFreq,
        ),
        h,
      );
      const dist = Math.sqrt((mx - bx) ** 2 + (my - by) ** 2);
      if (dist < closestDist) {
        closestDist = dist;
        closest = band.key;
      }
    }

    return closest;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const band = hitTest(e.clientX, e.clientY);
      if (!band) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const v = valuesRef.current;
      dragRef.current = {
        band,
        startX: e.clientX,
        startY: e.clientY,
        startFreq: band === "low" ? v.lowFreq : band === "mid" ? v.midFreq : v.highFreq,
        startGain: band === "low" ? v.lowGain : band === "mid" ? v.midGain : v.highGain,
      };
    },
    [hitTest],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) {
        // Hover detection
        const band = hitTest(e.clientX, e.clientY);
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.style.cursor = band ? "grab" : "default";
        }
        hoveredRef.current = band;
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const drag = dragRef.current;

      // Convert pointer position to freq/gain
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const newFreqRaw = xToFreq(mx, w);
      const newGainRaw = yToDb(my, h);

      const v = valuesRef.current;
      const limits = FREQ_LIMITS[drag.band];
      // Clamp so bands don't cross each other's frequencies
      const freqFloor =
        drag.band === "mid" ? v.lowFreq : drag.band === "high" ? v.midFreq : limits.min;
      const freqCeil =
        drag.band === "low" ? v.midFreq : drag.band === "mid" ? v.highFreq : limits.max;
      const clampedMin = Math.max(limits.min, freqFloor);
      const clampedMax = Math.min(limits.max, freqCeil);
      const newFreq =
        Math.round(Math.max(clampedMin, Math.min(clampedMax, newFreqRaw)) / limits.step) *
        limits.step;
      const newGain = Math.round(Math.max(DB_MIN, Math.min(DB_MAX, newGainRaw)) * 2) / 2;

      onFreqChange(FREQ_KEYS[drag.band], newFreq);
      onGainChange(GAIN_KEYS[drag.band], newGain);

      canvas.style.cursor = "grabbing";
    },
    [hitTest, onGainChange, onFreqChange],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = "default";
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const band = hitTest(e.clientX, e.clientY);
      if (!band) return;
      onGainChange(GAIN_KEYS[band], 0);
    },
    [hitTest, onGainChange],
  );

  return (
    <div ref={containerRef} className="w-full" style={{ height: CURVE_HEIGHT }}>
      <canvas
        ref={canvasRef}
        className="h-full w-full rounded-md"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}

// --- Vertical Band Slider ---

const SLIDER_HEIGHT = 80;

function BandSlider({
  label,
  gain,
  freq,
  color,
  freqMin,
  freqMax,
  freqStep,
  onGainChange,
  onFreqChange,
}: {
  label: string;
  gain: number;
  freq: number;
  color: string;
  freqMin: number;
  freqMax: number;
  freqStep: number;
  onGainChange: (value: number) => void;
  onFreqChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const fraction = (gain - DB_MIN) / (DB_MAX - DB_MIN);
  const fillPercent = fraction * 100;

  const gainFromY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) return gain;
      const rect = track.getBoundingClientRect();
      const y = clientY - rect.top;
      const frac = 1 - Math.max(0, Math.min(1, y / rect.height));
      const raw = DB_MIN + frac * (DB_MAX - DB_MIN);
      return Math.round(raw * 2) / 2;
    },
    [gain],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      isDragging.current = true;
      onGainChange(gainFromY(e.clientY));
    },
    [gainFromY, onGainChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      onGainChange(gainFromY(e.clientY));
    },
    [gainFromY, onGainChange],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    onGainChange(0);
  }, [onGainChange]);

  const freqLabel = freq >= 1000 ? `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}k` : `${freq}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {gain > 0 ? "+" : ""}
        {gain.toFixed(1)}
      </span>

      <div
        ref={trackRef}
        className="relative cursor-ns-resize rounded-full"
        style={{ width: 20, height: SLIDER_HEIGHT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <div className="absolute inset-x-[7px] inset-y-0 rounded-full bg-white/[0.06]" />
        <div className="absolute right-[5px] left-[5px] h-px bg-white/20" style={{ top: "50%" }} />
        {gain !== 0 && (
          <div
            className="absolute right-[7px] left-[7px] rounded-full"
            style={{
              backgroundColor: color,
              opacity: 0.4,
              ...(gain > 0
                ? { bottom: "50%", height: `${Math.min(50, fillPercent - 50)}%` }
                : { top: "50%", height: `${Math.min(50, 50 - fillPercent)}%` }),
            }}
          />
        )}
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-md transition-shadow hover:shadow-lg"
          style={{
            width: 14,
            height: 14,
            top: `${100 - fillPercent}%`,
            borderColor: color,
            backgroundColor: "#1a1a2e",
            boxShadow: `0 0 6px ${color}40`,
          }}
        />
      </div>

      <span className="text-[10px] font-medium" style={{ color }}>
        {label}
      </span>

      <FreqKnob
        freq={freq}
        min={freqMin}
        max={freqMax}
        step={freqStep}
        color={color}
        onChange={onFreqChange}
      />

      <span className="text-[9px] text-muted-foreground tabular-nums">{freqLabel} Hz</span>
    </div>
  );
}

// --- Frequency Knob ---

function FreqKnob({
  freq,
  min,
  max,
  step,
  color,
  onChange,
}: {
  freq: number;
  min: number;
  max: number;
  step: number;
  color: string;
  onChange: (value: number) => void;
}) {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startFreq = useRef(freq);

  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const fraction = (Math.log10(freq) - logMin) / (logMax - logMin);
  const angle = -135 + fraction * 270;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      isDragging.current = true;
      startY.current = e.clientY;
      startFreq.current = freq;
    },
    [freq],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      const sensitivity = 0.005;
      const logStart = Math.log10(startFreq.current);
      const logNew = logStart + delta * sensitivity * (logMax - logMin);
      const newFreq = Math.max(min, Math.min(max, 10 ** logNew));
      onChange(Math.round(newFreq / step) * step);
    },
    [min, max, step, logMax, logMin, onChange],
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Arc geometry: 270° sweep from -135° to +135° (relative to 12 o'clock)
  // SVG circle stroke starts at 3 o'clock. Rotate 135° so stroke starts at 7:30 position.
  const circumference = 2 * Math.PI * 9; // ~56.55
  const arcLength = circumference * (270 / 360); // ~42.41
  const gapLength = circumference - arcLength; // ~14.14

  return (
    <div
      className="relative cursor-ns-resize"
      style={{ width: 24, height: 24 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <svg viewBox="0 0 24 24" width={24} height={24}>
        {/* Background track (270° arc) */}
        <circle
          cx={12}
          cy={12}
          r={9}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={2}
          strokeDasharray={`${arcLength} ${gapLength}`}
          transform="rotate(135, 12, 12)"
        />
        {/* Filled portion */}
        <circle
          cx={12}
          cy={12}
          r={9}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={`${fraction * arcLength} ${circumference - fraction * arcLength}`}
          strokeLinecap="round"
          opacity={0.5}
          transform="rotate(135, 12, 12)"
        />
        {/* Needle indicator */}
        <line
          x1={12}
          y1={12}
          x2={12 + 7 * Math.cos(((angle - 90) * Math.PI) / 180)}
          y2={12 + 7 * Math.sin(((angle - 90) * Math.PI) / 180)}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <circle cx={12} cy={12} r={2} fill={color} opacity={0.6} />
      </svg>
    </div>
  );
}

// --- Main Component ---

export function EqVisualizer({
  lowGain,
  midGain,
  highGain,
  lowFreq,
  midFreq,
  highFreq,
  onGainChange,
  onFreqChange,
}: EqVisualizerProps) {
  return (
    <div className="space-y-3">
      <FrequencyResponseCanvas
        lowGain={lowGain}
        midGain={midGain}
        highGain={highGain}
        lowFreq={lowFreq}
        midFreq={midFreq}
        highFreq={highFreq}
        onGainChange={onGainChange}
        onFreqChange={onFreqChange}
      />

      <div className="flex items-start justify-around">
        <BandSlider
          label="Low"
          gain={lowGain}
          freq={lowFreq}
          color={BAND_COLORS.low}
          freqMin={20}
          freqMax={Math.min(2000, midFreq)}
          freqStep={10}
          onGainChange={(v) => onGainChange("lowGain", v)}
          onFreqChange={(v) => onFreqChange("lowFreq", v)}
        />
        <BandSlider
          label="Mid"
          gain={midGain}
          freq={midFreq}
          color={BAND_COLORS.mid}
          freqMin={Math.max(100, lowFreq)}
          freqMax={Math.min(10000, highFreq)}
          freqStep={50}
          onGainChange={(v) => onGainChange("midGain", v)}
          onFreqChange={(v) => onFreqChange("midFreq", v)}
        />
        <BandSlider
          label="High"
          gain={highGain}
          freq={highFreq}
          color={BAND_COLORS.high}
          freqMin={Math.max(1000, midFreq)}
          freqMax={20000}
          freqStep={100}
          onGainChange={(v) => onGainChange("highGain", v)}
          onFreqChange={(v) => onFreqChange("highFreq", v)}
        />
      </div>
    </div>
  );
}
