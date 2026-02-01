//! Shape and line rendering pipeline using Signed Distance Fields (SDF).
//!
//! Renders shapes (rectangles, ellipses, polygons) and lines with proper
//! anti-aliasing, fill, stroke, and endpoint decorations.

use bytemuck::{Pod, Zeroable};
use wgpu::{
    BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType, BlendState,
    BufferBindingType, ColorTargetState, ColorWrites, Device, FragmentState, FrontFace,
    MultisampleState, PipelineLayoutDescriptor, PolygonMode, PrimitiveState, PrimitiveTopology,
    RenderPipeline, RenderPipelineDescriptor, ShaderModuleDescriptor, ShaderSource, ShaderStages,
    TextureFormat, VertexState,
};

use tooscut_types::{
    LineHeadType, LineLayerData, LineStrokeStyle, ShapeLayerData, ShapeType,
};

/// Shape types for the shader.
pub const SHAPE_RECTANGLE: u32 = 0;
pub const SHAPE_ELLIPSE: u32 = 1;
pub const SHAPE_POLYGON: u32 = 2;
pub const SHAPE_LINE: u32 = 3;

/// Line head types for the shader.
pub const HEAD_NONE: u32 = 0;
pub const HEAD_ARROW: u32 = 1;
pub const HEAD_CIRCLE: u32 = 2;
pub const HEAD_SQUARE: u32 = 3;
pub const HEAD_DIAMOND: u32 = 4;

/// Line stroke styles.
pub const STROKE_SOLID: u32 = 0;
pub const STROKE_DASHED: u32 = 1;
pub const STROKE_DOTTED: u32 = 2;

/// Uniforms for shape rendering.
///
/// Layout: 192 bytes, 16-byte aligned.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct ShapeUniforms {
    // Transform and position (64 bytes)
    /// Bounding box: x, y, width, height (in pixels)
    pub bbox: [f32; 4],
    /// Canvas size: width, height, 1/width, 1/height
    pub canvas: [f32; 4],
    /// Fill color (RGBA)
    pub fill_color: [f32; 4],
    /// Stroke color (RGBA)
    pub stroke_color: [f32; 4],

    // Shape properties (64 bytes)
    /// Shape type (0=rect, 1=ellipse, 2=polygon, 3=line)
    pub shape_type: u32,
    /// Number of polygon sides
    pub sides: u32,
    /// Corner radius (for rectangles)
    pub corner_radius: f32,
    /// Stroke width
    pub stroke_width: f32,
    /// Opacity
    pub opacity: f32,
    /// Has stroke (0 or 1)
    pub has_stroke: u32,
    /// Stroke style (0=solid, 1=dashed, 2=dotted)
    pub stroke_style: u32,
    /// Padding
    pub _pad1: u32,

    // Line endpoints (32 bytes)
    /// Line start: x, y (in pixels)
    pub line_start: [f32; 2],
    /// Line end: x, y (in pixels)
    pub line_end: [f32; 2],
    /// Start head type and size
    pub start_head_type: u32,
    pub start_head_size: f32,
    /// End head type and size
    pub end_head_type: u32,
    pub end_head_size: f32,

    // Transition (32 bytes)
    /// Transition type
    pub transition_type: u32,
    /// Transition progress
    pub transition_progress: f32,
    /// X offset (for slide transitions)
    pub offset_x: f32,
    /// Y offset (for slide transitions)
    pub offset_y: f32,
    /// Scale (for zoom transitions)
    pub scale: f32,
    /// Padding
    pub _pad2: [f32; 3],
}

