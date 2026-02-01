//! Visual effects applied to layers.

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

/// Visual effects that can be applied to any layer.
///
/// All values use intuitive ranges where 1.0 is the default/neutral.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Effects {
    /// Opacity (0.0 = transparent, 1.0 = opaque).
    pub opacity: f32,
    /// Brightness multiplier (1.0 = normal).
    pub brightness: f32,
    /// Contrast multiplier (1.0 = normal).
    pub contrast: f32,
    /// Saturation multiplier (0.0 = grayscale, 1.0 = normal, 2.0 = oversaturated).
    pub saturation: f32,
    /// Hue rotation in degrees (0-360).
    pub hue_rotate: f32,
    /// Gaussian blur radius in pixels.
    pub blur: f32,
}

impl Effects {
    /// Create a new Effects instance.
    pub fn new(opacity: f32, brightness: f32, contrast: f32, saturation: f32, hue_rotate: f32, blur: f32) -> Self {
        Self { opacity, brightness, contrast, saturation, hue_rotate, blur }
    }
}

impl Effects {
    /// No effects applied (all defaults).
    pub const NONE: Self = Self {
        opacity: 1.0,
        brightness: 1.0,
        contrast: 1.0,
        saturation: 1.0,
        hue_rotate: 0.0,
        blur: 0.0,
    };

    /// Create effects with only opacity set.
    pub const fn with_opacity(opacity: f32) -> Self {
        Self { opacity, ..Self::NONE }
    }

    /// Check if any effects are applied (not default).
    pub fn has_effects(&self) -> bool {
        (self.opacity - 1.0).abs() > f32::EPSILON
            || (self.brightness - 1.0).abs() > f32::EPSILON
            || (self.contrast - 1.0).abs() > f32::EPSILON
            || (self.saturation - 1.0).abs() > f32::EPSILON
            || self.hue_rotate.abs() > f32::EPSILON
            || self.blur > f32::EPSILON
    }

    /// Check if blur is applied.
    pub fn has_blur(&self) -> bool {
        self.blur > f32::EPSILON
    }
}

impl Default for Effects {
    fn default() -> Self {
        Self::NONE
    }
}

/// Animatable effect property names.
///
/// Used for keyframe animation targeting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum EffectProperty {
    Opacity,
    Brightness,
    Contrast,
    Saturation,
    HueRotate,
    Blur,
}

impl EffectProperty {
    /// Get the default value for this property.
    pub const fn default_value(&self) -> f32 {
        match self {
            Self::Opacity => 1.0,
            Self::Brightness => 1.0,
            Self::Contrast => 1.0,
            Self::Saturation => 1.0,
            Self::HueRotate => 0.0,
            Self::Blur => 0.0,
        }
    }

    /// Get this property's value from an Effects struct.
    pub fn get(&self, effects: &Effects) -> f32 {
        match self {
            Self::Opacity => effects.opacity,
            Self::Brightness => effects.brightness,
            Self::Contrast => effects.contrast,
            Self::Saturation => effects.saturation,
            Self::HueRotate => effects.hue_rotate,
            Self::Blur => effects.blur,
        }
    }

    /// Set this property's value in an Effects struct.
    pub fn set(&self, effects: &mut Effects, value: f32) {
        match self {
            Self::Opacity => effects.opacity = value,
            Self::Brightness => effects.brightness = value,
            Self::Contrast => effects.contrast = value,
            Self::Saturation => effects.saturation = value,
            Self::HueRotate => effects.hue_rotate = value,
            Self::Blur => effects.blur = value,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_has_no_effects() {
        assert!(!Effects::NONE.has_effects());
    }

    #[test]
    fn opacity_change_is_detected() {
        let effects = Effects::with_opacity(0.5);
        assert!(effects.has_effects());
    }

    #[test]
    fn property_roundtrip() {
        let mut effects = Effects::NONE;
        EffectProperty::Blur.set(&mut effects, 5.0);
        assert!((EffectProperty::Blur.get(&effects) - 5.0).abs() < f32::EPSILON);
    }
}
