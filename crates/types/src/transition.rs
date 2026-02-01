//! Transition effects for clip in/out animations.

use serde::{Deserialize, Serialize};
use tsify_next::Tsify;
use wasm_bindgen::prelude::*;

use crate::Easing;

/// Types of transitions available.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum TransitionType {
    #[default]
    None,
    Fade,
    Dissolve,
    WipeLeft,
    WipeRight,
    WipeUp,
    WipeDown,
    SlideLeft,
    SlideRight,
    SlideUp,
    SlideDown,
    ZoomIn,
    ZoomOut,
    RotateCw,
    RotateCcw,
    FlipH,
    FlipV,
}

impl TransitionType {
    /// Check if this transition affects opacity.
    pub const fn affects_opacity(&self) -> bool {
        matches!(self, Self::Fade | Self::Dissolve)
    }

    /// Check if this transition affects position.
    pub const fn affects_position(&self) -> bool {
        matches!(
            self,
            Self::SlideLeft | Self::SlideRight | Self::SlideUp | Self::SlideDown
        )
    }

    /// Check if this transition affects scale.
    pub const fn affects_scale(&self) -> bool {
        matches!(self, Self::ZoomIn | Self::ZoomOut | Self::FlipH | Self::FlipV)
    }

    /// Check if this transition affects rotation.
    pub const fn affects_rotation(&self) -> bool {
        matches!(self, Self::RotateCw | Self::RotateCcw)
    }
}

/// A transition effect applied to a clip's in or out point.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Transition {
    /// The type of transition effect.
    #[serde(rename = "type")]
    #[tsify(type = "TransitionType")]
    pub transition_type: TransitionType,
    /// Duration of the transition in seconds.
    pub duration: f64,
    /// Easing curve for the transition.
    pub easing: Easing,
}

impl Transition {
    /// Create a new transition.
    pub const fn new(transition_type: TransitionType, duration: f64, easing: Easing) -> Self {
        Self {
            transition_type,
            duration,
            easing,
        }
    }

    /// Create a fade transition with default easing.
    pub fn fade(duration: f64) -> Self {
        Self::new(TransitionType::Fade, duration, Easing::default())
    }

    /// Create a dissolve transition with default easing.
    pub fn dissolve(duration: f64) -> Self {
        Self::new(TransitionType::Dissolve, duration, Easing::default())
    }
}

impl Default for Transition {
    fn default() -> Self {
        Self {
            transition_type: TransitionType::None,
            duration: 0.0,
            easing: Easing::default(),
        }
    }
}

/// Result of calculating transition effect at a specific time.
///
/// These values are deltas/multipliers applied to the base transform.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TransitionEffect {
    /// Opacity multiplier (1.0 = fully visible).
    pub opacity: f32,
    /// X offset in pixels.
    pub x_offset: f32,
    /// Y offset in pixels.
    pub y_offset: f32,
    /// Scale X multiplier.
    pub scale_x: f32,
    /// Scale Y multiplier.
    pub scale_y: f32,
    /// Additional rotation in degrees.
    pub rotation: f32,
}

impl TransitionEffect {
    /// No effect (identity).
    pub const NONE: Self = Self {
        opacity: 1.0,
        x_offset: 0.0,
        y_offset: 0.0,
        scale_x: 1.0,
        scale_y: 1.0,
        rotation: 0.0,
    };

    /// Calculate transition effect for a given progress (0.0-1.0).
    ///
    /// For "in" transitions, progress goes 0→1 as the clip appears.
    /// For "out" transitions, progress goes 0→1 as the clip disappears.
    ///
    /// The `direction` parameter is 1.0 for "in" and -1.0 for "out".
    pub fn calculate(
        transition_type: TransitionType,
        progress: f32,
        canvas_width: f32,
        canvas_height: f32,
        direction: f32,
    ) -> Self {
        let p = progress.clamp(0.0, 1.0);
        let inv_p = 1.0 - p; // For "in" transitions, this is how much is left

        match transition_type {
            TransitionType::None => Self::NONE,

            TransitionType::Fade | TransitionType::Dissolve => Self {
                opacity: p,
                ..Self::NONE
            },

            TransitionType::WipeLeft
            | TransitionType::WipeRight
            | TransitionType::WipeUp
            | TransitionType::WipeDown => Self::NONE,

            TransitionType::SlideLeft => Self {
                x_offset: inv_p * canvas_width * direction,
                ..Self::NONE
            },

            TransitionType::SlideRight => Self {
                x_offset: -inv_p * canvas_width * direction,
                ..Self::NONE
            },

            TransitionType::SlideUp => Self {
                y_offset: inv_p * canvas_height * direction,
                ..Self::NONE
            },

            TransitionType::SlideDown => Self {
                y_offset: -inv_p * canvas_height * direction,
                ..Self::NONE
            },

            TransitionType::ZoomIn => {
                let scale = p; // 0 → 1
                Self {
                    opacity: p,
                    scale_x: scale.max(0.01),
                    scale_y: scale.max(0.01),
                    ..Self::NONE
                }
            }

            TransitionType::ZoomOut => {
                let scale = 1.0 + inv_p; // 2 → 1
                Self {
                    opacity: p,
                    scale_x: scale,
                    scale_y: scale,
                    ..Self::NONE
                }
            }

            TransitionType::RotateCw => Self {
                opacity: p,
                rotation: -inv_p * 90.0 * direction,
                ..Self::NONE
            },

            TransitionType::RotateCcw => Self {
                opacity: p,
                rotation: inv_p * 90.0 * direction,
                ..Self::NONE
            },

            TransitionType::FlipH => Self {
                opacity: p,
                scale_x: p.max(0.01),
                ..Self::NONE
            },

            TransitionType::FlipV => Self {
                opacity: p,
                scale_y: p.max(0.01),
                ..Self::NONE
            },
        }
    }
}

impl Default for TransitionEffect {
    fn default() -> Self {
        Self::NONE
    }
}

/// A cross-transition configuration (type, duration, easing).
///
/// The clip references (IDs) are stored separately in the editor layer.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct CrossTransition {
    /// Type of cross-transition.
    #[serde(rename = "type")]
    #[tsify(type = "CrossTransitionType")]
    pub transition_type: CrossTransitionType,
    /// Duration of the overlap in seconds.
    pub duration: f64,
    /// Easing curve for the transition.
    pub easing: Easing,
}

/// Types of cross-transitions between clips.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum CrossTransitionType {
    #[default]
    Dissolve,
    Fade,
    WipeLeft,
    WipeRight,
    WipeUp,
    WipeDown,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fade_at_half_progress() {
        let effect = TransitionEffect::calculate(TransitionType::Fade, 0.5, 1920.0, 1080.0, 1.0);
        assert!((effect.opacity - 0.5).abs() < f32::EPSILON);
    }

    #[test]
    fn slide_at_zero_progress() {
        let effect = TransitionEffect::calculate(TransitionType::SlideLeft, 0.0, 1920.0, 1080.0, 1.0);
        assert!((effect.x_offset - 1920.0).abs() < f32::EPSILON);
    }

    #[test]
    fn slide_at_full_progress() {
        let effect = TransitionEffect::calculate(TransitionType::SlideLeft, 1.0, 1920.0, 1080.0, 1.0);
        assert!(effect.x_offset.abs() < f32::EPSILON);
    }
}
