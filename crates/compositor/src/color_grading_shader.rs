//! Color grading WGSL shader source.
//!
//! This module contains the WGSL shader code for color grading operations including:
//! - Color space conversions (sRGB ↔ Linear, Log formats)
//! - Primary correction (CDL/ASC-CDL)
//! - Color wheels (Lift/Gamma/Gain)
//! - Curves (via 1D LUT texture)
//! - 3D LUT application (tetrahedral interpolation)
//! - HSL qualifier (secondary color correction)

/// Color space conversion functions.
pub const COLOR_SPACE_FUNCTIONS: &str = r#"
// ============================================================================
// Color Space Conversions
// ============================================================================

// sRGB to Linear RGB
fn srgb_to_linear(srgb: vec3<f32>) -> vec3<f32> {
    let cutoff = vec3<f32>(0.04045);
    let linear_low = srgb / 12.92;
    let linear_high = pow((srgb + 0.055) / 1.055, vec3<f32>(2.4));
    return select(linear_low, linear_high, srgb > cutoff);
}

// Linear RGB to sRGB
fn linear_to_srgb(linear: vec3<f32>) -> vec3<f32> {
    let cutoff = vec3<f32>(0.0031308);
    let srgb_low = linear * 12.92;
    let srgb_high = 1.055 * pow(linear, vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(srgb_low, srgb_high, linear > cutoff);
}

// ARRI LogC3 to Linear (EI 800)
fn logc_to_linear(logc: vec3<f32>) -> vec3<f32> {
    let cut = 0.010591;
    let a = 5.555556;
    let b = 0.052272;
    let c = 0.247190;
    let d = 0.385537;
    let e = 5.367655;
    let f = 0.092809;

    let linear_low = (logc - d) / e;
    let linear_high = (pow(vec3<f32>(10.0), (logc - c) / a) - b) / a;
    return select(linear_low, linear_high, logc > cut);
}

// Linear to ARRI LogC3 (EI 800)
fn linear_to_logc(linear: vec3<f32>) -> vec3<f32> {
    let cut = 0.010591;
    let a = 5.555556;
    let b = 0.052272;
    let c = 0.247190;
    let d = 0.385537;
    let e = 5.367655;
    let f = 0.092809;

    let logc_low = e * linear + d;
    let logc_high = a * log(a * linear + b) / log(10.0) + c;
    return select(logc_low, logc_high, linear > vec3<f32>(cut));
}

// Sony S-Log3 to Linear
fn slog3_to_linear(slog: vec3<f32>) -> vec3<f32> {
    let a = 0.01125;
    let b = 0.18;
    let c = 0.00 + 0.01125 / 0.9;

    let linear_low = (slog - 0.030001222851889303) / 5.26;
    let linear_high = pow(vec3<f32>(10.0), (slog - 0.410557184750733) / 0.255620723362659) * (0.18 + 0.01) - 0.01;
    return select(linear_low, linear_high, slog >= vec3<f32>(0.1673609920));
}

// Linear to Sony S-Log3
fn linear_to_slog3(linear: vec3<f32>) -> vec3<f32> {
    let cut = 0.01125000;
    let slog_low = (linear * 5.26 + 0.030001222851889303);
    let slog_high = (420.0 + log((linear + 0.01) / (0.18 + 0.01)) / log(10.0) * 261.5) / 1023.0;
    return select(slog_low, slog_high, linear >= vec3<f32>(cut));
}

// RGB to HSL
fn rgb_to_hsl(rgb: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(rgb.r, rgb.g), rgb.b);
    let min_c = min(min(rgb.r, rgb.g), rgb.b);
    let delta = max_c - min_c;

    let l = (max_c + min_c) * 0.5;

    if (delta < 0.00001) {
        return vec3<f32>(0.0, 0.0, l);
    }

    let s = select(delta / (2.0 - max_c - min_c), delta / (max_c + min_c), l < 0.5);

    var h: f32;
    if (max_c == rgb.r) {
        h = (rgb.g - rgb.b) / delta + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (max_c == rgb.g) {
        h = (rgb.b - rgb.r) / delta + 2.0;
    } else {
        h = (rgb.r - rgb.g) / delta + 4.0;
    }
    h /= 6.0;

    return vec3<f32>(h, s, l);
}

// HSL to RGB helper
fn hue_to_rgb_component(p: f32, q: f32, t: f32) -> f32 {
    var t_mod = t;
    if (t_mod < 0.0) { t_mod += 1.0; }
    if (t_mod > 1.0) { t_mod -= 1.0; }
    if (t_mod < 1.0 / 6.0) { return p + (q - p) * 6.0 * t_mod; }
    if (t_mod < 0.5) { return q; }
    if (t_mod < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t_mod) * 6.0; }
    return p;
}

