/**
 * KeyframeCurveEditor - Timeline-integrated curve editor for keyframe animation.
 *
 * Each property gets its own collapsible graph with appropriate scale.
 * Supports cubic bezier handle editing for precise easing control.
 */

import type { AnyAnimatableProperty, CubicBezier } from "@tooscut/render-engine";
import type Konva from "konva";
import type React from "react";

import { CUBIC_BEZIER_PRESETS, evaluateCubicBezier } from "@tooscut/render-engine";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Text, Circle } from "react-konva";

import { getKeyframesForProperty } from "../../lib/keyframe-utils";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { TRACK_HEADER_WIDTH } from "./constants";

interface KeyframeCurveEditorProps {
  width: number;
  clipId: string;
  /** Properties to show curves for */
  properties: AnyAnimatableProperty[];
}

/** Height of each property graph */
const GRAPH_HEIGHT = 120;
/** Padding inside graph area */
const GRAPH_PADDING = 12;
/** Radius of keyframe points */
const KEYFRAME_RADIUS = 5;
/** Radius of bezier handles */
const HANDLE_RADIUS = 4;

/** Property configuration with display info and value range */
interface PropertyConfig {
  label: string;
  color: string;
  min: number;
  max: number;
  unit: string;
  /** Format value for display */
  format: (v: number) => string;
}

/** Default config for unknown properties (e.g., color grading) */
const DEFAULT_PROPERTY_CONFIG: PropertyConfig = {
  label: "Unknown",
  color: "#888888",
  min: 0,
  max: 1,
  unit: "",
  format: (v) => v.toFixed(2),
};

