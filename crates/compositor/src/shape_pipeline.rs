//! Shape and line rendering pipeline using Signed Distance Fields (SDF).
//!
//! Renders shapes (rectangles, ellipses, polygons) and lines with proper
//! anti-aliasing, fill, stroke, and endpoint decorations.

use bytemuck::{Pod, Zeroable};
use wgpu::{
    BindGroupLayout, BindGroupLayoutDescriptor, BindGroupLayoutEntry, BindingType,
    BufferBindingType, ColorTargetState, ColorWrites, Device, FragmentState, FrontFace,
    MultisampleState, PipelineLayoutDescriptor, PolygonMode, PrimitiveState, PrimitiveTopology,
    RenderPipeline, RenderPipelineDescriptor, ShaderModuleDescriptor, ShaderSource, ShaderStages,
    TextureFormat, VertexState,
};

use tooscut_types::{
    ActiveTransition, LineHeadType, LineLayerData, LineStrokeStyle, ShapeLayerData, ShapeType,
    TransitionEffect,
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
    /// Calculate combined transition opacity from transition_in and transition_out.
    pub fn transition_opacity(
        transition_in: &Option<ActiveTransition>,
        transition_out: &Option<ActiveTransition>,
        canvas_width: f32,
        canvas_height: f32,
    ) -> f32 {
        let mut opacity = 1.0;
        if let Some(ref t_in) = transition_in {
            let e = TransitionEffect::calculate(
                t_in.transition.transition_type,
                t_in.eased_progress(),
                canvas_width,
                canvas_height,
                1.0,
            );
            opacity *= e.opacity;
        }
        if let Some(ref t_out) = transition_out {
            let e = TransitionEffect::calculate(
                t_out.transition.transition_type,
                1.0 - t_out.eased_progress(),
                canvas_width,
                canvas_height,
                -1.0,
            );
            opacity *= e.opacity;
        }
        opacity
    }

    /// Create uniforms from a shape layer.
    pub fn from_shape(shape: &ShapeLayerData, canvas_width: u32, canvas_height: u32) -> Self {
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

        let t_opacity = Self::transition_opacity(
            &shape.transition_in,
            &shape.transition_out,
            cw,
            ch,
        );

        let scaled_stroke_width = shape.style.stroke_width * scale_factor;

        // Expand bbox by stroke width so the stroke isn't clipped at edges.
        // The shader computes center and half_size from bbox, so we offset
        // the bbox while keeping the SDF center unchanged — the shader
        // recalculates center = bbox.xy + bbox.zw*0.5 which stays the same
        // when we expand symmetrically.
        let stroke_pad = if has_stroke { scaled_stroke_width + 1.0 } else { 0.0 };

        Self {
            bbox: [x - stroke_pad, y - stroke_pad, w + stroke_pad * 2.0, h + stroke_pad * 2.0],
            canvas: [cw, ch, 1.0 / cw, 1.0 / ch],
            fill_color: shape.style.fill,
            stroke_color,
            shape_type,
            sides: shape.style.sides.unwrap_or(6),
            corner_radius: shape.style.corner_radius * scale_factor,
            stroke_width: scaled_stroke_width,
            opacity: shape.opacity * t_opacity,
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
    pub fn from_line(line: &LineLayerData, canvas_width: u32, canvas_height: u32) -> Self {
        let cw = canvas_width as f32;
        let ch = canvas_height as f32;

        // Convert percentage to pixels
        let x1 = line.line_box.x1 * cw / 100.0;
        let y1 = line.line_box.y1 * ch / 100.0;
        let x2 = line.line_box.x2 * cw / 100.0;
        let y2 = line.line_box.y2 * ch / 100.0;

        // Calculate bounding box with padding for line heads
        // Use actual pixel values for padding (no scaling)
        let head_size = line.style.start_head.size.max(line.style.end_head.size);
        let padding = line.style.stroke_width * 2.0 + head_size * 2.0;
        let min_x = x1.min(x2) - padding;
        let min_y = y1.min(y2) - padding;
        let max_x = x1.max(x2) + padding;
        let max_y = y1.max(y2) + padding;

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

        let t_opacity = Self::transition_opacity(
            &line.transition_in,
            &line.transition_out,
            cw,
            ch,
        );

        // Line properties use actual pixel values (no resolution scaling)
        // This gives designers direct control over visual appearance
        Self {
            bbox: [min_x, min_y, max_x - min_x, max_y - min_y],
            canvas: [cw, ch, 1.0 / cw, 1.0 / ch],
            fill_color: line.style.stroke, // Lines use stroke as primary color
            stroke_color: line.style.stroke,
            shape_type: SHAPE_LINE,
            sides: 0,
            corner_radius: 0.0,
            stroke_width: line.style.stroke_width,
            opacity: line.opacity * t_opacity,
            has_stroke: 0,
            stroke_style,
            _pad1: 0,
            line_start: [x1, y1],
            line_end: [x2, y2],
            start_head_type,
            start_head_size: line.style.start_head.size,
            end_head_type,
            end_head_size: line.style.end_head.size,
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

// Shape type constants
const SHAPE_RECTANGLE: u32 = 0u;
const SHAPE_ELLIPSE: u32 = 1u;
const SHAPE_POLYGON: u32 = 2u;
const SHAPE_LINE: u32 = 3u;

// Line head type constants
const HEAD_NONE: u32 = 0u;
const HEAD_ARROW: u32 = 1u;
const HEAD_CIRCLE: u32 = 2u;
const HEAD_SQUARE: u32 = 3u;
const HEAD_DIAMOND: u32 = 4u;

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

// SDF for a line segment (capsule shape)
fn sdf_line_segment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, thickness: f32) -> f32 {
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - thickness * 0.5;
}

// SDF for circle
fn sdf_circle(p: vec2<f32>, radius: f32) -> f32 {
    return length(p) - radius;
}

// SDF for a triangle (arrow head)
fn sdf_triangle(p: vec2<f32>, p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>) -> f32 {
    let e0 = p1 - p0;
    let e1 = p2 - p1;
    let e2 = p0 - p2;
    let v0 = p - p0;
    let v1 = p - p1;
    let v2 = p - p2;

    let pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
    let pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
    let pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);

    let s = sign(e0.x * e2.y - e0.y * e2.x);
    let d = min(min(
        vec2<f32>(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
        vec2<f32>(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
        vec2<f32>(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));

    return -sqrt(d.x) * sign(d.y);
}

// SDF for a square (rotated box)
fn sdf_square(p: vec2<f32>, size: f32) -> f32 {
    let q = abs(p);
    return max(q.x, q.y) - size * 0.5;
}

// SDF for a diamond (rotated square)
fn sdf_diamond(p: vec2<f32>, size: f32) -> f32 {
    let q = abs(p);
    return (q.x + q.y) * 0.7071 - size * 0.5;  // 0.7071 = 1/sqrt(2)
}

// Calculate arrow head SDF
fn sdf_arrow_head(p: vec2<f32>, tip: vec2<f32>, dir: vec2<f32>, size: f32) -> f32 {
    // Arrow points in 'dir' direction, tip is at 'tip'
    let perp = vec2<f32>(-dir.y, dir.x);
    let base = tip - dir * size;
    let left = base + perp * size * 0.5;
    let right = base - perp * size * 0.5;
    return sdf_triangle(p, tip, left, right);
}

// Calculate head SDF based on type
fn sdf_head(p: vec2<f32>, center: vec2<f32>, dir: vec2<f32>, head_type: u32, size: f32) -> f32 {
    let local_p = p - center;

    if head_type == HEAD_ARROW {
        return sdf_arrow_head(p, center, dir, size);
    } else if head_type == HEAD_CIRCLE {
        return sdf_circle(local_p, size * 0.5);
    } else if head_type == HEAD_SQUARE {
        // Rotate to align with line direction
        let angle = atan2(dir.y, dir.x);
        let c = cos(-angle);
        let s = sin(-angle);
        let rotated = vec2<f32>(local_p.x * c - local_p.y * s, local_p.x * s + local_p.y * c);
        return sdf_square(rotated, size);
    } else if head_type == HEAD_DIAMOND {
        return sdf_diamond(local_p, size);
    }
    return 1e10;  // HEAD_NONE
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let bbox = uniforms.data[0];
    let fill_color = uniforms.data[2];
    let params = uniforms.data[4];  // (shape_type, sides, corner_radius, stroke_width)
    let params2 = uniforms.data[5]; // (opacity, has_stroke, stroke_style, _pad)
    let line_endpoints = uniforms.data[6];  // (line_start.xy, line_end.xy)
    let head_params = uniforms.data[7];  // (start_head_type, start_head_size, end_head_type, end_head_size)

    let shape_type = bitcast<u32>(params.x);
    let sides = bitcast<u32>(params.y);
    let corner_radius = params.z;
    let stroke_width = params.w;
    let opacity = params2.x;

    let line_start = line_endpoints.xy;
    let line_end = line_endpoints.zw;
    let start_head_type = bitcast<u32>(head_params.x);
    let start_head_size = head_params.y;
    let end_head_type = bitcast<u32>(head_params.z);
    let end_head_size = head_params.w;

    let has_stroke = bitcast<u32>(params2.y);

    // bbox is expanded by stroke_pad for rendering. Recover original shape
    // half_size by subtracting the same padding used on the Rust side.
    let stroke_pad = select(0.0, stroke_width + 1.0, has_stroke == 1u && shape_type != SHAPE_LINE);
    let half_size = bbox.zw * 0.5 - vec2<f32>(stroke_pad, stroke_pad);
    let center = bbox.xy + bbox.zw * 0.5;
    let p = in.pixel_pos - center;

    var d: f32 = 1e10;
    let aa = 1.0;  // Anti-aliasing width

    // Calculate SDF based on shape type
    if shape_type == SHAPE_RECTANGLE {
        d = sdf_rounded_rect(p, half_size, corner_radius);
    } else if shape_type == SHAPE_ELLIPSE {
        d = sdf_ellipse(p, half_size);
    } else if shape_type == SHAPE_POLYGON {
        // Simple polygon using regular polygon SDF
        let n = max(sides, 3u);
        let an = 3.14159265 / f32(n);
        let angle = atan2(p.y, p.x);
        let r = length(p);
        let sector = floor((angle + an) / (2.0 * an));
        let theta = angle - sector * 2.0 * an;
        let q = r * vec2<f32>(cos(theta), abs(sin(theta)));
        let radius = min(half_size.x, half_size.y);
        d = q.x - radius * cos(an);
    } else if shape_type == SHAPE_LINE {
        // Line with optional heads
        let pixel_pos = in.pixel_pos;
        let stroke_style_u = bitcast<u32>(params2.z);

        // Line direction
        let line_vec = line_end - line_start;
        let line_len = length(line_vec);
        var line_dir = vec2<f32>(1.0, 0.0);
        if line_len > 0.001 {
            line_dir = line_vec / line_len;
        }

        // Adjust line endpoints for head sizes (line stops at head base)
        var adjusted_start = line_start;
        var adjusted_end = line_end;
        if start_head_type != HEAD_NONE && start_head_size > 0.0 {
            adjusted_start = line_start + line_dir * start_head_size * 0.3;
        }
        if end_head_type != HEAD_NONE && end_head_size > 0.0 {
            adjusted_end = line_end - line_dir * end_head_size * 0.3;
        }

        // Line segment SDF
        d = sdf_line_segment(pixel_pos, adjusted_start, adjusted_end, stroke_width);

        // Apply dash/dot pattern to the line segment only (not heads)
        if stroke_style_u != 0u && line_len > 0.001 {
            // Project pixel onto line to get parameter t along the line
            let pa = pixel_pos - adjusted_start;
            let ba = adjusted_end - adjusted_start;
            let t_along = dot(pa, ba) / dot(ba, ba);
            let dist_along = t_along * length(ba);

            if stroke_style_u == 1u {
                // Dashed: dash_len = 4× stroke width, gap = 3× stroke width
                let dash_len = stroke_width * 4.0;
                let gap_len = stroke_width * 3.0;
                let period = dash_len + gap_len;
                let phase = dist_along % period;
                if phase > dash_len {
                    d = max(d, 0.5);  // Push outside (transparent)
                }
            } else if stroke_style_u == 2u {
                // Dotted: dot spacing = 3× stroke width
                let spacing = stroke_width * 3.0;
                let phase = dist_along % spacing;
                let dot_center = spacing * 0.5;
                let dot_dist = abs(phase - dot_center);
                if dot_dist > stroke_width * 0.5 {
                    d = max(d, 0.5);  // Push outside (transparent)
                }
            }
        }

        // Start head
        if start_head_type != HEAD_NONE && start_head_size > 0.0 {
            let head_d = sdf_head(pixel_pos, line_start, -line_dir, start_head_type, start_head_size);
            d = min(d, head_d);
        }

        // End head
        if end_head_type != HEAD_NONE && end_head_size > 0.0 {
            let head_d = sdf_head(pixel_pos, line_end, line_dir, end_head_type, end_head_size);
            d = min(d, head_d);
        }
    } else {
        // Default to rectangle for unknown types
        d = sdf_rounded_rect(p, half_size, corner_radius);
    }

    // Stroke handling
    let stroke_color = uniforms.data[3];

    if has_stroke == 1u && stroke_width > 0.0 && shape_type != SHAPE_LINE {
        // For shapes with stroke: the fill region is where d < -stroke_width,
        // the stroke region is where d is between -stroke_width and 0.
        let fill_d = d + stroke_width;
        let fill_alpha = (1.0 - smoothstep(-aa, aa, fill_d)) * fill_color.a * opacity;
        let outer_alpha = (1.0 - smoothstep(-aa, aa, d)) * opacity;
        let stroke_alpha = outer_alpha * stroke_color.a - fill_alpha;

        let total_alpha = fill_alpha + max(stroke_alpha, 0.0);
        if total_alpha < 0.001 {
            discard;
        }

        // Blend fill and stroke colors
        var color = fill_color.rgb * fill_alpha;
        if stroke_alpha > 0.001 {
            color = color + stroke_color.rgb * stroke_alpha;
        }
        return vec4<f32>(color / total_alpha, total_alpha);
    }

    // No stroke — simple fill
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
        entries: &[BindGroupLayoutEntry {
            binding: 0,
            visibility: ShaderStages::VERTEX | ShaderStages::FRAGMENT,
            ty: BindingType::Buffer {
                ty: BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
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
