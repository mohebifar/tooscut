//! Color grading types for professional color correction.
//!
//! This module provides types for a node-based color grading pipeline
//! with support for:
//! - Primary correction (CDL-based)
//! - Color wheels (lift/gamma/gain)
//! - Curves (RGB and advanced)
//! - 3D LUT application
//! - HSL qualifier (secondary correction)
//! - Power windows (regional masks)

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

// ============================================================================
// Color Spaces
// ============================================================================

/// Color space for processing.
///
/// All internal processing happens in linear space with appropriate
/// conversions at input/output boundaries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Tsify, Default)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ColorSpace {
    /// Standard sRGB with gamma encoding.
    #[default]
    Srgb,
    /// Linear RGB (no gamma).
    Linear,
    /// ACES color encoding (AP1 primaries).
    AcesCg,
    /// ARRI Log C (wide dynamic range).
    LogC,
    /// Sony S-Log2.
    SLog2,
    /// Sony S-Log3.
    SLog3,
    /// Canon Log 3.
    CLog3,
    /// Panasonic V-Log.
    VLog,
    /// Blackmagic Film Gen 5.
    BmFilm,
    /// RED Log3G10.
    RedLog3G10,
}

// ============================================================================
// Tone Mapping
// ============================================================================

/// Tone mapping method for dynamic range compression.
///
/// When converting from wide-DR log footage to a display-referred space,
/// tone mapping smoothly compresses highlights to avoid hard clipping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Tsify, Default)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum ToneMapping {
    /// No tone mapping — 1:1 linear mapping, highlights clip at 1.0.
    #[default]
    None,
    /// Simple luminance-preserving highlight compression.
    /// Smoothly rolls off values above the shoulder threshold.
    Simple,
}

// ============================================================================
// Color Gamuts (Primaries)
// ============================================================================

/// Color gamut (primary) for gamut mapping.
///
/// Separate from the transfer function (ColorSpace). When source footage
/// uses wide-gamut primaries (e.g. S-Gamut), converting the gamut to
/// Rec.709 is necessary in addition to the transfer function conversion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Tsify, Default)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum Gamut {
    /// Rec.709 / sRGB primaries (default display gamut).
    #[default]
    Rec709,
    /// Sony S-Gamut (used with S-Log2/S-Log3).
    SGamut,
    /// Sony S-Gamut3 (improved S-Gamut).
    SGamut3,
    /// Sony S-Gamut3.Cine (cinema-optimized, closer to DCI-P3).
    SGamut3Cine,
    /// ARRI Wide Gamut (ALEXA Wide Gamut 3, used with LogC).
    ArriWideGamut,
    /// ACES AP1 primaries (ACEScg).
    AcesCgAp1,
    /// RED Wide Gamut RGB.
    RedWideGamut,
    /// DCI-P3 (D65 white point variant).
    DciP3,
    /// Rec.2020 / BT.2020 (UHDTV).
    Rec2020,
    /// Panasonic V-Gamut.
    VGamut,
    /// Blackmagic Design Wide Gamut (Gen 5).
    BmdWideGamut,
}

// ============================================================================
// Primary Correction (CDL)
// ============================================================================

/// Primary color correction using ASC-CDL (Color Decision List) model.
///
/// The CDL formula is: `output = (input * slope + offset) ^ power`
///
/// This is compatible with industry-standard CDL interchange formats.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PrimaryCorrection {
    /// Slope (gain) per channel - multiplier applied before offset.
    /// Default: [1.0, 1.0, 1.0]
    pub slope: [f32; 3],

    /// Offset (lift) per channel - added after slope multiplication.
    /// Default: [0.0, 0.0, 0.0]
    pub offset: [f32; 3],

    /// Power (gamma) per channel - applied after slope and offset.
    /// Default: [1.0, 1.0, 1.0]
    pub power: [f32; 3],

    /// Global saturation multiplier.
    /// 0.0 = grayscale, 1.0 = normal, 2.0 = double saturation.
    pub saturation: f32,

    /// Exposure adjustment in EV stops (-4.0 to +4.0).
    pub exposure: f32,

    /// Color temperature offset in Kelvin.
    /// Positive = warmer (yellow), negative = cooler (blue).
    pub temperature: f32,

    /// Tint adjustment (green-magenta axis).
    /// Positive = magenta, negative = green.
    pub tint: f32,

    /// Highlight recovery (-1.0 to 1.0).
    /// Positive compresses highlights, negative expands.
    pub highlights: f32,

    /// Shadow adjustment (-1.0 to 1.0).
    /// Positive lifts shadows, negative crushes.
    pub shadows: f32,
}

