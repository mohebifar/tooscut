//! Shape overlay types.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::{Color, KeyframeTracks};

/// Shape type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum ShapeType {
    #[default]
    Rectangle,
    Circle,
    Ellipse,
    Line,
    Triangle,
    Polygon,
}

/// Line stroke style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum StrokeStyle {
    #[default]
    Solid,
    Dashed,
    Dotted,
}

/// Line endpoint decoration type.
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

/// Line endpoint configuration.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LineEndpoint {
    /// Type of endpoint decoration.
    pub head_type: LineHeadType,
    /// Size of the decoration in pixels.
    pub head_size: f32,
}

impl Default for LineEndpoint {
    fn default() -> Self {
        Self {
            head_type: LineHeadType::None,
            head_size: 10.0,
        }
    }
}

impl LineEndpoint {
    /// Create an arrow endpoint.
    pub fn arrow(size: f32) -> Self {
        Self {
            head_type: LineHeadType::Arrow,
            head_size: size,
        }
    }

    /// Create a circle endpoint.
    pub fn circle(size: f32) -> Self {
        Self {
            head_type: LineHeadType::Circle,
            head_size: size,
        }
    }
}

/// Shape styling.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShapeStyle {
    /// Fill color.
    pub fill: Color,
    /// Stroke (outline) color.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke: Option<Color>,
    /// Stroke width in pixels.
    pub stroke_width: f32,
    /// Stroke style for lines.
    pub stroke_style: StrokeStyle,
    /// Corner radius for rectangles.
    pub corner_radius: f32,
    /// Start endpoint for lines.
    pub start_head: LineEndpoint,
    /// End endpoint for lines.
    pub end_head: LineEndpoint,
}

impl Default for ShapeStyle {
    fn default() -> Self {
        Self {
            fill: Color::WHITE,
            stroke: None,
            stroke_width: 2.0,
            stroke_style: StrokeStyle::Solid,
            corner_radius: 0.0,
            start_head: LineEndpoint::default(),
            end_head: LineEndpoint::default(),
        }
    }
}

impl ShapeStyle {
    /// Create a filled shape with no stroke.
    pub fn filled(color: Color) -> Self {
        Self {
            fill: color,
            stroke: None,
            ..Default::default()
        }
    }

    /// Create a stroked shape with no fill.
    pub fn stroked(color: Color, width: f32) -> Self {
        Self {
            fill: Color::TRANSPARENT,
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

    /// Set line endpoints.
    pub fn with_endpoints(mut self, start: LineEndpoint, end: LineEndpoint) -> Self {
        self.start_head = start;
        self.end_head = end;
        self
    }
}

/// A shape overlay layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShapeOverlay {
    /// Unique identifier.
    pub id: String,
    /// Shape type.
    pub shape: ShapeType,
    /// Bounding box X position (percentage 0-100 of canvas width).
    pub box_x: f32,
    /// Bounding box Y position (percentage 0-100 of canvas height).
    pub box_y: f32,
    /// Bounding box width (percentage 0-100 of canvas width).
    pub box_width: f32,
    /// Bounding box height (percentage 0-100 of canvas height).
    pub box_height: f32,
    /// For lines: start X (percentage of canvas width).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x1: Option<f32>,
    /// For lines: start Y (percentage of canvas height).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y1: Option<f32>,
    /// For lines: end X (percentage of canvas width).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x2: Option<f32>,
    /// For lines: end Y (percentage of canvas height).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y2: Option<f32>,
    /// Shape styling.
    pub style: ShapeStyle,
    /// Overall opacity (0.0-1.0).
    pub opacity: f32,
    /// Stacking order.
    pub z_index: i32,
    /// Keyframe animations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keyframes: Option<KeyframeTracks>,
    /// Clip start time for keyframe evaluation.
    pub clip_start_time: f64,
}

impl ShapeOverlay {
    /// Create a new rectangle shape.
    pub fn rectangle(id: impl Into<String>, x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            id: id.into(),
            shape: ShapeType::Rectangle,
            box_x: x,
            box_y: y,
            box_width: width,
            box_height: height,
            x1: None,
            y1: None,
            x2: None,
            y2: None,
            style: ShapeStyle::default(),
            opacity: 1.0,
            z_index: 50,
            keyframes: None,
            clip_start_time: 0.0,
        }
    }

    /// Create a new circle shape.
    pub fn circle(id: impl Into<String>, x: f32, y: f32, diameter: f32) -> Self {
        Self {
            id: id.into(),
            shape: ShapeType::Circle,
            box_x: x,
            box_y: y,
            box_width: diameter,
            box_height: diameter,
            x1: None,
            y1: None,
            x2: None,
            y2: None,
            style: ShapeStyle::default(),
            opacity: 1.0,
            z_index: 50,
            keyframes: None,
            clip_start_time: 0.0,
        }
    }

    /// Create a new line.
    pub fn line(id: impl Into<String>, x1: f32, y1: f32, x2: f32, y2: f32) -> Self {
        // Compute bounding box from endpoints
        let min_x = x1.min(x2);
        let min_y = y1.min(y2);
        let max_x = x1.max(x2);
        let max_y = y1.max(y2);

        Self {
            id: id.into(),
            shape: ShapeType::Line,
            box_x: min_x,
            box_y: min_y,
            box_width: (max_x - min_x).max(1.0),
            box_height: (max_y - min_y).max(1.0),
            x1: Some(x1),
            y1: Some(y1),
            x2: Some(x2),
            y2: Some(y2),
            style: ShapeStyle::stroked(Color::WHITE, 2.0),
            opacity: 1.0,
            z_index: 50,
            keyframes: None,
            clip_start_time: 0.0,
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangle_creation() {
        let rect = ShapeOverlay::rectangle("rect-1", 10.0, 20.0, 30.0, 40.0)
            .with_style(ShapeStyle::filled(Color::rgb(1.0, 0.0, 0.0)))
            .with_opacity(0.8);

        assert_eq!(rect.shape, ShapeType::Rectangle);
        assert_eq!(rect.box_x, 10.0);
        assert_eq!(rect.style.fill.r, 1.0);
        assert_eq!(rect.opacity, 0.8);
    }

    #[test]
    fn line_bounding_box() {
        let line = ShapeOverlay::line("line-1", 10.0, 20.0, 50.0, 80.0);

        assert_eq!(line.box_x, 10.0);
        assert_eq!(line.box_y, 20.0);
        assert_eq!(line.box_width, 40.0);
        assert_eq!(line.box_height, 60.0);
    }
}
