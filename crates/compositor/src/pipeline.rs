//! Render pipeline configuration.

use wgpu::{
    BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState,
    ColorTargetState, ColorWrites, Device, FragmentState, FrontFace, MultisampleState,
    PipelineLayoutDescriptor, PolygonMode, PrimitiveState, PrimitiveTopology, RenderPipeline,
    RenderPipelineDescriptor, SamplerBindingType, ShaderModuleDescriptor, ShaderSource,
    ShaderStages, TextureFormat, TextureSampleType, TextureViewDimension, VertexState,
};

use crate::error::Result;

/// Shader source code for the compositor.
const SHADER_SOURCE: &str = r#"
// Vertex shader

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) tex_coord: vec2<f32>,
};

struct LayerUniforms {
    transform: mat4x4<f32>,
    opacity: f32,
    brightness: f32,
    contrast: f32,
    saturation: f32,
    hue_rotate: f32,
    transition_type: u32,
    transition_progress: f32,
    crop_top: f32,
    crop_right: f32,
    crop_bottom: f32,
    crop_left: f32,
    blur: f32,
    texture_width: f32,
    texture_height: f32,
    mirror_edges: f32,
    motion_blur: f32,
};

struct ColorGradingUniforms {
    slope: vec4<f32>,
    offset: vec4<f32>,
    power: vec4<f32>,
    adjustments: vec4<f32>,
    lift: vec4<f32>,
    gamma: vec4<f32>,
    gain: vec4<f32>,
    qualifier_center: vec4<f32>,
    qualifier_width: vec4<f32>,
    qualifier_softness: vec4<f32>,
    flags: u32,
    primary_mix: f32,
    wheels_mix: f32,
    lut_mix: f32,
    qualifier_mix: f32,
    highlights: f32,
    shadows: f32,
    lut_size: f32,
    input_cst: u32,
    output_cst: u32,
    input_gamut: u32,
    output_gamut: u32,
    // Qualifier correction CDL
    q_slope: vec4<f32>,
    q_offset: vec4<f32>,
    q_power: vec4<f32>,
    q_adjustments: vec4<f32>,
    // Power window
    window_center_scale: vec4<f32>,
    window_shape: vec4<f32>,
    window_params: vec4<f32>,
    w_slope: vec4<f32>,
    w_offset: vec4<f32>,
    w_power: vec4<f32>,
    w_adjustments: vec4<f32>,
    window_mix: vec4<f32>,
    tone_mapping_method: u32,
    tone_mapping_a: f32,
    tone_mapping_b: f32,
    _pad_tone2: f32,
    _pad: array<vec4<f32>, 6>,
};

@group(0) @binding(0) var<uniform> uniforms: LayerUniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;

@group(1) @binding(0) var<uniform> cg: ColorGradingUniforms;
@group(1) @binding(1) var t_lut_3d: texture_3d<f32>;
@group(1) @binding(2) var s_lut: sampler;

// Quad vertices (two triangles) - corners of a unit quad [0,0] to [1,1]
// Will be scaled by texture dimensions in vertex shader
var<private> QUAD_VERTICES: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    // First triangle
    vec2<f32>(0.0, 0.0),  // top-left
    vec2<f32>(1.0, 0.0),  // top-right
    vec2<f32>(0.0, 1.0),  // bottom-left
    // Second triangle
    vec2<f32>(1.0, 0.0),  // top-right
    vec2<f32>(1.0, 1.0),  // bottom-right
    vec2<f32>(0.0, 1.0),  // bottom-left
);

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    // Get unit quad vertex [0,1] range
    let unit_pos = QUAD_VERTICES[vertex_index];

    // Apply crop to texture coordinates
    let crop_left = uniforms.crop_left;
    let crop_right = uniforms.crop_right;
    let crop_top = uniforms.crop_top;
    let crop_bottom = uniforms.crop_bottom;

    // Map unit position to UV with crop
    let uv_x = crop_left + unit_pos.x * (1.0 - crop_left - crop_right);
    let uv_y = crop_top + unit_pos.y * (1.0 - crop_top - crop_bottom);
    out.tex_coord = vec2<f32>(uv_x, uv_y);

    // Scale unit quad to layer pixel dimensions
    // The transform matrix expects layer-space input (0 to width, 0 to height)
    let layer_pos = vec2<f32>(
        unit_pos.x * uniforms.texture_width,
        unit_pos.y * uniforms.texture_height
    );
    // Transform from layer space to NDC
    out.position = uniforms.transform * vec4<f32>(layer_pos, 0.0, 1.0);

    return out;
}

// Fragment shader

// Convert RGB to HSL
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

// Convert HSL to RGB
fn hue_to_rgb(p: f32, q: f32, t: f32) -> f32 {
    var t_mod = t;
    if (t_mod < 0.0) { t_mod += 1.0; }
    if (t_mod > 1.0) { t_mod -= 1.0; }
    if (t_mod < 1.0 / 6.0) { return p + (q - p) * 6.0 * t_mod; }
    if (t_mod < 0.5) { return q; }
    if (t_mod < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t_mod) * 6.0; }
    return p;
}

