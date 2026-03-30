//! Audio Clip Source - PCM storage and sampling
//!
//! Supports two modes:
//! 1. **Bulk** (tests): Full PCM stored in memory via `new()`
//! 2. **Windowed** (preview + export): Fixed-size segment cache via `new_windowed()` / `update_buffer()`
//!
//! Both modes expose the same `get_sample()` API. Windowed mode returns silence
//! for regions not currently buffered and tracks buffer misses.

/// A contiguous decoded PCM segment
struct PcmSegment {
    /// Start time of this segment in source-time seconds
    start_time: f64,
    /// Interleaved PCM data (stereo: L, R, L, R, ...)
    data: Vec<f32>,
}

impl PcmSegment {
    /// End time of this segment based on sample rate and channels
    fn end_time(&self, sample_rate: u32, channels: u32) -> f64 {
        let num_frames = self.data.len() / channels as usize;
        self.start_time + num_frames as f64 / sample_rate as f64
    }

    /// Number of samples (total, not per-channel)
    fn num_samples(&self) -> usize {
        self.data.len()
    }
}

/// Audio clip source containing decoded PCM audio data
pub struct AudioClipSource {
    /// Unique identifier
    pub id: String,
    /// Decoded PCM segments (sorted by start_time, non-overlapping)
    segments: Vec<PcmSegment>,
    /// Source sample rate
    pub sample_rate: u32,
    /// Number of channels (1 or 2)
    pub channels: u32,
    /// Total duration of the source media in seconds
    pub duration: f64,
    /// Whether all PCM data has been received (streaming sources start as false)
    pub is_complete: bool,
    /// Maximum total samples to retain across all segments (usize::MAX = unbounded)
    max_samples: usize,
    /// Last source-time requested via get_sample (for eviction priority)
    last_requested_time: f64,
    /// Number of get_sample calls that hit an unbuffered region
    pub buffer_misses: u64,
}

impl AudioClipSource {
    /// Create a new audio clip source from PCM data (unbounded / legacy mode)
    ///
    /// All PCM is stored in a single segment. No eviction occurs.
    pub fn new(id: String, pcm_data: Vec<f32>, sample_rate: u32, channels: u32) -> Self {
        let num_samples = pcm_data.len() / channels as usize;
        let duration = num_samples as f64 / sample_rate as f64;

        let segment = PcmSegment {
            start_time: 0.0,
            data: pcm_data,
        };

        Self {
            id,
            segments: vec![segment],
            sample_rate,
            channels,
            duration,
            is_complete: true,
            max_samples: usize::MAX,
            last_requested_time: 0.0,
            buffer_misses: 0,
        }
    }

    /// Create a windowed audio source (metadata only, no PCM data)
    ///
    /// PCM data is managed via `update_buffer()` / `clear_buffer()`.
    /// Only `max_seconds` worth of decoded audio is retained at a time.
    pub fn new_windowed(
        id: String,
        sample_rate: u32,
        channels: u32,
        duration: f64,
        max_seconds: f64,
    ) -> Self {
        let max_samples = (max_seconds * sample_rate as f64 * channels as f64) as usize;

        Self {
            id,
            segments: Vec::new(),
            sample_rate,
            channels,
            duration,
            is_complete: true,
            max_samples,
            last_requested_time: 0.0,
            buffer_misses: 0,
        }
    }

