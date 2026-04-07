//! GPU uniform buffer structures for color grading.
//!
//! These structs are laid out for direct upload to GPU uniform buffers.
//! They must be 16-byte aligned and use repr(C) for binary compatibility.

use bytemuck::{Pod, Zeroable};
use tooscut_types::{ColorGrading, ColorGradingNode, PrimaryCorrection};

/// Primary color correction uniforms for the GPU shader.
///
/// This struct is 128 bytes, aligned to 16 bytes for WebGPU requirements.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct PrimaryCorrectionUniforms {
    // CDL parameters (48 bytes)
    /// Slope (gain) per RGB channel + padding.
    pub slope: [f32; 4], // 16 bytes
    /// Offset (lift) per RGB channel + padding.
    pub offset: [f32; 4], // 16 bytes
    /// Power (gamma) per RGB channel + padding.
    pub power: [f32; 4], // 16 bytes

    // Basic adjustments (16 bytes)
    /// Global saturation multiplier.
    pub saturation: f32,
    /// Exposure in EV stops.
    pub exposure: f32,
    /// Temperature offset.
    pub temperature: f32,
    /// Tint adjustment.
    pub tint: f32,

    // Additional controls (16 bytes)
    /// Highlight recovery.
    pub highlights: f32,
    /// Shadow adjustment.
    pub shadows: f32,
    /// Mix with original (0.0 = bypass, 1.0 = full effect).
    pub mix: f32,
    /// Padding.
    pub _pad0: f32,

    // Padding to reach 128 bytes (12 floats = 48 bytes)
    // 80 bytes used above, 48 bytes padding = 128 total
    pub _pad1: [f32; 12],
}

impl Default for PrimaryCorrectionUniforms {
    fn default() -> Self {
        Self {
            slope: [1.0, 1.0, 1.0, 1.0],
            offset: [0.0, 0.0, 0.0, 0.0],
            power: [1.0, 1.0, 1.0, 1.0],
            saturation: 1.0,
            exposure: 0.0,
            temperature: 0.0,
            tint: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            mix: 1.0,
            _pad0: 0.0,
            _pad1: [0.0; 12],
        }
    }
}

impl PrimaryCorrectionUniforms {
    /// Create uniforms from a PrimaryCorrection.
    pub fn from_correction(correction: &PrimaryCorrection, mix: f32) -> Self {
        Self {
            slope: [correction.slope[0], correction.slope[1], correction.slope[2], 1.0],
            offset: [correction.offset[0], correction.offset[1], correction.offset[2], 0.0],
            power: [correction.power[0], correction.power[1], correction.power[2], 1.0],
            saturation: correction.saturation,
            exposure: correction.exposure,
            temperature: correction.temperature,
            tint: correction.tint,
            highlights: correction.highlights,
            shadows: correction.shadows,
            mix,
            _pad0: 0.0,
            _pad1: [0.0; 12],
        }
    }
}

/// Color wheels uniforms for the GPU shader.
///
/// This struct is 128 bytes, aligned to 16 bytes for WebGPU requirements.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct ColorWheelsUniforms {
    // Lift wheel (16 bytes)
    /// Lift RGB offset.
    pub lift_rgb: [f32; 3],
    /// Lift luminance adjustment.
    pub lift_luminance: f32,

    // Gamma wheel (16 bytes)
    /// Gamma RGB offset.
    pub gamma_rgb: [f32; 3],
    /// Gamma luminance adjustment.
    pub gamma_luminance: f32,

    // Gain wheel (16 bytes)
    /// Gain RGB offset.
    pub gain_rgb: [f32; 3],
    /// Gain luminance adjustment.
    pub gain_luminance: f32,

    // Mix (16 bytes)
    /// Mix with original.
    pub mix: f32,
    /// Padding.
    pub _pad: [f32; 3],

    // 64 bytes, need 64 more for 128 bytes
    pub _pad2: [f32; 16],
}

