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
    _pad: array<vec4<f32>, 4>,
};

@group(0) @binding(0) var<uniform> uniforms: LayerUniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;

@group(1) @binding(0) var<uniform> cg: ColorGradingUniforms;

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
// Color Grading
// ============================================================================

const CG_FLAG_BYPASS: u32 = 1u;
const CG_FLAG_PRIMARY_ENABLED: u32 = 2u;
const CG_FLAG_WHEELS_ENABLED: u32 = 4u;

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

fn apply_color_grading(color: vec3<f32>) -> vec3<f32> {
    if ((cg.flags & CG_FLAG_BYPASS) != 0u) {
        return color;
    }
    var result = color;
    if ((cg.flags & CG_FLAG_PRIMARY_ENABLED) != 0u) {
        result = apply_primary_correction(
            result,
            cg.slope.rgb, cg.offset.rgb, cg.power.rgb,
            cg.adjustments.x, cg.adjustments.y,
            cg.adjustments.z, cg.adjustments.w,
            cg.highlights, cg.shadows, cg.primary_mix
        );
    }
    if ((cg.flags & CG_FLAG_WHEELS_ENABLED) != 0u) {
        result = apply_lift_gamma_gain(
            result,
            cg.lift.rgb, cg.lift.w,
            cg.gamma.rgb, cg.gamma.w,
            cg.gain.rgb, cg.gain.w,
            cg.wheels_mix
        );
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
    color = vec4<f32>(apply_color_grading(color.rgb), color.a);

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
        entries: &[BindGroupLayoutEntry {
            binding: 0,
            visibility: ShaderStages::FRAGMENT,
            ty: BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
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
