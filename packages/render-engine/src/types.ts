/**
 * Core types for the render engine.
 *
 * These types match the Rust types in crates/types and are serialized via serde.
 * Rust is the source of truth - keep these in sync with the Rust definitions.
 *
 * Note: We define types here rather than importing from WASM because:
 * - wasm_bindgen exports enums as numbers (0, 1, 2...)
 * - serde serializes enums as strings ("Linear", "Rectangle"...)
 * - The render pipeline uses serde-wasm-bindgen, so we need string-compatible types
 */

// ============================================================================
// Enums (as string unions to match serde serialization)
// ============================================================================

export type EasingPreset = "Linear" | "EaseIn" | "EaseOut" | "EaseInOut" | "Custom";

export type Interpolation = "Linear" | "Step" | "Bezier";

export type TransitionType =
  | "None"
  | "Fade"
  | "Dissolve"
  | "WipeLeft"
  | "WipeRight"
  | "WipeUp"
  | "WipeDown"
  | "SlideLeft"
  | "SlideRight"
  | "SlideUp"
  | "SlideDown"
  | "ZoomIn"
  | "ZoomOut"
  | "RotateCw"
  | "RotateCcw"
  | "FlipH"
  | "FlipV";

export type CrossTransitionType =
  | "Dissolve"
  | "Fade"
  | "WipeLeft"
  | "WipeRight"
  | "WipeUp"
  | "WipeDown";

export type ShapeType = "Rectangle" | "Ellipse" | "Polygon";

export type LineHeadType = "None" | "Arrow" | "Circle" | "Square" | "Diamond";

export type LineStrokeStyle = "Solid" | "Dashed" | "Dotted";

export type TextAlign = "Left" | "Center" | "Right";

export type VerticalAlign = "Top" | "Middle" | "Bottom";

// ============================================================================
// Easing & Keyframes
// ============================================================================

export interface CubicBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Easing {
  preset: EasingPreset;
  custom_bezier?: CubicBezier;
}

export interface Keyframe {
  time: number;
  value: number;
  interpolation: Interpolation;
  easing: Easing;
}

export interface KeyframeTrack {
  property: string;
  keyframes: Keyframe[];
}

export interface KeyframeTracks {
  tracks: KeyframeTrack[];
}

// ============================================================================
// Transform & Effects
// ============================================================================

export interface Transform {
  x: number;
  y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  anchor_x: number;
  anchor_y: number;
}

export interface Effects {
  opacity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue_rotate: number;
  blur: number;
}

export interface Crop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ============================================================================
// Transitions
// ============================================================================

export interface Transition {
  type: TransitionType;
  duration: number;
  easing: Easing;
}

export interface CrossTransition {
  type: CrossTransitionType;
  duration: number;
  easing: Easing;
}

export interface ActiveTransition {
  transition: Transition;
  progress: number;
}

export interface ActiveCrossTransition {
  cross_transition: CrossTransition;
  progress: number;
  is_outgoing: boolean;
}

// ============================================================================
// Text Layer
// ============================================================================

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextStyle {
  font_family: string;
  font_size: number;
  font_weight: number;
  italic: boolean;
  color: Color;
  text_align: TextAlign;
  vertical_align: VerticalAlign;
  line_height: number;
  letter_spacing: number;
  background_color?: Color;
  background_padding?: number;
  background_border_radius?: number;
}

export interface HighlightStyle {
  color?: Color;
  background_color?: Color;
  background_padding?: number;
  background_border_radius?: number;
  font_weight?: number;
  scale?: number;
}

export interface TextLayerData {
  id: string;
  text: string;
  box: TextBox;
  style: TextStyle;
  z_index: number;
  opacity: number;
  highlight_style?: HighlightStyle;
  highlighted_word_indices?: number[];
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
}

// ============================================================================
// Shape Layer
// ============================================================================

export interface ShapeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeStyle {
  fill: Color;
  stroke?: Color;
  stroke_width: number;
  corner_radius: number;
  sides?: number;
}