const PROPERTY_CONFIGS: Partial<Record<AnyAnimatableProperty, PropertyConfig>> = {
  x: {
    label: "Position X",
    color: "#ff6b6b",
    min: -1000,
    max: 3000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  y: {
    label: "Position Y",
    color: "#4ecdc4",
    min: -1000,
    max: 3000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  scaleX: {
    label: "Scale X",
    color: "#ffe66d",
    min: 0,
    max: 2,
    unit: "%",
    format: (v) => `${Math.round(v * 100)}%`,
  },
  scaleY: {
    label: "Scale Y",
    color: "#95e1d3",
    min: 0,
    max: 2,
    unit: "%",
    format: (v) => `${Math.round(v * 100)}%`,
  },
  rotation: {
    label: "Rotation",
    color: "#dda0dd",
    min: -360,
    max: 360,
    unit: "°",
    format: (v) => `${Math.round(v)}°`,
  },
  opacity: {
    label: "Opacity",
    color: "#87ceeb",
    min: 0,
    max: 1,
    unit: "%",
    format: (v) => `${Math.round(v * 100)}%`,
  },
  volume: {
    label: "Volume",
    color: "#98d8c8",
    min: 0,
    max: 1,
    unit: "%",
    format: (v) => `${Math.round(v * 100)}%`,
  },
  brightness: {
    label: "Brightness",
    color: "#f8b500",
    min: -1,
    max: 1,
    unit: "",
    format: (v) => v.toFixed(2),
  },
  contrast: {
    label: "Contrast",
    color: "#ff7f50",
    min: 0,
    max: 2,
    unit: "",
    format: (v) => v.toFixed(2),
  },
  saturation: {
    label: "Saturation",
    color: "#da70d6",
    min: 0,
    max: 2,
    unit: "",
    format: (v) => v.toFixed(2),
  },
  hueRotate: {
    label: "Hue Rotate",
    color: "#00ced1",
    min: -180,
    max: 180,
    unit: "°",
    format: (v) => `${Math.round(v)}°`,
  },
  blur: {
    label: "Blur",
    color: "#778899",
    min: 0,
    max: 50,
    unit: "px",
    format: (v) => `${v.toFixed(1)}px`,
  },
  width: {
    label: "Width",
    color: "#cd853f",
    min: 0,
    max: 2000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  height: {
    label: "Height",
    color: "#8fbc8f",
    min: 0,
    max: 2000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  strokeWidth: {
    label: "Stroke",
    color: "#b0c4de",
    min: 0,
    max: 20,
    unit: "px",
    format: (v) => `${v.toFixed(1)}px`,
  },
  cornerRadius: {
    label: "Corner Radius",
    color: "#deb887",
    min: 0,
    max: 100,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  x1: {
    label: "X1",
    color: "#ff6b6b",
    min: -1000,
    max: 3000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  y1: {
    label: "Y1",
    color: "#4ecdc4",
    min: -1000,
    max: 3000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  x2: {
    label: "X2",
    color: "#ffe66d",
    min: -1000,
    max: 3000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  y2: {
    label: "Y2",
    color: "#95e1d3",
    min: -1000,
    max: 3000,
    unit: "px",
    format: (v) => `${Math.round(v)}px`,
  },
  eqLowGain: {
    label: "EQ Low",
    color: "#e67e22",
    min: -24,
    max: 24,
    unit: "dB",
    format: (v) => `${v.toFixed(1)}dB`,
  },
  eqMidGain: {
    label: "EQ Mid",
    color: "#f39c12",
    min: -24,
    max: 24,
    unit: "dB",
    format: (v) => `${v.toFixed(1)}dB`,
  },
  eqHighGain: {
    label: "EQ High",
    color: "#f1c40f",
    min: -24,
    max: 24,
    unit: "dB",
    format: (v) => `${v.toFixed(1)}dB`,
  },
  compressorThreshold: {
    label: "Comp Threshold",
    color: "#e74c3c",
    min: -60,
    max: 0,
    unit: "dB",
    format: (v) => `${v.toFixed(1)}dB`,
  },
  noiseGateThreshold: {
    label: "Gate Threshold",
    color: "#2ecc71",
    min: -80,
    max: 0,
    unit: "dB",
    format: (v) => `${v.toFixed(1)}dB`,
  },
  reverbDryWet: {
    label: "Reverb Mix",
    color: "#3498db",
    min: 0,
    max: 1,
    unit: "",
    format: (v) => `${Math.round(v * 100)}%`,
  },
};

interface PropertyGraphProps {
  property: AnyAnimatableProperty;
  clipId: string;
  width: number;
  height: number;
  config: PropertyConfig;
  scrollX: number;
  zoom: number;
  clipStartTime: number;
  currentTime: number;
  /** Vertical zoom level (1 = default, higher = zoomed in) */
  valueZoom: number;
  onValueZoomChange: (zoom: number) => void;
}

function PropertyGraph({
  property,
  clipId,
  width,
  height,
  config,
  scrollX,
  zoom,
  clipStartTime,
  currentTime,
  valueZoom,
  onValueZoomChange,
}: PropertyGraphProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const [dragging, setDragging] = useState<{
    index: number;
    type: "point" | "handleIn" | "handleOut";
  } | null>(null);
  const isDragging = dragging !== null;

  const clips = useVideoEditorStore((s) => s.clips);
  const updateKeyframe = useVideoEditorStore((s) => s.updateKeyframe);

  const clip = clips.find((c) => c.id === clipId);
  const keyframes = useMemo(
    () => (clip ? getKeyframesForProperty(clip.keyframes, property) : []),
    [clip, property],
  );

  // Compute value range from keyframe values with 50% padding
  const [baseRange, setBaseRange] = useState({ min: config.min, max: config.max });

  // Only update the range when NOT dragging
  useEffect(() => {
    if (isDragging) return;

    if (keyframes.length === 0) {
      setBaseRange({ min: config.min, max: config.max });
      return;
    }

    let minVal = Number.POSITIVE_INFINITY;
    let maxVal = Number.NEGATIVE_INFINITY;
    for (const kf of keyframes) {
      if (kf.value < minVal) minVal = kf.value;
      if (kf.value > maxVal) maxVal = kf.value;
    }

    const span = maxVal - minVal;
    if (span < 1e-9) {
      const absVal = Math.abs(minVal);
      const padding = absVal > 1e-9 ? absVal * 0.5 : 1;
      setBaseRange({ min: minVal - padding, max: maxVal + padding });
    } else {
      const padding = span * 0.5;
      setBaseRange({ min: minVal - padding, max: maxVal + padding });
    }
  }, [isDragging, keyframes, config.min, config.max]);

  // Apply vertical zoom: zoom towards center of range
  const zoomedRange = useMemo(() => {
    const center = (baseRange.min + baseRange.max) / 2;
    const halfSpan = (baseRange.max - baseRange.min) / 2 / valueZoom;
    return { min: center - halfSpan, max: center + halfSpan };
  }, [baseRange.min, baseRange.max, valueZoom]);

  // Graph content area
  const graphWidth = width - TRACK_HEADER_WIDTH;
  const graphContentHeight = height - GRAPH_PADDING * 2;

  // Coordinate conversion
  const frameToX = useCallback(
    (time: number) => TRACK_HEADER_WIDTH + (clipStartTime + time) * zoom - scrollX,
    [zoom, scrollX, clipStartTime],
  );

  const xToFrame = useCallback(
    (x: number) => {
      const absoluteTime = (x - TRACK_HEADER_WIDTH + scrollX) / zoom;
      return absoluteTime - clipStartTime;
    },
    [zoom, scrollX, clipStartTime],
  );

  const valueToY = useCallback(
    (value: number) => {
      const normalized = (value - zoomedRange.min) / (zoomedRange.max - zoomedRange.min);
      return GRAPH_PADDING + (1 - normalized) * graphContentHeight;
    },
    [zoomedRange.min, zoomedRange.max, graphContentHeight],
  );

  const yToValue = useCallback(
    (y: number) => {
      const normalized = 1 - (y - GRAPH_PADDING) / graphContentHeight;
      return zoomedRange.min + normalized * (zoomedRange.max - zoomedRange.min);
    },
    [zoomedRange.min, zoomedRange.max, graphContentHeight],
  );

  // Vertical zoom via wheel
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const delta = e.evt.deltaY;
      const factor = delta > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(50, valueZoom * factor));
      onValueZoomChange(newZoom);
    },
    [valueZoom, onValueZoomChange],
  );

  // Handle drag
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!dragging || !clip) return;

      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;

      const { index, type } = dragging;
      const kf = keyframes[index];
      if (!kf) return;

      if (type === "point") {
        // Drag keyframe point
        const newTime = Math.max(0, xToFrame(pos.x));
        const newValue = yToValue(pos.y);
        updateKeyframe(clipId, property, index, { time: newTime, value: newValue });
      } else {
        // Drag bezier handle
        const nextKf = keyframes[index + 1];
        if (!nextKf) return;

        const x1 = frameToX(kf.time);
        const y1 = valueToY(kf.value);
        const x2 = frameToX(nextKf.time);
        const y2 = valueToY(nextKf.value);
        const dx = x2 - x1;
        const dy = y2 - y1;

        if (Math.abs(dx) < 1) return;

        const currentBezier = kf.easing.custom_bezier ?? CUBIC_BEZIER_PRESETS[kf.easing.preset];

        let newBezier: CubicBezier;
        if (type === "handleOut") {
          // First control point (from start keyframe)
          const handleX = Math.max(0, Math.min(1, (pos.x - x1) / dx));
          const handleY = dy !== 0 ? (pos.y - y1) / dy : 0;
          newBezier = {
            x1: handleX,
            y1: handleY,
            x2: currentBezier.x2,
            y2: currentBezier.y2,
          };
        } else {
          // Second control point (to end keyframe)
          const handleX = Math.max(0, Math.min(1, (pos.x - x1) / dx));
          const handleY = dy !== 0 ? (pos.y - y1) / dy : 0;
          newBezier = {
            x1: currentBezier.x1,
            y1: currentBezier.y1,
            x2: handleX,
            y2: handleY,
          };
        }

        updateKeyframe(clipId, property, index, {
          interpolation: "Bezier",
          easing: { preset: "Custom", custom_bezier: newBezier },
        });
      }
    },
    [
      dragging,
      clip,
      keyframes,
      clipId,
      property,
      xToFrame,
      yToValue,
      frameToX,
      valueToY,
      updateKeyframe,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Generate curve points
  const generateCurvePoints = useCallback(() => {
    if (keyframes.length < 2) return [];

    const points: number[] = [];
    const samples = 50;

    for (let i = 0; i < keyframes.length - 1; i++) {
      const k1 = keyframes[i];
      const k2 = keyframes[i + 1];

      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const time = k1.time + t * (k2.time - k1.time);

        let value: number;
        if (k1.interpolation === "Step") {
          value = s < samples ? k1.value : k2.value;
        } else if (k1.interpolation === "Linear") {
          value = k1.value + t * (k2.value - k1.value);
        } else {
          const bezier = k1.easing.custom_bezier ?? CUBIC_BEZIER_PRESETS[k1.easing.preset];
          const easedT = evaluateCubicBezier(bezier, t);
          value = k1.value + easedT * (k2.value - k1.value);
        }

        points.push(frameToX(time), valueToY(value));
      }
    }

    return points;
  }, [keyframes, frameToX, valueToY]);

  // Playhead position
  const playheadX = frameToX(currentTime - clipStartTime);
  const curvePoints = generateCurvePoints();

  // Value scale labels
  const scaleLabels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: GRAPH_PADDING + (1 - ratio) * graphContentHeight,
    value: zoomedRange.min + ratio * (zoomedRange.max - zoomedRange.min),
  }));

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <Layer>
        {/* Background */}
        <Rect x={0} y={0} width={width} height={height} fill="#141414" />

        {/* Left panel (value scale) */}
        <Rect x={0} y={0} width={TRACK_HEADER_WIDTH} height={height} fill="#1a1a1a" />

        {/* Value scale labels */}
        {scaleLabels.map(({ y, value }, i) => (
          <Text
            key={i}
            x={4}
            y={y - 6}
            text={config.format(value)}
            fontSize={9}
            fill="#666"
            width={TRACK_HEADER_WIDTH - 8}
            align="right"
          />
        ))}

        {/* Horizontal grid lines */}
        {scaleLabels.map(({ y }, i) => (
          <Line
            key={i}
            points={[TRACK_HEADER_WIDTH, y, width, y]}
            stroke="#2a2a2a"
            strokeWidth={1}
            dash={i === 2 ? undefined : [2, 4]}
          />
        ))}

        {/* Vertical time grid */}
        {(() => {
          const lines: React.JSX.Element[] = [];
          const startTime = Math.floor(scrollX / zoom);
          const endTime = Math.ceil((scrollX + graphWidth) / zoom);
          for (let t = startTime; t <= endTime; t++) {
            const x = frameToX(t - clipStartTime);
            if (x >= TRACK_HEADER_WIDTH && x <= width) {
              lines.push(
                <Line key={t} points={[x, 0, x, height]} stroke="#2a2a2a" strokeWidth={1} />,
              );
            }
          }
          return lines;
        })()}

        {/* The curve */}
        {curvePoints.length >= 4 && (
          <Line
            points={curvePoints}
            stroke={config.color}
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Single keyframe - show horizontal line */}
        {keyframes.length === 1 && (
          <Line
            points={[
              TRACK_HEADER_WIDTH,
              valueToY(keyframes[0].value),
              width,
              valueToY(keyframes[0].value),
            ]}
            stroke={config.color}
            strokeWidth={1}
            dash={[4, 4]}
            opacity={0.5}
          />
        )}

        {/* Keyframe points and bezier handles */}
        {keyframes.map((kf, index) => {
          const x = frameToX(kf.time);
          const y = valueToY(kf.value);
          const nextKf = keyframes[index + 1];
          const showHandles = nextKf && kf.interpolation === "Bezier";

          return (
            <Group key={index}>
              {/* Bezier handles */}
              {showHandles &&
                (() => {
                  const x2 = frameToX(nextKf.time);
                  const y2 = valueToY(nextKf.value);
                  const bezier = kf.easing.custom_bezier ?? CUBIC_BEZIER_PRESETS[kf.easing.preset];
                  const dx = x2 - x;
                  const dy = y2 - y;

                  const h1x = x + bezier.x1 * dx;
                  const h1y = y + bezier.y1 * dy;
                  const h2x = x + bezier.x2 * dx;
                  const h2y = y + bezier.y2 * dy;

                  return (
                    <>
                      {/* Handle lines */}
                      <Line
                        points={[x, y, h1x, h1y]}
                        stroke={config.color}
                        strokeWidth={1}
                        opacity={0.6}
                      />
                      <Line
                        points={[x2, y2, h2x, h2y]}
                        stroke={config.color}
                        strokeWidth={1}
                        opacity={0.6}
                      />

                      {/* Handle 1 (outgoing from current keyframe) */}
                      <Circle
                        x={h1x}
                        y={h1y}
                        radius={HANDLE_RADIUS}
                        fill={config.color}
                        stroke="#fff"
                        strokeWidth={1}
                        onMouseDown={() => setDragging({ index, type: "handleOut" })}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "pointer";
                        }}
                        onMouseLeave={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "default";
                        }}
                      />

                      {/* Handle 2 (incoming to next keyframe) */}
                      <Circle
                        x={h2x}
                        y={h2y}
                        radius={HANDLE_RADIUS}
                        fill={config.color}
                        stroke="#fff"
                        strokeWidth={1}
                        onMouseDown={() => setDragging({ index, type: "handleIn" })}
                        onMouseEnter={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "pointer";
                        }}
                        onMouseLeave={(e) => {
                          const container = e.target.getStage()?.container();
                          if (container) container.style.cursor = "default";
                        }}
                      />
                    </>
                  );
                })()}

              {/* Keyframe diamond */}
              <Line
                points={[
                  x,
                  y - KEYFRAME_RADIUS,
                  x + KEYFRAME_RADIUS,
                  y,
                  x,
                  y + KEYFRAME_RADIUS,
                  x - KEYFRAME_RADIUS,
                  y,
                ]}
                closed
                fill={config.color}
                stroke="#fff"
                strokeWidth={1.5}
                onMouseDown={() => setDragging({ index, type: "point" })}
                onMouseEnter={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) container.style.cursor = "move";
                }}
                onMouseLeave={(e) => {
                  const container = e.target.getStage()?.container();
                  if (container) container.style.cursor = "default";
                }}
              />

              {/* Value tooltip on hover/drag */}
              {dragging?.index === index && dragging.type === "point" && (
                <Group>
                  <Rect x={x + 10} y={y - 20} width={60} height={18} fill="#333" cornerRadius={3} />
                  <Text
                    x={x + 12}
                    y={y - 17}
                    text={config.format(kf.value)}
                    fontSize={11}
                    fill="#fff"
                  />
                </Group>
              )}
            </Group>
          );
        })}

        {/* Playhead */}
        {playheadX >= TRACK_HEADER_WIDTH && playheadX <= width && (
          <Line
            points={[playheadX, 0, playheadX, height]}
            stroke="#fff"
            strokeWidth={1}
            opacity={0.8}
          />
        )}
      </Layer>
    </Stage>
  );
}

