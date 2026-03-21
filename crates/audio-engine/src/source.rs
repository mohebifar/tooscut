//! Audio Clip Source - PCM storage and sampling
//!
//! Handles storage of decoded PCM audio data and provides
//! sample-accurate retrieval with linear interpolation.

/// Audio clip source containing decoded PCM audio data
pub struct AudioClipSource {
    /// Unique identifier
    pub id: String,
    /// Interleaved stereo PCM data (L, R, L, R, ...)
    pub pcm_data: Vec<f32>,
    /// Source sample rate
    pub sample_rate: u32,
    /// Number of channels (1 or 2)
    pub channels: u32,
    /// Duration in seconds
    pub duration: f64,
    /// Whether all PCM data has been received (streaming sources start as false)
    pub is_complete: bool,
}

impl AudioClipSource {
    /// Create a new audio clip source from PCM data
    ///
    /// # Arguments
    /// * `id` - Unique identifier
    /// * `pcm_data` - Interleaved PCM data
    /// * `sample_rate` - Source sample rate
    /// * `channels` - Number of channels (1 or 2)
    pub fn new(id: String, pcm_data: Vec<f32>, sample_rate: u32, channels: u32) -> Self {
        let num_samples = pcm_data.len() / channels as usize;
        let duration = num_samples as f64 / sample_rate as f64;

        Self {
            id,
            pcm_data,
            sample_rate,
            channels,
            duration,
            is_complete: true,
        }
    }

    /// Create a new streaming audio clip source with no initial data
    ///
    /// PCM data is appended incrementally via `append_chunk()` and finalized
    /// with `finalize()`. The source is playable immediately (returns silence
    /// for regions not yet received).
    ///
    /// # Arguments
    /// * `id` - Unique identifier
    /// * `sample_rate` - Source sample rate
    /// * `channels` - Number of channels (1 or 2)
    /// * `estimated_duration` - Optional duration hint for pre-allocation
    pub fn new_streaming(
        id: String,
        sample_rate: u32,
        channels: u32,
        estimated_duration: Option<f64>,
    ) -> Self {
        let capacity = match estimated_duration {
            Some(dur) => (dur * sample_rate as f64 * channels as f64) as usize,
            None => 0,
        };

        Self {
            id,
            pcm_data: Vec::with_capacity(capacity),
            sample_rate,
            channels,
            duration: 0.0,
            is_complete: false,
        }
    }

    /// Append a chunk of interleaved PCM data to this streaming source
    ///
    /// Recalculates duration after appending. Can be called from the audio
    /// worklet thread between `process()` calls.
    pub fn append_chunk(&mut self, chunk: &[f32]) {
        self.pcm_data.extend_from_slice(chunk);
        let num_samples = self.pcm_data.len() / self.channels as usize;
        self.duration = num_samples as f64 / self.sample_rate as f64;
    }

    /// Mark this streaming source as complete (all data received)
    ///
    /// Calls `shrink_to_fit()` to release unused pre-allocated capacity.
    pub fn finalize(&mut self) {
        self.is_complete = true;
        self.pcm_data.shrink_to_fit();
    }

    /// Get a stereo sample at the given source time using linear interpolation
    ///
    /// # Arguments
    /// * `source_time` - Time in seconds within the source audio
    /// * `_output_sample_rate` - Target sample rate (unused, kept for API compatibility)
    ///
    /// # Returns
    /// Tuple of (left, right) sample values
    pub fn get_sample(&self, source_time: f64, _output_sample_rate: u32) -> (f32, f32) {
        if source_time < 0.0 || source_time >= self.duration {
            return (0.0, 0.0);
        }

        // Calculate the source sample position
        let source_sample_pos = source_time * self.sample_rate as f64;
        let sample_index = source_sample_pos.floor() as usize;
        let frac = (source_sample_pos - sample_index as f64) as f32;

        // Get interpolated sample based on channel count
        if self.channels == 1 {
            // Mono: duplicate to stereo
            let sample = self.interpolate_mono(sample_index, frac);
            (sample, sample)
        } else {
            // Stereo: interpolate both channels
            self.interpolate_stereo(sample_index, frac)
        }
    }

    /// Linear interpolation for mono source
    fn interpolate_mono(&self, sample_index: usize, frac: f32) -> f32 {
        let num_samples = self.pcm_data.len();

        if sample_index >= num_samples {
            return 0.0;
        }

        let s0 = self.pcm_data[sample_index];
        let s1 = if sample_index + 1 < num_samples {
            self.pcm_data[sample_index + 1]
        } else {
            s0
        };

        // Linear interpolation
        s0 + (s1 - s0) * frac
    }

