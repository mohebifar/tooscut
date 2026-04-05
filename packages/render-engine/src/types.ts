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
// Color Grading
// ============================================================================

export type ColorSpace =
  | "Srgb"
  | "Linear"
  | "AcesCg"
  | "LogC"
  | "SLog3"
  | "CLog3"
  | "VLog"
  | "BmFilm"
  | "RedLog3G10";

export type LutInterpolation = "Trilinear" | "Tetrahedral";

/** Primary correction using ASC-CDL model. */
export interface PrimaryCorrection {
  /** Slope (gain) per RGB channel. Default: [1, 1, 1] */
  slope: [number, number, number];
  /** Offset (lift) per RGB channel. Default: [0, 0, 0] */
  offset: [number, number, number];
  /** Power (gamma) per RGB channel. Default: [1, 1, 1] */
  power: [number, number, number];
  /** Global saturation (0 = grayscale, 1 = normal). */
  saturation: number;
  /** Exposure in EV stops (-4 to +4). */
  exposure: number;
  /** Temperature offset in Kelvin. */
  temperature: number;
  /** Tint (green-magenta). */
  tint: number;
  /** Highlight recovery (-1 to 1). */
  highlights: number;
  /** Shadow adjustment (-1 to 1). */
  shadows: number;
}

/** Color wheel value as polar coordinates. */
export interface ColorWheelValue {
  /** Hue angle (0-360 degrees). */
  angle: number;
  /** Distance from center (0-1). */
  distance: number;
}

/** Color wheels for lift/gamma/gain adjustment. */
export interface ColorWheels {
  lift: ColorWheelValue;
  gamma: ColorWheelValue;
  gain: ColorWheelValue;
  lift_luminance: number;
  gamma_luminance: number;
  gain_luminance: number;
}

/** A point on a curve. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** 1D curve defined by control points. */
export interface Curve1D {
  points: CurvePoint[];
}

/** RGB curves plus advanced curve types. */
export interface Curves {
  master: Curve1D;
  red: Curve1D;
  green: Curve1D;
  blue: Curve1D;
  hue_vs_sat?: Curve1D;
  hue_vs_hue?: Curve1D;
  hue_vs_lum?: Curve1D;
  lum_vs_sat?: Curve1D;
  sat_vs_sat?: Curve1D;
}

/** Reference to a loaded 3D LUT. */
export interface LutReference {
  lut_id: string;
  interpolation: LutInterpolation;
  mix: number;
}

/** HSL qualifier for secondary color correction. */
export interface HslQualifier {
  hue_center: number;
  saturation_center: number;
  luminance_center: number;
  hue_width: number;
  saturation_width: number;
  luminance_width: number;
  hue_softness: number;
  saturation_softness: number;
  luminance_softness: number;
  invert: boolean;
}

/** Power window shape types. */
export type PowerWindowShape =
  | { Circle: { radius_x: number; radius_y: number } }
  | { Rectangle: { width: number; height: number; corner_radius: number } }
  | { Gradient: { angle: number } }
  | { Polygon: { points: [number, number][] } };

/** Power window for regional corrections. */
export interface PowerWindow {
  shape: PowerWindowShape;
  center_x: number;
  center_y: number;
  scale_x: number;
  scale_y: number;
  rotation: number;
  softness_inner: number;
  softness_outer: number;
  invert: boolean;
}

/** Color grading node types. */
export type ColorGradingNode =
  | {
      type: "Primary";
      id: string;
      enabled: boolean;
      mix: number;
      label?: string;
      correction: PrimaryCorrection;
    }
  | {
      type: "ColorWheels";
      id: string;
      enabled: boolean;
      mix: number;
      label?: string;
      wheels: ColorWheels;
    }
  | {
      type: "Curves";
      id: string;
      enabled: boolean;
      mix: number;
      label?: string;
      curves: Curves;
    }
  | {
      type: "Lut";
      id: string;
      enabled: boolean;
      mix: number;
      label?: string;
      lut: LutReference;
    }
  | {
      type: "Qualifier";
      id: string;
      enabled: boolean;
      mix: number;
      label?: string;
      qualifier: HslQualifier;
      correction: PrimaryCorrection;
    }
  | {
      type: "Window";
      id: string;
      enabled: boolean;
      mix: number;
      label?: string;
      window: PowerWindow;
      correction: PrimaryCorrection;
    };

