/**
 * Curves editor for color grading.
 *
 * Features:
 * - Interactive canvas-based curve editor (similar to Photoshop/DaVinci)
 * - Tabs to switch between Master, Red, Green, Blue channels
 * - Click on curve to add control points
 * - Drag control points to adjust
 * - Double-click a point to remove it (except endpoints)
 * - Monotonic cubic spline interpolation for smooth curves
 * - Grid lines and identity diagonal for visual reference
 */

import type { Curves, Curve1D } from "@tooscut/render-engine";

import { DEFAULT_CURVES } from "@tooscut/render-engine";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../../lib/utils";
import { useVideoEditorStore } from "../../../state/video-editor-store";
import { Button } from "../../ui/button";

// ============================================================================
// Types
// ============================================================================

interface CurvesPropertiesProps {
  curves: Curves;
  onCurvesChange: (curves: Curves) => void;
}

type CurveChannel = "master" | "red" | "green" | "blue";

interface ChannelConfig {
  key: CurveChannel;
  label: string;
  color: string;
  activeColor: string;
  bgClass: string;
}

// ============================================================================
// Constants
// ============================================================================

const CANVAS_PADDING = 12;
const POINT_RADIUS = 5;
const POINT_HIT_RADIUS = 10;

const CHANNELS: ChannelConfig[] = [
  {
    key: "master",
    label: "Master",
    color: "rgba(255, 255, 255, 0.9)",
    activeColor: "rgba(255, 255, 255, 1)",
    bgClass: "bg-neutral-500",
  },
  {
    key: "red",
    label: "Red",
    color: "rgba(239, 68, 68, 0.9)",
    activeColor: "rgba(239, 68, 68, 1)",
    bgClass: "bg-red-500",
  },
  {
    key: "green",
    label: "Green",
    color: "rgba(34, 197, 94, 0.9)",
    activeColor: "rgba(34, 197, 94, 1)",
    bgClass: "bg-green-500",
  },
  {
    key: "blue",
    label: "Blue",
    color: "rgba(59, 130, 246, 0.9)",
    activeColor: "rgba(59, 130, 246, 1)",
    bgClass: "bg-blue-500",
  },
];

// ============================================================================
// Curve Evaluation (monotonic cubic interpolation)
// ============================================================================

/**
 * Evaluate a Curve1D at a given x using monotonic cubic Hermite interpolation.
 * This matches the smooth curve rendering and avoids overshooting.
 */
function evaluateCurve(curve: Curve1D, x: number): number {
  const pts = curve.points;
  if (pts.length === 0) return x;
  if (pts.length === 1) return pts[0].y;

  const clamped = Math.max(0, Math.min(1, x));

  // Below first point
  if (clamped <= pts[0].x) return pts[0].y;
  // Above last point
  if (clamped >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

  // Find the segment
  let segIdx = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (clamped >= pts[i].x && clamped <= pts[i + 1].x) {
      segIdx = i;
      break;
    }
  }

  // If only 2 points, use linear
  if (pts.length === 2) {
    const dx = pts[1].x - pts[0].x;
    if (Math.abs(dx) < 1e-6) return pts[0].y;
    const t = (clamped - pts[0].x) / dx;
    return pts[0].y + t * (pts[1].y - pts[0].y);
  }

  // Compute monotone cubic Hermite tangents (Fritsch-Carlson)
  const n = pts.length;
  const deltas: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    deltas.push(dx > 1e-10 ? (pts[i + 1].y - pts[i].y) / dx : 0);
  }

  // Initial tangents
  const tangents = new Array<number>(n);
  tangents[0] = deltas[0];
  tangents[n - 1] = deltas[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (deltas[i - 1] * deltas[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (deltas[i - 1] + deltas[i]) / 2;
    }
  }

  // Monotonicity corrections
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(deltas[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / deltas[i];
      const beta = tangents[i + 1] / deltas[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * alpha * deltas[i];
        tangents[i + 1] = tau * beta * deltas[i];
      }
    }
  }

  // Hermite interpolation on the segment
  const i = segIdx;
  const h = pts[i + 1].x - pts[i].x;
  if (Math.abs(h) < 1e-10) return pts[i].y;

  const t = (clamped - pts[i].x) / h;
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * pts[i].y + h10 * h * tangents[i] + h01 * pts[i + 1].y + h11 * h * tangents[i + 1];
}

/**
 * Check if a Curve1D is an identity curve (all points on the diagonal).
 */
function isCurveIdentity(curve: Curve1D): boolean {
  return curve.points.every((p) => Math.abs(p.x - p.y) < 0.01);
}

// ============================================================================
// Main Component
// ============================================================================