    /// Linear interpolation for stereo source
    fn interpolate_stereo(&self, sample_index: usize, frac: f32) -> (f32, f32) {
        let num_frames = self.pcm_data.len() / 2;

        if sample_index >= num_frames {
            return (0.0, 0.0);
        }

        // Get current frame
        let idx0 = sample_index * 2;
        let l0 = self.pcm_data[idx0];
        let r0 = self.pcm_data[idx0 + 1];

        // Get next frame
        let (l1, r1) = if sample_index + 1 < num_frames {
            let idx1 = (sample_index + 1) * 2;
            (self.pcm_data[idx1], self.pcm_data[idx1 + 1])
        } else {
            (l0, r0)
        };

        // Linear interpolation
        let left = l0 + (l1 - l0) * frac;
        let right = r0 + (r1 - r0) * frac;

        (left, right)
    }

    /// Get the number of frames (samples per channel)
    pub fn num_frames(&self) -> usize {
        self.pcm_data.len() / self.channels as usize
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mono_to_stereo() {
        // 4 samples at 1000 Hz = 4ms
        let pcm_data = vec![0.0, 0.5, 1.0, 0.5];
        let source = AudioClipSource::new("test".to_string(), pcm_data, 1000, 1);

        // Sample at t=0
        let (l, r) = source.get_sample(0.0, 48000);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);

        // Sample at t=0.5ms (halfway between samples 0 and 1)
        let (l, r) = source.get_sample(0.0005, 48000);
        assert!((l - 0.25).abs() < 0.01);
        assert_eq!(l, r);
    }

    #[test]
    fn test_stereo_interpolation() {
        // 2 frames of stereo at 1000 Hz
        let pcm_data = vec![0.0, 0.0, 1.0, -1.0];
        let source = AudioClipSource::new("test".to_string(), pcm_data, 1000, 2);

        // Sample halfway between frames
        let (l, r) = source.get_sample(0.0005, 48000);
        assert!((l - 0.5).abs() < 0.01);
        assert!((r - (-0.5)).abs() < 0.01);
    }

    #[test]
    fn test_out_of_bounds() {
        let pcm_data = vec![1.0, 1.0];
        let source = AudioClipSource::new("test".to_string(), pcm_data, 1000, 2);

        // Before start
        let (l, r) = source.get_sample(-0.1, 48000);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);

        // After end
        let (l, r) = source.get_sample(1.0, 48000);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);
    }

    #[test]
    fn test_streaming_new() {
        let source = AudioClipSource::new_streaming("stream".to_string(), 48000, 2, Some(10.0));
        assert!(!source.is_complete);
        assert_eq!(source.duration, 0.0);
        assert_eq!(source.pcm_data.len(), 0);
        // Pre-allocated capacity for ~10s of stereo audio
        assert!(source.pcm_data.capacity() >= 48000 * 2 * 10);
    }

    #[test]
    fn test_streaming_append_and_playback() {
        let mut source = AudioClipSource::new_streaming("stream".to_string(), 1000, 2, None);

        // Append first chunk: 2 stereo frames
        source.append_chunk(&[0.5, -0.5, 1.0, -1.0]);
        assert_eq!(source.duration, 0.002); // 2 frames at 1000 Hz
        assert!(!source.is_complete);

        // Can sample from the first chunk
        let (l, r) = source.get_sample(0.0, 48000);
        assert!((l - 0.5).abs() < 0.01);
        assert!((r - (-0.5)).abs() < 0.01);

        // Beyond current data returns silence
        let (l, r) = source.get_sample(0.01, 48000);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);

        // Append second chunk
        source.append_chunk(&[0.25, -0.25]);
        assert_eq!(source.duration, 0.003); // 3 frames now

        // Can sample across chunk boundary (interpolation between frame 1 and 2)
        let (l, r) = source.get_sample(0.0015, 48000);
        // Midpoint between frame 1 (1.0, -1.0) and frame 2 (0.25, -0.25)
        assert!((l - 0.625).abs() < 0.01);
        assert!((r - (-0.625)).abs() < 0.01);
    }

    #[test]
    fn test_streaming_finalize() {
        let mut source = AudioClipSource::new_streaming("stream".to_string(), 48000, 2, Some(60.0));

        // Pre-allocated for 60s but only append a tiny amount
        source.append_chunk(&[0.5, -0.5]);
        assert!(!source.is_complete);

        source.finalize();
        assert!(source.is_complete);
        // shrink_to_fit should have reduced capacity
        assert!(source.pcm_data.capacity() <= source.pcm_data.len() + 16);
    }

    #[test]
    fn test_backward_compat_is_complete() {
        let source = AudioClipSource::new("test".to_string(), vec![1.0, 1.0], 1000, 2);
        assert!(source.is_complete);
    }
}