/** Complete color grading configuration. */
export interface ColorGrading {
  input_color_space: ColorSpace;
  output_color_space: ColorSpace;
  nodes: ColorGradingNode[];
  bypass: boolean;
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
  color_grading?: ColorGrading;
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

export const DEFAULT_PRIMARY_CORRECTION: PrimaryCorrection = {
  slope: [1, 1, 1],
  offset: [0, 0, 0],
  power: [1, 1, 1],
  saturation: 1,
  exposure: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
};

export const DEFAULT_COLOR_WHEEL_VALUE: ColorWheelValue = {
  angle: 0,
  distance: 0,
};

export const DEFAULT_COLOR_WHEELS: ColorWheels = {
  lift: DEFAULT_COLOR_WHEEL_VALUE,
  gamma: DEFAULT_COLOR_WHEEL_VALUE,
  gain: DEFAULT_COLOR_WHEEL_VALUE,
  lift_luminance: 0,
  gamma_luminance: 0,
  gain_luminance: 0,
};

export const DEFAULT_CURVE_1D: Curve1D = {
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
};

export const DEFAULT_CURVES: Curves = {
  master: DEFAULT_CURVE_1D,
  red: DEFAULT_CURVE_1D,
  green: DEFAULT_CURVE_1D,
  blue: DEFAULT_CURVE_1D,
};

export const DEFAULT_HSL_QUALIFIER: HslQualifier = {
  hue_center: 0,
  saturation_center: 0.5,
  luminance_center: 0.5,
  hue_width: 30,
  saturation_width: 0.5,
  luminance_width: 0.5,
  hue_softness: 0.1,
  saturation_softness: 0.1,
  luminance_softness: 0.1,
  invert: false,
};

export const DEFAULT_COLOR_GRADING: ColorGrading = {
  input_color_space: "Srgb",
  output_color_space: "Srgb",
  nodes: [],
  bypass: false,
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

/** Color grading animatable properties (for keyframe animation). */
export const COLOR_GRADING_ANIMATABLE_PROPERTIES = {
  // CDL
  cgSlopeR: "cgSlopeR",
  cgSlopeG: "cgSlopeG",
  cgSlopeB: "cgSlopeB",
  cgOffsetR: "cgOffsetR",
  cgOffsetG: "cgOffsetG",
  cgOffsetB: "cgOffsetB",
  cgPowerR: "cgPowerR",
  cgPowerG: "cgPowerG",
  cgPowerB: "cgPowerB",
  cgSaturation: "cgSaturation",
  cgExposure: "cgExposure",
  cgTemperature: "cgTemperature",
  cgTint: "cgTint",
  cgHighlights: "cgHighlights",
  cgShadows: "cgShadows",
  // Color wheels
  cgLiftAngle: "cgLiftAngle",
  cgLiftDistance: "cgLiftDistance",
  cgLiftLuminance: "cgLiftLuminance",
  cgGammaAngle: "cgGammaAngle",
  cgGammaDistance: "cgGammaDistance",
  cgGammaLuminance: "cgGammaLuminance",
  cgGainAngle: "cgGainAngle",
  cgGainDistance: "cgGainDistance",
  cgGainLuminance: "cgGainLuminance",
  // HSL Qualifier
  cgQualifierHueCenter: "cgQualifierHueCenter",
  cgQualifierHueWidth: "cgQualifierHueWidth",
  cgQualifierSatCenter: "cgQualifierSatCenter",
  cgQualifierSatWidth: "cgQualifierSatWidth",
  cgQualifierLumCenter: "cgQualifierLumCenter",
  cgQualifierLumWidth: "cgQualifierLumWidth",
  // Power window
  cgWindowCenterX: "cgWindowCenterX",
  cgWindowCenterY: "cgWindowCenterY",
  cgWindowScaleX: "cgWindowScaleX",
  cgWindowScaleY: "cgWindowScaleY",
  cgWindowRotation: "cgWindowRotation",
  cgWindowSoftness: "cgWindowSoftness",
} as const;

export type ColorGradingAnimatableProperty = keyof typeof COLOR_GRADING_ANIMATABLE_PROPERTIES;

export type AnimatableProperty = keyof typeof ANIMATABLE_PROPERTIES;

/** All animatable properties including color grading. */
export type AnyAnimatableProperty = AnimatableProperty | ColorGradingAnimatableProperty;

// ============================================================================
// Frame Rate
// ============================================================================

/**
 * Rational frame rate representation.
 *
 * Uses numerator/denominator to exactly represent rates like 29.97fps (30000/1001)
 * without floating-point error.
 */
export interface FrameRate {
  numerator: number;
  denominator: number;
}

/**
 * Standard frame rate presets.
 */
export const FRAME_RATE_PRESETS = {
  "23.976": { numerator: 24000, denominator: 1001 },
  "24": { numerator: 24, denominator: 1 },
  "25": { numerator: 25, denominator: 1 },
  "29.97": { numerator: 30000, denominator: 1001 },
  "30": { numerator: 30, denominator: 1 },
  "50": { numerator: 50, denominator: 1 },
  "59.94": { numerator: 60000, denominator: 1001 },
  "60": { numerator: 60, denominator: 1 },
} as const satisfies Record<string, FrameRate>;

/**
 * Convert a frame count to seconds using a rational frame rate.
 */
export function framesToSeconds(frames: number, fps: FrameRate): number {
  return (frames * fps.denominator) / fps.numerator;
}

/**
 * Convert seconds to a frame count using a rational frame rate.
 * Rounds to the nearest frame.
 */
export function secondsToFrames(seconds: number, fps: FrameRate): number {
  return Math.round((seconds * fps.numerator) / fps.denominator);
}

/**
 * Get the frame rate as a floating-point number (e.g., 29.97).
 */
export function frameRateToFloat(fps: FrameRate): number {
  return fps.numerator / fps.denominator;
}
