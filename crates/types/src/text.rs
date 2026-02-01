//! Text overlay types.

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use crate::ActiveTransition;

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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct TextStyle {
    /// Font family name (must be loaded).
    pub font_family: String,
    /// Font size in pixels.
    pub font_size: f32,
    /// Font weight (100-900, where 400=normal, 700=bold).
    pub font_weight: u16,
    /// Whether text is italic.
    pub italic: bool,
    /// Text color (RGBA 0-1).
    pub color: [f32; 4],
    /// Horizontal alignment.
    #[tsify(type = "TextAlign")]
    pub text_align: TextAlign,
    /// Vertical alignment within the box.
    #[tsify(type = "VerticalAlign")]
    pub vertical_align: VerticalAlign,
    /// Line height multiplier (1.0 = normal).
    pub line_height: f32,
    /// Letter spacing in pixels.
    pub letter_spacing: f32,
    /// Background color (RGBA 0-1).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub background_color: Option<[f32; 4]>,
    /// Background padding in pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub background_padding: Option<f32>,
    /// Background border radius in pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub background_border_radius: Option<f32>,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            font_family: "Inter".to_string(),
            font_size: 48.0,
            font_weight: 400,
            italic: false,
            color: [1.0, 1.0, 1.0, 1.0], // White
            text_align: TextAlign::Center,
            vertical_align: VerticalAlign::Middle,
            line_height: 1.2,
            letter_spacing: 0.0,
            background_color: None,
            background_padding: None,
            background_border_radius: None,
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
    pub fn with_color(mut self, color: [f32; 4]) -> Self {
        self.color = color;
        self
    }

    /// Set the font family.
    pub fn with_font(mut self, font_family: impl Into<String>) -> Self {
        self.font_family = font_family.into();
        self
    }

    /// Set bold weight.
    pub fn bold(mut self) -> Self {
        self.font_weight = 700;
        self
    }

    /// Set italic.
    pub fn italic(mut self) -> Self {
        self.italic = true;
        self
    }
}

/// Text bounding box (position and size as percentages 0-100 of canvas).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct TextBox {
    /// X position (percentage of canvas width).
    pub x: f32,
    /// Y position (percentage of canvas height).
    pub y: f32,
    /// Width (percentage of canvas width).
    pub width: f32,
    /// Height (percentage of canvas height).
    pub height: f32,
}

impl Default for TextBox {
    fn default() -> Self {
        Self {
            x: 50.0,
            y: 50.0,
            width: 80.0,
            height: 20.0,
        }
    }
}

/// Karaoke-style word highlight configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct HighlightStyle {
    /// Override text color for highlighted words (RGBA 0-1).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub color: Option<[f32; 4]>,
    /// Override background color for highlighted words (RGBA 0-1).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub background_color: Option<[f32; 4]>,
    /// Override background padding.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub background_padding: Option<f32>,
    /// Override border radius.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub background_border_radius: Option<f32>,
    /// Override font weight.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub font_weight: Option<u16>,
    /// Scale factor for highlighted words.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub scale: Option<f32>,
}

impl Default for HighlightStyle {
    fn default() -> Self {
        Self {
            color: Some([1.0, 0.8, 0.0, 1.0]), // Yellow
            background_color: None,
            background_padding: None,
            background_border_radius: None,
            font_weight: None,
            scale: None,
        }
    }
}

/// Text layer data for rendering.
///
/// All values are pre-evaluated (keyframes resolved before sending to compositor).
/// This allows stateless, parallel rendering across web workers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct TextLayerData {
    /// Unique identifier.
    pub id: String,
    /// The text content to render.
    pub text: String,
    /// Bounding box (position and size as percentages).
    #[serde(rename = "box")]
    pub text_box: TextBox,
    /// Text styling.
    pub style: TextStyle,
    /// Stacking order (higher = on top).
    pub z_index: i32,
    /// Overall opacity (0.0-1.0).
    pub opacity: f32,
    /// Highlight style for karaoke effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub highlight_style: Option<HighlightStyle>,
    /// Word indices that are currently highlighted (0-based).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub highlighted_word_indices: Option<Vec<usize>>,
    /// Transition in effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_in: Option<ActiveTransition>,
    /// Transition out effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_out: Option<ActiveTransition>,
}

impl TextLayerData {
    /// Create a new text layer.
    pub fn new(id: impl Into<String>, text: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            text_box: TextBox::default(),
            style: TextStyle::default(),
            z_index: 100,
            opacity: 1.0,
            highlight_style: None,
            highlighted_word_indices: None,
            transition_in: None,
            transition_out: None,
        }
    }

    /// Set the position (percentage of canvas).
    pub fn at(mut self, x: f32, y: f32) -> Self {
        self.text_box.x = x;
        self.text_box.y = y;
        self
    }

    /// Set the box size (percentage of canvas).
    pub fn with_size(mut self, width: f32, height: f32) -> Self {
        self.text_box.width = width;
        self.text_box.height = height;
        self
    }

    /// Set the style.
    pub fn with_style(mut self, style: TextStyle) -> Self {
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
    fn text_layer_builder() {
        let layer = TextLayerData::new("text-1", "Hello, World!")
            .at(50.0, 50.0)
            .with_size(80.0, 20.0)
            .with_style(TextStyle::with_size(64.0).bold())
            .with_opacity(0.9);

        assert_eq!(layer.text, "Hello, World!");
        assert_eq!(layer.style.font_size, 64.0);
        assert_eq!(layer.style.font_weight, 700);
        assert_eq!(layer.opacity, 0.9);
    }

    #[test]
    fn text_style_defaults() {
        let style = TextStyle::default();
        assert_eq!(style.font_family, "Inter");
        assert_eq!(style.font_size, 48.0);
        assert_eq!(style.font_weight, 400);
        assert!(!style.italic);
        assert_eq!(style.color, [1.0, 1.0, 1.0, 1.0]);
    }

    #[test]
    fn text_style_builder() {
        let style = TextStyle::with_size(32.0)
            .with_font("Roboto")
            .with_color([1.0, 0.0, 0.0, 1.0])
            .bold()
            .italic();

        assert_eq!(style.font_family, "Roboto");
        assert_eq!(style.font_size, 32.0);
        assert_eq!(style.font_weight, 700);
        assert!(style.italic);
        assert_eq!(style.color, [1.0, 0.0, 0.0, 1.0]);
    }
}