fn hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
    if (hsl.y < 0.00001) {
        return vec3<f32>(hsl.z, hsl.z, hsl.z);
    }

    let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
    let p = 2.0 * hsl.z - q;

    return vec3<f32>(
        hue_to_rgb(p, q, hsl.x + 1.0 / 3.0),
        hue_to_rgb(p, q, hsl.x),
        hue_to_rgb(p, q, hsl.x - 1.0 / 3.0),
    );
}

// ============================================================================
// Color Space Transforms
// ============================================================================

// Color space IDs (must match Rust ColorSpace enum)
const CS_SRGB: u32 = 0u;
const CS_LINEAR: u32 = 1u;
const CS_ACES_CG: u32 = 2u;
const CS_LOGC: u32 = 3u;
const CS_SLOG2: u32 = 4u;
const CS_SLOG3: u32 = 5u;
const CS_CLOG3: u32 = 6u;
const CS_VLOG: u32 = 7u;
const CS_BM_FILM: u32 = 8u;
const CS_RED_LOG3G10: u32 = 9u;

// sRGB <-> Linear
fn srgb_to_linear(srgb: vec3<f32>) -> vec3<f32> {
    let cutoff = vec3<f32>(0.04045);
    let linear_low = srgb / 12.92;
    let linear_high = pow((srgb + 0.055) / 1.055, vec3<f32>(2.4));
    return select(linear_low, linear_high, srgb > cutoff);
}

