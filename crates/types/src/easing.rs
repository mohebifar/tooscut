//! Easing functions and cubic bezier curves.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Cubic bezier control points [x1, y1, x2, y2].
/// Controls the acceleration curve of animations and transitions.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[wasm_bindgen(getter_with_clone)]
pub struct CubicBezier {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
}

#[wasm_bindgen]
impl CubicBezier {
    #[wasm_bindgen(constructor)]
    pub fn new(x1: f32, y1: f32, x2: f32, y2: f32) -> Self {
        Self { x1, y1, x2, y2 }
    }

    /// Evaluate the bezier curve at progress t (0.0-1.0).
    /// Uses Newton-Raphson iteration to find the curve parameter.
    pub fn evaluate(&self, t: f32) -> f32 {
        if t <= 0.0 {
            return 0.0;
        }
        if t >= 1.0 {
            return 1.0;
        }

        // Newton-Raphson to find x(u) = t
        let mut u = t; // Initial guess
        for _ in 0..8 {
            let x = self.sample_x(u) - t;
            if x.abs() < 1e-6 {
                break;
            }
            let dx = self.sample_dx(u);
            if dx.abs() < 1e-6 {
                break;
            }
            u -= x / dx;
        }

        self.sample_y(u.clamp(0.0, 1.0))
    }
}

impl CubicBezier {
    pub const LINEAR: Self = Self { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 };
    pub const EASE_IN: Self = Self { x1: 0.42, y1: 0.0, x2: 1.0, y2: 1.0 };
    pub const EASE_OUT: Self = Self { x1: 0.0, y1: 0.0, x2: 0.58, y2: 1.0 };
    pub const EASE_IN_OUT: Self = Self { x1: 0.42, y1: 0.0, x2: 0.58, y2: 1.0 };

    /// Sample the X coordinate at parameter u.
    #[inline]
    fn sample_x(&self, u: f32) -> f32 {
        let u2 = u * u;
        let u3 = u2 * u;
        let mt = 1.0 - u;
        let mt2 = mt * mt;

        3.0 * mt2 * u * self.x1 + 3.0 * mt * u2 * self.x2 + u3
    }

    /// Sample the Y coordinate at parameter u.
    #[inline]
    fn sample_y(&self, u: f32) -> f32 {
        let u2 = u * u;
        let u3 = u2 * u;
        let mt = 1.0 - u;
        let mt2 = mt * mt;

        3.0 * mt2 * u * self.y1 + 3.0 * mt * u2 * self.y2 + u3
    }

    /// Derivative of X with respect to u.
    #[inline]
    fn sample_dx(&self, u: f32) -> f32 {
        let u2 = u * u;
        let mt = 1.0 - u;

        3.0 * mt * mt * self.x1 + 6.0 * mt * u * (self.x2 - self.x1) + 3.0 * u2 * (1.0 - self.x2)
    }
}

impl Default for CubicBezier {
    fn default() -> Self {
        Self::LINEAR
    }
}

impl From<[f32; 4]> for CubicBezier {
    fn from([x1, y1, x2, y2]: [f32; 4]) -> Self {
        Self { x1, y1, x2, y2 }
    }
}

impl From<CubicBezier> for [f32; 4] {
    fn from(b: CubicBezier) -> Self {
        [b.x1, b.y1, b.x2, b.y2]
    }
}

/// Common easing presets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[wasm_bindgen]
pub enum EasingPreset {
    #[default]
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    Custom,
}

impl EasingPreset {
    /// Get the cubic bezier curve for this preset.
    pub const fn to_bezier(&self) -> CubicBezier {
        match self {
            Self::Linear => CubicBezier::LINEAR,
            Self::EaseIn => CubicBezier::EASE_IN,
            Self::EaseOut => CubicBezier::EASE_OUT,
            Self::EaseInOut => CubicBezier::EASE_IN_OUT,
            Self::Custom => CubicBezier::EASE_IN_OUT, // Fallback
        }
    }
}

/// Combined easing configuration.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Easing {
    pub preset: EasingPreset,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_bezier: Option<CubicBezier>,
}

impl Easing {
    /// Create a new easing with a preset.
    pub const fn preset(preset: EasingPreset) -> Self {
        Self {
            preset,
            custom_bezier: None,
        }
    }

    /// Create a custom easing with explicit bezier curve.
    pub const fn custom(bezier: CubicBezier) -> Self {
        Self {
            preset: EasingPreset::Custom,
            custom_bezier: Some(bezier),
        }
    }

    /// Get the effective cubic bezier curve.
    pub fn to_bezier(&self) -> CubicBezier {
        self.custom_bezier.unwrap_or_else(|| self.preset.to_bezier())
    }

    /// Evaluate the easing at progress t (0.0-1.0).
    pub fn evaluate(&self, t: f32) -> f32 {
        self.to_bezier().evaluate(t)
    }
}

impl Default for Easing {
    fn default() -> Self {
        Self::preset(EasingPreset::Linear)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_easing() {
        let easing = Easing::preset(EasingPreset::Linear);
        assert!((easing.evaluate(0.0) - 0.0).abs() < 1e-6);
        assert!((easing.evaluate(0.5) - 0.5).abs() < 1e-6);
        assert!((easing.evaluate(1.0) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn ease_in_starts_slow() {
        let easing = Easing::preset(EasingPreset::EaseIn);
        let mid = easing.evaluate(0.5);
        assert!(mid < 0.5, "ease-in at 0.5 should be < 0.5, got {mid}");
    }

    #[test]
    fn ease_out_starts_fast() {
        let easing = Easing::preset(EasingPreset::EaseOut);
        let mid = easing.evaluate(0.5);
        assert!(mid > 0.5, "ease-out at 0.5 should be > 0.5, got {mid}");
    }
}