impl Default for PrimaryCorrection {
    fn default() -> Self {
        Self {
            slope: [1.0, 1.0, 1.0],
            offset: [0.0, 0.0, 0.0],
            power: [1.0, 1.0, 1.0],
            saturation: 1.0,
            exposure: 0.0,
            temperature: 0.0,
            tint: 0.0,
            highlights: 0.0,
            shadows: 0.0,
        }
    }
}

impl PrimaryCorrection {
    /// Check if this correction is at default (no-op) values.
    pub fn is_default(&self) -> bool {
        const E: f32 = 1e-6;
        (self.slope[0] - 1.0).abs() < E
            && (self.slope[1] - 1.0).abs() < E
            && (self.slope[2] - 1.0).abs() < E
            && self.offset[0].abs() < E
            && self.offset[1].abs() < E
            && self.offset[2].abs() < E
            && (self.power[0] - 1.0).abs() < E
            && (self.power[1] - 1.0).abs() < E
            && (self.power[2] - 1.0).abs() < E
            && (self.saturation - 1.0).abs() < E
            && self.exposure.abs() < E
            && self.temperature.abs() < E
            && self.tint.abs() < E
            && self.highlights.abs() < E
            && self.shadows.abs() < E
    }
}

// ============================================================================
// Color Wheels
// ============================================================================

/// A color wheel value represented as polar coordinates.
///
/// Used for lift/gamma/gain color adjustments.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ColorWheelValue {
    /// Hue angle in degrees (0-360).
    pub angle: f32,
    /// Distance from center (0.0-1.0), representing color intensity.
    pub distance: f32,
}

impl Default for ColorWheelValue {
    fn default() -> Self {
        Self {
            angle: 0.0,
            distance: 0.0,
        }
    }
}

impl ColorWheelValue {
    /// Create a new color wheel value.
    pub fn new(angle: f32, distance: f32) -> Self {
        Self { angle, distance }
    }

    /// Convert to RGB offset (for shader use).
    /// Returns values in range [-1, 1] for each channel.
    pub fn to_rgb(&self) -> [f32; 3] {
        if self.distance < 1e-6 {
            return [0.0, 0.0, 0.0];
        }

        let angle_rad = self.angle.to_radians();
        let hue = angle_rad / std::f32::consts::TAU;
        let sat = self.distance;

        // Convert HSL (with L=0.5) to RGB, then normalize to [-1, 1]
        let c = sat;
        let x = c * (1.0 - ((hue * 6.0) % 2.0 - 1.0).abs());
        let m = 0.5 - c / 2.0;

        let (r, g, b) = match (hue * 6.0) as u32 {
            0 => (c, x, 0.0),
            1 => (x, c, 0.0),
            2 => (0.0, c, x),
            3 => (0.0, x, c),
            4 => (x, 0.0, c),
            _ => (c, 0.0, x),
        };

        // Normalize from [0, 1] to [-1, 1] for use as offset
        [(r + m) * 2.0 - 1.0, (g + m) * 2.0 - 1.0, (b + m) * 2.0 - 1.0]
    }

    /// Check if this is at the center (no adjustment).
    pub fn is_centered(&self) -> bool {
        self.distance < 1e-6
    }
}

/// Color wheels for lift/gamma/gain adjustment.
///
/// - **Lift**: Adjusts shadows (dark areas)
/// - **Gamma**: Adjusts midtones
/// - **Gain**: Adjusts highlights (bright areas)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ColorWheels {
    /// Lift wheel (shadows).
    pub lift: ColorWheelValue,
    /// Gamma wheel (midtones).
    pub gamma: ColorWheelValue,
    /// Gain wheel (highlights).
    pub gain: ColorWheelValue,

    /// Lift luminance adjustment (-1.0 to 1.0).
    pub lift_luminance: f32,
    /// Gamma luminance adjustment (-1.0 to 1.0).
    pub gamma_luminance: f32,
    /// Gain luminance adjustment (-1.0 to 1.0).
    pub gain_luminance: f32,
}

