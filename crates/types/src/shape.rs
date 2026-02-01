//! Shape and line layer types.
//!
//! Primitive shapes: Rectangle (with corner_radius), Ellipse, Polygon.
//! Lines are separate with endpoint decorations (arrows, etc.).

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use crate::ActiveTransition;

// ============================================================================
// Shape Types
// ============================================================================

/// Primitive shape types.
///
/// - Rectangle: 4-sided shape with optional corner radius (square is equal width/height)
/// - Ellipse: Oval shape (circle is equal width/height)
/// - Polygon: N-sided regular polygon defined by number of sides
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum ShapeType {
    #[default]
    Rectangle,
    Ellipse,
    Polygon,
}

/// Shape bounding box (position and size as percentages 0-100 of canvas).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ShapeBox {
    /// X position (percentage of canvas width).
    pub x: f32,
    /// Y position (percentage of canvas height).
    pub y: f32,
    /// Width (percentage of canvas width).
    pub width: f32,
    /// Height (percentage of canvas height).
    pub height: f32,
}

impl Default for ShapeBox {
    fn default() -> Self {
        Self {
            x: 50.0,
            y: 50.0,
            width: 20.0,
            height: 20.0,
        }
    }
}

/// Shape style properties.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ShapeStyle {
    /// Fill color (RGBA 0-1).
    pub fill: [f32; 4],
    /// Stroke (outline) color (RGBA 0-1).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub stroke: Option<[f32; 4]>,
    /// Stroke width in pixels.
    pub stroke_width: f32,
    /// Corner radius for rectangles.
    pub corner_radius: f32,
    /// Number of sides for polygons (3 = triangle, 5 = pentagon, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub sides: Option<u32>,
}

impl Default for ShapeStyle {
    fn default() -> Self {
        Self {
            fill: [1.0, 1.0, 1.0, 1.0], // White
            stroke: None,
            stroke_width: 0.0,
            corner_radius: 0.0,
            sides: None,
        }
    }
}

impl ShapeStyle {
    /// Create a filled shape with no stroke.
    pub fn filled(color: [f32; 4]) -> Self {
        Self {
            fill: color,
            stroke: None,
            ..Default::default()
        }
    }

    /// Create a stroked shape with transparent fill.
    pub fn stroked(color: [f32; 4], width: f32) -> Self {
        Self {
            fill: [0.0, 0.0, 0.0, 0.0], // Transparent
            stroke: Some(color),
            stroke_width: width,
            ..Default::default()
        }
    }

    /// Set corner radius.
    pub fn with_corner_radius(mut self, radius: f32) -> Self {
        self.corner_radius = radius;
        self
    }

    /// Set number of polygon sides.
    pub fn with_sides(mut self, sides: u32) -> Self {
        self.sides = Some(sides);
        self
    }
}

/// Shape layer data for rendering.
///
/// All values are pre-evaluated (keyframes resolved before sending to compositor).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ShapeLayerData {
    /// Unique identifier.
    pub id: String,
    /// Shape type.
    #[tsify(type = "ShapeType")]
    pub shape: ShapeType,
    /// Bounding box (position and size as percentages).
    #[serde(rename = "box")]
    pub shape_box: ShapeBox,
    /// Shape styling.
    pub style: ShapeStyle,
    /// Stacking order (higher = on top).
    pub z_index: i32,
    /// Overall opacity (0.0-1.0).
    pub opacity: f32,
    /// Transition in effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_in: Option<ActiveTransition>,
    /// Transition out effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_out: Option<ActiveTransition>,
}

