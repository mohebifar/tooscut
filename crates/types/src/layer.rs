//! Layer types for the compositor.
//!
//! A layer represents a single renderable element (video, image, text, shape)
//! with its transform, effects, and animation state.

use serde::{Deserialize, Serialize};

use crate::{Crop, CrossTransition, Effects, KeyframeTracks, Transform, Transition};

/// Data for rendering a video/image layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LayerData {
    /// Unique texture ID for this layer's content.
    pub texture_id: String,
    /// Transform (position, scale, rotation).
    pub transform: Transform,
    /// Visual effects.
    pub effects: Effects,
    /// Stacking order (higher = on top).
    pub z_index: i32,
    /// Crop region.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crop: Option<Crop>,
    /// Transition in effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_in: Option<ActiveTransition>,
    /// Transition out effect.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_out: Option<ActiveTransition>,
    /// Cross-transition with adjacent clip (only one can be active).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cross_transition: Option<ActiveCrossTransition>,
    /// Keyframe animations.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keyframes: Option<KeyframeTracks>,
    /// Clip start time on timeline (for keyframe evaluation).
    pub clip_start_time: f64,
}

impl LayerData {
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
            keyframes: None,
            clip_start_time: 0.0,
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActiveTransition {
    /// The transition configuration.
    pub transition: Transition,
    /// Current progress (0.0-1.0, before easing is applied).
    pub progress: f32,
}

impl ActiveTransition {
    /// Create a new active transition.
    pub fn new(transition: Transition, progress: f32) -> Self {
        Self { transition, progress }
    }

    /// Get the eased progress value.
    pub fn eased_progress(&self) -> f32 {
        self.transition.easing.evaluate(self.progress)
    }
}

/// An active cross-transition between two clips.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// Render frame request containing all layers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RenderFrame {
    /// Video/image layers.
    pub layers: Vec<LayerData>,
    /// Current timeline time in seconds.
    pub timeline_time: f64,
    /// Canvas width.
    pub width: u32,
    /// Canvas height.
    pub height: u32,
}

impl RenderFrame {
    /// Create a new render frame.
    pub fn new(width: u32, height: u32, timeline_time: f64) -> Self {
        Self {
            layers: Vec::new(),
            timeline_time,
            width,
            height,
        }
    }

    /// Add a layer to the frame.
    pub fn add_layer(&mut self, layer: LayerData) {
        self.layers.push(layer);
    }

    /// Sort layers by z-index for proper rendering order.
    pub fn sort_by_z_index(&mut self) {
        self.layers.sort_by_key(|l| l.z_index);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layer_builder_pattern() {
        let layer = LayerData::new("video-1")
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
        frame.add_layer(LayerData::new("a").with_z_index(10));
        frame.add_layer(LayerData::new("b").with_z_index(1));
        frame.add_layer(LayerData::new("c").with_z_index(5));

        frame.sort_by_z_index();

        assert_eq!(frame.layers[0].texture_id, "b");
        assert_eq!(frame.layers[1].texture_id, "c");
        assert_eq!(frame.layers[2].texture_id, "a");
    }
}