impl Default for ColorWheels {
    fn default() -> Self {
        Self {
            lift: ColorWheelValue::default(),
            gamma: ColorWheelValue::default(),
            gain: ColorWheelValue::default(),
            lift_luminance: 0.0,
            gamma_luminance: 0.0,
            gain_luminance: 0.0,
        }
    }
}

impl ColorWheels {
    /// Check if all wheels are at default (no adjustment).
    pub fn is_default(&self) -> bool {
        self.lift.is_centered()
            && self.gamma.is_centered()
            && self.gain.is_centered()
            && self.lift_luminance.abs() < 1e-6
            && self.gamma_luminance.abs() < 1e-6
            && self.gain_luminance.abs() < 1e-6
    }
}

// ============================================================================
// Curves
// ============================================================================

/// A point on a curve with optional tangent handles.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct CurvePoint {
    /// Input value (0.0-1.0).
    pub x: f32,
    /// Output value (0.0-1.0).
    pub y: f32,
}

impl CurvePoint {
    /// Create a new curve point.
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    /// Create a point on the identity line (x == y).
    pub fn identity(x: f32) -> Self {
        Self { x, y: x }
    }
}

/// A 1D curve defined by control points.
///
/// Points are interpolated using monotonic cubic splines to ensure
/// smooth, well-behaved curves without overshooting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Curve1D {
    /// Control points sorted by x coordinate.
    pub points: Vec<CurvePoint>,
}

impl Default for Curve1D {
    fn default() -> Self {
        // Identity curve (diagonal line)
        Self {
            points: vec![CurvePoint::new(0.0, 0.0), CurvePoint::new(1.0, 1.0)],
        }
    }
}

impl Curve1D {
    /// Create an identity curve (no change).
    pub fn identity() -> Self {
        Self::default()
    }

    /// Create an S-curve for contrast enhancement.
    pub fn s_curve(amount: f32) -> Self {
        let mid_offset = amount * 0.15;
        Self {
            points: vec![
                CurvePoint::new(0.0, 0.0),
                CurvePoint::new(0.25, 0.25 - mid_offset),
                CurvePoint::new(0.75, 0.75 + mid_offset),
                CurvePoint::new(1.0, 1.0),
            ],
        }
    }

    /// Check if this is an identity curve.
    pub fn is_identity(&self) -> bool {
        self.points
            .iter()
            .all(|p| (p.x - p.y).abs() < 1e-6)
    }

    /// Evaluate the curve at a given input value using linear interpolation.
    /// For GPU use, curves should be baked into a 1D LUT texture.
    pub fn evaluate(&self, x: f32) -> f32 {
        if self.points.is_empty() {
            return x;
        }
        if self.points.len() == 1 {
            return self.points[0].y;
        }

        // Clamp to curve bounds
        let x = x.clamp(0.0, 1.0);

        // Find surrounding points
        let mut lower = &self.points[0];
        let mut upper = &self.points[self.points.len() - 1];

        for window in self.points.windows(2) {
            if x >= window[0].x && x <= window[1].x {
                lower = &window[0];
                upper = &window[1];
                break;
            }
        }

        // Linear interpolation between points
        if (upper.x - lower.x).abs() < 1e-6 {
            return lower.y;
        }

        let t = (x - lower.x) / (upper.x - lower.x);
        lower.y + t * (upper.y - lower.y)
    }

    /// Generate a 256-entry LUT from this curve.
    pub fn to_lut(&self) -> [f32; 256] {
        let mut lut = [0.0f32; 256];
        for (i, value) in lut.iter_mut().enumerate() {
            let x = i as f32 / 255.0;
            *value = self.evaluate(x);
        }
        lut
    }
}