export function KeyframeCurveEditor({ width, clipId, properties }: KeyframeCurveEditorProps) {
  const [expandedProperties, setExpandedProperties] = useState<Set<AnyAnimatableProperty>>(
    () => new Set(properties),
  );
  const [valueZooms, setValueZooms] = useState<Record<string, number>>({});

  const scrollX = useVideoEditorStore((s) => s.scrollX);
  const zoom = useVideoEditorStore((s) => s.zoom);
  const currentTime = useVideoEditorStore((s) => s.currentFrame);
  const clips = useVideoEditorStore((s) => s.clips);

  const clip = clips.find((c) => c.id === clipId);
  const clipStartTime = clip?.startTime ?? 0;

  const toggleProperty = (property: AnyAnimatableProperty) => {
    setExpandedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(property)) {
        next.delete(property);
      } else {
        next.add(property);
      }
      return next;
    });
  };

  if (!clip) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-900">
        <span className="text-sm text-muted-foreground">Select a clip to view keyframes</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-neutral-900">
      {properties.map((property) => {
        const config = PROPERTY_CONFIGS[property] ?? DEFAULT_PROPERTY_CONFIG;
        const isExpanded = expandedProperties.has(property);
        const keyframes = getKeyframesForProperty(clip.keyframes, property);

        return (
          <div key={property} className="border-b border-neutral-700">
            {/* Property header */}
            <button
              type="button"
              className="hover:bg-neutral-750 flex h-7 w-full items-center gap-2 bg-neutral-800 px-2 transition-colors"
              onClick={() => toggleProperty(property)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-400" />
              )}
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: config.color }} />
              <span className="text-xs font-medium text-neutral-200">
                {config.label !== "Unknown" ? config.label : property}
              </span>
              <span className="ml-auto text-xs text-neutral-500">
                {keyframes.length} keyframe{keyframes.length !== 1 ? "s" : ""}
              </span>
            </button>

            {/* Property graph */}
            {isExpanded && (
              <PropertyGraph
                property={property}
                clipId={clipId}
                width={width}
                height={GRAPH_HEIGHT}
                config={config}
                scrollX={scrollX}
                zoom={zoom}
                clipStartTime={clipStartTime}
                currentTime={currentTime}
                valueZoom={valueZooms[property] ?? 1}
                onValueZoomChange={(z) => setValueZooms((prev) => ({ ...prev, [property]: z }))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