impl Default for ColorWheelsUniforms {
    fn default() -> Self {
        Self {
            lift_rgb: [0.0, 0.0, 0.0],
            lift_luminance: 0.0,
            gamma_rgb: [0.0, 0.0, 0.0],
            gamma_luminance: 0.0,
            gain_rgb: [0.0, 0.0, 0.0],
            gain_luminance: 0.0,
            mix: 1.0,
            _pad: [0.0; 3],
            _pad2: [0.0; 16],
        }
    }
}

impl ColorWheelsUniforms {
    /// Create uniforms from ColorWheels.
    pub fn from_wheels(wheels: &tooscut_types::ColorWheels, mix: f32) -> Self {
        let lift_rgb = wheels.lift.to_rgb();
        let gamma_rgb = wheels.gamma.to_rgb();
        let gain_rgb = wheels.gain.to_rgb();

        Self {
            lift_rgb,
            lift_luminance: wheels.lift_luminance,
            gamma_rgb,
            gamma_luminance: wheels.gamma_luminance,
            gain_rgb,
            gain_luminance: wheels.gain_luminance,
            mix,
            _pad: [0.0; 3],
            _pad2: [0.0; 16],
        }
    }
}

/// HSL qualifier uniforms for the GPU shader.
///
/// This struct is 128 bytes, aligned to 16 bytes for WebGPU requirements.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct HslQualifierUniforms {
    // Center values (16 bytes)
    /// Hue center (0-1, representing 0-360 degrees).
    pub hue_center: f32,
    /// Saturation center (0-1).
    pub saturation_center: f32,
    /// Luminance center (0-1).
    pub luminance_center: f32,
    /// Padding.
    pub _pad0: f32,

    // Width values (16 bytes)
    /// Hue width (0-0.5, representing 0-180 degrees).
    pub hue_width: f32,
    /// Saturation width (0-1).
    pub saturation_width: f32,
    /// Luminance width (0-1).
    pub luminance_width: f32,
    /// Padding.
    pub _pad1: f32,

    // Softness values (16 bytes)
    /// Hue softness (0-1).
    pub hue_softness: f32,
    /// Saturation softness (0-1).
    pub saturation_softness: f32,
    /// Luminance softness (0-1).
    pub luminance_softness: f32,
    /// Padding.
    pub _pad2: f32,

    // Flags and mix (16 bytes)
    /// Invert flag (0 or 1).
    pub invert: u32,
    /// Mix with original.
    pub mix: f32,
    /// Padding.
    pub _pad3: [f32; 2],

    // 64 bytes, need 64 more for 128 bytes
    pub _pad4: [f32; 16],
}

impl Default for HslQualifierUniforms {
    fn default() -> Self {
        Self {
            hue_center: 0.0,
            saturation_center: 0.5,
            luminance_center: 0.5,
            _pad0: 0.0,
            hue_width: 30.0 / 360.0,
            saturation_width: 0.5,
            luminance_width: 0.5,
            _pad1: 0.0,
            hue_softness: 0.1,
            saturation_softness: 0.1,
            luminance_softness: 0.1,
            _pad2: 0.0,
            invert: 0,
            mix: 1.0,
            _pad3: [0.0; 2],
            _pad4: [0.0; 16],
        }
    }
}

impl HslQualifierUniforms {
    /// Create uniforms from HslQualifier.
    pub fn from_qualifier(qualifier: &tooscut_types::HslQualifier, mix: f32) -> Self {
        Self {
            hue_center: qualifier.hue_center / 360.0,
            saturation_center: qualifier.saturation_center,
            luminance_center: qualifier.luminance_center,
            _pad0: 0.0,
            hue_width: qualifier.hue_width / 360.0,
            saturation_width: qualifier.saturation_width,
            luminance_width: qualifier.luminance_width,
            _pad1: 0.0,
            hue_softness: qualifier.hue_softness,
            saturation_softness: qualifier.saturation_softness,
            luminance_softness: qualifier.luminance_softness,
            _pad2: 0.0,
            invert: if qualifier.invert { 1 } else { 0 },
            mix,
            _pad3: [0.0; 2],
            _pad4: [0.0; 16],
        }
    }
}