export function CurvesProperties({ curves, onCurvesChange }: CurvesPropertiesProps) {
  const [activeChannel, setActiveChannel] = useState<CurveChannel>("master");

  const activeCurve = curves[activeChannel];
  const channelConfig = CHANNELS.find((c) => c.key === activeChannel)!;

  const isDirty = useMemo(() => {
    return (
      !isCurveIdentity(curves.master) ||
      !isCurveIdentity(curves.red) ||
      !isCurveIdentity(curves.green) ||
      !isCurveIdentity(curves.blue)
    );
  }, [curves]);

  const handleCurveChange = useCallback(
    (newCurve: Curve1D) => {
      onCurvesChange({ ...curves, [activeChannel]: newCurve });
    },
    [curves, activeChannel, onCurvesChange],
  );

  const handleResetAll = useCallback(() => {
    onCurvesChange({ ...DEFAULT_CURVES });
  }, [onCurvesChange]);

  const handleResetChannel = useCallback(() => {
    onCurvesChange({
      ...curves,
      [activeChannel]: {
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    });
  }, [curves, activeChannel, onCurvesChange]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex h-6 items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Curves</span>
        {isDirty && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleResetAll}
            title="Reset all curves"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset All
          </Button>
        )}
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1">
        {CHANNELS.map((ch) => {
          const isActive = activeChannel === ch.key;
          const channelDirty = !isCurveIdentity(curves[ch.key]);
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => setActiveChannel(ch.key)}
              className={cn(
                "relative flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300",
              )}
            >
              {ch.label}
              {channelDirty && (
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full",
                    ch.bgClass,
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Curve canvas */}
      <CurveCanvas
        curve={activeCurve}
        channelConfig={channelConfig}
        curves={curves}
        onChange={handleCurveChange}
      />

      {/* Channel reset */}
      {!isCurveIdentity(activeCurve) && (
        <button
          type="button"
          onClick={handleResetChannel}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Reset {channelConfig.label}
        </button>
      )}

      {/* Instructions */}
      <p className="text-xs text-muted-foreground">
        Click to add point. Drag to adjust. Double-click to remove.
      </p>
    </div>
  );
}

// ============================================================================
// Curve Canvas
// ============================================================================

interface CurveCanvasProps {
  curve: Curve1D;
  channelConfig: ChannelConfig;
  /** All curves, for drawing inactive channels as background */
  curves: Curves;
  onChange: (curve: Curve1D) => void;
}

function CurveCanvas({ curve, channelConfig, curves, onChange }: CurveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 280, height: 220 });
  const draggingIndexRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  // Observe container size for responsive canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.floor(entry.contentRect.width);
        setCanvasSize({ width, height: Math.min(220, Math.max(180, Math.floor(width * 0.75))) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Coordinate conversion helpers
  const plotArea = useMemo(() => {
    return {
      x: CANVAS_PADDING,
      y: CANVAS_PADDING,
      width: canvasSize.width - 2 * CANVAS_PADDING,
      height: canvasSize.height - 2 * CANVAS_PADDING,
    };
  }, [canvasSize]);

  const valueToCanvas = useCallback(
    (vx: number, vy: number): { cx: number; cy: number } => {
      return {
        cx: plotArea.x + vx * plotArea.width,
        cy: plotArea.y + (1 - vy) * plotArea.height,
      };
    },
    [plotArea],
  );

  const canvasToValue = useCallback(
    (cx: number, cy: number): { vx: number; vy: number } => {
      return {
        vx: Math.max(0, Math.min(1, (cx - plotArea.x) / plotArea.width)),
        vy: Math.max(0, Math.min(1, 1 - (cy - plotArea.y) / plotArea.height)),
      };
    },
    [plotArea],
  );

  // Draw the curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.scale(dpr, dpr);

    const { width, height } = canvasSize;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "rgba(15, 15, 15, 0.8)";
    ctx.roundRect(0, 0, width, height, 6);
    ctx.fill();

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const frac = i / 4;
      const gx = plotArea.x + frac * plotArea.width;
      const gy = plotArea.y + frac * plotArea.height;

      ctx.beginPath();
      ctx.moveTo(gx, plotArea.y);
      ctx.lineTo(gx, plotArea.y + plotArea.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(plotArea.x, gy);
      ctx.lineTo(plotArea.x + plotArea.width, gy);
      ctx.stroke();
    }

    // Identity diagonal (reference line)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const start = valueToCanvas(0, 0);
    const end = valueToCanvas(1, 1);
    ctx.moveTo(start.cx, start.cy);
    ctx.lineTo(end.cx, end.cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw inactive channel curves as faint background
    const inactiveChannels = CHANNELS.filter((ch) => ch.key !== channelConfig.key);
    for (const ch of inactiveChannels) {
      const chCurve = curves[ch.key];
      if (isCurveIdentity(chCurve)) continue;

      ctx.strokeStyle = ch.color.replace("0.9", "0.15");
      ctx.lineWidth = 1;
      ctx.beginPath();
      const steps = 100;
      for (let s = 0; s <= steps; s++) {
        const vx = s / steps;
        const vy = evaluateCurve(chCurve, vx);
        const { cx, cy } = valueToCanvas(vx, vy);
        if (s === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // Draw active curve
    ctx.strokeStyle = channelConfig.activeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const steps = 200;
    for (let s = 0; s <= steps; s++) {
      const vx = s / steps;
      const vy = evaluateCurve(curve, vx);
      const { cx, cy } = valueToCanvas(vx, vy);
      if (s === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Draw control points
    for (let i = 0; i < curve.points.length; i++) {
      const pt = curve.points[i];
      const { cx, cy } = valueToCanvas(pt.x, pt.y);
      const isEndpoint = i === 0 || i === curve.points.length - 1;

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, POINT_RADIUS + 1, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fill();

      // Inner circle
      ctx.beginPath();
      ctx.arc(cx, cy, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isEndpoint ? "rgba(180, 180, 180, 1)" : channelConfig.activeColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, width - 1, height - 1, 6);
    ctx.stroke();
  }, [canvasSize, curve, channelConfig, curves, plotArea, valueToCanvas]);

  // Find the closest point to a canvas coordinate
  const findPointAt = useCallback(
    (cx: number, cy: number): number | null => {
      for (let i = 0; i < curve.points.length; i++) {
        const pt = curve.points[i];
        const { cx: px, cy: py } = valueToCanvas(pt.x, pt.y);
        const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
        if (dist <= POINT_HIT_RADIUS) return i;
      }
      return null;
    },
    [curve.points, valueToCanvas],
  );

  // Get canvas-relative coordinates from a pointer event
  const getCanvasCoords = useCallback((e: React.PointerEvent): { cx: number; cy: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { cx: 0, cy: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      cx: e.clientX - rect.left,
      cy: e.clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.setPointerCapture(e.pointerId);
      const { cx, cy } = getCanvasCoords(e);
      const hitIndex = findPointAt(cx, cy);

      if (hitIndex !== null) {
        // Start dragging existing point
        isDraggingRef.current = true;
        draggingIndexRef.current = hitIndex;
        useVideoEditorStore.temporal.getState().pause();
      } else {
        // Add a new point
        const { vx, vy } = canvasToValue(cx, cy);

        // Find insertion index to keep points sorted by x
        const newPoints = [...curve.points];
        let insertIdx = newPoints.length;
        for (let i = 0; i < newPoints.length; i++) {
          if (vx < newPoints[i].x) {
            insertIdx = i;
            break;
          }
        }

        const roundedX = Math.round(vx * 1000) / 1000;
        const roundedY = Math.round(vy * 1000) / 1000;
        newPoints.splice(insertIdx, 0, { x: roundedX, y: roundedY });
        onChange({ points: newPoints });

        // Start dragging the newly added point
        isDraggingRef.current = true;
        draggingIndexRef.current = insertIdx;
        useVideoEditorStore.temporal.getState().pause();
      }
    },
    [curve.points, findPointAt, getCanvasCoords, canvasToValue, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || draggingIndexRef.current === null) return;

      const { cx, cy } = getCanvasCoords(e);
      const { vx, vy } = canvasToValue(cx, cy);

      const idx = draggingIndexRef.current;
      const newPoints = [...curve.points];
      const isFirst = idx === 0;
      const isLast = idx === newPoints.length - 1;

      // Endpoints: lock x, only allow y adjustment
      if (isFirst) {
        newPoints[idx] = { x: 0, y: Math.round(vy * 1000) / 1000 };
      } else if (isLast) {
        newPoints[idx] = { x: 1, y: Math.round(vy * 1000) / 1000 };
      } else {
        // Interior points: constrain x between neighbors
        const minX = newPoints[idx - 1].x + 0.005;
        const maxX = newPoints[idx + 1].x - 0.005;
        const clampedX = Math.max(minX, Math.min(maxX, vx));
        newPoints[idx] = {
          x: Math.round(clampedX * 1000) / 1000,
          y: Math.round(vy * 1000) / 1000,
        };
      }

      onChange({ points: newPoints });
    },
    [curve.points, getCanvasCoords, canvasToValue, onChange],
  );

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      draggingIndexRef.current = null;
      useVideoEditorStore.temporal.getState().resume();
    }
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const hitIndex = findPointAt(cx, cy);

      if (hitIndex !== null) {
        // Don't remove the first or last point
        if (hitIndex === 0 || hitIndex === curve.points.length - 1) return;

        const newPoints = [...curve.points];
        newPoints.splice(hitIndex, 1);
        onChange({ points: newPoints });
      }
    },
    [curve.points, findPointAt, onChange],
  );

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        style={{ width: canvasSize.width, height: canvasSize.height }}
        className="cursor-crosshair rounded-md"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}
