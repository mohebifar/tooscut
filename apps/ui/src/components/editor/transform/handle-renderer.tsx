import type { DisplayBounds, HandlePosition } from "./types";
import type { LineClip } from "../../../state/video-editor-store";
import { getLineEndpointDisplayPositions } from "./bounds";
import type { MediaAsset } from "../../timeline/use-asset-store";

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 24;
const ROTATION_HANDLE_RADIUS = 5;

interface HandleRendererProps {
  bounds: DisplayBounds;
  rotation: number;
  showRotation: boolean;
  onDragStart: (e: React.MouseEvent, handle: HandlePosition) => void;
  onMoveDragStart: (e: React.MouseEvent) => void;
}

const RESIZE_HANDLES: { pos: HandlePosition; getXY: (b: DisplayBounds) => [number, number] }[] = [
  { pos: "nw", getXY: (b) => [b.x, b.y] },
  { pos: "n", getXY: (b) => [b.x + b.width / 2, b.y] },
  { pos: "ne", getXY: (b) => [b.x + b.width, b.y] },
  { pos: "e", getXY: (b) => [b.x + b.width, b.y + b.height / 2] },
  { pos: "se", getXY: (b) => [b.x + b.width, b.y + b.height] },
  { pos: "s", getXY: (b) => [b.x + b.width / 2, b.y + b.height] },
  { pos: "sw", getXY: (b) => [b.x, b.y + b.height] },
  { pos: "w", getXY: (b) => [b.x, b.y + b.height / 2] },
];

const CURSOR_MAP: Record<HandlePosition, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
  rotation: "grab",
  p1: "crosshair",
  p2: "crosshair",
};

export function HandleRenderer({
  bounds,
  rotation,
  showRotation,
  onDragStart,
  onMoveDragStart,
}: HandleRendererProps) {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return (
    <g transform={`rotate(${-rotation} ${centerX} ${centerY})`}>
      {/* Bounding box rectangle */}
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="transparent"
        stroke="#8b5cf6"
        strokeWidth={1.5}
        cursor="move"
        onMouseDown={onMoveDragStart}
      />

      {/* Resize handles */}
      {RESIZE_HANDLES.map(({ pos, getXY }) => {
        const [hx, hy] = getXY(bounds);
        return (
          <rect
            key={pos}
            x={hx - HANDLE_SIZE / 2}
            y={hy - HANDLE_SIZE / 2}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="white"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            cursor={CURSOR_MAP[pos]}
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragStart(e, pos);
            }}
          />
        );
      })}

      {/* Rotation handle */}
      {showRotation && (
        <>
          {/* Line from top-center to rotation handle */}
          <line
            x1={centerX}
            y1={bounds.y}
            x2={centerX}
            y2={bounds.y - ROTATION_HANDLE_OFFSET}
            stroke="#8b5cf6"
            strokeWidth={1}
            pointerEvents="none"
          />
          <circle
            cx={centerX}
            cy={bounds.y - ROTATION_HANDLE_OFFSET}
            r={ROTATION_HANDLE_RADIUS}
            fill="white"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            cursor="grab"
            onMouseDown={(e) => {
              e.stopPropagation();
              onDragStart(e, "rotation");
            }}
          />
        </>
      )}
    </g>
  );
}

// ============================================================================
// Line Handle Renderer
// ============================================================================

const LINE_ENDPOINT_RADIUS = 6;
const LINE_HIT_WIDTH = 12;

interface LineHandleRendererProps {
  clip: LineClip;
  displayScale: number;
  settings: { width: number; height: number };
  currentTime?: number;
  onEndpointDragStart: (e: React.MouseEvent, handle: HandlePosition) => void;
  onMoveDragStart: (e: React.MouseEvent) => void;
}

export function LineHandleRenderer({
  clip,
  displayScale,
  settings,
  currentTime,
  onEndpointDragStart,
  onMoveDragStart,
}: LineHandleRendererProps) {
  const ctx = { displayScale, settings, assetMap: new Map<string, MediaAsset>() };
  const { p1, p2 } = getLineEndpointDisplayPositions(clip, ctx, currentTime);

  return (
    <g>
      {/* Invisible thick line for move drag target */}
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="transparent"
        strokeWidth={LINE_HIT_WIDTH}
        cursor="move"
        onMouseDown={onMoveDragStart}
      />

      {/* Visible line */}
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="#8b5cf6"
        strokeWidth={1.5}
        pointerEvents="none"
      />

      {/* P1 endpoint handle */}
      <circle
        cx={p1.x}
        cy={p1.y}
        r={LINE_ENDPOINT_RADIUS}
        fill="white"
        stroke="#8b5cf6"
        strokeWidth={1.5}
        cursor="crosshair"
        onMouseDown={(e) => {
          e.stopPropagation();
          onEndpointDragStart(e, "p1");
        }}
      />

      {/* P2 endpoint handle */}
      <circle
        cx={p2.x}
        cy={p2.y}
        r={LINE_ENDPOINT_RADIUS}
        fill="white"
        stroke="#8b5cf6"
        strokeWidth={1.5}
        cursor="crosshair"
        onMouseDown={(e) => {
          e.stopPropagation();
          onEndpointDragStart(e, "p2");
        }}
      />
    </g>
  );
}
