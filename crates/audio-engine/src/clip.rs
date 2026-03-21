//! Audio Clip - timeline clip state and gain calculation
//!
//! Represents a clip on the timeline with position, timing, and audio properties.

use serde::Deserialize;
use tooscut_keyframe::{evaluate_keyframes, KeyframeTracks};

use crate::effects::AudioEffects;

/// Audio clip on the timeline
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioClip {
    /// Unique clip identifier
    pub id: String,
    /// ID of the source audio (references AudioClipSource / asset ID)
    pub source_id: String,
    /// Track this clip belongs to
    pub track_id: String,

    // Timeline position
    /// Start time on the timeline (seconds)
    pub start_time: f64,
    /// Duration on the timeline (seconds)
    pub duration: f64,
    /// Start point within source media (seconds)
    pub in_point: f64,
    /// Playback speed multiplier (1.0 = normal)
    #[serde(default = "default_speed")]
    pub speed: f64,

    // Audio properties
    /// Clip gain (0.0 - 2.0, default 1.0)
    #[serde(default = "default_gain")]
    pub gain: f32,
    /// Fade in duration (seconds)
    #[serde(default)]
    pub fade_in: f64,
    /// Fade out duration (seconds)
    #[serde(default)]
    pub fade_out: f64,
    /// Optional keyframe animation data
    #[serde(default)]
    pub keyframes: Option<KeyframeTracks>,
    /// Optional audio effects (EQ, compressor, noise gate, reverb)
    #[serde(default)]
    pub effects: Option<AudioEffects>,
}

fn default_speed() -> f64 {
    1.0
}

fn default_gain() -> f32 {
    1.0
}

impl AudioClip {
    /// Get the end time of this clip on the timeline
    pub fn end_time(&self) -> f64 {
        self.start_time + self.duration
    }

    /// Check if this clip is active at the given timeline time
    pub fn is_active_at(&self, timeline_time: f64) -> bool {
        timeline_time >= self.start_time && timeline_time < self.end_time()
    }

    /// Calculate the source time for a given timeline time
    ///
    /// Takes into account in_point and speed.
    pub fn get_source_time(&self, timeline_time: f64) -> f64 {
        let clip_local_time = timeline_time - self.start_time;
        self.in_point + (clip_local_time * self.speed)
    }

    /// Calculate the clip gain at a given timeline time
    ///
    /// Applies keyframe-based volume if present, otherwise fade in/out.
    pub fn calculate_gain(&self, timeline_time: f64) -> f32 {
        let clip_local_time = timeline_time - self.start_time;

        // Check for volume keyframes first
        if let Some(ref keyframes) = self.keyframes {
            if let Some(track) = keyframes.get("volume") {
                let volume = evaluate_keyframes(&track.keyframes, clip_local_time);
                // Keyframes override fade system, but still multiply by base gain
                return volume * self.gain;
            }
        }

        // Fall back to legacy fade system
        let mut gain = self.gain;

        // Apply fade in
        if self.fade_in > 0.0 && clip_local_time < self.fade_in {
            let fade_progress = (clip_local_time / self.fade_in) as f32;
            gain *= fade_progress.max(0.0);
        }

        // Apply fade out
        if self.fade_out > 0.0 {
            let fade_start = self.duration - self.fade_out;
            if clip_local_time > fade_start {
                let fade_progress = ((self.duration - clip_local_time) / self.fade_out) as f32;
                gain *= fade_progress.max(0.0);
            }
        }

        gain
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_clip() -> AudioClip {
        AudioClip {
            id: "clip1".to_string(),
            source_id: "source1".to_string(),
            track_id: "track1".to_string(),
            start_time: 1.0,
            duration: 2.0,
            in_point: 0.0,
            speed: 1.0,
            gain: 1.0,
            fade_in: 0.5,
            fade_out: 0.5,
            keyframes: None,
            effects: None,
        }
    }

    #[test]
    fn test_is_active() {
        let clip = create_test_clip();

        assert!(!clip.is_active_at(0.5)); // Before clip
        assert!(clip.is_active_at(1.0)); // At start
        assert!(clip.is_active_at(2.0)); // In middle
        assert!(!clip.is_active_at(3.0)); // At end (exclusive)
        assert!(!clip.is_active_at(4.0)); // After clip
    }

    #[test]
    fn test_source_time() {
        let clip = create_test_clip();

        assert_eq!(clip.get_source_time(1.0), 0.0); // Start of clip
        assert_eq!(clip.get_source_time(2.0), 1.0); // 1s into clip
    }

    #[test]
    fn test_source_time_with_speed() {
        let mut clip = create_test_clip();
        clip.speed = 2.0;

        assert_eq!(clip.get_source_time(1.0), 0.0); // Start
        assert_eq!(clip.get_source_time(1.5), 1.0); // 0.5s timeline = 1s source
    }

    #[test]
    fn test_fade_in() {
        let clip = create_test_clip();

        // Start of fade (0%)
        let gain = clip.calculate_gain(1.0);
        assert!((gain - 0.0).abs() < 0.01);

        // Middle of fade (50%)
        let gain = clip.calculate_gain(1.25);
        assert!((gain - 0.5).abs() < 0.01);

        // End of fade (100%)
        let gain = clip.calculate_gain(1.5);
        assert!((gain - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_fade_out() {
        let clip = create_test_clip();

        // Before fade out
        let gain = clip.calculate_gain(2.0);
        assert!((gain - 1.0).abs() < 0.01);

        // Middle of fade out (50%)
        let gain = clip.calculate_gain(2.75);
        assert!((gain - 0.5).abs() < 0.01);

        // End of fade out (0%)
        let gain = clip.calculate_gain(3.0);
        assert!((gain - 0.0).abs() < 0.01);
    }
}
