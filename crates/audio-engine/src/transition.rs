//! Cross-transition calculation for audio
//!
//! Handles crossfade between adjacent clips.

use crate::clip::AudioClip;
use serde::Deserialize;
use tooscut_types::Easing;

/// Cross-transition between two adjacent clips
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrossTransition {
    /// Unique identifier
    pub id: String,
    /// ID of the outgoing clip (the one ending)
    pub outgoing_clip_id: String,
    /// ID of the incoming clip (the one starting)
    pub incoming_clip_id: String,
    /// Duration of the transition in seconds
    pub duration: f64,
    /// Easing preset for the transition
    #[serde(default)]
    pub easing: Easing,
}

/// Result of checking a clip's cross-transition status
#[derive(Debug, Clone, Copy)]
pub struct CrossTransitionInfo {
    /// Whether this clip is part of an active cross-transition
    pub is_active: bool,
    /// Whether this clip is the outgoing or incoming clip
    pub is_outgoing: bool,
    /// Linear progress through the transition (0.0 to 1.0)
    pub progress: f32,
    /// Eased progress (after applying easing function)
    pub eased_progress: f32,
}

impl CrossTransition {
    /// Calculate the cut point (where the outgoing clip ends)
    ///
    /// # Arguments
    /// * `outgoing_clip` - The outgoing clip
    ///
    /// # Returns
    /// The timeline time where the clips meet
    pub fn get_cut_point(&self, outgoing_clip: &AudioClip) -> f64 {
        outgoing_clip.start_time + outgoing_clip.duration
    }

    /// Get the start and end times of this transition
    ///
    /// # Arguments
    /// * `outgoing_clip` - The outgoing clip
    ///
    /// # Returns
    /// Tuple of (transition_start, transition_end)
    pub fn get_transition_range(&self, outgoing_clip: &AudioClip) -> (f64, f64) {
        let cut_point = self.get_cut_point(outgoing_clip);
        let half_duration = self.duration / 2.0;
        (cut_point - half_duration, cut_point + half_duration)
    }

    /// Check if a clip is part of this transition and calculate its gain
    ///
    /// # Arguments
    /// * `clip` - The clip to check
    /// * `outgoing_clip` - The outgoing clip (needed to calculate cut point)
    /// * `timeline_time` - Current timeline time
    ///
    /// # Returns
    /// CrossTransitionInfo with gain calculation, or None if not in transition
    pub fn check_clip(
        &self,
        clip: &AudioClip,
        outgoing_clip: &AudioClip,
        timeline_time: f64,
    ) -> Option<CrossTransitionInfo> {
        // Check if this clip is part of the transition
        let is_outgoing = clip.id == self.outgoing_clip_id;
        let is_incoming = clip.id == self.incoming_clip_id;

        if !is_outgoing && !is_incoming {
            return None;
        }

        // Get transition range
        let (ct_start, ct_end) = self.get_transition_range(outgoing_clip);

        // Check if we're within the transition
        if timeline_time < ct_start || timeline_time > ct_end {
            return None;
        }

        // Calculate progress
        let linear_progress = ((timeline_time - ct_start) / self.duration) as f32;
        let linear_progress = linear_progress.clamp(0.0, 1.0);

        let eased_progress = self.easing.evaluate(linear_progress);

        Some(CrossTransitionInfo {
            is_active: true,
            is_outgoing,
            progress: linear_progress,
            eased_progress,
        })
    }
}

impl CrossTransitionInfo {
    /// Get the gain multiplier for this clip during the transition
    ///
    /// Outgoing clips fade from 1.0 to 0.0
    /// Incoming clips fade from 0.0 to 1.0
    pub fn get_gain(&self) -> f32 {
        if self.is_outgoing {
            1.0 - self.eased_progress
        } else {
            self.eased_progress
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_clips() -> (AudioClip, AudioClip) {
        let outgoing = AudioClip {
            id: "clip1".to_string(),
            source_id: "source1".to_string(),
            track_id: "track1".to_string(),
            start_time: 0.0,
            duration: 5.0,
            in_point: 0.0,
            speed: 1.0,
            gain: 1.0,
            fade_in: 0.0,
            fade_out: 0.0,
            keyframes: None,
            effects: None,
        };

        let incoming = AudioClip {
            id: "clip2".to_string(),
            source_id: "source2".to_string(),
            track_id: "track1".to_string(),
            start_time: 5.0,
            duration: 5.0,
            in_point: 0.0,
            speed: 1.0,
            gain: 1.0,
            fade_in: 0.0,
            fade_out: 0.0,
            keyframes: None,
            effects: None,
        };

        (outgoing, incoming)
    }

    fn create_test_transition() -> CrossTransition {
        use tooscut_types::EasingPreset;
        CrossTransition {
            id: "ct1".to_string(),
            outgoing_clip_id: "clip1".to_string(),
            incoming_clip_id: "clip2".to_string(),
            duration: 2.0,
            easing: Easing::preset(EasingPreset::Linear),
        }
    }

    #[test]
    fn test_transition_range() {
        let (outgoing, _) = create_test_clips();
        let ct = create_test_transition();

        let (start, end) = ct.get_transition_range(&outgoing);
        assert_eq!(start, 4.0); // cut point (5.0) - half duration (1.0)
        assert_eq!(end, 6.0); // cut point (5.0) + half duration (1.0)
    }

    #[test]
    fn test_outgoing_clip_progress() {
        let (outgoing, _) = create_test_clips();
        let ct = create_test_transition();

        // At start of transition
        let info = ct.check_clip(&outgoing, &outgoing, 4.0).unwrap();
        assert!(info.is_outgoing);
        assert!((info.progress - 0.0).abs() < 0.01);
        assert!((info.get_gain() - 1.0).abs() < 0.01);

        // At middle of transition
        let info = ct.check_clip(&outgoing, &outgoing, 5.0).unwrap();
        assert!((info.progress - 0.5).abs() < 0.01);
        assert!((info.get_gain() - 0.5).abs() < 0.01);

        // At end of transition
        let info = ct.check_clip(&outgoing, &outgoing, 6.0).unwrap();
        assert!((info.progress - 1.0).abs() < 0.01);
        assert!((info.get_gain() - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_incoming_clip_progress() {
        let (outgoing, incoming) = create_test_clips();
        let ct = create_test_transition();

        // At start of transition
        let info = ct.check_clip(&incoming, &outgoing, 4.0).unwrap();
        assert!(!info.is_outgoing);
        assert!((info.get_gain() - 0.0).abs() < 0.01);

        // At middle of transition
        let info = ct.check_clip(&incoming, &outgoing, 5.0).unwrap();
        assert!((info.get_gain() - 0.5).abs() < 0.01);

        // At end of transition
        let info = ct.check_clip(&incoming, &outgoing, 6.0).unwrap();
        assert!((info.get_gain() - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_not_in_transition() {
        let (outgoing, _) = create_test_clips();
        let ct = create_test_transition();

        // Before transition
        assert!(ct.check_clip(&outgoing, &outgoing, 3.0).is_none());

        // After transition
        assert!(ct.check_clip(&outgoing, &outgoing, 7.0).is_none());
    }
}
