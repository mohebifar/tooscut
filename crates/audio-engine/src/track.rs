//! Audio Track - track-level processing
//!
//! Handles volume, pan, mute, and solo for tracks.

use serde::Deserialize;

/// Audio track settings
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    /// Unique track identifier
    pub id: String,
    /// Track volume (0.0 - 1.0)
    #[serde(default = "default_volume")]
    pub volume: f32,
    /// Pan position (-1.0 = left, 0.0 = center, 1.0 = right)
    #[serde(default)]
    pub pan: f32,
    /// Whether the track is muted
    #[serde(default)]
    pub mute: bool,
    /// Whether the track is soloed
    #[serde(default)]
    pub solo: bool,
}

fn default_volume() -> f32 {
    1.0
}

impl AudioTrack {
    /// Apply volume and pan to a stereo sample
    ///
    /// Uses constant power panning for smooth transitions.
    ///
    /// # Arguments
    /// * `left` - Left channel input
    /// * `right` - Right channel input
    ///
    /// # Returns
    /// Tuple of (left, right) after applying volume and pan
    pub fn apply(&self, left: f32, right: f32) -> (f32, f32) {
        // Apply constant power panning
        let (pan_l, pan_r) = constant_power_pan(self.pan);

        let out_left = left * pan_l * self.volume;
        let out_right = right * pan_r * self.volume;

        (out_left, out_right)
    }

    /// Check if this track should produce audio given solo state
    ///
    /// # Arguments
    /// * `has_solo` - Whether any track in the session is soloed
    ///
    /// # Returns
    /// true if this track should produce audio
    pub fn should_play(&self, has_solo: bool) -> bool {
        if self.mute {
            return false;
        }
        if has_solo && !self.solo {
            return false;
        }
        true
    }
}

/// Calculate constant power pan gains
///
/// Uses a simple linear crossfade approximation that sounds good
/// and is computationally cheap.
///
/// # Arguments
/// * `pan` - Pan position (-1.0 to 1.0)
///
/// # Returns
/// Tuple of (left_gain, right_gain)
fn constant_power_pan(pan: f32) -> (f32, f32) {
    // Clamp pan to valid range
    let pan = pan.clamp(-1.0, 1.0);

    // Convert pan to 0-1 range (0 = full left, 1 = full right)
    let pan_normalized = (pan + 1.0) * 0.5;

    // Constant power panning using quarter sine
    // This approximation is close enough and very fast
    let angle = pan_normalized * std::f32::consts::FRAC_PI_2;
    let left_gain = angle.cos();
    let right_gain = angle.sin();

    (left_gain, right_gain)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_center_pan() {
        let (l, r) = constant_power_pan(0.0);
        // At center, both channels should be approximately 0.707 (sqrt(0.5))
        assert!((l - 0.707).abs() < 0.01);
        assert!((r - 0.707).abs() < 0.01);
    }

    #[test]
    fn test_full_left_pan() {
        let (l, r) = constant_power_pan(-1.0);
        assert!((l - 1.0).abs() < 0.01);
        assert!(r.abs() < 0.01);
    }

    #[test]
    fn test_full_right_pan() {
        let (l, r) = constant_power_pan(1.0);
        assert!(l.abs() < 0.01);
        assert!((r - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_track_should_play() {
        let mut track = AudioTrack {
            id: "track1".to_string(),
            volume: 1.0,
            pan: 0.0,
            mute: false,
            solo: false,
        };

        // Normal track, no solo active
        assert!(track.should_play(false));

        // Muted track
        track.mute = true;
        assert!(!track.should_play(false));
        track.mute = false;

        // Non-soloed track when solo is active
        assert!(!track.should_play(true));

        // Soloed track
        track.solo = true;
        assert!(track.should_play(true));
    }

    #[test]
    fn test_track_apply() {
        let track = AudioTrack {
            id: "track1".to_string(),
            volume: 0.5,
            pan: 0.0,
            mute: false,
            solo: false,
        };

        let (l, r) = track.apply(1.0, 1.0);
        // At center pan with 0.5 volume: 1.0 * 0.707 * 0.5 ≈ 0.354
        assert!((l - 0.354).abs() < 0.01);
        assert!((r - 0.354).abs() < 0.01);
    }
}
