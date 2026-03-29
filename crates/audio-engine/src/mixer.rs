//! Audio Mixer - Core mixing logic
//!
//! Orchestrates multi-track audio mixing with:
//! - Per-clip gain and fades
//! - Cross-transition crossfades
//! - Track volume, pan, mute/solo
//! - Master volume

use std::collections::HashMap;

use serde::Deserialize;

use crate::clip::AudioClip;
use crate::effects::{AudioEffects, EffectChain};
use crate::source::AudioClipSource;
use crate::time_stretcher::TimeStretcher;
use crate::track::AudioTrack;
use crate::transition::CrossTransition;
use tooscut_keyframe::evaluate_keyframes;

/// Timeline state received from TypeScript
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioTimelineState {
    clips: Vec<AudioClip>,
    tracks: Vec<AudioTrack>,
    cross_transitions: Vec<CrossTransition>,
}

/// The main audio mixer
pub struct AudioMixer {
    /// Output sample rate
    sample_rate: u32,
    /// Current playback time in seconds
    current_time: f64,
    /// Whether playback is active
    is_playing: bool,

    /// Audio sources (decoded PCM data) - keyed by source/asset ID
    sources: HashMap<String, AudioClipSource>,

    /// Timeline clips
    clips: Vec<AudioClip>,
    /// Timeline tracks
    tracks: Vec<AudioTrack>,
    /// Cross-transitions
    cross_transitions: Vec<CrossTransition>,

    /// Master volume (0.0 - 1.0)
    master_volume: f32,

    /// Per-clip time stretchers for pitch-preserving speed changes
    stretchers: HashMap<String, TimeStretcher>,

    /// Per-clip audio effect chains (EQ, compressor, noise gate, reverb)
    effect_chains: HashMap<String, EffectChain>,
}