fn linear_to_srgb(linear: vec3<f32>) -> vec3<f32> {
    let cutoff = vec3<f32>(0.0031308);
    let srgb_low = linear * 12.92;
    let srgb_high = 1.055 * pow(linear, vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(srgb_low, srgb_high, linear > cutoff);
}

// Sony S-Log2 <-> Linear (scene-referred)
// S-Log2 is defined as 219/155 * S-Log, with legal-to-full range conversion.
// Input: normalised code value (0.0-1.0). Output: scene-linear reflection.
// Reference: Sony S-Log2 Technical Summary, colour-science library.
fn slog2_to_linear(slog: vec3<f32>) -> vec3<f32> {
    // Step 1: legal-to-full range (10-bit: (v*1023 - 64) / 876)
    let x = (slog * 1023.0 - 64.0) / 876.0;
    // Step 2: S-Log inverse
    let threshold = vec3<f32>(0.088251);  // S-Log encoding of 0.0 as NCV
    let linear_low = (x - 0.030001222851889303) / 5.0;
    let linear_high = pow(vec3<f32>(10.0), (x - 0.616596 - 0.03) / 0.432699) - 0.037584;
    let slog_linear = select(linear_low, linear_high, slog >= threshold);
    // Step 3: reflection * S-Log2 scale factor (0.9 * 219/155)
    return slog_linear * 1.2716129032;
}

fn linear_to_slog2(linear: vec3<f32>) -> vec3<f32> {
    // Inverse of slog2_to_linear
    let x = linear / 1.2716129032;  // undo S-Log2 scale
    let slog_low = x * 5.0 + 0.030001222851889303;
    let slog_high = 0.432699 * log(x + 0.037584) / log(10.0) + 0.616596 + 0.03;
    let full = select(slog_low, slog_high, x >= vec3<f32>(0.0));
    // full-to-legal range
    return (full * 876.0 + 64.0) / 1023.0;
}

// ARRI LogC3 <-> Linear (EI 800, SUP 3.x)
// Reference: ARRI LogC3 specification, colour-science library.
fn logc_to_linear(logc: vec3<f32>) -> vec3<f32> {
    let a = 5.555556;
    let b = 0.052272;
    let c = 0.24719;
    let d = 0.385537;
    let e_val = 5.367655;
    let f = 0.092809;
    let breakpoint = vec3<f32>(0.1496578);  // e*cut + f
    let linear_low = (logc - f) / e_val;
    let linear_high = (pow(vec3<f32>(10.0), (logc - d) / c) - b) / a;
    return select(linear_low, linear_high, logc > breakpoint);
}

fn linear_to_logc(linear: vec3<f32>) -> vec3<f32> {
    let a = 5.555556;
    let b = 0.052272;
    let c = 0.24719;
    let d = 0.385537;
    let e_val = 5.367655;
    let f = 0.092809;
    let cut = vec3<f32>(0.010591);
    let logc_low = e_val * linear + f;
    let logc_high = c * log(a * linear + b) / log(10.0) + d;
    return select(logc_low, logc_high, linear > cut);
}

// Sony S-Log3 <-> Linear (scene-referred)
// Reference: Sony S-Log3 Technical Summary, colour-science library.
fn slog3_to_linear(slog: vec3<f32>) -> vec3<f32> {
    let threshold = vec3<f32>(171.2102946929 / 1023.0);  // ~0.16736
    let linear_low = (slog * 1023.0 - 95.0) * 0.01125000 / (171.2102946929 - 95.0);
    let linear_high = pow(vec3<f32>(10.0), (slog * 1023.0 - 420.0) / 261.5) * 0.19 - 0.01;
    return select(linear_low, linear_high, slog >= threshold);
}

fn linear_to_slog3(linear: vec3<f32>) -> vec3<f32> {
    let cut = vec3<f32>(0.01125000);
    let slog_low = (linear / 0.01125000 * (171.2102946929 - 95.0) + 95.0) / 1023.0;
    let slog_high = (420.0 + log((linear + 0.01) / 0.19) / log(10.0) * 261.5) / 1023.0;
    return select(slog_low, slog_high, linear >= cut);
}

// Canon CLog3 <-> Linear (simplified)
fn clog3_to_linear(clog: vec3<f32>) -> vec3<f32> {
    let cut = 0.097465473;
    let linear_low = (clog - 0.073059361) / 5.0;
    let linear_high = (pow(vec3<f32>(10.0), (clog - 0.449369) / 0.42889912) - 1.0) * 0.08;
    return select(linear_low, linear_high, clog > vec3<f32>(cut));
}

fn linear_to_clog3(linear: vec3<f32>) -> vec3<f32> {
    let cut = 0.014;
    let clog_low = linear * 5.0 + 0.073059361;
    let clog_high = 0.42889912 * log(linear / 0.08 + 1.0) / log(10.0) + 0.449369;
    return select(clog_low, clog_high, linear > vec3<f32>(cut));
}

// Panasonic V-Log <-> Linear
fn vlog_to_linear(vlog: vec3<f32>) -> vec3<f32> {
    let cut_in = 0.181;
    let linear_low = (vlog - 0.125) / 5.6;
    let linear_high = pow(vec3<f32>(10.0), (vlog - 0.598206) / 0.241514) - 0.00873;
    return select(linear_low, linear_high, vlog >= vec3<f32>(cut_in));
}

fn linear_to_vlog(linear: vec3<f32>) -> vec3<f32> {
    let cut = 0.01;
    let vlog_low = linear * 5.6 + 0.125;
    let vlog_high = 0.241514 * log(linear + 0.00873) / log(10.0) + 0.598206;
    return select(vlog_low, vlog_high, linear >= vec3<f32>(cut));
}

// Convert any color space to linear
fn to_linear(color: vec3<f32>, cs: u32) -> vec3<f32> {
    switch cs {
        case CS_LINEAR: { return color; }
        case CS_SRGB: { return srgb_to_linear(color); }
        case CS_LOGC: { return logc_to_linear(color); }
        case CS_SLOG2: { return slog2_to_linear(color); }
        case CS_SLOG3: { return slog3_to_linear(color); }
        case CS_CLOG3: { return clog3_to_linear(color); }
        case CS_VLOG: { return vlog_to_linear(color); }
        // ACES CG is already linear (just different primaries, simplified here)
        case CS_ACES_CG: { return color; }
        // BmFilm and RedLog3G10 simplified as log curves
        case CS_BM_FILM: { return logc_to_linear(color); }
        case CS_RED_LOG3G10: { return slog3_to_linear(color); }
        default: { return srgb_to_linear(color); }
    }
}

// Convert from linear to any color space
fn from_linear(color: vec3<f32>, cs: u32) -> vec3<f32> {
    switch cs {
        case CS_LINEAR: { return color; }
        case CS_SRGB: { return linear_to_srgb(color); }
        case CS_LOGC: { return linear_to_logc(color); }
        case CS_SLOG2: { return linear_to_slog2(color); }
        case CS_SLOG3: { return linear_to_slog3(color); }
        case CS_CLOG3: { return linear_to_clog3(color); }
        case CS_VLOG: { return linear_to_vlog(color); }
        case CS_ACES_CG: { return color; }
        case CS_BM_FILM: { return linear_to_logc(color); }
        case CS_RED_LOG3G10: { return linear_to_slog3(color); }
        default: { return linear_to_srgb(color); }
    }
}

// ============================================================================
// Gamut Conversion (Color Primaries)
// ============================================================================

// Gamut IDs (must match Rust Gamut enum)
const GAMUT_REC709: u32 = 0u;
const GAMUT_SGAMUT: u32 = 1u;
const GAMUT_SGAMUT3: u32 = 2u;
const GAMUT_SGAMUT3_CINE: u32 = 3u;
const GAMUT_ARRI_WIDE: u32 = 4u;
const GAMUT_ACES_AP1: u32 = 5u;
const GAMUT_RED_WIDE: u32 = 6u;
const GAMUT_DCI_P3: u32 = 7u;
const GAMUT_REC2020: u32 = 8u;
const GAMUT_VGAMUT: u32 = 9u;
const GAMUT_BMD_WIDE: u32 = 10u;

// 3x3 matrices to convert from source gamut to Rec.709 (linear space).
// Pre-computed as: XYZ_to_Rec709 * source_RGB_to_XYZ (D65 white point, no CAT needed).
// Matrices are in WGSL column-major order (each vec3 is a column).

fn gamut_to_rec709(color: vec3<f32>, gamut: u32) -> vec3<f32> {
    switch gamut {
        case GAMUT_REC709: { return color; }
        case GAMUT_SGAMUT, GAMUT_SGAMUT3: {
            return mat3x3<f32>(
                vec3<f32>( 1.8775895, -0.1768085, -0.0262071),
                vec3<f32>(-0.7940379,  1.3510232, -0.1484570),
                vec3<f32>(-0.0837210, -0.1741716,  1.1747362)
            ) * color;
        }
        case GAMUT_SGAMUT3_CINE: {
            return mat3x3<f32>(
                vec3<f32>( 1.6266602, -0.1785165, -0.0444460),
                vec3<f32>(-0.5400464,  1.4179576, -0.1959648),
                vec3<f32>(-0.0867831, -0.2393980,  1.2404829)
            ) * color;
        }
        case GAMUT_ARRI_WIDE: {
            return mat3x3<f32>(
                vec3<f32>( 1.6172660, -0.0705744, -0.0211068),
                vec3<f32>(-0.5372011,  1.3346439, -0.2270083),
                vec3<f32>(-0.0802240, -0.2640464,  1.2483551)
            ) * color;
        }
        case GAMUT_ACES_AP1: {
            return mat3x3<f32>(
                vec3<f32>( 1.7309784, -0.1316220, -0.0245741),
                vec3<f32>(-0.6039470,  1.1348678, -0.1257806),
                vec3<f32>(-0.0800949, -0.0086797,  1.0658927)
            ) * color;
        }
        case GAMUT_RED_WIDE: {
            return mat3x3<f32>(
                vec3<f32>( 1.9816606, -0.1781473, -0.1018204),
                vec3<f32>(-0.9002885,  1.5005030, -0.5353919),
                vec3<f32>(-0.0815312, -0.3223326,  1.6374523)
            ) * color;
        }
        case GAMUT_DCI_P3: {
            return mat3x3<f32>(
                vec3<f32>( 1.2247450, -0.0420578, -0.0196423),
                vec3<f32>(-0.2249043,  1.0420810, -0.0786549),
                vec3<f32>( 0.0000001, -0.0000001,  1.0985372)
            ) * color;
        }
        case GAMUT_REC2020: {
            return mat3x3<f32>(
                vec3<f32>( 1.6602266, -0.1245533, -0.0181551),
                vec3<f32>(-0.5875477,  1.1329261, -0.1006030),
                vec3<f32>(-0.0728382, -0.0083497,  1.1189982)
            ) * color;
        }
        case GAMUT_VGAMUT: {
            return mat3x3<f32>(
                vec3<f32>( 1.8062884, -0.1700943, -0.0252119),
                vec3<f32>(-0.6955865,  1.3059854, -0.1545054),
                vec3<f32>(-0.1108609, -0.1358680,  1.1799572)
            ) * color;
        }
        case GAMUT_BMD_WIDE: {
            return mat3x3<f32>(
                vec3<f32>( 1.5683008, -0.0863812, -0.0520228),
                vec3<f32>(-0.5227529,  1.3449488, -0.2491763),
                vec3<f32>(-0.0457070, -0.2585445,  1.3014390)
            ) * color;
        }
        default: { return color; }
    }
}

fn rec709_to_gamut(color: vec3<f32>, gamut: u32) -> vec3<f32> {
    switch gamut {
        case GAMUT_REC709: { return color; }
        case GAMUT_SGAMUT, GAMUT_SGAMUT3: {
            return mat3x3<f32>(
                vec3<f32>( 0.5661472,  0.0769741,  0.0223577),
                vec3<f32>( 0.3427600,  0.7990405,  0.1086252),
                vec3<f32>( 0.0911672,  0.1239551,  0.8689536)
            ) * color;
        }
        case GAMUT_SGAMUT3_CINE: {
            return mat3x3<f32>(
                vec3<f32>( 0.6457935,  0.0875449,  0.0369684),
                vec3<f32>( 0.2591131,  0.7596906,  0.1292957),
                vec3<f32>( 0.0951848,  0.1527355,  0.8336765)
            ) * color;
        }
        case GAMUT_ARRI_WIDE: {
            return mat3x3<f32>(
                vec3<f32>( 0.6314215,  0.0368258,  0.0173725),
                vec3<f32>( 0.2707945,  0.7930187,  0.1487858),
                vec3<f32>( 0.0978548,  0.1701023,  0.8336410)
            ) * color;
        }
        case GAMUT_ACES_AP1: {
            return mat3x3<f32>(
                vec3<f32>( 0.6032028,  0.0701291,  0.0221824),
                vec3<f32>( 0.3263270,  0.9198951,  0.1160756),
                vec3<f32>( 0.0479841,  0.0127606,  0.9407928)
            ) * color;
        }
        case GAMUT_RED_WIDE: {
            return mat3x3<f32>(
                vec3<f32>( 0.5420324,  0.0770016,  0.0588817),
                vec3<f32>( 0.3601398,  0.7679506,  0.2734883),
                vec3<f32>( 0.0978822,  0.1550052,  0.6674728)
            ) * color;
        }
        case GAMUT_DCI_P3: {
            return mat3x3<f32>(
                vec3<f32>( 0.8225930,  0.0331994,  0.0170854),
                vec3<f32>( 0.1775339,  0.9667835,  0.0723957),
                vec3<f32>( 0.0000000,  0.0000000,  0.9103014)
            ) * color;
        }
        case GAMUT_REC2020: {
            return mat3x3<f32>(
                vec3<f32>( 0.6275038,  0.0691083,  0.0163941),
                vec3<f32>( 0.3292755,  0.9195191,  0.0880113),
                vec3<f32>( 0.0433026,  0.0113596,  0.8953803)
            ) * color;
        }
        case GAMUT_VGAMUT: {
            return mat3x3<f32>(
                vec3<f32>( 0.5852893,  0.0786011,  0.0227979),
                vec3<f32>( 0.3226342,  0.8196082,  0.1142144),
                vec3<f32>( 0.0921401,  0.1017599,  0.8627817)
            ) * color;
        }
        case GAMUT_BMD_WIDE: {
            return mat3x3<f32>(
                vec3<f32>( 0.6549678,  0.0488989,  0.0355435),
                vec3<f32>( 0.2687242,  0.7919967,  0.1623791),
                vec3<f32>( 0.0763876,  0.1590558,  0.8018868)
            ) * color;
        }
        default: { return color; }
    }
}

// ============================================================================
// Tone Mapping
// ============================================================================

const TM_NONE: u32 = 0u;
const TM_SIMPLE: u32 = 1u;

// Per-channel hyperbolic rolloff tone mapping.
// Matches DaVinci Resolve's "Simple" / "DaVinci" tone mapping method.
// Formula: f(x) = a * x / (x + b)
// where a and b are derived from input/output white points.
// Reference: reverse-engineered by Thatcher Freeman
// (github.com/thatcherfreeman/utility-dctls)
//
// For SDR output (100 nits) from camera log (~5500 nits peak):
//   input_white = 55.0 (5500/100), output_white = 1.0
//   adaptation = 9.0
//   b = (Wᵢ - (adapt/100)*(Wᵢ/Wₒ)) / ((Wᵢ/Wₒ) - 1) = 0.926852
//   a = Wₒ / (Wᵢ/(Wᵢ+b)) = 1.016852
// Per-channel hyperbolic rolloff: f(x) = a * x / (x + b)
// a and b are pre-computed from input/output peak luminance and passed via uniforms.
fn apply_tone_mapping(color: vec3<f32>, method: u32) -> vec3<f32> {
    if (method == TM_NONE) { return color; }

    let a = cg.tone_mapping_a;
    let b = cg.tone_mapping_b;

    // Clamp negative values (from gamut conversion of out-of-gamut colors)
    let c = max(color, vec3<f32>(0.0));

    return vec3<f32>(
        a * c.x / (c.x + b),
        a * c.y / (c.y + b),
        a * c.z / (c.z + b)
    );
}

// ============================================================================
// Color Grading
// ============================================================================

const CG_FLAG_BYPASS: u32 = 1u;
const CG_FLAG_PRIMARY_ENABLED: u32 = 2u;
const CG_FLAG_WHEELS_ENABLED: u32 = 4u;
const CG_FLAG_LUT_ENABLED: u32 = 16u;
const CG_FLAG_QUALIFIER_ENABLED: u32 = 32u;
const CG_FLAG_WINDOW_ENABLED: u32 = 64u;
const CG_FLAG_INPUT_CST: u32 = 128u;
const CG_FLAG_OUTPUT_CST: u32 = 256u;
const CG_FLAG_INPUT_GAMUT: u32 = 512u;
const CG_FLAG_OUTPUT_GAMUT: u32 = 1024u;

fn cg_luminance(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// ASC-CDL: output = (input * slope + offset) ^ power
fn apply_cdl(color: vec3<f32>, slope: vec3<f32>, offset: vec3<f32>, power: vec3<f32>) -> vec3<f32> {
    return pow(max(color * slope + offset, vec3<f32>(0.0)), power);
}

fn apply_primary_correction(
    color: vec3<f32>,
    slope: vec3<f32>,
    offset: vec3<f32>,
    power: vec3<f32>,
    sat: f32,
    exposure: f32,
    temperature: f32,
    tint: f32,
    highlights: f32,
    shadows: f32,
    mix_amount: f32
) -> vec3<f32> {
    var result = apply_cdl(color, slope, offset, power);
    // Exposure
    result = result * pow(2.0, exposure);
    // Temperature
    let t = temperature * 0.01;
    result = result * vec3<f32>(1.0 + t * 0.1, 1.0, 1.0 - t * 0.1);
    // Tint
    if (tint > 0.0) {
        result = result * vec3<f32>(1.0 + tint * 0.1, 1.0, 1.0);
    } else {
        result = result * vec3<f32>(1.0, 1.0 + abs(tint) * 0.1, 1.0);
    }
    // Saturation
    let lum_sat = cg_luminance(result);
    result = mix(vec3<f32>(lum_sat), result, sat);
    // Highlights: scale bright areas (positive = brighter highlights, negative = darker)
    if (abs(highlights) > 0.001) {
        let lum_hi = cg_luminance(result);
        // Smooth weight: 0 for darks, 1 for full white
        let hi_weight = smoothstep(0.3, 1.0, lum_hi);
        result = result * (1.0 + highlights * hi_weight);
    }
    // Shadows: scale dark areas (positive = brighter shadows, negative = darker)
    if (abs(shadows) > 0.001) {
        let lum_sh = cg_luminance(result);
        // Smooth weight: 1 for blacks, 0 for brights
        let sh_weight = 1.0 - smoothstep(0.0, 0.5, lum_sh);
        result = result + shadows * sh_weight * 0.5;
    }
    return mix(color, result, mix_amount);
}

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
    // Lift (shadows)
    let lift_color = lift_rgb + lift_lum;
    result = result + lift_color * (1.0 - result) * 0.5;
    // Gamma (midtones)
    let gamma_factor = 1.0 / max(1.0 + gamma_rgb + gamma_lum, vec3<f32>(0.01));
    result = pow(max(result, vec3<f32>(0.0)), gamma_factor);
    // Gain (highlights)
    let gain_factor = 1.0 + gain_rgb + gain_lum;
    result = result * gain_factor;
    return mix(color, result, mix_amount);
}

// ============================================================================
// HSL Qualifier
// ============================================================================

fn rgb_to_hsl_cg(rgb: vec3<f32>) -> vec3<f32> {
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

fn hsl_qualifier_mask(
    hsl: vec3<f32>,
    center: vec3<f32>,
    width: vec3<f32>,
    softness: vec3<f32>,
    invert_flag: f32,
) -> f32 {
    // Hue distance (circular)
    var hue_diff = abs(hsl.x - center.x);
    hue_diff = min(hue_diff, 1.0 - hue_diff);
    let sat_diff = abs(hsl.y - center.y);
    let lum_diff = abs(hsl.z - center.z);

    let hue_inner = width.x * (1.0 - softness.x);
    let hue_mask = 1.0 - smoothstep(hue_inner, width.x, hue_diff);
    let sat_inner = width.y * (1.0 - softness.y);
    let sat_mask = 1.0 - smoothstep(sat_inner, width.y, sat_diff);
    let lum_inner = width.z * (1.0 - softness.z);
    let lum_mask = 1.0 - smoothstep(lum_inner, width.z, lum_diff);

    var mask = hue_mask * sat_mask * lum_mask;
    if (invert_flag > 0.5) {
        mask = 1.0 - mask;
    }
    return mask;
}

fn apply_qualifier(color: vec3<f32>) -> vec3<f32> {
    let hsl = rgb_to_hsl_cg(color);
    let mask = hsl_qualifier_mask(
        hsl,
        cg.qualifier_center.xyz,
        cg.qualifier_width.xyz,
        cg.qualifier_softness.xyz,
        cg.qualifier_softness.w,
    );
    // Apply correction within qualified region
    var corrected = apply_cdl(color, cg.q_slope.rgb, cg.q_offset.rgb, cg.q_power.rgb);
    corrected = corrected * pow(2.0, cg.q_adjustments.y); // exposure
    let lum_q = cg_luminance(corrected);
    corrected = mix(vec3<f32>(lum_q), corrected, cg.q_adjustments.x); // saturation
    // Desaturate non-qualified region so user can see the selection
    let outside = mix(vec3<f32>(cg_luminance(color)), color, 0.3);
    return mix(outside, corrected, mask * cg.qualifier_mix);
}

// ============================================================================
// Power Window
// ============================================================================

fn power_window_mask(uv: vec2<f32>) -> f32 {
    let center = cg.window_center_scale.xy;
    let scale = cg.window_center_scale.zw;
    let rotation = cg.window_params.x * 6.28318530718; // normalized to radians
    let softness_inner = cg.window_params.y;
    let softness_outer = cg.window_params.z;
    let invert_flag = cg.window_params.w;
    let shape_type = cg.window_shape.w;

    // Transform UV relative to window center, accounting for rotation and scale
    var p = uv - center;
    let cos_r = cos(rotation);
    let sin_r = sin(rotation);
    p = vec2<f32>(p.x * cos_r + p.y * sin_r, -p.x * sin_r + p.y * cos_r);
    p = p / max(scale, vec2<f32>(0.001));

    var dist: f32;
    if (shape_type < 0.5) {
        // Circle/Ellipse
        let r = cg.window_shape.xy;
        let d = p / max(r, vec2<f32>(0.001));
        dist = length(d);
    } else if (shape_type < 1.5) {
        // Rectangle
        let half_size = cg.window_shape.xy * 0.5;
        let corner = cg.window_shape.z;
        let d = abs(p) - half_size + corner;
        dist = (length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - corner)
            / max(min(half_size.x, half_size.y), 0.001) + 1.0;
    } else {
        // Gradient
        let angle = cg.window_shape.x * 6.28318530718;
        let dir = vec2<f32>(cos(angle), sin(angle));
        dist = dot(p, dir) + 0.5;
    }

    // Apply softness
    let edge_start = 1.0 - softness_inner;
    let edge_end = 1.0 + softness_outer;
    var mask = 1.0 - smoothstep(edge_start, edge_end, dist);

    if (invert_flag > 0.5) {
        mask = 1.0 - mask;
    }
    return mask;
}

fn apply_window(color: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    let mask = power_window_mask(uv);
    if (mask < 0.001) {
        return color;
    }
    var corrected = apply_cdl(color, cg.w_slope.rgb, cg.w_offset.rgb, cg.w_power.rgb);
    corrected = corrected * pow(2.0, cg.w_adjustments.y); // exposure
    let lum_w = cg_luminance(corrected);
    corrected = mix(vec3<f32>(lum_w), corrected, cg.w_adjustments.x); // saturation
    return mix(color, corrected, mask * cg.window_mix.x);
}

// ============================================================================
// 3D LUT
// ============================================================================

fn apply_lut(color: vec3<f32>, lut_mix: f32) -> vec3<f32> {
    let lut_size = cg.lut_size;
    // Scale color to LUT coordinates with half-texel offset for correct sampling
    let half_texel = 0.5 / lut_size;
    let scale = (lut_size - 1.0) / lut_size;
    let lut_coord = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)) * scale + half_texel;
    let lut_color = textureSampleLevel(t_lut_3d, s_lut, lut_coord, 0.0).rgb;
    return mix(color, lut_color, lut_mix);
}

