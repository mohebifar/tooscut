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

@group(0) @binding(0) var<uniform> uniforms: LayerUniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;

// Fullscreen triangle vertices
var<private> VERTICES: array<vec2<f32>, 3> = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    let pos = VERTICES[vertex_index];

    // Apply crop to texture coordinates
    let crop_left = uniforms.crop_left;
    let crop_right = uniforms.crop_right;
    let crop_top = uniforms.crop_top;
    let crop_bottom = uniforms.crop_bottom;

    // Map position to UV with crop
    let uv_x = crop_left + (pos.x * 0.5 + 0.5) * (1.0 - crop_left - crop_right);
    let uv_y = crop_top + (pos.y * 0.5 + 0.5) * (1.0 - crop_top - crop_bottom);
    out.tex_coord = vec2<f32>(uv_x, uv_y);

    // Transform position
    out.position = uniforms.transform * vec4<f32>(pos, 0.0, 1.0);

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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample texture
    var color = textureSample(t_diffuse, s_diffuse, in.tex_coord);

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

/// Create the render pipeline for compositing.
pub fn create_pipeline(
    device: &Device,
    bind_group_layout: &BindGroupLayout,
    target_format: TextureFormat,
) -> Result<RenderPipeline> {
    let shader = device.create_shader_module(ShaderModuleDescriptor {
        label: Some("compositor_shader"),
        source: ShaderSource::Wgsl(SHADER_SOURCE.into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
        label: Some("compositor_pipeline_layout"),
        bind_group_layouts: &[bind_group_layout],
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