impl AudioMixer {
    /// Create a new audio mixer
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            current_time: 0.0,
            is_playing: false,
            sources: HashMap::new(),
            clips: Vec::new(),
            tracks: Vec::new(),
            cross_transitions: Vec::new(),
            master_volume: 1.0,
            stretchers: HashMap::new(),
            effect_chains: HashMap::new(),
        }
    }

    /// Upload audio source data
    pub fn upload_audio(
        &mut self,
        source_id: &str,
        pcm_data: &[f32],
        source_sample_rate: u32,
        channels: u32,
    ) {
        let source = AudioClipSource::new(
            source_id.to_string(),
            pcm_data.to_vec(),
            source_sample_rate,
            channels,
        );
        self.sources.insert(source_id.to_string(), source);
    }

    /// Remove audio source
    pub fn remove_audio(&mut self, source_id: &str) {
        self.sources.remove(source_id);
    }

    /// Create a windowed audio source (metadata only, fixed-size buffer)
    pub fn create_windowed_source(
        &mut self,
        source_id: &str,
        sample_rate: u32,
        channels: u32,
        duration: f64,
        max_buffer_seconds: f64,
    ) {
        let source = AudioClipSource::new_windowed(
            source_id.to_string(),
            sample_rate,
            channels,
            duration,
            max_buffer_seconds,
        );
        self.sources.insert(source_id.to_string(), source);
    }

    /// Update the buffered PCM window for a source
    pub fn update_source_buffer(&mut self, source_id: &str, start_time: f64, pcm_data: &[f32]) {
        if let Some(source) = self.sources.get_mut(source_id) {
            source.update_buffer(start_time, pcm_data.to_vec());
        }
    }

    /// Clear all buffered data for a source (used on seek)
    pub fn clear_source_buffer(&mut self, source_id: &str) {
        if let Some(source) = self.sources.get_mut(source_id) {
            source.clear_buffer();
        }
    }

    /// Get buffer misses since last query (diagnostics)
    pub fn get_buffer_misses(&mut self, source_id: &str) -> u64 {
        if let Some(source) = self.sources.get_mut(source_id) {
            source.get_buffer_misses()
        } else {
            0
        }
    }


    /// Set the timeline state from JSON
    pub fn set_timeline(&mut self, timeline_json: &str) -> Result<(), String> {
        let state: AudioTimelineState =
            serde_json::from_str(timeline_json).map_err(|e| format!("JSON parse error: {}", e))?;

        log::debug!(
            "[AudioMixer] Setting timeline: {} clips, {} tracks",
            state.clips.len(),
            state.tracks.len()
        );

        self.clips = state.clips;
        self.tracks = state.tracks;
        self.cross_transitions = state.cross_transitions;

        // Clear stretchers so they re-initialize with updated clip speeds
        self.stretchers.clear();
        // Clear effect chains so they re-initialize with updated effects
        self.effect_chains.clear();

        Ok(())
    }

    /// Set playback state
    pub fn set_playing(&mut self, playing: bool) {
        log::debug!(
            "[AudioMixer] Set playing: {} -> {}",
            self.is_playing,
            playing
        );
        self.is_playing = playing;
    }

    /// Seek to a specific time
    pub fn seek(&mut self, time: f64) {
        self.current_time = time;
        // Reset all time stretchers so they re-sync to the new position
        self.stretchers.clear();
        // Reset all effect chains (clear reverb tails, filter state, etc.)
        for chain in self.effect_chains.values_mut() {
            chain.reset();
        }
    }

    /// Get current playback time
    pub fn get_current_time(&self) -> f64 {
        self.current_time
    }

    /// Set master volume
    pub fn set_master_volume(&mut self, volume: f32) {
        self.master_volume = volume.clamp(0.0, 1.0);
    }

    /// Render audio frames
    ///
    /// # Arguments
    /// * `output` - Mutable slice for interleaved stereo output
    /// * `num_frames` - Number of stereo frames to render
    ///
    /// # Returns
    /// Number of frames actually rendered
    pub fn render(&mut self, output: &mut [f32], num_frames: usize) -> usize {
        if !self.is_playing {
            // Fill with silence
            let samples = (num_frames * 2).min(output.len());
            output[..samples].fill(0.0);
            return num_frames;
        }

        let time_per_sample = 1.0 / self.sample_rate as f64;

        for frame in 0..num_frames {
            let (left, right) = self.render_frame();

            let idx = frame * 2;
            if idx + 1 < output.len() {
                output[idx] = left;
                output[idx + 1] = right;
            }

            self.current_time += time_per_sample;
        }

        num_frames
    }

    /// Render a single stereo frame
    fn render_frame(&mut self) -> (f32, f32) {
        let mut left_sum = 0.0f32;
        let mut right_sum = 0.0f32;

        // Check if any track is soloed
        let has_solo = self.tracks.iter().any(|t| t.solo);

        for i in 0..self.clips.len() {
            let clip = &self.clips[i];

            // Check if clip is active (either normally or via cross-transition)
            if !self.is_clip_active(clip) {
                continue;
            }

            // Get track for this clip
            let track = match self.tracks.iter().find(|t| t.id == clip.track_id) {
                Some(t) => t,
                None => continue,
            };

            // Check if track should play (mute/solo logic)
            if !track.should_play(has_solo) {
                continue;
            }

            // Get audio source (mutable for windowed buffer tracking)
            let source = match self.sources.get_mut(&clip.source_id) {
                Some(s) => s,
                None => continue,
            };

            let clip_id = clip.id.clone();
            let speed = clip.speed;
            let uses_stretcher = (speed - 1.0).abs() > 0.001;

            // Get sample: use time stretcher for non-1.0 speed to preserve pitch
            let (mut sample_l, mut sample_r) = if uses_stretcher {
                let source_time = clip.get_source_time(self.current_time);
                let stretcher = self.stretchers.entry(clip_id.clone()).or_insert_with(|| {
                    let mut s = TimeStretcher::new(self.sample_rate);
                    s.reset(source_time, speed);
                    s
                });
                stretcher.set_speed(speed);
                stretcher.get_sample(source)
            } else {
                let source_time = clip.get_source_time(self.current_time);
                source.get_sample(source_time, self.sample_rate)
            };

            // Re-borrow clip after mutable stretcher access
            let clip = &self.clips[i];

            // Apply clip gain (includes fade in/out)
            let clip_gain = clip.calculate_gain(self.current_time);
            sample_l *= clip_gain;
            sample_r *= clip_gain;

            // Apply per-clip audio effects (EQ → Compressor → Noise Gate → Reverb)
            if let Some(ref effects) = clip.effects {
                // Resolve keyframed audio effect parameters
                let resolved = resolve_effect_keyframes(effects, clip, self.current_time);
                let chain = self
                    .effect_chains
                    .entry(clip_id)
                    .or_insert_with(|| EffectChain::new(self.sample_rate));
                let result = chain.process(&resolved, sample_l, sample_r);
                sample_l = result.0;
                sample_r = result.1;
            }

            // Re-borrow clip after mutable effect_chains access
            let clip = &self.clips[i];

            // Apply cross-transition gain
            let ct_gain = self.calculate_cross_transition_gain(clip);
            sample_l *= ct_gain;
            sample_r *= ct_gain;

            // Apply track processing (volume, pan)
            let (track_l, track_r) = track.apply(sample_l, sample_r);

            left_sum += track_l;
            right_sum += track_r;
        }

        // Apply master volume
        left_sum *= self.master_volume;
        right_sum *= self.master_volume;

        // Soft clip to prevent harsh distortion
        (soft_clip(left_sum), soft_clip(right_sum))
    }

    /// Check if a clip is active at the current time
    ///
    /// A clip is active if:
    /// 1. The current time is within its normal range, OR
    /// 2. It's part of an active cross-transition
    fn is_clip_active(&self, clip: &AudioClip) -> bool {
        // Normal active check
        if clip.is_active_at(self.current_time) {
            return true;
        }

        // Check if part of active cross-transition
        for ct in &self.cross_transitions {
            if ct.outgoing_clip_id != clip.id && ct.incoming_clip_id != clip.id {
                continue;
            }

            // Find the outgoing clip to get the cut point
            let outgoing_clip = self.clips.iter().find(|c| c.id == ct.outgoing_clip_id);
            if let Some(outgoing) = outgoing_clip {
                let (ct_start, ct_end) = ct.get_transition_range(outgoing);

                if self.current_time >= ct_start && self.current_time <= ct_end {
                    return true;
                }
            }
        }

        false
    }

    /// Calculate cross-transition gain for a clip
    fn calculate_cross_transition_gain(&self, clip: &AudioClip) -> f32 {
        for ct in &self.cross_transitions {
            let is_outgoing = ct.outgoing_clip_id == clip.id;
            let is_incoming = ct.incoming_clip_id == clip.id;

            if !is_outgoing && !is_incoming {
                continue;
            }

            // Find the outgoing clip
            let outgoing_clip = self.clips.iter().find(|c| c.id == ct.outgoing_clip_id);
            if let Some(outgoing) = outgoing_clip {
                if let Some(info) = ct.check_clip(clip, outgoing, self.current_time) {
                    return info.get_gain();
                }
            }
        }

        // No active cross-transition
        1.0
    }
}