/// RGB curves plus advanced curve types.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Curves {
    /// Master curve (affects all channels equally).
    pub master: Curve1D,
    /// Red channel curve.
    pub red: Curve1D,
    /// Green channel curve.
    pub green: Curve1D,
    /// Blue channel curve.
    pub blue: Curve1D,

    /// Hue vs Saturation curve (optional).
    /// X = input hue (0-1 maps to 0-360°), Y = saturation multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub hue_vs_sat: Option<Curve1D>,

    /// Hue vs Hue curve (optional).
    /// X = input hue, Y = hue rotation offset.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub hue_vs_hue: Option<Curve1D>,

    /// Hue vs Luminance curve (optional).
    /// X = input hue, Y = luminance multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub hue_vs_lum: Option<Curve1D>,

    /// Luminance vs Saturation curve (optional).
    /// X = input luminance, Y = saturation multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub lum_vs_sat: Option<Curve1D>,

    /// Saturation vs Saturation curve (optional).
    /// X = input saturation, Y = saturation multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub sat_vs_sat: Option<Curve1D>,
}

impl Default for Curves {
    fn default() -> Self {
        Self {
            master: Curve1D::identity(),
            red: Curve1D::identity(),
            green: Curve1D::identity(),
            blue: Curve1D::identity(),
            hue_vs_sat: None,
            hue_vs_hue: None,
            hue_vs_lum: None,
            lum_vs_sat: None,
            sat_vs_sat: None,
        }
    }
}

impl Curves {
    /// Check if all curves are at identity (no adjustment).
    pub fn is_identity(&self) -> bool {
        self.master.is_identity()
            && self.red.is_identity()
            && self.green.is_identity()
            && self.blue.is_identity()
            && self.hue_vs_sat.as_ref().is_none_or(|c| c.is_identity())
            && self.hue_vs_hue.as_ref().is_none_or(|c| c.is_identity())
            && self.hue_vs_lum.as_ref().is_none_or(|c| c.is_identity())
            && self.lum_vs_sat.as_ref().is_none_or(|c| c.is_identity())
            && self.sat_vs_sat.as_ref().is_none_or(|c| c.is_identity())
    }
}

// ============================================================================
// LUT (Look-Up Table)
// ============================================================================

/// Reference to a loaded 3D LUT.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LutReference {
    /// Unique ID of the loaded LUT.
    pub lut_id: String,

    /// Interpolation method.
    pub interpolation: LutInterpolation,

    /// Mix amount (0.0 = original, 1.0 = full LUT effect).
    pub mix: f32,
}

impl LutReference {
    /// Create a new LUT reference with full mix.
    pub fn new(lut_id: impl Into<String>) -> Self {
        Self {
            lut_id: lut_id.into(),
            interpolation: LutInterpolation::Tetrahedral,
            mix: 1.0,
        }
    }
}

/// LUT interpolation method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Tsify, Default)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum LutInterpolation {
    /// Trilinear interpolation (faster, lower quality).
    Trilinear,
    /// Tetrahedral interpolation (slower, higher quality).
    #[default]
    Tetrahedral,
}

// ============================================================================
// HSL Qualifier (Secondary Color Correction)
// ============================================================================

/// HSL qualifier for isolating specific colors.
///
/// Creates a mask based on hue, saturation, and luminance ranges,
/// which can then be used to apply corrections to specific color regions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct HslQualifier {
    /// Center hue (0-360 degrees).
    pub hue_center: f32,
    /// Center saturation (0.0-1.0).
    pub saturation_center: f32,
    /// Center luminance (0.0-1.0).
    pub luminance_center: f32,

    /// Hue selection width (0-180 degrees).
    pub hue_width: f32,
    /// Saturation selection width (0.0-1.0).
    pub saturation_width: f32,
    /// Luminance selection width (0.0-1.0).
    pub luminance_width: f32,

    /// Hue edge softness (0.0-1.0).
    pub hue_softness: f32,
    /// Saturation edge softness (0.0-1.0).
    pub saturation_softness: f32,
    /// Luminance edge softness (0.0-1.0).
    pub luminance_softness: f32,

    /// Invert the qualifier mask.
    pub invert: bool,
}

impl Default for HslQualifier {
    fn default() -> Self {
        Self {
            hue_center: 0.0,
            saturation_center: 0.5,
            luminance_center: 0.5,
            hue_width: 30.0,
            saturation_width: 0.5,
            luminance_width: 0.5,
            hue_softness: 0.1,
            saturation_softness: 0.1,
            luminance_softness: 0.1,
            invert: false,
        }
    }
}