/// Combined color grading uniforms for a single-pass shader.
///
/// This struct contains all color grading parameters for efficient GPU transfer.
/// It's 256 bytes total, allowing a complete color grade in one uniform buffer.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct ColorGradingUniforms {
    // Primary correction (64 bytes)
    /// CDL slope per RGB channel.
    pub slope: [f32; 4], // 16 bytes
    /// CDL offset per RGB channel.
    pub offset: [f32; 4], // 16 bytes
    /// CDL power per RGB channel.
    pub power: [f32; 4], // 16 bytes
    /// Saturation, exposure, temperature, tint.
    pub adjustments: [f32; 4], // 16 bytes

    // Color wheels (48 bytes)
    /// Lift RGB + luminance.
    pub lift: [f32; 4], // 16 bytes
    /// Gamma RGB + luminance.
    pub gamma: [f32; 4], // 16 bytes
    /// Gain RGB + luminance.
    pub gain: [f32; 4], // 16 bytes

    // HSL qualifier (48 bytes)
    /// Qualifier center (hue, sat, lum, pad).
    pub qualifier_center: [f32; 4], // 16 bytes
    /// Qualifier width (hue, sat, lum, pad).
    pub qualifier_width: [f32; 4], // 16 bytes
    /// Qualifier softness (hue, sat, lum, invert flag as f32).
    pub qualifier_softness: [f32; 4], // 16 bytes

    // Flags and settings (32 bytes)
    /// Flags: bit 0 = bypass, bit 1 = primary enabled, bit 2 = wheels enabled,
    /// bit 3 = curves enabled, bit 4 = LUT enabled, bit 5 = qualifier enabled.
    pub flags: u32,
    /// Primary correction mix.
    pub primary_mix: f32,
    /// Color wheels mix.
    pub wheels_mix: f32,
    /// LUT mix.
    pub lut_mix: f32,
    /// Qualifier mix.
    pub qualifier_mix: f32,
    /// Highlights adjustment.
    pub highlights: f32,
    /// Shadows adjustment.
    pub shadows: f32,
    /// LUT size (cube dimension, e.g., 33).
    pub lut_size: f32,

    /// Input color space transform (ColorSpace enum as u32, 0 = sRGB).
    pub input_cst: u32,
    /// Output color space transform (ColorSpace enum as u32, 0 = sRGB).
    pub output_cst: u32,
    /// Padding to maintain vec4 alignment.
    pub _pad_align: [f32; 2],

    // === Qualifier correction CDL (applied within qualified region) ===
    /// Qualifier correction slope.
    pub q_slope: [f32; 4], // 16 bytes
    /// Qualifier correction offset.
    pub q_offset: [f32; 4], // 16 bytes
    /// Qualifier correction power.
    pub q_power: [f32; 4], // 16 bytes
    /// Qualifier correction adjustments: sat, exposure, temperature, tint.
    pub q_adjustments: [f32; 4], // 16 bytes

    // === Power window params ===
    /// Window center (x, y) and scale (x, y).
    pub window_center_scale: [f32; 4], // 16 bytes
    /// Window shape params: (radius_x/width, radius_y/height, corner_radius/angle, shape_type).
    pub window_shape: [f32; 4], // 16 bytes
    /// Window: rotation, softness_inner, softness_outer, invert.
    pub window_params: [f32; 4], // 16 bytes
    /// Window correction slope.
    pub w_slope: [f32; 4], // 16 bytes
    /// Window correction offset.
    pub w_offset: [f32; 4], // 16 bytes
    /// Window correction power.
    pub w_power: [f32; 4], // 16 bytes
    /// Window correction adjustments: sat, exposure, temperature, tint.
    pub w_adjustments: [f32; 4], // 16 bytes
    /// Window mix + pad.
    pub window_mix: [f32; 4], // 16 bytes

    // Padding to 512 bytes (400 used, 112 remaining = 28 floats)
    pub _pad: [f32; 28],
}