// ============================================================================
// Combined Color Grading
// ============================================================================

fn apply_color_grading(color: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    if ((cg.flags & CG_FLAG_BYPASS) != 0u) {
        return color;
    }
    var result = color;

    // Input CST: convert from source color space to linear for grading
    if ((cg.flags & CG_FLAG_INPUT_CST) != 0u) {
        result = to_linear(result, cg.input_cst);
    }

    // Input gamut: convert from source primaries to Rec.709
    if ((cg.flags & CG_FLAG_INPUT_GAMUT) != 0u) {
        result = gamut_to_rec709(result, cg.input_gamut);
    }

    // Tone mapping: compress dynamic range for display
    if (cg.tone_mapping_method != TM_NONE) {
        result = apply_tone_mapping(result, cg.tone_mapping_method);
    }

    // Primary correction (operates in linear)
    if ((cg.flags & CG_FLAG_PRIMARY_ENABLED) != 0u) {
        result = apply_primary_correction(
            result,
            cg.slope.rgb, cg.offset.rgb, cg.power.rgb,
            cg.adjustments.x, cg.adjustments.y,
            cg.adjustments.z, cg.adjustments.w,
            cg.highlights, cg.shadows, cg.primary_mix
        );
    }

    // Color wheels (operates in linear)
    if ((cg.flags & CG_FLAG_WHEELS_ENABLED) != 0u) {
        result = apply_lift_gamma_gain(
            result,
            cg.lift.rgb, cg.lift.w,
            cg.gamma.rgb, cg.gamma.w,
            cg.gain.rgb, cg.gain.w,
            cg.wheels_mix
        );
    }

    // 3D LUT
    if ((cg.flags & CG_FLAG_LUT_ENABLED) != 0u) {
        result = apply_lut(result, cg.lut_mix);
    }

    // HSL Qualifier (secondary correction within color range)
    if ((cg.flags & CG_FLAG_QUALIFIER_ENABLED) != 0u) {
        result = apply_qualifier(result);
    }

    // Power Window (regional correction)
    if ((cg.flags & CG_FLAG_WINDOW_ENABLED) != 0u) {
        result = apply_window(result, uv);
    }

    // Output gamut: convert from Rec.709 to target primaries
    if ((cg.flags & CG_FLAG_OUTPUT_GAMUT) != 0u) {
        result = rec709_to_gamut(result, cg.output_gamut);
    }

    // Output CST: convert from linear to output color space
    if ((cg.flags & CG_FLAG_OUTPUT_CST) != 0u) {
        result = from_linear(result, cg.output_cst);
    }

    return clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var color: vec4<f32>;

    // Apply Gaussian blur if needed
    if (uniforms.blur > 0.01) {
        let texel = vec2<f32>(1.0 / uniforms.texture_width, 1.0 / uniforms.texture_height);
        let sigma = uniforms.blur;
        // Scale step size so our 13x13 grid covers ~3 sigma
        let step_scale = max(sigma / 6.0, 1.0);

        var total = vec4<f32>(0.0);
        var weight_sum = 0.0;

        for (var dy = -6; dy <= 6; dy++) {
            for (var dx = -6; dx <= 6; dx++) {
                let offset = vec2<f32>(f32(dx), f32(dy)) * step_scale;
                let d2 = dot(offset, offset);
                let w = exp(-d2 / (2.0 * sigma * sigma));
                let uv = in.tex_coord + offset * texel;
                total += textureSampleLevel(t_diffuse, s_diffuse, uv, 0.0) * w;
                weight_sum += w;
            }
        }

        color = total / weight_sum;
    } else {
        color = textureSample(t_diffuse, s_diffuse, in.tex_coord);
    }

    // Early discard for fully transparent pixels
    if (color.a < 0.001) {
        discard;
    }

    // Apply brightness
    color = vec4<f32>(color.rgb * uniforms.brightness, color.a);

    // Apply contrast
    color = vec4<f32>((color.rgb - 0.5) * uniforms.contrast + 0.5, color.a);

    // Apply saturation
    let luminance = dot(color.rgb, vec3<f32>(0.299, 0.587, 0.114));
    color = vec4<f32>(mix(vec3<f32>(luminance), color.rgb, uniforms.saturation), color.a);

    // Apply hue rotation
    if (abs(uniforms.hue_rotate) > 0.001) {
        var hsl = rgb_to_hsl(color.rgb);
        hsl.x = fract(hsl.x + uniforms.hue_rotate / 6.28318530718); // Divide by 2π
        color = vec4<f32>(hsl_to_rgb(hsl), color.a);
    }

    // Apply color grading
    color = vec4<f32>(apply_color_grading(color.rgb, in.tex_coord), color.a);

    // Apply wipe transition masking (for cross-transition wipes)
    // Wipe types: 3=WipeLeft, 4=WipeRight, 5=WipeUp, 6=WipeDown
    if (uniforms.transition_type >= 3u && uniforms.transition_type <= 6u) {
        let p = uniforms.transition_progress;
        let soft = 0.005; // Soft edge width in UV space
        var wipe_alpha = 1.0;

        if (uniforms.transition_type == 3u) {
            // WipeLeft: reveals incoming from the right side
            let edge = 1.0 - p;
            wipe_alpha = smoothstep(edge - soft, edge + soft, in.tex_coord.x);
        } else if (uniforms.transition_type == 4u) {
            // WipeRight: reveals incoming from the left side
            let edge = p;
            wipe_alpha = 1.0 - smoothstep(edge - soft, edge + soft, in.tex_coord.x);
        } else if (uniforms.transition_type == 5u) {
            // WipeUp: reveals incoming from the bottom
            let edge = 1.0 - p;
            wipe_alpha = smoothstep(edge - soft, edge + soft, in.tex_coord.y);
        } else if (uniforms.transition_type == 6u) {
            // WipeDown: reveals incoming from the top
            let edge = p;
            wipe_alpha = 1.0 - smoothstep(edge - soft, edge + soft, in.tex_coord.y);
        }

        if (wipe_alpha < 0.001) {
            discard;
        }
        color = vec4<f32>(color.rgb, color.a * wipe_alpha);
    }

    // Apply opacity
    color = vec4<f32>(color.rgb, color.a * uniforms.opacity);

    // Clamp final color
    return clamp(color, vec4<f32>(0.0), vec4<f32>(1.0));
}
"#;