impl Default for ShapeUniforms {
    fn default() -> Self {
        Self {
            bbox: [0.0, 0.0, 100.0, 100.0],
            canvas: [1920.0, 1080.0, 1.0 / 1920.0, 1.0 / 1080.0],
            fill_color: [1.0, 1.0, 1.0, 1.0],
            stroke_color: [0.0, 0.0, 0.0, 1.0],
            shape_type: SHAPE_RECTANGLE,
            sides: 6,
            corner_radius: 0.0,
            stroke_width: 0.0,
            opacity: 1.0,
            has_stroke: 0,
            stroke_style: STROKE_SOLID,
            _pad1: 0,
            line_start: [0.0, 0.0],
            line_end: [100.0, 100.0],
            start_head_type: HEAD_NONE,
            start_head_size: 10.0,
            end_head_type: HEAD_NONE,
            end_head_size: 10.0,
            transition_type: 0,
            transition_progress: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
            scale: 1.0,
            _pad2: [0.0; 3],
        }
    }
}

impl ShapeUniforms {
    /// Create uniforms from a shape layer.
    pub fn from_shape(
        shape: &ShapeLayerData,
        canvas_width: u32,
        canvas_height: u32,
    ) -> Self {
        let cw = canvas_width as f32;
        let ch = canvas_height as f32;

        // Convert percentage to pixels
        let x = shape.shape_box.x * cw / 100.0;
        let y = shape.shape_box.y * ch / 100.0;
        let w = shape.shape_box.width * cw / 100.0;
        let h = shape.shape_box.height * ch / 100.0;

        // Scale factor for resolution independence (based on 1080p)
        let scale_factor = ch / 1080.0;

        let has_stroke = shape.style.stroke.is_some() && shape.style.stroke_width > 0.0;
        let stroke_color = shape.style.stroke.unwrap_or([0.0, 0.0, 0.0, 0.0]);

        let shape_type = match shape.shape {
            ShapeType::Rectangle => SHAPE_RECTANGLE,
            ShapeType::Ellipse => SHAPE_ELLIPSE,
            ShapeType::Polygon => SHAPE_POLYGON,
        };

        Self {
            bbox: [x, y, w, h],
            canvas: [cw, ch, 1.0 / cw, 1.0 / ch],
            fill_color: shape.style.fill,
            stroke_color,
            shape_type,
            sides: shape.style.sides.unwrap_or(6),
            corner_radius: shape.style.corner_radius * scale_factor,
            stroke_width: shape.style.stroke_width * scale_factor,
            opacity: shape.opacity,
            has_stroke: if has_stroke { 1 } else { 0 },
            stroke_style: STROKE_SOLID,
            _pad1: 0,
            line_start: [0.0, 0.0],
            line_end: [0.0, 0.0],
            start_head_type: HEAD_NONE,
            start_head_size: 0.0,
            end_head_type: HEAD_NONE,
            end_head_size: 0.0,
            transition_type: 0,
            transition_progress: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
            scale: 1.0,
            _pad2: [0.0; 3],
        }
    }