export interface ShapeLayerData {
  id: string;
  shape: ShapeType;
  box: ShapeBox;
  style: ShapeStyle;
  z_index: number;
  opacity: number;
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
}

// ============================================================================
// Line Layer
// ============================================================================

export interface LineBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LineEndpoint {
  type: LineHeadType;
  size: number;
}

export interface LineStyle {
  stroke: Color;
  stroke_width: number;
  stroke_style: LineStrokeStyle;
  start_head: LineEndpoint;
  end_head: LineEndpoint;
}

export interface LineLayerData {
  id: string;
  box: LineBox;
  style: LineStyle;
  z_index: number;
  opacity: number;
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
}

// ============================================================================
// Media Layer
// ============================================================================

export interface MediaLayerData {
  texture_id: string;
  transform: Transform;
  effects: Effects;
  z_index: number;
  crop?: Crop;
  transition_in?: ActiveTransition;
  transition_out?: ActiveTransition;
  cross_transition?: ActiveCrossTransition;
}

// ============================================================================
// Render Frame
// ============================================================================

export interface RenderFrame {
  media_layers: MediaLayerData[];
  text_layers: TextLayerData[];
  shape_layers: ShapeLayerData[];
  line_layers: LineLayerData[];
  timeline_time: number;
  width: number;
  height: number;
}

// ============================================================================
// Type Aliases
// ============================================================================

/** RGBA color (0-1 range for each component). */
export type Color = [number, number, number, number];

/** @deprecated Use MediaLayerData instead. */
export type LayerData = MediaLayerData;

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale_x: 1,
  scale_y: 1,
  rotation: 0,
  anchor_x: 0.5,
  anchor_y: 0.5,
};

export const DEFAULT_EFFECTS: Effects = {
  opacity: 1,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue_rotate: 0,
  blur: 0,
};

export const DEFAULT_EASING: Easing = {
  preset: "Linear",
};

export const DEFAULT_TRANSITION: Transition = {
  type: "None",
  duration: 0,
  easing: DEFAULT_EASING,
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font_family: "Inter",
  font_size: 48,
  font_weight: 400,
  italic: false,
  color: [1, 1, 1, 1],
  text_align: "Center",
  vertical_align: "Middle",
  line_height: 1.2,
  letter_spacing: 0,
};

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  fill: [1, 1, 1, 1],
  stroke: undefined,
  stroke_width: 0,
  corner_radius: 0,
};

export const DEFAULT_LINE_STYLE: LineStyle = {
  stroke: [1, 1, 1, 1],
  stroke_width: 2,
  stroke_style: "Solid",
  start_head: { type: "None", size: 10 },
  end_head: { type: "None", size: 10 },
};

export const DEFAULT_LINE_ENDPOINT: LineEndpoint = {
  type: "None",
  size: 10,
};

// ============================================================================
// Animatable Property Names
// ============================================================================

export const ANIMATABLE_PROPERTIES = {
  x: "x",
  y: "y",
  scaleX: "scaleX",
  scaleY: "scaleY",
  rotation: "rotation",
  opacity: "opacity",
  brightness: "brightness",
  contrast: "contrast",
  saturation: "saturation",
  hueRotate: "hueRotate",
  blur: "blur",
  volume: "volume",
  x1: "x1",
  y1: "y1",
  x2: "x2",
  y2: "y2",
  strokeWidth: "strokeWidth",
  cornerRadius: "cornerRadius",
  width: "width",
  height: "height",
  eqLowGain: "eqLowGain",
  eqMidGain: "eqMidGain",
  eqHighGain: "eqHighGain",
  compressorThreshold: "compressorThreshold",
  noiseGateThreshold: "noiseGateThreshold",
  reverbDryWet: "reverbDryWet",
} as const;

export type AnimatableProperty = keyof typeof ANIMATABLE_PROPERTIES;
