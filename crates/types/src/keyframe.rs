//! Keyframe animation types.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::{CubicBezier, Easing, EasingPreset};

/// Interpolation mode between keyframes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum Interpolation {
    /// Linear interpolation between values.
    #[default]
    Linear,
    /// Hold previous value until next keyframe (step function).
    Step,
    /// Cubic bezier interpolation with custom easing.
    Bezier,
}

/// A single keyframe at a specific time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Keyframe {
    /// Time in seconds (relative to clip start).
    pub time: f64,
    /// Value at this keyframe.
    pub value: f32,
    /// Interpolation mode to the next keyframe.
    pub interpolation: Interpolation,
    /// Easing curve (used when interpolation is Bezier).
    pub easing: Easing,
}

impl Keyframe {
    /// Create a linear keyframe.
    pub fn linear(time: f64, value: f32) -> Self {
        Self {
            time,
            value,
            interpolation: Interpolation::Linear,
            easing: Easing::preset(EasingPreset::Linear),
        }
    }

    /// Create a step (hold) keyframe.
    pub fn step(time: f64, value: f32) -> Self {
        Self {
            time,
            value,
            interpolation: Interpolation::Step,
            easing: Easing::default(),
        }
    }

    /// Create a bezier keyframe with custom easing.
    pub fn bezier(time: f64, value: f32, bezier: CubicBezier) -> Self {
        Self {
            time,
            value,
            interpolation: Interpolation::Bezier,
            easing: Easing::custom(bezier),
        }
    }

    /// Create a bezier keyframe with preset easing.
    pub fn eased(time: f64, value: f32, preset: EasingPreset) -> Self {
        Self {
            time,
            value,
            interpolation: Interpolation::Bezier,
            easing: Easing::preset(preset),
        }
    }
}

/// A track of keyframes for a single animatable property.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeyframeTrack {
    /// Property name (e.g., "x", "opacity", "volume").
    pub property: String,
    /// Keyframes sorted by time.
    pub keyframes: Vec<Keyframe>,
}

impl KeyframeTrack {
    /// Create a new empty track for a property.
    pub fn new(property: impl Into<String>) -> Self {
        Self {
            property: property.into(),
            keyframes: Vec::new(),
        }
    }

    /// Create a track with initial keyframes.
    pub fn with_keyframes(property: impl Into<String>, keyframes: Vec<Keyframe>) -> Self {
        let mut track = Self {
            property: property.into(),
            keyframes,
        };
        track.sort();
        track
    }

    /// Add a keyframe and maintain sorted order.
    pub fn add(&mut self, keyframe: Keyframe) {
        let pos = self
            .keyframes
            .binary_search_by(|k| k.time.partial_cmp(&keyframe.time).unwrap())
            .unwrap_or_else(|p| p);
        self.keyframes.insert(pos, keyframe);
    }

    /// Remove a keyframe at the given time (within epsilon).
    pub fn remove_at(&mut self, time: f64, epsilon: f64) -> Option<Keyframe> {
        let pos = self
            .keyframes
            .iter()
            .position(|k| (k.time - time).abs() < epsilon)?;
        Some(self.keyframes.remove(pos))
    }

    /// Sort keyframes by time.
    pub fn sort(&mut self) {
        self.keyframes.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap());
    }

    /// Check if this track has any keyframes.
    pub fn is_empty(&self) -> bool {
        self.keyframes.is_empty()
    }

    /// Get the number of keyframes.
    pub fn len(&self) -> usize {
        self.keyframes.len()
    }

    /// Get the time range covered by this track.
    pub fn time_range(&self) -> Option<(f64, f64)> {
        if self.keyframes.is_empty() {
            return None;
        }
        Some((
            self.keyframes.first().unwrap().time,
            self.keyframes.last().unwrap().time,
        ))
    }
}

/// Collection of keyframe tracks for multiple properties.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct KeyframeTracks {
    /// All keyframe tracks.
    pub tracks: Vec<KeyframeTrack>,
}

impl KeyframeTracks {
    /// Create an empty keyframe collection.
    pub fn new() -> Self {
        Self { tracks: Vec::new() }
    }

    /// Create from a list of tracks.
    pub fn from_tracks(tracks: Vec<KeyframeTrack>) -> Self {
        Self { tracks }
    }

    /// Get a track by property name.
    pub fn get(&self, property: &str) -> Option<&KeyframeTrack> {
        self.tracks.iter().find(|t| t.property == property)
    }

    /// Get a mutable track by property name.
    pub fn get_mut(&mut self, property: &str) -> Option<&mut KeyframeTrack> {
        self.tracks.iter_mut().find(|t| t.property == property)
    }

    /// Get or create a track for the given property.
    pub fn get_or_create(&mut self, property: &str) -> &mut KeyframeTrack {
        if !self.tracks.iter().any(|t| t.property == property) {
            self.tracks.push(KeyframeTrack::new(property));
        }
        self.get_mut(property).unwrap()
    }

    /// Check if a property has keyframes.
    pub fn has_property(&self, property: &str) -> bool {
        self.get(property).is_some_and(|t| !t.is_empty())
    }

    /// List all animated properties.
    pub fn properties(&self) -> Vec<&str> {
        self.tracks.iter().map(|t| t.property.as_str()).collect()
    }

    /// Check if any properties are animated.
    pub fn is_empty(&self) -> bool {
        self.tracks.is_empty() || self.tracks.iter().all(|t| t.is_empty())
    }
}

/// Common animatable property names.
pub mod properties {
    /// Transform properties.
    pub const X: &str = "x";
    pub const Y: &str = "y";
    pub const SCALE_X: &str = "scaleX";
    pub const SCALE_Y: &str = "scaleY";
    pub const ROTATION: &str = "rotation";

    /// Effect properties.
    pub const OPACITY: &str = "opacity";
    pub const BRIGHTNESS: &str = "brightness";
    pub const CONTRAST: &str = "contrast";
    pub const SATURATION: &str = "saturation";
    pub const HUE_ROTATE: &str = "hueRotate";
    pub const BLUR: &str = "blur";

    /// Audio properties.
    pub const VOLUME: &str = "volume";

    /// Shape-specific properties.
    pub const X1: &str = "x1";
    pub const Y1: &str = "y1";
    pub const X2: &str = "x2";
    pub const Y2: &str = "y2";
    pub const STROKE_WIDTH: &str = "strokeWidth";
    pub const CORNER_RADIUS: &str = "cornerRadius";

    /// Size properties.
    pub const WIDTH: &str = "width";
    pub const HEIGHT: &str = "height";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn track_maintains_sorted_order() {
        let mut track = KeyframeTrack::new("opacity");
        track.add(Keyframe::linear(2.0, 0.5));
        track.add(Keyframe::linear(0.0, 1.0));
        track.add(Keyframe::linear(1.0, 0.8));

        assert_eq!(track.keyframes[0].time, 0.0);
        assert_eq!(track.keyframes[1].time, 1.0);
        assert_eq!(track.keyframes[2].time, 2.0);
    }

    #[test]
    fn tracks_get_or_create() {
        let mut tracks = KeyframeTracks::new();
        tracks.get_or_create("x").add(Keyframe::linear(0.0, 100.0));
        tracks.get_or_create("x").add(Keyframe::linear(1.0, 200.0));

        assert!(tracks.has_property("x"));
        assert_eq!(tracks.get("x").unwrap().len(), 2);
    }
}
