//! Text overlay types.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::{Color, KeyframeTracks};

/// Text alignment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum TextAlign {
    Left,
    #[default]
    Center,
    Right,
}

/// Vertical alignment for text within its box.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum VerticalAlign {
    Top,
    #[default]
    Middle,
    Bottom,
}

/// Text style configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextStyle {
    /// Font size in pixels.
    pub font_size: f32,
    /// Text color.
    pub color: Color,
    /// Font family name (must be loaded).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    /// Font weight (100-900, where 400=normal, 700=bold).
    pub weight: u16,
    /// Whether text is italic.
    pub italic: bool,
    /// Line height multiplier (1.0 = normal).
    pub line_height: f32,
    /// Letter spacing in pixels.
    pub letter_spacing: f32,
    /// Horizontal alignment.
    pub align: TextAlign,
    /// Vertical alignment within the box.
    pub vertical_align: VerticalAlign,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            font_size: 48.0,
            color: Color::WHITE,
            font_family: None,
            weight: 400,
            italic: false,
            line_height: 1.2,
            letter_spacing: 0.0,
            align: TextAlign::Center,
            vertical_align: VerticalAlign::Middle,
        }
    }
}

impl TextStyle {
    /// Create a style with the given font size.
    pub fn with_size(font_size: f32) -> Self {
        Self {
            font_size,
            ..Default::default()
        }
    }

    /// Set the color.
    pub fn with_color(mut self, color: Color) -> Self {
        self.color = color;
        self
    }

    /// Set the font family.
    pub fn with_font(mut self, font_family: impl Into<String>) -> Self {
        self.font_family = Some(font_family.into());
        self
    }

    /// Set bold weight.
    pub fn bold(mut self) -> Self {
        self.weight = 700;
        self
    }

    /// Set italic.
    pub fn italic(mut self) -> Self {
        self.italic = true;
        self
    }
}

/// Background styling for text.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextBackground {
    /// Background color.
    pub color: Color,
    /// Padding around text in pixels.
    pub padding: f32,
    /// Corner radius in pixels.
    pub border_radius: f32,
}

impl Default for TextBackground {
    fn default() -> Self {
        Self {
            color: Color::new(0.0, 0.0, 0.0, 0.5),
            padding: 8.0,
            border_radius: 4.0,
        }
    }
}

/// Karaoke-style word highlight configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HighlightStyle {
    /// Override text color for highlighted words.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Color>,
    /// Override background color for highlighted words.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_color: Option<Color>,
    /// Override background padding.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_padding: Option<f32>,
    /// Override border radius.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border_radius: Option<f32>,
    /// Override font weight.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weight: Option<u16>,
    /// Scale factor for highlighted words.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scale: Option<f32>,
}

impl Default for HighlightStyle {
    fn default() -> Self {
        Self {
            color: Some(Color::new(1.0, 0.8, 0.0, 1.0)), // Yellow
            background_color: None,
            background_padding: None,
            border_radius: None,
            weight: None,
            scale: None,
        }
    }
}

/// A text overlay layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TextOverlay {
    /// Unique identifier.
    pub id: String,
    /// The text content to render.
    pub text: String,
    /// Bounding box X position (percentage 0-100 of canvas width).
    pub box_x: f32,
    /// Bounding box Y position (percentage 0-100 of canvas height).
    pub box_y: f32,
    /// Bounding box width (percentage 0-100 of canvas width).
    pub box_width: f32,
    /// Bounding box height (percentage 0-100 of canvas height).
    pub box_height: f32,
    /// Text styling.
    pub style: TextStyle,
    /// Background (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<TextBackground>,
    /// Overall opacity (0.0-1.0).
    pub opacity: f32,
    /// Stacking order.
    pub z_index: i32,
    /// Highlight style for karaoke effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight_style: Option<HighlightStyle>,
    /// Word indices that are currently highlighted (0-based).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlighted_word_indices: Option<Vec<usize>>,
    /// Keyframe animations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keyframes: Option<KeyframeTracks>,
    /// Clip start time for keyframe evaluation.
    pub clip_start_time: f64,
}

impl TextOverlay {
    /// Create a new text overlay.
    pub fn new(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            box_x: 50.0,
            box_y: 50.0,
            box_width: 80.0,
            box_height: 20.0,
            style: TextStyle::default(),
            background: None,
            opacity: 1.0,
            z_index: 100,
            highlight_style: None,
            highlighted_word_indices: None,
            keyframes: None,
            clip_start_time: 0.0,
        }
    }

    /// Set the position (percentage of canvas).
    pub fn at(mut self, x: f32, y: f32) -> Self {
        self.box_x = x;
        self.box_y = y;
        self
    }

    /// Set the box size (percentage of canvas).
    pub fn with_size(mut self, width: f32, height: f32) -> Self {
        self.box_width = width;
        self.box_height = height;
        self
    }

    /// Set the style.
    pub fn with_style(mut self, style: TextStyle) -> Self {
        self.style = style;
        self
    }

    /// Add a background.
    pub fn with_background(mut self, background: TextBackground) -> Self {
        self.background = Some(background);
        self
    }

    /// Set the opacity.
    pub fn with_opacity(mut self, opacity: f32) -> Self {
        self.opacity = opacity;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_overlay_builder() {
        let overlay = TextOverlay::new("text-1", "Hello, World!")
            .at(50.0, 50.0)
            .with_size(80.0, 20.0)
            .with_style(TextStyle::with_size(64.0).bold())
            .with_opacity(0.9);

        assert_eq!(overlay.text, "Hello, World!");
        assert_eq!(overlay.style.font_size, 64.0);
        assert_eq!(overlay.style.weight, 700);
        assert_eq!(overlay.opacity, 0.9);
    }
}