    /// Insert or append a decoded PCM segment at the given source time (windowed mode)
    ///
    /// For sequential chunks (typical during decode-ahead), this extends the last
    /// segment in-place to avoid floating-point mismatches between computed end_time
    /// and MediaBunny's sample timestamps.
    ///
    /// If total samples across all segments exceeds `max_samples`, the segment
    /// furthest from `last_requested_time` is evicted.
    pub fn update_buffer(&mut self, start_time: f64, pcm_data: Vec<f32>) {
        if pcm_data.is_empty() {
            return;
        }

        // Fast path: if the new chunk starts within or just after the last segment,
        // extend it in place. This handles both exact-contiguous and slightly-overlapping
        // chunks from sequential decoding (e.g., MediaBunny seeking to nearest keyframe
        // may produce chunks that overlap with the previous decode's end).
        if let Some(last) = self.segments.last_mut() {
            let last_end = last.end_time(self.sample_rate, self.channels);
            let sample_duration = 1.0 / self.sample_rate as f64;

            // New chunk starts within the existing segment or just after it
            if start_time >= last.start_time && start_time <= last_end + sample_duration {
                // Skip samples that overlap with existing data
                let overlap_time = last_end - start_time;
                if overlap_time > 0.0 {
                    let overlap_frames =
                        (overlap_time * self.sample_rate as f64).ceil() as usize;
                    let overlap_samples = overlap_frames * self.channels as usize;
                    if overlap_samples < pcm_data.len() {
                        last.data.extend_from_slice(&pcm_data[overlap_samples..]);
                    }
                    // If entire chunk is within existing data, skip
                } else {
                    last.data.extend_from_slice(&pcm_data);
                }
                self.evict_if_needed();
                return;
            }
        }

        // General path: insert as a new non-contiguous segment
        let new_segment = PcmSegment {
            start_time,
            data: pcm_data,
        };
        let new_end = new_segment.end_time(self.sample_rate, self.channels);

        // Only remove segments FULLY contained within the new one
        self.segments.retain(|seg| {
            let seg_end = seg.end_time(self.sample_rate, self.channels);
            !(seg.start_time >= start_time && seg_end <= new_end)
        });

        // Insert sorted by start_time
        let insert_pos = self
            .segments
            .binary_search_by(|seg| seg.start_time.partial_cmp(&start_time).unwrap())
            .unwrap_or_else(|pos| pos);
        self.segments.insert(insert_pos, new_segment);

        // Merge adjacent segments
        self.merge_adjacent_segments();

        // Evict if over budget
        self.evict_if_needed();
    }