// ============================================================================
// Power Window (Regional Mask)
// ============================================================================

/// Shape type for power windows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub enum PowerWindowShape {
    /// Circular/elliptical window.
    Circle {
        /// Horizontal radius (0.0-1.0, fraction of frame width).
        radius_x: f32,
        /// Vertical radius (0.0-1.0, fraction of frame height).
        radius_y: f32,
    },
    /// Rectangular window with optional corner radius.
    Rectangle {
        /// Width (0.0-1.0, fraction of frame width).
        width: f32,
        /// Height (0.0-1.0, fraction of frame height).
        height: f32,
        /// Corner radius (0.0-1.0, fraction of min dimension).
        corner_radius: f32,
    },
    /// Linear gradient.
    Gradient {
        /// Gradient angle in degrees.
        angle: f32,
    },
    /// Polygon defined by vertices.
    Polygon {
        /// Vertices as (x, y) pairs in normalized coordinates.
        points: Vec<[f32; 2]>,
    },
}

/// Power window for regional color corrections.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct PowerWindow {
    /// Window shape.
    pub shape: PowerWindowShape,

    /// Center X position (0.0-1.0, fraction of frame width).
    pub center_x: f32,
    /// Center Y position (0.0-1.0, fraction of frame height).
    pub center_y: f32,

    /// Horizontal scale multiplier.
    pub scale_x: f32,
    /// Vertical scale multiplier.
    pub scale_y: f32,

    /// Rotation in degrees.
    pub rotation: f32,

    /// Inner edge softness (0.0-1.0).
    pub softness_inner: f32,
    /// Outer edge softness (0.0-1.0).
    pub softness_outer: f32,

    /// Invert the window mask.
    pub invert: bool,
}

impl Default for PowerWindow {
    fn default() -> Self {
        Self {
            shape: PowerWindowShape::Circle {
                radius_x: 0.25,
                radius_y: 0.25,
            },
            center_x: 0.5,
            center_y: 0.5,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            softness_inner: 0.0,
            softness_outer: 0.1,
            invert: false,
        }
    }
}

// ============================================================================
// Color Grading Nodes
// ============================================================================

/// Node position in the graph editor.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct NodePosition {
    pub x: f32,
    pub y: f32,
}

/// A node in the color grading pipeline.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(tag = "type")]
pub enum ColorGradingNode {
    /// Primary color correction.
    Primary {
        /// Unique node ID.
        id: String,
        /// Whether this node is enabled.
        enabled: bool,
        /// Mix with input (0.0 = bypass, 1.0 = full effect).
        mix: f32,
        /// Optional label.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        label: Option<String>,
        /// Graph editor position.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        position: Option<NodePosition>,
        /// Correction parameters.
        correction: PrimaryCorrection,
    },

    /// Color wheels (lift/gamma/gain).
    ColorWheels {
        id: String,
        enabled: bool,
        mix: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        label: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        position: Option<NodePosition>,
        wheels: ColorWheels,
    },

    /// Curves adjustment.
    Curves {
        id: String,
        enabled: bool,
        mix: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        label: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        position: Option<NodePosition>,
        curves: Curves,
    },

    /// 3D LUT application.
    Lut {
        id: String,
        enabled: bool,
        mix: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        label: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        position: Option<NodePosition>,
        lut: LutReference,
    },

    /// HSL qualifier with correction.
    Qualifier {
        id: String,
        enabled: bool,
        mix: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        label: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        position: Option<NodePosition>,
        qualifier: HslQualifier,
        /// Correction to apply within qualified region.
        correction: PrimaryCorrection,
    },

    /// Power window with correction.
    Window {
        id: String,
        enabled: bool,
        mix: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        label: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        position: Option<NodePosition>,
        window: PowerWindow,
        /// Correction to apply within window.
        correction: PrimaryCorrection,
    },

    /// Color space transform.
    ColorSpaceTransform {
        id: String,
        enabled: bool,
        mix: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        label: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        position: Option<NodePosition>,
        /// Source transfer function (gamma curve).
        from_space: ColorSpace,
        /// Target transfer function (gamma curve).
        to_space: ColorSpace,
        /// Source gamut (color primaries). None = Rec709.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        from_gamut: Option<Gamut>,
        /// Target gamut (color primaries). None = Rec709.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        to_gamut: Option<Gamut>,
        /// Tone mapping method. None = no tone mapping.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[tsify(optional)]
        tone_mapping: Option<ToneMapping>,
    },
}