// HSL to RGB
fn hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
    if (hsl.y < 0.00001) {
        return vec3<f32>(hsl.z, hsl.z, hsl.z);
    }

    let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
    let p = 2.0 * hsl.z - q;

    return vec3<f32>(
        hue_to_rgb_component(p, q, hsl.x + 1.0 / 3.0),
        hue_to_rgb_component(p, q, hsl.x),
        hue_to_rgb_component(p, q, hsl.x - 1.0 / 3.0),
    );
}

// RGB to HSV
fn rgb_to_hsv(rgb: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(rgb.r, rgb.g), rgb.b);
    let min_c = min(min(rgb.r, rgb.g), rgb.b);
    let delta = max_c - min_c;

    let v = max_c;
    let s = select(0.0, delta / max_c, max_c > 0.00001);

    var h: f32 = 0.0;
    if (delta > 0.00001) {
        if (max_c == rgb.r) {
            h = (rgb.g - rgb.b) / delta + select(0.0, 6.0, rgb.g < rgb.b);
        } else if (max_c == rgb.g) {
            h = (rgb.b - rgb.r) / delta + 2.0;
        } else {
            h = (rgb.r - rgb.g) / delta + 4.0;
        }
        h /= 6.0;
    }

    return vec3<f32>(h, s, v);
}

// HSV to RGB
fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = hsv.x * 6.0;
    let s = hsv.y;
    let v = hsv.z;

    let i = floor(h);
    let f = h - i;
    let p = v * (1.0 - s);
    let q = v * (1.0 - s * f);
    let t = v * (1.0 - s * (1.0 - f));

    let i_mod = i32(i) % 6;
    if (i_mod == 0) { return vec3<f32>(v, t, p); }
    if (i_mod == 1) { return vec3<f32>(q, v, p); }
    if (i_mod == 2) { return vec3<f32>(p, v, t); }
    if (i_mod == 3) { return vec3<f32>(p, q, v); }
    if (i_mod == 4) { return vec3<f32>(t, p, v); }
    return vec3<f32>(v, p, q);
}

// Calculate luminance (Rec. 709)
fn luminance(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}
"#;

/// Primary color correction (CDL) functions.
pub const PRIMARY_CORRECTION_FUNCTIONS: &str = r#"
// ============================================================================
// Primary Color Correction (CDL)
// ============================================================================

// ASC-CDL formula: output = (input * slope + offset) ^ power
fn apply_cdl(color: vec3<f32>, slope: vec3<f32>, offset: vec3<f32>, power: vec3<f32>) -> vec3<f32> {
    return pow(max(color * slope + offset, vec3<f32>(0.0)), power);
}

// Apply saturation adjustment
fn apply_saturation(color: vec3<f32>, saturation: f32) -> vec3<f32> {
    let lum = luminance(color);
    return mix(vec3<f32>(lum), color, saturation);
}

// Apply exposure adjustment (in EV stops)
fn apply_exposure(color: vec3<f32>, exposure: f32) -> vec3<f32> {
    return color * pow(2.0, exposure);
}

// Apply color temperature adjustment (simplified Kelvin shift)
// temperature > 0 = warmer (yellow/red), temperature < 0 = cooler (blue)
fn apply_temperature(color: vec3<f32>, temperature: f32) -> vec3<f32> {
    // Simplified temperature shift using RGB gains
    // Based on approximation of Planckian locus
    let t = temperature * 0.01; // Normalize to reasonable range
    let warm = vec3<f32>(1.0 + t * 0.1, 1.0, 1.0 - t * 0.1);
    return color * warm;
}

// Apply tint adjustment (green-magenta axis)
fn apply_tint(color: vec3<f32>, tint: f32) -> vec3<f32> {
    let t = tint * 0.1;
    let shift = vec3<f32>(1.0, 1.0 - abs(t), 1.0);
    let multiplier = select(
        vec3<f32>(1.0 + t, 1.0, 1.0), // Magenta (positive)
        vec3<f32>(1.0, 1.0 - t, 1.0), // Green (negative)
        tint > 0.0
    );
    return color * multiplier;
}

// Apply highlight recovery (compress highlights)
fn apply_highlights(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    // Soft knee compression for highlights
    let knee = 0.8;
    let factor = select(
        1.0,
        1.0 - (lum - knee) * amount * 0.5,
        lum > knee
    );
    return color * factor;
}

