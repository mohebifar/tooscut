//! Layer types for the compositor.
//!
//! A layer represents a single renderable element (video, image, text, shape)
//! with its transform, effects, and animation state.
//!
//! Note: Keyframe evaluation happens in JS before sending to the compositor.
//! The compositor receives pre-evaluated transform/effects values for stateless
//! parallel rendering across workers.

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

use crate::{
    ColorGrading, Crop, CrossTransition, Effects, LineLayerData, ShapeLayerData, TextLayerData,
    Transform, Transition,
};

/// Data for rendering a video/image layer.
///
/// All transform and effects values are pre-evaluated (keyframes resolved in JS).
/// This allows stateless, parallel rendering across web workers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct MediaLayerData {
    /// Unique texture ID for this layer's content.
    pub texture_id: String,
    /// Transform (position, scale, rotation) - pre-evaluated.
    pub transform: Transform,
    /// Visual effects - pre-evaluated.
    pub effects: Effects,
    /// Stacking order (higher = on top).
    pub z_index: i32,
    /// Crop region.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub crop: Option<Crop>,
    /// Transition in effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_in: Option<ActiveTransition>,
    /// Transition out effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub transition_out: Option<ActiveTransition>,
    /// Cross-transition with adjacent clip (only one can be active).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub cross_transition: Option<ActiveCrossTransition>,
    /// Color grading configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[tsify(optional)]
    pub color_grading: Option<ColorGrading>,
}

/// Legacy type alias for MediaLayerData.
#[deprecated(note = "Use MediaLayerData instead")]
pub type LayerData = MediaLayerData;

impl MediaLayerData {
    /// Create a new layer with default settings.
    pub fn new(texture_id: impl Into<String>) -> Self {
        Self {
            texture_id: texture_id.into(),
            transform: Transform::IDENTITY,
            effects: Effects::NONE,
            z_index: 0,
            crop: None,
            transition_in: None,
            transition_out: None,
            cross_transition: None,
            color_grading: None,
        }
    }

    /// Set the transform.
    pub fn with_transform(mut self, transform: Transform) -> Self {
        self.transform = transform;
        self
    }

    /// Set the effects.
    pub fn with_effects(mut self, effects: Effects) -> Self {
        self.effects = effects;
        self
    }

    /// Set the z-index.
    pub fn with_z_index(mut self, z_index: i32) -> Self {
        self.z_index = z_index;
        self
    }

    /// Set the crop region.
    pub fn with_crop(mut self, crop: Crop) -> Self {
        self.crop = Some(crop);
        self
    }
}

/// An active transition with its current progress.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ActiveTransition {
    /// The transition configuration.
    pub transition: Transition,
    /// Current progress (0.0-1.0, before easing is applied).
    pub progress: f32,
}

impl ActiveTransition {
    /// Create a new active transition.
    pub fn new(transition: Transition, progress: f32) -> Self {
        Self {
            transition,
            progress,
        }
    }

    /// Get the eased progress value.
    pub fn eased_progress(&self) -> f32 {
        self.transition.easing.evaluate(self.progress)
    }
}

/// An active cross-transition between two clips.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct ActiveCrossTransition {
    /// The cross-transition configuration.
    pub cross_transition: CrossTransition,
    /// Current progress (0.0-1.0, before easing is applied).
    pub progress: f32,
    /// Whether this layer is the outgoing clip (true) or incoming (false).
    pub is_outgoing: bool,
}

impl ActiveCrossTransition {
    /// Get the eased progress value.
    pub fn eased_progress(&self) -> f32 {
        self.cross_transition.easing.evaluate(self.progress)
    }

    /// Get the opacity for this layer based on cross-transition progress.
    pub fn opacity(&self) -> f32 {
        let p = self.eased_progress();
        if self.is_outgoing {
            1.0 - p // Fade out
        } else {
            p // Fade in
        }
    }
}

/// Render frame request containing all layer types.
///
/// All layer types share the same transition system (transition_in, transition_out).
/// The compositor applies transitions uniformly regardless of layer type.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct RenderFrame {
    /// Media layers (video/image clips).
    pub media_layers: Vec<MediaLayerData>,
    /// Text layers.
    pub text_layers: Vec<TextLayerData>,
    /// Shape layers (rectangle, ellipse, polygon).
    pub shape_layers: Vec<ShapeLayerData>,
    /// Line layers.
    pub line_layers: Vec<LineLayerData>,
    /// Current timeline time in seconds.
    pub timeline_time: f64,
    /// Canvas width in pixels.
    pub width: u32,
    /// Canvas height in pixels.
    pub height: u32,
}

impl RenderFrame {
    /// Create a new empty render frame.
    pub fn new(width: u32, height: u32, timeline_time: f64) -> Self {
        Self {
            media_layers: Vec::new(),
            text_layers: Vec::new(),
            shape_layers: Vec::new(),
            line_layers: Vec::new(),
            timeline_time,
            width,
            height,
        }
    }

    /// Add a media layer to the frame.
    pub fn add_media_layer(&mut self, layer: MediaLayerData) {
        self.media_layers.push(layer);
    }

    /// Add a text layer to the frame.
    pub fn add_text_layer(&mut self, layer: TextLayerData) {
        self.text_layers.push(layer);
    }

    /// Add a shape layer to the frame.
    pub fn add_shape_layer(&mut self, layer: ShapeLayerData) {
        self.shape_layers.push(layer);
    }

    /// Add a line layer to the frame.
    pub fn add_line_layer(&mut self, layer: LineLayerData) {
        self.line_layers.push(layer);
    }

    /// Sort media layers by z-index for proper rendering order.
    pub fn sort_media_by_z_index(&mut self) {
        self.media_layers.sort_by_key(|l| l.z_index);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layer_builder_pattern() {
        let layer = MediaLayerData::new("video-1")
            .with_transform(Transform::at(100.0, 200.0))
            .with_effects(Effects::with_opacity(0.8))
            .with_z_index(5);

        assert_eq!(layer.texture_id, "video-1");
        assert_eq!(layer.transform.x, 100.0);
        assert_eq!(layer.effects.opacity, 0.8);
        assert_eq!(layer.z_index, 5);
    }

    #[test]
    fn render_frame_sorting() {
        let mut frame = RenderFrame::new(1920, 1080, 0.0);
        frame.add_media_layer(MediaLayerData::new("a").with_z_index(10));
        frame.add_media_layer(MediaLayerData::new("b").with_z_index(1));
        frame.add_media_layer(MediaLayerData::new("c").with_z_index(5));

        frame.sort_media_by_z_index();

        assert_eq!(frame.media_layers[0].texture_id, "b");
        assert_eq!(frame.media_layers[1].texture_id, "c");
        assert_eq!(frame.media_layers[2].texture_id, "a");
    }
}
