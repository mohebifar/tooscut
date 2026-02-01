//! Keyframe evaluator with temporal coherence caching.

use std::collections::HashMap;

use tooscut_types::{Keyframe, KeyframeTracks};
use wasm_bindgen::prelude::*;

use crate::interpolate_keyframes;

/// Keyframe evaluator with temporal coherence caching.
///
/// During sequential playback (frame-by-frame), the current time typically
/// advances by a small delta. This evaluator caches the last keyframe index
/// for each property, allowing O(1) lookups when time moves forward slightly.
///
/// When seeking (large time jumps), it falls back to binary search O(log n).
#[wasm_bindgen]
pub struct KeyframeEvaluator {
    tracks: KeyframeTracks,
    /// Cached index for each property (last keyframe index used).
    cache: HashMap<String, usize>,
}

#[wasm_bindgen]
impl KeyframeEvaluator {
    /// Create a new evaluator from a KeyframeTracks object.
    #[wasm_bindgen(constructor)]
    pub fn new(tracks: JsValue) -> Result<KeyframeEvaluator, JsValue> {
        let tracks: KeyframeTracks =
            serde_wasm_bindgen::from_value(tracks).map_err(|e| JsValue::from_str(&e.to_string()))?;

        Ok(Self::from_tracks(tracks))
    }

    /// Evaluate a property at the given time.
    ///
    /// Returns `None` (as NaN) if the property doesn't exist.
    #[wasm_bindgen]
    pub fn evaluate(&mut self, property: &str, time: f64) -> f64 {
        self.evaluate_property(property, time)
            .map(|v| v as f64)
            .unwrap_or(f64::NAN)
    }

    /// Check if a property exists and has keyframes.
    #[wasm_bindgen]
    pub fn has_property(&self, property: &str) -> bool {
        self.tracks.has_property(property)
    }