// Apply shadow adjustment (lift shadows)
fn apply_shadows(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    // Lift shadows while preserving blacks
    let knee = 0.2;
    let lift = select(
        amount * (knee - lum) / knee * 0.1,
        0.0,
        lum < knee
    );
    return color + lift;
}

// Complete primary correction
fn apply_primary_correction(
    color: vec3<f32>,
    slope: vec3<f32>,
    offset: vec3<f32>,
    power: vec3<f32>,
    saturation: f32,
    exposure: f32,
    temperature: f32,
    tint: f32,
    highlights: f32,
    shadows: f32,
    mix_amount: f32
) -> vec3<f32> {
    var result = color;

    // Apply CDL
    result = apply_cdl(result, slope, offset, power);

    // Apply adjustments
    result = apply_exposure(result, exposure);
    result = apply_temperature(result, temperature);
    result = apply_tint(result, tint);
    result = apply_saturation(result, saturation);
    result = apply_highlights(result, highlights);
    result = apply_shadows(result, shadows);

    // Mix with original
    return mix(color, result, mix_amount);
}
"#;

/// Color wheels (Lift/Gamma/Gain) functions.
pub const COLOR_WHEELS_FUNCTIONS: &str = r#"
// ============================================================================
// Color Wheels (Lift/Gamma/Gain)
// ============================================================================

// Apply lift/gamma/gain color correction
// - Lift: affects shadows (adds color offset that diminishes in highlights)
// - Gamma: affects midtones (power function)
// - Gain: affects highlights (multiplier)
fn apply_lift_gamma_gain(
    color: vec3<f32>,
    lift_rgb: vec3<f32>,
    lift_lum: f32,
    gamma_rgb: vec3<f32>,
    gamma_lum: f32,
    gain_rgb: vec3<f32>,
    gain_lum: f32,
    mix_amount: f32
) -> vec3<f32> {
    var result = color;

    // Apply lift (shadows)
    // Lift adds color to dark areas: result = color + lift * (1 - color)
    let lift_color = lift_rgb + lift_lum;
    result = result + lift_color * (1.0 - result) * 0.5;

    // Apply gamma (midtones)
    // Gamma is a power function: result = pow(color, 1/gamma)
    let gamma_factor = 1.0 / max(1.0 + gamma_rgb + gamma_lum, vec3<f32>(0.01));
    result = pow(max(result, vec3<f32>(0.0)), gamma_factor);

    // Apply gain (highlights)
    // Gain multiplies the color: result = color * gain
    let gain_factor = 1.0 + gain_rgb + gain_lum;
    result = result * gain_factor;

    // Mix with original
    return mix(color, result, mix_amount);
}
"#;

/// 3D LUT functions.
pub const LUT_FUNCTIONS: &str = r#"
// ============================================================================
// 3D LUT Application
// ============================================================================

// Trilinear interpolation for 3D LUT
fn apply_lut_trilinear(
    color: vec3<f32>,
    lut: texture_3d<f32>,
    lut_sampler: sampler,
    lut_size: f32,
    mix_amount: f32
) -> vec3<f32> {
    // Scale color to LUT coordinates with half-texel offset for correct sampling
    let half_texel = 0.5 / lut_size;
    let scale = (lut_size - 1.0) / lut_size;
    let lut_coord = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)) * scale + half_texel;

    let lut_color = textureSampleLevel(lut, lut_sampler, lut_coord, 0.0).rgb;
    return mix(color, lut_color, mix_amount);
}