    /// Create uniforms from a line layer.
    pub fn from_line(
        line: &LineLayerData,
        canvas_width: u32,
        canvas_height: u32,
    ) -> Self {
        let cw = canvas_width as f32;
        let ch = canvas_height as f32;

        // Convert percentage to pixels
        let x1 = line.line_box.x1 * cw / 100.0;
        let y1 = line.line_box.y1 * ch / 100.0;
        let x2 = line.line_box.x2 * cw / 100.0;
        let y2 = line.line_box.y2 * ch / 100.0;

        // Calculate bounding box with padding for line heads
        let padding = line.style.stroke_width * 2.0 +
            line.style.start_head.size.max(line.style.end_head.size);
        let min_x = x1.min(x2) - padding;
        let min_y = y1.min(y2) - padding;
        let max_x = x1.max(x2) + padding;
        let max_y = y1.max(y2) + padding;

        // Scale factor for resolution independence
        let scale_factor = ch / 1080.0;

        let stroke_style = match line.style.stroke_style {
            LineStrokeStyle::Solid => STROKE_SOLID,
            LineStrokeStyle::Dashed => STROKE_DASHED,
            LineStrokeStyle::Dotted => STROKE_DOTTED,
        };

        let start_head_type = match line.style.start_head.head_type {
            LineHeadType::None => HEAD_NONE,
            LineHeadType::Arrow => HEAD_ARROW,
            LineHeadType::Circle => HEAD_CIRCLE,
            LineHeadType::Square => HEAD_SQUARE,
            LineHeadType::Diamond => HEAD_DIAMOND,
        };

        let end_head_type = match line.style.end_head.head_type {
            LineHeadType::None => HEAD_NONE,
            LineHeadType::Arrow => HEAD_ARROW,
            LineHeadType::Circle => HEAD_CIRCLE,
            LineHeadType::Square => HEAD_SQUARE,
            LineHeadType::Diamond => HEAD_DIAMOND,
        };

        Self {
            bbox: [min_x, min_y, max_x - min_x, max_y - min_y],
            canvas: [cw, ch, 1.0 / cw, 1.0 / ch],
            fill_color: line.style.stroke, // Lines use stroke as primary color
            stroke_color: line.style.stroke,
            shape_type: SHAPE_LINE,
            sides: 0,
            corner_radius: 0.0,
            stroke_width: line.style.stroke_width * scale_factor,
            opacity: line.opacity,
            has_stroke: 0,
            stroke_style,
            _pad1: 0,
            line_start: [x1, y1],
            line_end: [x2, y2],
            start_head_type,
            start_head_size: line.style.start_head.size * scale_factor,
            end_head_type,
            end_head_size: line.style.end_head.size * scale_factor,
            transition_type: 0,
            transition_progress: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
            scale: 1.0,
            _pad2: [0.0; 3],
        }
    }
}

/// Verify struct size matches shader expectations (160 bytes).
const _: () = assert!(std::mem::size_of::<ShapeUniforms>() == 160);

/// WGSL shader source for shape rendering.
/// Using flat array layout to match Rust struct memory exactly.
const SHAPE_SHADER: &str = r#"
// Uniform data as flat array (10 * vec4<f32> = 160 bytes)
// Layout matches Rust ShapeUniforms:
// data[0] = bbox (x, y, width, height)
// data[1] = canvas (width, height, 1/width, 1/height)
// data[2] = fill_color (rgba)
// data[3] = stroke_color (rgba)
// data[4] = (shape_type, sides, corner_radius, stroke_width) - as bitcast u32/f32
// data[5] = (opacity, has_stroke, stroke_style, _pad)
// data[6] = (line_start.xy, line_end.xy)
// data[7] = (start_head_type, start_head_size, end_head_type, end_head_size)
// data[8] = (transition_type, transition_progress, offset_x, offset_y)
// data[9] = (scale, _pad2.xyz)
struct ShapeUniforms {
    data: array<vec4<f32>, 10>,
};

@group(0) @binding(0) var<uniform> uniforms: ShapeUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) pixel_pos: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    var out: VertexOutput;

    // Quad positions (triangle strip)
    var local_positions = array<vec2<f32>, 4>(
        vec2<f32>(0.0, 0.0),  // top-left
        vec2<f32>(1.0, 0.0),  // top-right
        vec2<f32>(0.0, 1.0),  // bottom-left
        vec2<f32>(1.0, 1.0),  // bottom-right
    );

    let local = local_positions[vi];
    let bbox = uniforms.data[0];  // x, y, width, height
    let canvas = uniforms.data[1];  // width, height, 1/width, 1/height

    // Convert bbox to pixel coordinates
    let pixel_x = bbox.x + local.x * bbox.z;
    let pixel_y = bbox.y + local.y * bbox.w;
    out.pixel_pos = vec2<f32>(pixel_x, pixel_y);

    // Convert to NDC
    let clip_x = (pixel_x / canvas.x) * 2.0 - 1.0;
    let clip_y = 1.0 - (pixel_y / canvas.y) * 2.0;
    out.position = vec4<f32>(clip_x, clip_y, 0.0, 1.0);

    return out;
}