impl ShapeLayerData {
    /// Create a new rectangle shape.
    pub fn rectangle(id: impl Into<String>, x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            id: id.into(),
            shape: ShapeType::Rectangle,
            shape_box: ShapeBox { x, y, width, height },
            style: ShapeStyle::default(),
            z_index: 50,
            opacity: 1.0,
            transition_in: None,
            transition_out: None,
        }
    }

    /// Create a new ellipse shape.
    pub fn ellipse(id: impl Into<String>, x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            id: id.into(),
            shape: ShapeType::Ellipse,
            shape_box: ShapeBox { x, y, width, height },
            style: ShapeStyle::default(),
            z_index: 50,
            opacity: 1.0,
            transition_in: None,
            transition_out: None,
        }
    }

    /// Create a new circle (ellipse with equal width/height).
    pub fn circle(id: impl Into<String>, x: f32, y: f32, diameter: f32) -> Self {
        Self::ellipse(id, x, y, diameter, diameter)
    }

    /// Create a new polygon shape.
    pub fn polygon(id: impl Into<String>, x: f32, y: f32, width: f32, height: f32, sides: u32) -> Self {
        Self {
            id: id.into(),
            shape: ShapeType::Polygon,
            shape_box: ShapeBox { x, y, width, height },
            style: ShapeStyle::default().with_sides(sides),
            z_index: 50,
            opacity: 1.0,
            transition_in: None,
            transition_out: None,
        }
    }

    /// Create a triangle (3-sided polygon).
    pub fn triangle(id: impl Into<String>, x: f32, y: f32, width: f32, height: f32) -> Self {
        Self::polygon(id, x, y, width, height, 3)
    }

    /// Set the style.
    pub fn with_style(mut self, style: ShapeStyle) -> Self {
        self.style = style;
        self
    }

    /// Set the opacity.
    pub fn with_opacity(mut self, opacity: f32) -> Self {
        self.opacity = opacity;
        self
    }

    /// Set the z-index.
    pub fn with_z_index(mut self, z_index: i32) -> Self {
        self.z_index = z_index;
        self
    }
}

// ============================================================================
// Line Types
// ============================================================================

/// Line endpoint head types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum LineHeadType {
    #[default]
    None,
    Arrow,
    Circle,
    Square,
    Diamond,
}

/// Line stroke style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum LineStrokeStyle {
    #[default]
    Solid,
    Dashed,
    Dotted,
}

/// Line endpoint configuration.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LineEndpoint {
    /// Type of endpoint decoration.
    #[serde(rename = "type")]
    #[tsify(type = "LineHeadType")]
    pub head_type: LineHeadType,
    /// Size of the decoration in pixels.
    pub size: f32,
}

impl Default for LineEndpoint {
    fn default() -> Self {
        Self {
            head_type: LineHeadType::None,
            size: 10.0,
        }
    }
}

impl LineEndpoint {
    /// Create an arrow endpoint.
    pub fn arrow(size: f32) -> Self {
        Self {
            head_type: LineHeadType::Arrow,
            size,
        }
    }

    /// Create a circle endpoint.
    pub fn circle(size: f32) -> Self {
        Self {
            head_type: LineHeadType::Circle,
            size,
        }
    }

    /// Create a square endpoint.
    pub fn square(size: f32) -> Self {
        Self {
            head_type: LineHeadType::Square,
            size,
        }
    }

    /// Create a diamond endpoint.
    pub fn diamond(size: f32) -> Self {
        Self {
            head_type: LineHeadType::Diamond,
            size,
        }
    }
}

/// Line endpoints (as percentages 0-100 of canvas).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LineBox {
    /// Start X position (percentage of canvas width).
    pub x1: f32,
    /// Start Y position (percentage of canvas height).
    pub y1: f32,
    /// End X position (percentage of canvas width).
    pub x2: f32,
    /// End Y position (percentage of canvas height).
    pub y2: f32,
}

impl Default for LineBox {
    fn default() -> Self {
        Self {
            x1: 25.0,
            y1: 50.0,
            x2: 75.0,
            y2: 50.0,
        }
    }
}

/// Line style properties.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LineStyle {
    /// Stroke color (RGBA 0-1).
    pub stroke: [f32; 4],
    /// Stroke width in pixels.
    pub stroke_width: f32,
    /// Stroke style.
    #[tsify(type = "LineStrokeStyle")]
    pub stroke_style: LineStrokeStyle,
    /// Start endpoint decoration.
    pub start_head: LineEndpoint,
    /// End endpoint decoration.
    pub end_head: LineEndpoint,
}

impl Default for LineStyle {
    fn default() -> Self {
        Self {
            stroke: [1.0, 1.0, 1.0, 1.0], // White
            stroke_width: 2.0,
            stroke_style: LineStrokeStyle::Solid,
            start_head: LineEndpoint::default(),
            end_head: LineEndpoint::default(),
        }
    }
}

impl LineStyle {
    /// Set stroke color.
    pub fn with_color(mut self, color: [f32; 4]) -> Self {
        self.stroke = color;
        self
    }

    /// Set stroke width.
    pub fn with_width(mut self, width: f32) -> Self {
        self.stroke_width = width;
        self
    }