// Tetrahedral interpolation for 3D LUT (higher quality)
fn apply_lut_tetrahedral(
    color: vec3<f32>,
    lut: texture_3d<f32>,
    lut_sampler: sampler,
    lut_size: f32,
    mix_amount: f32
) -> vec3<f32> {
    // Scale to LUT indices
    let scaled = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)) * (lut_size - 1.0);
    let base = floor(scaled);
    let frac = scaled - base;

    // Calculate texel coordinates with half-texel offset
    let texel = 1.0 / lut_size;
    let half_texel = 0.5 * texel;

    // Sample 8 corners of the cube
    let c000 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(0.0, 0.0, 0.0)) * texel + half_texel, 0.0).rgb;
    let c001 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(0.0, 0.0, 1.0)) * texel + half_texel, 0.0).rgb;
    let c010 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(0.0, 1.0, 0.0)) * texel + half_texel, 0.0).rgb;
    let c011 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(0.0, 1.0, 1.0)) * texel + half_texel, 0.0).rgb;
    let c100 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(1.0, 0.0, 0.0)) * texel + half_texel, 0.0).rgb;
    let c101 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(1.0, 0.0, 1.0)) * texel + half_texel, 0.0).rgb;
    let c110 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(1.0, 1.0, 0.0)) * texel + half_texel, 0.0).rgb;
    let c111 = textureSampleLevel(lut, lut_sampler, (base + vec3<f32>(1.0, 1.0, 1.0)) * texel + half_texel, 0.0).rgb;

    // Tetrahedral interpolation - determine which tetrahedron we're in
    var result: vec3<f32>;
    if (frac.r > frac.g) {
        if (frac.g > frac.b) {
            // r > g > b
            result = c000 + (c100 - c000) * frac.r + (c110 - c100) * frac.g + (c111 - c110) * frac.b;
        } else if (frac.r > frac.b) {
            // r > b > g
            result = c000 + (c100 - c000) * frac.r + (c101 - c100) * frac.b + (c111 - c101) * frac.g;
        } else {
            // b > r > g
            result = c000 + (c001 - c000) * frac.b + (c101 - c001) * frac.r + (c111 - c101) * frac.g;
        }
    } else {
        if (frac.b > frac.g) {
            // b > g > r
            result = c000 + (c001 - c000) * frac.b + (c011 - c001) * frac.g + (c111 - c011) * frac.r;
        } else if (frac.r > frac.b) {
            // g > r > b
            result = c000 + (c010 - c000) * frac.g + (c110 - c010) * frac.r + (c111 - c110) * frac.b;
        } else {
            // g > b > r
            result = c000 + (c010 - c000) * frac.g + (c011 - c010) * frac.b + (c111 - c011) * frac.r;
        }
    }

    return mix(color, result, mix_amount);
}
"#;

/// HSL qualifier functions.
pub const HSL_QUALIFIER_FUNCTIONS: &str = r#"
// ============================================================================
// HSL Qualifier (Secondary Color Correction)
// ============================================================================

// Calculate HSL qualifier mask
fn hsl_qualifier_mask(
    hsl: vec3<f32>,
    center: vec3<f32>,    // hue, sat, lum (hue in 0-1 range)
    width: vec3<f32>,     // hue, sat, lum width
    softness: vec3<f32>,  // hue, sat, lum softness
    invert: bool
) -> f32 {
    // Hue distance (circular, wraps at 0/1)
    var hue_diff = abs(hsl.x - center.x);
    hue_diff = min(hue_diff, 1.0 - hue_diff);

    // Saturation and luminance distance (linear)
    let sat_diff = abs(hsl.y - center.y);
    let lum_diff = abs(hsl.z - center.z);

    // Calculate mask for each dimension with soft edges
    let hue_inner = width.x * (1.0 - softness.x);
    let hue_mask = 1.0 - smoothstep(hue_inner, width.x, hue_diff);

    let sat_inner = width.y * (1.0 - softness.y);
    let sat_mask = 1.0 - smoothstep(sat_inner, width.y, sat_diff);

    let lum_inner = width.z * (1.0 - softness.z);
    let lum_mask = 1.0 - smoothstep(lum_inner, width.z, lum_diff);

    // Combine masks
    var mask = hue_mask * sat_mask * lum_mask;

    if (invert) {
        mask = 1.0 - mask;
    }

    return mask;
}

// Apply correction within qualified region
fn apply_qualified_correction(
    color: vec3<f32>,
    correction_color: vec3<f32>,
    qualifier_center: vec3<f32>,
    qualifier_width: vec3<f32>,
    qualifier_softness: vec3<f32>,
    invert: bool,
    mix_amount: f32
) -> vec3<f32> {
    let hsl = rgb_to_hsl(color);
    let mask = hsl_qualifier_mask(hsl, qualifier_center, qualifier_width, qualifier_softness, invert);

    // Apply correction based on mask
    let final_mix = mask * mix_amount;
    return mix(color, correction_color, final_mix);
}
"#;

/// Curves functions.
pub const CURVES_FUNCTIONS: &str = r#"
// ============================================================================
// Curves (1D LUT Texture)
// ============================================================================

