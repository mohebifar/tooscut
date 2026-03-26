import type { Transform } from "@tooscut/render-engine";

import type { EditorClip } from "../../../state/video-editor-store";

export type HandlePosition =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "rotation"
  | "p1"
  | "p2";

export interface DragState {
  dragType: "move" | "resize" | "rotate";
  handle?: HandlePosition;
  /** clientX at mousedown */
  startX: number;
  /** clientY at mousedown */
  startY: number;
  /** Evaluated transform at drag start (merged base + keyframed) */
  startTransform: Partial<Transform>;
  /** Display-space bounding box at drag start */
  startBox: { x: number; y: number; width: number; height: number };
  /** Rotation angle (radians) from center to mouse at drag start */
  startAngle: number;
  /** Original rotation value at drag start */
  startRotation: number;
  clipId: string;
  clipType: EditorClip["type"];
  /** For text/shape: starting box values (percentage) */
  startPercentageBox?: { x: number; y: number; width: number; height: number };
  /** For line: starting line box values (percentage) */
  startLineBox?: { x1: number; y1: number; x2: number; y2: number };
}

export interface SnapGuide {
  type: "vertical" | "horizontal";
  /** Position in display coordinates */
  position: number;
}

export interface SnapTarget {
  value: number;
  axis: "x" | "y";
  source: string;
}

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