impl ColorGradingNode {
    /// Get the node ID.
    pub fn id(&self) -> &str {
        match self {
            Self::Primary { id, .. }
            | Self::ColorWheels { id, .. }
            | Self::Curves { id, .. }
            | Self::Lut { id, .. }
            | Self::Qualifier { id, .. }
            | Self::Window { id, .. }
            | Self::ColorSpaceTransform { id, .. } => id,
        }
    }

    /// Check if the node is enabled.
    pub fn is_enabled(&self) -> bool {
        match self {
            Self::Primary { enabled, .. }
            | Self::ColorWheels { enabled, .. }
            | Self::Curves { enabled, .. }
            | Self::Lut { enabled, .. }
            | Self::Qualifier { enabled, .. }
            | Self::Window { enabled, .. }
            | Self::ColorSpaceTransform { enabled, .. } => *enabled,
        }
    }

    /// Get the mix value.
    pub fn mix(&self) -> f32 {
        match self {
            Self::Primary { mix, .. }
            | Self::ColorWheels { mix, .. }
            | Self::Curves { mix, .. }
            | Self::Lut { mix, .. }
            | Self::Qualifier { mix, .. }
            | Self::Window { mix, .. }
            | Self::ColorSpaceTransform { mix, .. } => *mix,
        }
    }
}

// ============================================================================
// Complete Color Grading State
// ============================================================================

/// Complete color grading configuration for a media layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ColorGrading {
    /// Input color space (for LOG footage, etc.).
    pub input_color_space: ColorSpace,

    /// Output color space.
    pub output_color_space: ColorSpace,

    /// Node pipeline executed in order.
    pub nodes: Vec<ColorGradingNode>,

    /// Bypass all color grading.
    pub bypass: bool,
}

impl Default for ColorGrading {
    fn default() -> Self {
        Self {
            input_color_space: ColorSpace::Srgb,
            output_color_space: ColorSpace::Srgb,
            nodes: Vec::new(),
            bypass: false,
        }
    }
}

impl ColorGrading {
    /// Check if color grading has any active effect.
    pub fn has_effect(&self) -> bool {
        !self.bypass && !self.nodes.is_empty() && self.nodes.iter().any(|n| n.is_enabled())
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primary_correction_default_is_noop() {
        let correction = PrimaryCorrection::default();
        assert!(correction.is_default());
    }

    #[test]
    fn color_wheel_to_rgb_centered() {
        let wheel = ColorWheelValue::default();
        let rgb = wheel.to_rgb();
        assert!(rgb[0].abs() < 1e-6);
        assert!(rgb[1].abs() < 1e-6);
        assert!(rgb[2].abs() < 1e-6);
    }

    #[test]
    fn curve_identity_evaluation() {
        let curve = Curve1D::identity();
        assert!((curve.evaluate(0.0) - 0.0).abs() < 1e-6);
        assert!((curve.evaluate(0.5) - 0.5).abs() < 1e-6);
        assert!((curve.evaluate(1.0) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn curve_s_curve_midpoint() {
        let curve = Curve1D::s_curve(1.0);
        // S-curve should still pass through midpoint
        let mid = curve.evaluate(0.5);
        assert!((mid - 0.5).abs() < 0.1);
    }

    #[test]
    fn curve_to_lut() {
        let curve = Curve1D::identity();
        let lut = curve.to_lut();
        assert_eq!(lut.len(), 256);
        assert!((lut[0] - 0.0).abs() < 1e-6);
        assert!((lut[255] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn color_grading_node_accessors() {
        let node = ColorGradingNode::Primary {
            id: "node-1".into(),
            enabled: true,
            mix: 0.8,
            label: Some("My Grade".into()),
            correction: PrimaryCorrection::default(),
        };

        assert_eq!(node.id(), "node-1");
        assert!(node.is_enabled());
        assert!((node.mix() - 0.8).abs() < 1e-6);
    }
}