/// Resolve keyframed audio effect parameters
///
/// Checks if the clip has keyframes for any audio effect properties
/// (e.g., "eqLowGain", "compressorThreshold") and overrides the static
/// values from AudioEffects with the evaluated keyframe values.
fn resolve_effect_keyframes(
    effects: &AudioEffects,
    clip: &AudioClip,
    timeline_time: f64,
) -> AudioEffects {
    let keyframes = match &clip.keyframes {
        Some(kf) => kf,
        None => return effects.clone(),
    };

    let clip_local_time = timeline_time - clip.start_time;
    let mut resolved = effects.clone();

    // EQ keyframes
    if let Some(ref mut eq) = resolved.eq {
        if let Some(track) = keyframes.get("eqLowGain") {
            eq.low_gain = evaluate_keyframes(&track.keyframes, clip_local_time) as f32;
        }
        if let Some(track) = keyframes.get("eqMidGain") {
            eq.mid_gain = evaluate_keyframes(&track.keyframes, clip_local_time) as f32;
        }
        if let Some(track) = keyframes.get("eqHighGain") {
            eq.high_gain = evaluate_keyframes(&track.keyframes, clip_local_time) as f32;
        }
    }

    // Compressor keyframes
    if let Some(ref mut comp) = resolved.compressor {
        if let Some(track) = keyframes.get("compressorThreshold") {
            comp.threshold = evaluate_keyframes(&track.keyframes, clip_local_time) as f32;
        }
    }

    // Noise gate keyframes
    if let Some(ref mut gate) = resolved.noise_gate {
        if let Some(track) = keyframes.get("noiseGateThreshold") {
            gate.threshold = evaluate_keyframes(&track.keyframes, clip_local_time) as f32;
        }
    }

    // Reverb keyframes
    if let Some(ref mut reverb) = resolved.reverb {
        if let Some(track) = keyframes.get("reverbDryWet") {
            reverb.dry_wet = evaluate_keyframes(&track.keyframes, clip_local_time) as f32;
        }
    }

    resolved
}

/// Soft clipping function to prevent harsh clipping
///
/// Uses tanh-like soft clipping for audio above 1.0
fn soft_clip(x: f32) -> f32 {
    if x.abs() < 1.0 {
        x
    } else {
        // Soft clip using tanh approximation
        x.signum() * (1.0 + (x.abs() - 1.0).tanh() * 0.5)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_soft_clip() {
        // Below threshold - unchanged
        assert_eq!(soft_clip(0.5), 0.5);
        assert_eq!(soft_clip(-0.5), -0.5);

        // At threshold
        assert!((soft_clip(1.0) - 1.0).abs() < 0.01);

        // Above threshold - soft limited
        let result = soft_clip(2.0);
        assert!(result > 1.0);
        assert!(result < 2.0);
    }

    #[test]
    fn test_mixer_creation() {
        let mixer = AudioMixer::new(48000);
        assert_eq!(mixer.sample_rate, 48000);
        assert!(!mixer.is_playing);
        assert_eq!(mixer.current_time, 0.0);
    }

    #[test]
    fn test_silent_when_not_playing() {
        let mut mixer = AudioMixer::new(48000);
        let mut output = vec![1.0f32; 256]; // Fill with non-zero

        mixer.render(&mut output, 128);

        // Should be all zeros
        assert!(output[..256].iter().all(|&x| x == 0.0));
    }
}