    /// Clear the temporal cache (call after seeking).
    #[wasm_bindgen]
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    /// Get all animated property names.
    #[wasm_bindgen]
    pub fn properties(&self) -> Result<JsValue, JsValue> {
        let props: Vec<&str> = self.tracks.properties();
        serde_wasm_bindgen::to_value(&props).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

impl KeyframeEvaluator {
    /// Create from parsed tracks.
    pub fn from_tracks(tracks: KeyframeTracks) -> Self {
        Self {
            tracks,
            cache: HashMap::new(),
        }
    }

    /// Evaluate a property, returning an Option.
    pub fn evaluate_property(&mut self, property: &str, time: f64) -> Option<f32> {
        let track = self.tracks.get(property)?;
        let keyframes = &track.keyframes;

        if keyframes.is_empty() {
            return None;
        }

        // Single keyframe - always return its value
        if keyframes.len() == 1 {
            return Some(keyframes[0].value);
        }

        // Before first keyframe
        if time <= keyframes[0].time {
            return Some(keyframes[0].value);
        }

        // After last keyframe
        let last_idx = keyframes.len() - 1;
        if time >= keyframes[last_idx].time {
            return Some(keyframes[last_idx].value);
        }

        // Try to use cached index for temporal coherence
        let idx = if let Some(&cached_idx) = self.cache.get(property) {
            self.find_index_from_cache(keyframes, time, cached_idx)
        } else {
            self.binary_search_index(keyframes, time)
        };

        // Update cache
        self.cache.insert(property.to_string(), idx);

        // Interpolate between keyframes[idx] and keyframes[idx + 1]
        let k1 = &keyframes[idx];
        let k2 = &keyframes[idx + 1];

        Some(interpolate_keyframes(k1, k2, time))
    }

    /// Find keyframe index using cached hint.
    ///
    /// First tries forward linear search from cached index (fast for sequential playback).
    /// Falls back to binary search for large time jumps.
    fn find_index_from_cache(&self, keyframes: &[Keyframe], time: f64, cached_idx: usize) -> usize {
        let len = keyframes.len();
        let idx = cached_idx.min(len.saturating_sub(2));

        // Check if time is still in the same segment
        if idx < len - 1 && keyframes[idx].time <= time && time < keyframes[idx + 1].time {
            return idx;
        }

        // Try forward linear search (common case during playback)
        let search_limit = 4; // Only search a few frames forward
        for i in 0..search_limit {
            let check_idx = idx + i + 1;
            if check_idx >= len - 1 {
                break;
            }
            if keyframes[check_idx].time <= time && time < keyframes[check_idx + 1].time {
                return check_idx;
            }
        }

        // Fall back to binary search for seeks
        self.binary_search_index(keyframes, time)
    }

    /// Binary search for the keyframe index.
    fn binary_search_index(&self, keyframes: &[Keyframe], time: f64) -> usize {
        // Find the rightmost keyframe with time <= given time
        let result = keyframes.binary_search_by(|k| {
            k.time.partial_cmp(&time).unwrap_or(std::cmp::Ordering::Equal)
        });

        match result {
            Ok(i) => i.min(keyframes.len() - 2),
            Err(i) => i.saturating_sub(1).min(keyframes.len() - 2),
        }
    }

    /// Evaluate all animated properties at the given time.
    ///
    /// Returns a map of property name to value.
    pub fn evaluate_all(&mut self, time: f64) -> HashMap<String, f32> {
        // Collect property names first to avoid borrow conflict
        let properties: Vec<String> = self
            .tracks
            .tracks
            .iter()
            .map(|t| t.property.clone())
            .collect();

        let mut result = HashMap::new();
        for property in properties {
            if let Some(value) = self.evaluate_property(&property, time) {
                result.insert(property, value);
            }
        }

        result
    }

    /// Get the time range covered by all tracks.
    pub fn time_range(&self) -> Option<(f64, f64)> {
        let mut min_time = f64::MAX;
        let mut max_time = f64::MIN;

        for track in &self.tracks.tracks {
            if let Some((start, end)) = track.time_range() {
                min_time = min_time.min(start);
                max_time = max_time.max(end);
            }
        }

        if min_time <= max_time {
            Some((min_time, max_time))
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tooscut_types::KeyframeTrack;

    fn make_linear_track(property: &str, keyframes: Vec<(f64, f32)>) -> KeyframeTrack {
        KeyframeTrack {
            property: property.to_string(),
            keyframes: keyframes
                .into_iter()
                .map(|(t, v)| Keyframe::linear(t, v))
                .collect(),
        }
    }

    #[test]
    fn evaluator_linear_interpolation() {
        let tracks = KeyframeTracks::from_tracks(vec![make_linear_track("x", vec![
            (0.0, 0.0),
            (1.0, 100.0),
            (2.0, 50.0),
        ])]);

        let mut eval = KeyframeEvaluator::from_tracks(tracks);

        assert!((eval.evaluate_property("x", 0.0).unwrap() - 0.0).abs() < 0.001);
        assert!((eval.evaluate_property("x", 0.5).unwrap() - 50.0).abs() < 0.001);
        assert!((eval.evaluate_property("x", 1.0).unwrap() - 100.0).abs() < 0.001);
        assert!((eval.evaluate_property("x", 1.5).unwrap() - 75.0).abs() < 0.001);
        assert!((eval.evaluate_property("x", 2.0).unwrap() - 50.0).abs() < 0.001);
    }

    #[test]
    fn cache_improves_sequential_access() {
        let tracks = KeyframeTracks::from_tracks(vec![make_linear_track(
            "opacity",
            (0..100).map(|i| (i as f64 * 0.1, i as f32)).collect(),
        )]);

        let mut eval = KeyframeEvaluator::from_tracks(tracks);

        // Simulate sequential playback
        for i in 0..1000 {
            let time = i as f64 * 0.01;
            let _ = eval.evaluate_property("opacity", time);
        }

        // Cache should be populated
        assert!(eval.cache.contains_key("opacity"));
    }

    #[test]
    fn nonexistent_property_returns_none() {
        let tracks = KeyframeTracks::from_tracks(vec![make_linear_track("x", vec![(0.0, 100.0)])]);

        let mut eval = KeyframeEvaluator::from_tracks(tracks);

        assert!(eval.evaluate_property("nonexistent", 0.0).is_none());
    }

    #[test]
    fn evaluate_all_returns_all_properties() {
        let tracks = KeyframeTracks::from_tracks(vec![
            make_linear_track("x", vec![(0.0, 100.0), (1.0, 200.0)]),
            make_linear_track("y", vec![(0.0, 50.0), (1.0, 150.0)]),
        ]);

        let mut eval = KeyframeEvaluator::from_tracks(tracks);
        let values = eval.evaluate_all(0.5);

        assert!((values["x"] - 150.0).abs() < 0.001);
        assert!((values["y"] - 100.0).abs() < 0.001);
    }
}