// SDF for rounded rectangle
fn sdf_rounded_rect(p: vec2<f32>, half_size: vec2<f32>, radius: f32) -> f32 {
    let r = min(radius, min(half_size.x, half_size.y));
    let q = abs(p) - half_size + r;
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// SDF for ellipse
fn sdf_ellipse(p: vec2<f32>, ab: vec2<f32>) -> f32 {
    let p_norm = p / ab;
    let d = length(p_norm) - 1.0;
    return d * min(ab.x, ab.y);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let bbox = uniforms.data[0];
    let fill_color = uniforms.data[2];
    let params = uniforms.data[4];  // (shape_type, sides, corner_radius, stroke_width)
    let params2 = uniforms.data[5]; // (opacity, has_stroke, stroke_style, _pad)

    let shape_type = bitcast<u32>(params.x);
    let corner_radius = params.z;
    let opacity = params2.x;

    let half_size = bbox.zw * 0.5;
    let center = bbox.xy + half_size;
    let p = in.pixel_pos - center;

    var d: f32 = 1e10;
    let aa = 1.0;  // Anti-aliasing width

    // Calculate SDF based on shape type
    if shape_type == 0u {
        // Rectangle
        d = sdf_rounded_rect(p, half_size, corner_radius);
    } else if shape_type == 1u {
        // Ellipse
        d = sdf_ellipse(p, half_size);
    } else {
        // Default to rectangle for unknown types
        d = sdf_rounded_rect(p, half_size, corner_radius);
    }

    // Calculate alpha with anti-aliasing
    let alpha = (1.0 - smoothstep(-aa, aa, d)) * fill_color.a * opacity;

    if alpha < 0.001 {
        discard;
    }

    return vec4<f32>(fill_color.rgb, alpha);
}
"#;

/// Create the bind group layout for shape rendering.
pub fn create_shape_bind_group_layout(device: &Device) -> BindGroupLayout {
    device.create_bind_group_layout(&BindGroupLayoutDescriptor {
        label: Some("shape_bind_group_layout"),
        entries: &[
            BindGroupLayoutEntry {
                binding: 0,
                visibility: ShaderStages::VERTEX | ShaderStages::FRAGMENT,
                ty: BindingType::Buffer {
                    ty: BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    })
}

/// Create the render pipeline for shape rendering.
pub fn create_shape_pipeline(
    device: &Device,
    bind_group_layout: &BindGroupLayout,
    target_format: TextureFormat,
) -> RenderPipeline {
    let shader = device.create_shader_module(ShaderModuleDescriptor {
        label: Some("shape_shader"),
        source: ShaderSource::Wgsl(SHAPE_SHADER.into()),
    });

    let pipeline_layout = device.create_pipeline_layout(&PipelineLayoutDescriptor {
        label: Some("shape_pipeline_layout"),
        bind_group_layouts: &[bind_group_layout],
        push_constant_ranges: &[],
    });

    device.create_render_pipeline(&RenderPipelineDescriptor {
        label: Some("shape_pipeline"),
        layout: Some(&pipeline_layout),
        vertex: VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            targets: &[Some(ColorTargetState {
                format: target_format,
                // Use alpha blending for proper transparency
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: PrimitiveState {
            topology: PrimitiveTopology::TriangleStrip,
            strip_index_format: None,
            front_face: FrontFace::Ccw,
            cull_mode: None,
            polygon_mode: PolygonMode::Fill,
            unclipped_depth: false,
            conservative: false,
        },
        depth_stencil: None,
        multisample: MultisampleState::default(),
        multiview: None,
        cache: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uniforms_size() {
        assert_eq!(std::mem::size_of::<ShapeUniforms>(), 160);
    }

    #[test]
    fn default_uniforms() {
        let uniforms = ShapeUniforms::default();
        assert_eq!(uniforms.opacity, 1.0);
        assert_eq!(uniforms.shape_type, SHAPE_RECTANGLE);
    }
}