impl Default for ColorGradingUniforms {
    fn default() -> Self {
        Self {
            slope: [1.0, 1.0, 1.0, 1.0],
            offset: [0.0, 0.0, 0.0, 0.0],
            power: [1.0, 1.0, 1.0, 1.0],
            adjustments: [1.0, 0.0, 0.0, 0.0], // sat, exp, temp, tint
            lift: [0.0, 0.0, 0.0, 0.0],
            gamma: [0.0, 0.0, 0.0, 0.0],
            gain: [0.0, 0.0, 0.0, 0.0],
            qualifier_center: [0.0, 0.5, 0.5, 0.0],
            qualifier_width: [30.0 / 360.0, 0.5, 0.5, 0.0],
            qualifier_softness: [0.1, 0.1, 0.1, 0.0],
            flags: 0,
            primary_mix: 1.0,
            wheels_mix: 1.0,
            lut_mix: 1.0,
            qualifier_mix: 1.0,
            highlights: 0.0,
            shadows: 0.0,
            lut_size: 33.0,
            input_cst: 0,
            output_cst: 0,
            _pad_align: [0.0; 2],
            // Qualifier correction
            q_slope: [1.0, 1.0, 1.0, 1.0],
            q_offset: [0.0, 0.0, 0.0, 0.0],
            q_power: [1.0, 1.0, 1.0, 1.0],
            q_adjustments: [1.0, 0.0, 0.0, 0.0],
            // Power window
            window_center_scale: [0.5, 0.5, 1.0, 1.0],
            window_shape: [0.25, 0.25, 0.0, 0.0], // circle default
            window_params: [0.0, 0.0, 0.1, 0.0], // rotation, softness_inner, softness_outer, invert
            w_slope: [1.0, 1.0, 1.0, 1.0],
            w_offset: [0.0, 0.0, 0.0, 0.0],
            w_power: [1.0, 1.0, 1.0, 1.0],
            w_adjustments: [1.0, 0.0, 0.0, 0.0],
            window_mix: [1.0, 0.0, 0.0, 0.0],
            _pad: [0.0; 28],
        }
    }
}

// Flag bit constants
pub const FLAG_BYPASS: u32 = 1 << 0;
pub const FLAG_PRIMARY_ENABLED: u32 = 1 << 1;
pub const FLAG_WHEELS_ENABLED: u32 = 1 << 2;
pub const FLAG_CURVES_ENABLED: u32 = 1 << 3;
pub const FLAG_LUT_ENABLED: u32 = 1 << 4;
pub const FLAG_QUALIFIER_ENABLED: u32 = 1 << 5;
pub const FLAG_WINDOW_ENABLED: u32 = 1 << 6;
pub const FLAG_INPUT_CST: u32 = 1 << 7;
pub const FLAG_OUTPUT_CST: u32 = 1 << 8;

/// Convert ColorSpace enum to u32 for shader.
fn color_space_to_u32(cs: &tooscut_types::ColorSpace) -> u32 {
    use tooscut_types::ColorSpace;
    match cs {
        ColorSpace::Srgb => 0,
        ColorSpace::Linear => 1,
        ColorSpace::AcesCg => 2,
        ColorSpace::LogC => 3,
        ColorSpace::SLog2 => 4,
        ColorSpace::SLog3 => 5,
        ColorSpace::CLog3 => 6,
        ColorSpace::VLog => 7,
        ColorSpace::BmFilm => 8,
        ColorSpace::RedLog3G10 => 9,
    }
}

