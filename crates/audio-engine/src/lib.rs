//! Audio Engine - WASM-based audio mixing for video editor
//!
//! This crate provides a sample-accurate audio mixer that runs in an AudioWorklet.
//! It handles multi-track mixing, cross-transitions, and per-clip/track processing.

mod clip;
mod effects;
mod mixer;
mod source;
mod time_stretcher;
mod track;
mod transition;

use mixer::AudioMixer;
use wasm_bindgen::prelude::*;

/// Initialize panic hook and logging for better WASM debugging
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Debug).ok();
}

/// Audio Engine - main WASM export
///
/// This struct wraps the AudioMixer and provides the public API for the AudioWorklet.
#[wasm_bindgen]
pub struct AudioEngine {
    mixer: AudioMixer,
}

#[wasm_bindgen]
impl AudioEngine {
    /// Create a new AudioEngine with the given output sample rate
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32) -> Self {
        Self {
            mixer: AudioMixer::new(sample_rate),
        }
    }

    /// Upload decoded PCM audio data for a clip
    ///
    /// # Arguments
    /// * `source_id` - Unique identifier for this audio source (asset ID)
    /// * `pcm_data` - Interleaved stereo PCM data (f32)
    /// * `source_sample_rate` - Sample rate of the source audio
    /// * `channels` - Number of channels (1 or 2)
    #[wasm_bindgen]
    pub fn upload_audio(
        &mut self,
        source_id: &str,
        pcm_data: &[f32],
        source_sample_rate: u32,
        channels: u32,
    ) {
        self.mixer
            .upload_audio(source_id, pcm_data, source_sample_rate, channels);
    }

    /// Remove audio data for a source
    #[wasm_bindgen]
    pub fn remove_audio(&mut self, source_id: &str) {
        self.mixer.remove_audio(source_id);
    }

    /// Create a windowed audio source (metadata only, fixed-size buffer)
    ///
    /// Unlike streaming sources, windowed sources only retain a limited amount
    /// of decoded PCM in memory. The JS side manages decode-ahead and sends
    /// buffer updates as the playhead moves.
    ///
    /// # Arguments
    /// * `source_id` - Unique identifier for this audio source (asset ID)
    /// * `sample_rate` - Sample rate of the source audio
    /// * `channels` - Number of channels (1 or 2)
    /// * `duration` - Total duration of the source media in seconds
    /// * `max_buffer_seconds` - Maximum seconds of PCM to retain (e.g. 30.0)
    #[wasm_bindgen]
    pub fn create_windowed_source(
        &mut self,
        source_id: &str,
        sample_rate: u32,
        channels: u32,
        duration: f64,
        max_buffer_seconds: f64,
    ) {
        self.mixer.create_windowed_source(
            source_id,
            sample_rate,
            channels,
            duration,
            max_buffer_seconds,
        );
    }

    /// Update the buffered PCM window for a windowed source
    ///
    /// # Arguments
    /// * `source_id` - ID of the windowed source
    /// * `start_time` - Start time in source-time seconds for this chunk
    /// * `pcm_data` - Interleaved PCM data (f32)
    #[wasm_bindgen]
    pub fn update_source_buffer(&mut self, source_id: &str, start_time: f64, pcm_data: &[f32]) {
        self.mixer.update_source_buffer(source_id, start_time, pcm_data);
    }

    /// Clear all buffered data for a windowed source (used on seek)
    #[wasm_bindgen]
    pub fn clear_source_buffer(&mut self, source_id: &str) {
        self.mixer.clear_source_buffer(source_id);
    }

    /// Update the sample rate for a source
    ///
    /// Used when the actual decoded sample rate differs from the container metadata
    /// (e.g. HE-AAC files where probe reports 44100 but decoder outputs 48000).
    #[wasm_bindgen]
    pub fn update_source_sample_rate(&mut self, source_id: &str, sample_rate: u32) {
        self.mixer.update_source_sample_rate(source_id, sample_rate);
    }

    /// Get buffer misses since last query (diagnostics)
    #[wasm_bindgen]
    pub fn get_buffer_misses(&mut self, source_id: &str) -> u64 {
        self.mixer.get_buffer_misses(source_id)
    }

    /// Update the timeline state (clips, tracks, cross-transitions)
    ///
    /// # Arguments
    /// * `timeline_json` - JSON string containing AudioTimelineState
    #[wasm_bindgen]
    pub fn set_timeline(&mut self, timeline_json: &str) {
        if let Err(e) = self.mixer.set_timeline(timeline_json) {
            log::error!("[AudioEngine] Failed to set timeline: {}", e);
        }
    }

    /// Set playback state
    #[wasm_bindgen]
    pub fn set_playing(&mut self, playing: bool) {
        self.mixer.set_playing(playing);
    }

    /// Seek to a specific time
    #[wasm_bindgen]
    pub fn seek(&mut self, time: f64) {
        self.mixer.seek(time);
    }

    /// Render audio frames
    ///
    /// Called from the AudioWorklet processor every ~128 samples.
    /// Output is interleaved stereo (L, R, L, R, ...).
    ///
    /// # Arguments
    /// * `output` - Mutable slice to write interleaved stereo samples
    /// * `num_frames` - Number of stereo frames to render
    ///
    /// # Returns
    /// Number of frames actually rendered
    #[wasm_bindgen]
    pub fn render(&mut self, output: &mut [f32], num_frames: usize) -> usize {
        self.mixer.render(output, num_frames)
    }

    /// Get the current playback time (for sync feedback)
    #[wasm_bindgen]
    pub fn get_current_time(&self) -> f64 {
        self.mixer.get_current_time()
    }

    /// Set master volume (0.0 - 1.0)
    #[wasm_bindgen]
    pub fn set_master_volume(&mut self, volume: f32) {
        self.mixer.set_master_volume(volume);
    }

    /// Set global playback rate
    ///
    /// # Arguments
    /// * `rate` - Playback rate multiplier (1.0 = normal, 2.0 = 2x, -1.0 = reverse)
    ///
    /// Note: Reverse playback outputs silence as audio cannot play backwards.
    #[wasm_bindgen]
    pub fn set_playback_rate(&mut self, rate: f64) {
        self.mixer.set_playback_rate(rate);
    }
}