// Apply RGB curves via 1D LUT texture
// The LUT texture contains 4 rows: master, red, green, blue
fn apply_curves(
    color: vec3<f32>,
    curves_lut: texture_2d<f32>,
    curves_sampler: sampler,
    mix_amount: f32
) -> vec3<f32> {
    // Sample master curve (row 0)
    let master_r = textureSampleLevel(curves_lut, curves_sampler, vec2<f32>(color.r, 0.125), 0.0).r;
    let master_g = textureSampleLevel(curves_lut, curves_sampler, vec2<f32>(color.g, 0.125), 0.0).r;
    let master_b = textureSampleLevel(curves_lut, curves_sampler, vec2<f32>(color.b, 0.125), 0.0).r;

    // Sample individual RGB curves (rows 1, 2, 3)
    let red = textureSampleLevel(curves_lut, curves_sampler, vec2<f32>(master_r, 0.375), 0.0).r;
    let green = textureSampleLevel(curves_lut, curves_sampler, vec2<f32>(master_g, 0.625), 0.0).r;
    let blue = textureSampleLevel(curves_lut, curves_sampler, vec2<f32>(master_b, 0.875), 0.0).r;

    let result = vec3<f32>(red, green, blue);
    return mix(color, result, mix_amount);
}
"#;

/// Combined color grading shader for single-pass processing.
pub const COLOR_GRADING_COMBINED_SHADER: &str = r#"
// ============================================================================
// Color Grading Combined Shader
// ============================================================================

struct ColorGradingUniforms {
    // Primary correction
    slope: vec4<f32>,        // RGB + pad
    offset: vec4<f32>,       // RGB + pad
    power: vec4<f32>,        // RGB + pad
    adjustments: vec4<f32>,  // saturation, exposure, temperature, tint

    // Color wheels
    lift: vec4<f32>,         // RGB + luminance
    gamma: vec4<f32>,        // RGB + luminance
    gain: vec4<f32>,         // RGB + luminance

    // HSL qualifier
    qualifier_center: vec4<f32>,   // hue, sat, lum, pad
    qualifier_width: vec4<f32>,    // hue, sat, lum, pad
    qualifier_softness: vec4<f32>, // hue, sat, lum, invert

    // Flags and settings
    flags: u32,              // bitfield
    primary_mix: f32,
    wheels_mix: f32,
    lut_mix: f32,
    qualifier_mix: f32,
    highlights: f32,
    shadows: f32,
    lut_size: f32,

    _pad: array<f32, 16>,
};

// Flag constants
const FLAG_BYPASS: u32 = 1u;
const FLAG_PRIMARY_ENABLED: u32 = 2u;
const FLAG_WHEELS_ENABLED: u32 = 4u;
const FLAG_CURVES_ENABLED: u32 = 8u;
const FLAG_LUT_ENABLED: u32 = 16u;
const FLAG_QUALIFIER_ENABLED: u32 = 32u;

@group(1) @binding(0) var<uniform> cg: ColorGradingUniforms;
@group(1) @binding(1) var lut_3d: texture_3d<f32>;
@group(1) @binding(2) var lut_sampler: sampler;

// Apply full color grading pipeline
fn apply_color_grading(color: vec3<f32>) -> vec3<f32> {
    // Check bypass
    if ((cg.flags & FLAG_BYPASS) != 0u) {
        return color;
    }

    var result = color;

    // Primary correction
    if ((cg.flags & FLAG_PRIMARY_ENABLED) != 0u) {
        result = apply_primary_correction(
            result,
            cg.slope.rgb,
            cg.offset.rgb,
            cg.power.rgb,
            cg.adjustments.x, // saturation
            cg.adjustments.y, // exposure
            cg.adjustments.z, // temperature
            cg.adjustments.w, // tint
            cg.highlights,
            cg.shadows,
            cg.primary_mix
        );
    }

    // Color wheels
    if ((cg.flags & FLAG_WHEELS_ENABLED) != 0u) {
        result = apply_lift_gamma_gain(
            result,
            cg.lift.rgb,
            cg.lift.w,
            cg.gamma.rgb,
            cg.gamma.w,
            cg.gain.rgb,
            cg.gain.w,
            cg.wheels_mix
        );
    }

    // 3D LUT
    if ((cg.flags & FLAG_LUT_ENABLED) != 0u) {
        result = apply_lut_tetrahedral(result, lut_3d, lut_sampler, cg.lut_size, cg.lut_mix);
    }

    // HSL Qualifier (if enabled, would apply secondary correction here)
    // This is a simplified version - full implementation would apply
    // a separate correction within the qualified region

    return clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
}
"#;

/// Get the complete color grading shader source.
pub fn get_color_grading_shader() -> String {
    format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        COLOR_SPACE_FUNCTIONS,
        PRIMARY_CORRECTION_FUNCTIONS,
        COLOR_WHEELS_FUNCTIONS,
        LUT_FUNCTIONS,
        HSL_QUALIFIER_FUNCTIONS,
        CURVES_FUNCTIONS,
    )
}