impl ColorGradingUniforms {
    /// Create uniforms from a ColorGrading configuration.
    ///
    /// This extracts the first node of each type and combines them into
    /// a single uniform buffer for efficient GPU transfer.
    pub fn from_color_grading(grading: &ColorGrading) -> Self {
        let mut uniforms = Self::default();

        if grading.bypass {
            uniforms.flags |= FLAG_BYPASS;
            return uniforms;
        }

        // Scan for CST nodes: first enabled CST → input, last enabled CST → output
        let mut first_cst: Option<(tooscut_types::ColorSpace, tooscut_types::ColorSpace)> = None;
        let mut last_cst: Option<(tooscut_types::ColorSpace, tooscut_types::ColorSpace)> = None;
        for node in &grading.nodes {
            if let ColorGradingNode::ColorSpaceTransform {
                enabled: true,
                from_space,
                to_space,
                ..
            } = node
            {
                if first_cst.is_none() {
                    first_cst = Some((from_space.clone(), to_space.clone()));
                }
                last_cst = Some((from_space.clone(), to_space.clone()));
            }
        }

        // First CST node: use from_space as input CST (convert from source to linear)
        if let Some((from_space, _)) = &first_cst {
            if *from_space != tooscut_types::ColorSpace::Srgb {
                uniforms.flags |= FLAG_INPUT_CST;
                uniforms.input_cst = color_space_to_u32(from_space);
            }
        }
        // Last CST node: use to_space as output CST (convert from linear to target)
        if let Some((_, to_space)) = &last_cst {
            if *to_space != tooscut_types::ColorSpace::Srgb {
                uniforms.flags |= FLAG_OUTPUT_CST;
                uniforms.output_cst = color_space_to_u32(to_space);
            }
        }

        for node in &grading.nodes {
            if !node.is_enabled() {
                continue;
            }

            match node {
                ColorGradingNode::Primary {
                    correction, mix, ..
                } => {
                    uniforms.flags |= FLAG_PRIMARY_ENABLED;
                    uniforms.slope = [correction.slope[0], correction.slope[1], correction.slope[2], 1.0];
                    uniforms.offset = [correction.offset[0], correction.offset[1], correction.offset[2], 0.0];
                    uniforms.power = [correction.power[0], correction.power[1], correction.power[2], 1.0];
                    uniforms.adjustments = [
                        correction.saturation,
                        correction.exposure,
                        correction.temperature,
                        correction.tint,
                    ];
                    uniforms.highlights = correction.highlights;
                    uniforms.shadows = correction.shadows;
                    uniforms.primary_mix = *mix;
                }
                ColorGradingNode::ColorWheels { wheels, mix, .. } => {
                    uniforms.flags |= FLAG_WHEELS_ENABLED;
                    let lift_rgb = wheels.lift.to_rgb();
                    let gamma_rgb = wheels.gamma.to_rgb();
                    let gain_rgb = wheels.gain.to_rgb();
                    uniforms.lift = [lift_rgb[0], lift_rgb[1], lift_rgb[2], wheels.lift_luminance];
                    uniforms.gamma = [gamma_rgb[0], gamma_rgb[1], gamma_rgb[2], wheels.gamma_luminance];
                    uniforms.gain = [gain_rgb[0], gain_rgb[1], gain_rgb[2], wheels.gain_luminance];
                    uniforms.wheels_mix = *mix;
                }
                ColorGradingNode::Lut { lut, .. } => {
                    uniforms.flags |= FLAG_LUT_ENABLED;
                    uniforms.lut_mix = lut.mix;
                    // LUT texture binding handled separately
                }
                ColorGradingNode::Qualifier {
                    qualifier, correction, mix, ..
                } => {
                    uniforms.flags |= FLAG_QUALIFIER_ENABLED;
                    uniforms.qualifier_center = [
                        qualifier.hue_center / 360.0,
                        qualifier.saturation_center,
                        qualifier.luminance_center,
                        0.0,
                    ];
                    uniforms.qualifier_width = [
                        qualifier.hue_width / 360.0,
                        qualifier.saturation_width,
                        qualifier.luminance_width,
                        0.0,
                    ];
                    uniforms.qualifier_softness = [
                        qualifier.hue_softness,
                        qualifier.saturation_softness,
                        qualifier.luminance_softness,
                        if qualifier.invert { 1.0 } else { 0.0 },
                    ];
                    uniforms.qualifier_mix = *mix;
                    // Qualifier correction CDL
                    uniforms.q_slope = [correction.slope[0], correction.slope[1], correction.slope[2], 1.0];
                    uniforms.q_offset = [correction.offset[0], correction.offset[1], correction.offset[2], 0.0];
                    uniforms.q_power = [correction.power[0], correction.power[1], correction.power[2], 1.0];
                    uniforms.q_adjustments = [
                        correction.saturation,
                        correction.exposure,
                        correction.temperature,
                        correction.tint,
                    ];
                }
                ColorGradingNode::Window {
                    window, correction, mix, ..
                } => {
                    uniforms.flags |= FLAG_WINDOW_ENABLED;
                    uniforms.window_center_scale = [
                        window.center_x,
                        window.center_y,
                        window.scale_x,
                        window.scale_y,
                    ];
                    // Encode shape type: 0=circle, 1=rectangle, 2=gradient
                    let (p1, p2, p3, shape_type) = match &window.shape {
                        tooscut_types::PowerWindowShape::Circle { radius_x, radius_y } => {
                            (*radius_x, *radius_y, 0.0, 0.0)
                        }
                        tooscut_types::PowerWindowShape::Rectangle { width, height, corner_radius } => {
                            (*width, *height, *corner_radius, 1.0)
                        }
                        tooscut_types::PowerWindowShape::Gradient { angle } => {
                            (*angle / 360.0, 0.0, 0.0, 2.0)
                        }
                        tooscut_types::PowerWindowShape::Polygon { .. } => {
                            (0.25, 0.25, 0.0, 0.0) // fallback to circle
                        }
                    };
                    uniforms.window_shape = [p1, p2, p3, shape_type];
                    uniforms.window_params = [
                        window.rotation / 360.0,
                        window.softness_inner,
                        window.softness_outer,
                        if window.invert { 1.0 } else { 0.0 },
                    ];
                    uniforms.w_slope = [correction.slope[0], correction.slope[1], correction.slope[2], 1.0];
                    uniforms.w_offset = [correction.offset[0], correction.offset[1], correction.offset[2], 0.0];
                    uniforms.w_power = [correction.power[0], correction.power[1], correction.power[2], 1.0];
                    uniforms.w_adjustments = [
                        correction.saturation,
                        correction.exposure,
                        correction.temperature,
                        correction.tint,
                    ];
                    uniforms.window_mix = [*mix, 0.0, 0.0, 0.0];
                }
                // CST handled above in the pre-scan
                ColorGradingNode::ColorSpaceTransform { .. } => {}
                // Curves require additional texture, handled separately
                _ => {}
            }
        }

        uniforms
    }
}

