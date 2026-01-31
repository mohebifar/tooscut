//! Keyframe animation evaluation with temporal coherence caching.
//!
//! This crate provides efficient keyframe interpolation for video editor
//! animations. It leverages temporal coherence (frame-to-frame locality)
//! to minimize binary searches during sequential playback.

mod evaluator;

pub use evaluator::KeyframeEvaluator;

// Re-export types for convenience
pub use tooscut_types::{
    CubicBezier, Easing, EasingPreset, Interpolation, Keyframe, KeyframeTrack, KeyframeTracks,
};

use wasm_bindgen::prelude::*;

/// Evaluate a single keyframe track at the given time.
///
/// This is a convenience function for one-off evaluations.
/// For repeated evaluations, use `KeyframeEvaluator` which caches
/// the last index for better performance.
#[wasm_bindgen]
pub fn evaluate_track(track_json: &str, time: f64) -> Result<f32, JsValue> {
    let track: KeyframeTrack =
        serde_json::from_str(track_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(evaluate_keyframes(&track.keyframes, time))
}

/// Evaluate a list of keyframes at the given time.
pub fn evaluate_keyframes(keyframes: &[Keyframe], time: f64) -> f32 {
    if keyframes.is_empty() {
        return 0.0;
    }

    // Before first keyframe
    if time <= keyframes[0].time {
        return keyframes[0].value;
    }

    // After last keyframe
    if time >= keyframes[keyframes.len() - 1].time {
        return keyframes[keyframes.len() - 1].value;
    }

    // Binary search for the keyframe pair
    let idx = keyframes
        .binary_search_by(|k| k.time.partial_cmp(&time).unwrap())
        .unwrap_or_else(|i| i.saturating_sub(1));

    let k1 = &keyframes[idx];
    let k2 = &keyframes[(idx + 1).min(keyframes.len() - 1)];

    interpolate_keyframes(k1, k2, time)
}

/// Interpolate between two keyframes.
fn interpolate_keyframes(k1: &Keyframe, k2: &Keyframe, time: f64) -> f32 {
    if k1.time >= k2.time {
        return k1.value;
    }

    // Calculate linear progress
    let t = ((time - k1.time) / (k2.time - k1.time)) as f32;

    match k1.interpolation {
        Interpolation::Step => k1.value,
        Interpolation::Linear => {
            // Linear interpolation
            k1.value + (k2.value - k1.value) * t
        }
        Interpolation::Bezier => {
            // Apply easing to time, then interpolate value
            let eased_t = k1.easing.evaluate(t);
            k1.value + (k2.value - k1.value) * eased_t
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_track(keyframes: Vec<Keyframe>) -> KeyframeTrack {
        KeyframeTrack {
            property: "test".to_string(),
            keyframes,
        }
    }

    #[test]
    fn empty_track_returns_zero() {
        assert_eq!(evaluate_keyframes(&[], 1.0), 0.0);
    }

    #[test]
    fn single_keyframe_returns_value() {
        let kfs = vec![Keyframe::linear(1.0, 100.0)];
        assert_eq!(evaluate_keyframes(&kfs, 0.0), 100.0);
        assert_eq!(evaluate_keyframes(&kfs, 1.0), 100.0);
        assert_eq!(evaluate_keyframes(&kfs, 2.0), 100.0);
    }

    #[test]
    fn linear_interpolation() {
        let kfs = vec![Keyframe::linear(0.0, 0.0), Keyframe::linear(1.0, 100.0)];

        assert!((evaluate_keyframes(&kfs, 0.0) - 0.0).abs() < 0.001);
        assert!((evaluate_keyframes(&kfs, 0.5) - 50.0).abs() < 0.001);
        assert!((evaluate_keyframes(&kfs, 1.0) - 100.0).abs() < 0.001);
    }

    #[test]
    fn step_interpolation() {
        let kfs = vec![Keyframe::step(0.0, 0.0), Keyframe::step(1.0, 100.0)];

        assert_eq!(evaluate_keyframes(&kfs, 0.0), 0.0);
        assert_eq!(evaluate_keyframes(&kfs, 0.5), 0.0);
        assert_eq!(evaluate_keyframes(&kfs, 0.99), 0.0);
        assert_eq!(evaluate_keyframes(&kfs, 1.0), 100.0);
    }

    #[test]
    fn before_first_keyframe() {
        let kfs = vec![Keyframe::linear(1.0, 50.0), Keyframe::linear(2.0, 100.0)];
        assert_eq!(evaluate_keyframes(&kfs, 0.0), 50.0);
    }

    #[test]
    fn after_last_keyframe() {
        let kfs = vec![Keyframe::linear(0.0, 0.0), Keyframe::linear(1.0, 50.0)];
        assert_eq!(evaluate_keyframes(&kfs, 2.0), 50.0);
    }
}