/// Create the bind group layout for layer rendering.
pub fn create_bind_group_layout(device: &Device) -> BindGroupLayout {
    device.create_bind_group_layout(&BindGroupLayoutDescriptor {
        label: Some("layer_bind_group_layout"),
        entries: &[
            // Uniforms
            BindGroupLayoutEntry {
                binding: 0,
                visibility: ShaderStages::VERTEX | ShaderStages::FRAGMENT,
                ty: BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            // Texture
            BindGroupLayoutEntry {
                binding: 1,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Texture {
                    sample_type: TextureSampleType::Float { filterable: true },
                    view_dimension: TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            // Sampler
            BindGroupLayoutEntry {
                binding: 2,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Sampler(SamplerBindingType::Filtering),
                count: None,
            },
        ],
    })
}

/// Create the bind group layout for color grading uniforms (group 1).
pub fn create_color_grading_bind_group_layout(device: &Device) -> BindGroupLayout {
    device.create_bind_group_layout(&BindGroupLayoutDescriptor {
        label: Some("color_grading_bind_group_layout"),
        entries: &[
            // binding 0: color grading uniforms
            BindGroupLayoutEntry {
                binding: 0,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            // binding 1: 3D LUT texture (Rgba16Float — supports linear filtering)
            BindGroupLayoutEntry {
                binding: 1,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Texture {
                    sample_type: TextureSampleType::Float { filterable: true },
                    view_dimension: TextureViewDimension::D3,
                    multisampled: false,
                },
                count: None,
            },
            // binding 2: LUT sampler (linear filtering for smooth interpolation)
            BindGroupLayoutEntry {
                binding: 2,
                visibility: ShaderStages::FRAGMENT,
                ty: BindingType::Sampler(SamplerBindingType::Filtering),
                count: None,
            },
        ],
    })
}

/// Create the render pipeline for compositing.
pub fn create_pipeline(
    device: &Device,
    bind_group_layout: &BindGroupLayout,
    color_grading_bind_group_layout: &BindGroupLayout,
    target_format: TextureFormat,
) -> Result<RenderPipeline> {
    let shader = device.create_shader_module(ShaderModuleDescriptor {
        label: Some("compositor_shader"),
        source: ShaderSource::Wgsl(SHADER_SOURCE.into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
        label: Some("compositor_pipeline_layout"),
        bind_group_layouts: &[bind_group_layout, color_grading_bind_group_layout],
        push_constant_ranges: &[],
    });

    let pipeline = device.create_render_pipeline(&RenderPipelineDescriptor {
        label: Some("compositor_pipeline"),
        layout: Some(&pipeline_layout),
        vertex: VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            buffers: &[], // We use a fullscreen triangle, no vertex buffers needed
            compilation_options: Default::default(),
        },
        fragment: Some(FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            targets: &[Some(ColorTargetState {
                format: target_format,
                blend: Some(BlendState::ALPHA_BLENDING),
                write_mask: ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: PrimitiveState {
            topology: PrimitiveTopology::TriangleList,
            strip_index_format: None,
            front_face: FrontFace::Ccw,
            cull_mode: None, // No culling for fullscreen triangle
            polygon_mode: PolygonMode::Fill,
            unclipped_depth: false,
            conservative: false,
        },
        depth_stencil: None,
        multisample: MultisampleState::default(),
        multiview: None,
        cache: None,
    });

    Ok(pipeline)
}

#[cfg(test)]
mod tests {
    // Pipeline tests require a WebGPU context.
}