/// Verify struct sizes for GPU alignment.
const _: () = assert!(std::mem::size_of::<PrimaryCorrectionUniforms>() == 128);
const _: () = assert!(std::mem::size_of::<ColorWheelsUniforms>() == 128);
const _: () = assert!(std::mem::size_of::<HslQualifierUniforms>() == 128);
const _: () = assert!(std::mem::size_of::<ColorGradingUniforms>() == 512);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uniform_sizes() {
        assert_eq!(std::mem::size_of::<PrimaryCorrectionUniforms>(), 128);
        assert_eq!(std::mem::size_of::<ColorWheelsUniforms>(), 128);
        assert_eq!(std::mem::size_of::<HslQualifierUniforms>(), 128);
        assert_eq!(std::mem::size_of::<ColorGradingUniforms>(), 512);
    }

    #[test]
    fn default_primary_correction() {
        let uniforms = PrimaryCorrectionUniforms::default();
        assert_eq!(uniforms.slope, [1.0, 1.0, 1.0, 1.0]);
        assert_eq!(uniforms.saturation, 1.0);
        assert_eq!(uniforms.exposure, 0.0);
    }

    #[test]
    fn from_color_grading_empty() {
        let grading = ColorGrading::default();
        let uniforms = ColorGradingUniforms::from_color_grading(&grading);
        assert_eq!(uniforms.flags, 0);
    }

    #[test]
    fn from_color_grading_bypass() {
        let mut grading = ColorGrading::default();
        grading.bypass = true;
        let uniforms = ColorGradingUniforms::from_color_grading(&grading);
        assert_eq!(uniforms.flags & FLAG_BYPASS, FLAG_BYPASS);
    }
}