    /// Update the sample rate (used when decoded audio rate differs from probe metadata)
    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.sample_rate = sample_rate;
    }

    /// Clear all buffered PCM data (windowed mode, used on seek)
    pub fn clear_buffer(&mut self) {
        self.segments.clear();
    }

    /// Get and reset the buffer miss counter
    pub fn get_buffer_misses(&mut self) -> u64 {
        let misses = self.buffer_misses;
        self.buffer_misses = 0;
        misses
    }

    /// Get a stereo sample at the given source time using linear interpolation
    ///
    /// Returns silence `(0.0, 0.0)` if the requested time is out of bounds
    /// or not currently buffered (windowed mode).
    pub fn get_sample(&mut self, source_time: f64, _output_sample_rate: u32) -> (f32, f32) {
        if source_time < 0.0 || source_time >= self.duration {
            return (0.0, 0.0);
        }

        self.last_requested_time = source_time;

        // Find the segment containing this time
        let segment = match self.find_segment(source_time) {
            Some(seg) => seg,
            None => {
                self.buffer_misses += 1;
                return (0.0, 0.0);
            }
        };

        // Calculate position within the segment
        let local_time = source_time - segment.start_time;
        let source_sample_pos = local_time * self.sample_rate as f64;
        let sample_index = source_sample_pos.floor() as usize;
        let frac = (source_sample_pos - sample_index as f64) as f32;

        if self.channels == 1 {
            let sample = Self::interpolate_mono_segment(&segment.data, sample_index, frac);
            (sample, sample)
        } else {
            Self::interpolate_stereo_segment(&segment.data, sample_index, frac)
        }
    }

    /// Find the segment containing the given source time
    fn find_segment(&self, source_time: f64) -> Option<&PcmSegment> {
        // Binary search for the segment whose start_time <= source_time
        let idx = self
            .segments
            .binary_search_by(|seg| seg.start_time.partial_cmp(&source_time).unwrap())
            .unwrap_or_else(|pos| pos.saturating_sub(1));

        if idx < self.segments.len() {
            let seg = &self.segments[idx];
            let seg_end = seg.end_time(self.sample_rate, self.channels);
            if seg.start_time <= source_time && source_time < seg_end {
                return Some(seg);
            }
        }

        // Also check the exact match case (binary_search found exact)
        if !self.segments.is_empty() {
            // Check if source_time falls in the first segment
            let seg = &self.segments[0];
            let seg_end = seg.end_time(self.sample_rate, self.channels);
            if seg.start_time <= source_time && source_time < seg_end {
                return Some(seg);
            }
        }

        None
    }

    /// Merge adjacent segments that are within 2 samples of each other
    fn merge_adjacent_segments(&mut self) {
        if self.segments.len() < 2 {
            return;
        }

        let sample_tolerance = 2.0 / self.sample_rate as f64;
        let mut i = 0;
        while i + 1 < self.segments.len() {
            let end_time = self.segments[i].end_time(self.sample_rate, self.channels);
            let next_start = self.segments[i + 1].start_time;

            if (next_start - end_time).abs() <= sample_tolerance {
                // Merge: append next segment's data to current
                let next_data = std::mem::take(&mut self.segments[i + 1].data);
                self.segments[i].data.extend_from_slice(&next_data);
                self.segments.remove(i + 1);
            } else {
                i += 1;
            }
        }
    }

    /// Evict segments furthest from last_requested_time if over budget
    fn evict_if_needed(&mut self) {
        while self.total_samples() > self.max_samples && self.segments.len() > 1 {
            // Find segment furthest from last_requested_time
            let mut worst_idx = 0;
            let mut worst_dist = 0.0f64;

            for (i, seg) in self.segments.iter().enumerate() {
                let seg_mid = seg.start_time
                    + (seg.data.len() as f64 / self.channels as f64 / self.sample_rate as f64)
                        / 2.0;
                let dist = (seg_mid - self.last_requested_time).abs();
                if dist > worst_dist {
                    worst_dist = dist;
                    worst_idx = i;
                }
            }

            self.segments.remove(worst_idx);
        }
    }

    /// Total number of samples across all segments
    fn total_samples(&self) -> usize {
        self.segments.iter().map(|s| s.num_samples()).sum()
    }

    /// Linear interpolation for mono source within a segment
    fn interpolate_mono_segment(data: &[f32], sample_index: usize, frac: f32) -> f32 {
        if sample_index >= data.len() {
            return 0.0;
        }

        let s0 = data[sample_index];
        let s1 = if sample_index + 1 < data.len() {
            data[sample_index + 1]
        } else {
            s0
        };

        s0 + (s1 - s0) * frac
    }

    /// Linear interpolation for stereo source within a segment
    fn interpolate_stereo_segment(data: &[f32], sample_index: usize, frac: f32) -> (f32, f32) {
        let num_frames = data.len() / 2;

        if sample_index >= num_frames {
            return (0.0, 0.0);
        }

        let idx0 = sample_index * 2;
        let l0 = data[idx0];
        let r0 = data[idx0 + 1];

        let (l1, r1) = if sample_index + 1 < num_frames {
            let idx1 = (sample_index + 1) * 2;
            (data[idx1], data[idx1 + 1])
        } else {
            (l0, r0)
        };

        let left = l0 + (l1 - l0) * frac;
        let right = r0 + (r1 - r0) * frac;

        (left, right)
    }

    /// Get the number of frames (samples per channel) across all segments
    pub fn num_frames(&self) -> usize {
        self.total_samples() / self.channels as usize
    }

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mono_to_stereo() {
        // 4 samples at 1000 Hz = 4ms
        let pcm_data = vec![0.0, 0.5, 1.0, 0.5];
        let mut source = AudioClipSource::new("test".to_string(), pcm_data, 1000, 1);

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
        let mut source = AudioClipSource::new("test".to_string(), pcm_data, 1000, 2);

        // Sample halfway between frames
        let (l, r) = source.get_sample(0.0005, 48000);
        assert!((l - 0.5).abs() < 0.01);
        assert!((r - (-0.5)).abs() < 0.01);
    }

    #[test]
    fn test_out_of_bounds() {
        let pcm_data = vec![1.0, 1.0];
        let mut source = AudioClipSource::new("test".to_string(), pcm_data, 1000, 2);

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
    fn test_backward_compat_is_complete() {
        let source = AudioClipSource::new("test".to_string(), vec![1.0, 1.0], 1000, 2);
        assert!(source.is_complete);
    }

    // --- Windowed mode tests ---

    #[test]
    fn test_windowed_new() {
        let source =
            AudioClipSource::new_windowed("win".to_string(), 48000, 2, 300.0, 30.0);
        assert!(source.is_complete);
        assert_eq!(source.duration, 300.0);
        assert!(source.segments.is_empty());
        assert_eq!(source.buffer_misses, 0);
        // max_samples = 30s * 48000 * 2 = 2,880,000
        assert_eq!(source.max_samples, 2_880_000);
    }

    #[test]
    fn test_windowed_update_buffer_and_sample() {
        let mut source =
            AudioClipSource::new_windowed("win".to_string(), 1000, 2, 10.0, 5.0);

        // Insert 2 stereo frames starting at t=1.0
        source.update_buffer(1.0, vec![0.5, -0.5, 1.0, -1.0]);

        // Sample within the buffer
        let (l, r) = source.get_sample(1.0, 48000);
        assert!((l - 0.5).abs() < 0.01);
        assert!((r - (-0.5)).abs() < 0.01);

        // Sample outside the buffer → silence + buffer miss
        let (l, r) = source.get_sample(0.0, 48000);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);
        assert_eq!(source.buffer_misses, 1);
    }

    #[test]
    fn test_windowed_clear_buffer() {
        let mut source =
            AudioClipSource::new_windowed("win".to_string(), 1000, 2, 10.0, 5.0);

        source.update_buffer(0.0, vec![1.0, -1.0]);
        assert_eq!(source.segments.len(), 1);

        source.clear_buffer();
        assert!(source.segments.is_empty());
    }

    #[test]
    fn test_windowed_get_buffer_misses() {
        let mut source =
            AudioClipSource::new_windowed("win".to_string(), 1000, 2, 10.0, 5.0);

        // Miss 3 times
        source.get_sample(0.0, 48000);
        source.get_sample(1.0, 48000);
        source.get_sample(2.0, 48000);

        let misses = source.get_buffer_misses();
        assert_eq!(misses, 3);

        // Counter should be reset
        let misses = source.get_buffer_misses();
        assert_eq!(misses, 0);
    }

    #[test]
    fn test_windowed_eviction() {
        // max_samples = 1s * 1000Hz * 2ch = 2000 samples
        let mut source =
            AudioClipSource::new_windowed("win".to_string(), 1000, 2, 100.0, 1.0);

        // Insert 0.6s of audio at t=0 (1200 samples)
        let data_a: Vec<f32> = vec![0.1; 1200];
        source.update_buffer(0.0, data_a);

        // Insert 0.6s at t=50 (1200 samples) → total 2400 > 2000, must evict
        let data_b: Vec<f32> = vec![0.2; 1200];
        // Set last_requested_time near t=50 so t=0 segment gets evicted
        source.last_requested_time = 50.0;
        source.update_buffer(50.0, data_b);

        // Should have evicted the segment at t=0 (furthest from t=50)
        assert_eq!(source.segments.len(), 1);
        assert!((source.segments[0].start_time - 50.0).abs() < 0.001);
    }

    #[test]
    fn test_windowed_merge_adjacent() {
        let mut source =
            AudioClipSource::new_windowed("win".to_string(), 1000, 2, 10.0, 30.0);

        // Insert 2 frames at t=0 (ends at t=0.002)
        source.update_buffer(0.0, vec![0.5, -0.5, 1.0, -1.0]);

        // Insert 2 frames at t=0.002 (adjacent within 1 sample)
        source.update_buffer(0.002, vec![0.25, -0.25, 0.75, -0.75]);

        // Should have merged into 1 segment with 4 frames
        assert_eq!(source.segments.len(), 1);
        assert_eq!(source.segments[0].data.len(), 8); // 4 frames * 2 channels

        // Can sample across the merge boundary
        let (l, r) = source.get_sample(0.0015, 48000);
        // Between frame 1 (1.0, -1.0) and frame 2 (0.25, -0.25), frac=0.5
        assert!((l - 0.625).abs() < 0.02);
        assert!((r - (-0.625)).abs() < 0.02);
    }

    #[test]
    fn test_windowed_overlap_replace() {
        let mut source =
            AudioClipSource::new_windowed("win".to_string(), 1000, 2, 10.0, 30.0);

        // Insert at t=0, 3 frames [0, 0.003)
        source.update_buffer(0.0, vec![0.1, 0.1, 0.2, 0.2, 0.3, 0.3]);

        // Insert a non-contiguous segment far away at t=5.0 (well beyond tolerance)
        source.update_buffer(5.0, vec![0.9, 0.9, 0.8, 0.8]);

        // Both segments should exist
        assert_eq!(source.segments.len(), 2);

        // Can read from both
        let (l, _) = source.get_sample(0.0, 48000);
        assert!((l - 0.1).abs() < 0.01);
        let (l, _) = source.get_sample(5.0, 48000);
        assert!((l - 0.9).abs() < 0.01);
    }

    #[test]
    fn test_windowed_sequential_extend() {
        let mut source =
            AudioClipSource::new_windowed("win".to_string(), 1000, 2, 10.0, 30.0);

        // Sequential chunks should extend via fast path
        source.update_buffer(0.0, vec![0.1, 0.1, 0.2, 0.2, 0.3, 0.3]);
        source.update_buffer(0.003, vec![0.4, 0.4, 0.5, 0.5]);

        // Should be 1 merged segment with 5 frames
        assert_eq!(source.segments.len(), 1);
        assert_eq!(source.segments[0].data.len(), 10); // 5 frames * 2 channels

        // Can read across chunk boundary
        let (l, _) = source.get_sample(0.003, 48000);
        assert!((l - 0.4).abs() < 0.01);
    }
}