    /// Set endpoints.
    pub fn with_endpoints(mut self, start: LineEndpoint, end: LineEndpoint) -> Self {
        self.start_head = start;
        self.end_head = end;
        self
    }

    /// Create an arrow line (arrow at end).
    pub fn arrow(color: [f32; 4], width: f32) -> Self {
        Self {
            stroke: color,
            stroke_width: width,
            stroke_style: LineStrokeStyle::Solid,
            start_head: LineEndpoint::default(),
            end_head: LineEndpoint::arrow(width * 4.0),
        }
    }
}

/// Line layer data for rendering.
///
/// All values are pre-evaluated (keyframes resolved before sending to compositor).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct LineLayerData {
    /// Unique identifier.
    pub id: String,
    /// Line endpoints (as percentages).
    #[serde(rename = "box")]
    pub line_box: LineBox,
    /// Line styling.
    pub style: LineStyle,
    /// Stacking order (higher = on top).
    pub z_index: i32,
    /// Overall opacity (0.0-1.0).
    pub opacity: f32,
    /// Transition in effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_in: Option<ActiveTransition>,
    /// Transition out effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_out: Option<ActiveTransition>,
}

impl LineLayerData {
    /// Create a new line.
    pub fn new(id: impl Into<String>, x1: f32, y1: f32, x2: f32, y2: f32) -> Self {
        Self {
            id: id.into(),
            line_box: LineBox { x1, y1, x2, y2 },
            style: LineStyle::default(),
            z_index: 50,
            opacity: 1.0,
            transition_in: None,
            transition_out: None,
        }
    }

    /// Set the style.
    pub fn with_style(mut self, style: LineStyle) -> Self {
        self.style = style;
        self
    }

    /// Set the opacity.
    pub fn with_opacity(mut self, opacity: f32) -> Self {
        self.opacity = opacity;
        self
    }

    /// Set the z-index.
    pub fn with_z_index(mut self, z_index: i32) -> Self {
        self.z_index = z_index;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangle_creation() {
        let rect = ShapeLayerData::rectangle("rect-1", 10.0, 20.0, 30.0, 40.0)
            .with_style(ShapeStyle::filled([1.0, 0.0, 0.0, 1.0]))
            .with_opacity(0.8);

        assert_eq!(rect.shape, ShapeType::Rectangle);
        assert_eq!(rect.shape_box.x, 10.0);
        assert_eq!(rect.style.fill, [1.0, 0.0, 0.0, 1.0]);
        assert_eq!(rect.opacity, 0.8);
    }

    #[test]
    fn circle_is_ellipse() {
        let circle = ShapeLayerData::circle("circle-1", 50.0, 50.0, 20.0);
        assert_eq!(circle.shape, ShapeType::Ellipse);
        assert_eq!(circle.shape_box.width, circle.shape_box.height);
    }

    #[test]
    fn polygon_with_sides() {
        let triangle = ShapeLayerData::triangle("tri-1", 50.0, 50.0, 30.0, 30.0);
        assert_eq!(triangle.shape, ShapeType::Polygon);
        assert_eq!(triangle.style.sides, Some(3));

        let pentagon = ShapeLayerData::polygon("pent-1", 50.0, 50.0, 30.0, 30.0, 5);
        assert_eq!(pentagon.style.sides, Some(5));
    }

    #[test]
    fn line_creation() {
        let line = LineLayerData::new("line-1", 10.0, 20.0, 50.0, 80.0)
            .with_style(LineStyle::arrow([1.0, 1.0, 1.0, 1.0], 3.0));

        assert_eq!(line.line_box.x1, 10.0);
        assert_eq!(line.line_box.y2, 80.0);
        assert_eq!(line.style.end_head.head_type, LineHeadType::Arrow);
    }

    #[test]
    fn shape_style_builders() {
        let filled = ShapeStyle::filled([0.0, 0.0, 1.0, 1.0]);
        assert_eq!(filled.fill, [0.0, 0.0, 1.0, 1.0]);
        assert!(filled.stroke.is_none());

        let stroked = ShapeStyle::stroked([1.0, 0.0, 0.0, 1.0], 2.0);
        assert_eq!(stroked.fill[3], 0.0); // Transparent
        assert_eq!(stroked.stroke, Some([1.0, 0.0, 0.0, 1.0]));
        assert_eq!(stroked.stroke_width, 2.0);
    }
}
