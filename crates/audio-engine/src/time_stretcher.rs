//! WSOLA (Waveform Similarity Overlap-Add) time stretcher.
//!
//! Preserves pitch while changing playback speed by finding the best
//! phase-aligned overlap position via cross-correlation search.

use crate::source::AudioClipSource;

/// Window size in frames (~43ms at 48kHz).
const WINDOW_SIZE: usize = 2048;
/// Analysis hop (source advance per window)
const ANALYSIS_HOP: usize = WINDOW_SIZE / 2;
/// Search range for WSOLA cross-correlation (frames around the target position)
const SEARCH_RANGE: usize = 256;
/// Output ring buffer size in frames
const BUFFER_FRAMES: usize = WINDOW_SIZE * 4;

/// Per-clip WSOLA time stretcher that preserves pitch during speed changes.
pub struct TimeStretcher {
    /// Pre-computed Hann window coefficients
    window: Vec<f32>,
    /// Circular output buffer (stereo interleaved)
    output: Vec<f32>,
    /// Normalization weights per output frame
    weights: Vec<f32>,
    /// Absolute read position (frames consumed by caller)
    read_pos: usize,
    /// Absolute write position (next synthesis window start)
    write_pos: usize,
    /// Target source read position in seconds (ideal, before WSOLA adjustment)
    target_source_time: f64,
    /// Actual source read position (adjusted by WSOLA search)
    actual_source_time: f64,
    /// Configured speed
    speed: f64,
    /// Source sample rate
    sample_rate: u32,
    /// Whether this is the first window (skip correlation search)
    first_window: bool,
    /// Temporary buffer for reading candidate windows (mono sum for correlation)
    corr_buf: Vec<f32>,
    /// Temporary buffer for the overlap region of the output
    overlap_buf: Vec<f32>,
}

impl TimeStretcher {
    pub fn new(sample_rate: u32) -> Self {
        let window: Vec<f32> = (0..WINDOW_SIZE)
            .map(|i| {
                let t = i as f64 / (WINDOW_SIZE - 1) as f64;
                (0.5 * (1.0 - (2.0 * std::f64::consts::PI * t).cos())) as f32
            })
            .collect();

        Self {
            window,
            output: vec![0.0; BUFFER_FRAMES * 2],
            weights: vec![0.0; BUFFER_FRAMES],
            read_pos: 0,
            write_pos: 0,
            target_source_time: 0.0,
            actual_source_time: 0.0,
            speed: 1.0,
            sample_rate,
            first_window: true,
            corr_buf: vec![0.0; WINDOW_SIZE],
            overlap_buf: vec![0.0; WINDOW_SIZE],
        }
    }

    /// Reset the stretcher state (e.g., after seek).
    pub fn reset(&mut self, source_time: f64, speed: f64) {
        self.output.fill(0.0);
        self.weights.fill(0.0);
        self.read_pos = 0;
        self.write_pos = 0;
        self.target_source_time = source_time;
        self.actual_source_time = source_time;
        self.speed = speed;
        self.first_window = true;
    }

    /// Update speed without full reset.
    pub fn set_speed(&mut self, speed: f64) {
        self.speed = speed;
    }

    /// Get the next stereo sample from the stretcher.
    pub fn get_sample(&mut self, source: &mut AudioClipSource) -> (f32, f32) {
        // Process windows until we have enough output ahead of read_pos
        while self.write_pos <= self.read_pos + 1 {
            self.process_window(source);
        }

        let buf_idx = self.read_pos % BUFFER_FRAMES;
        let stereo_idx = buf_idx * 2;
        let w = self.weights[buf_idx];

        let (l, r) = if w > 0.001 {
            (self.output[stereo_idx] / w, self.output[stereo_idx + 1] / w)
        } else {
            (0.0, 0.0)
        };

        // Clear consumed slot
        self.output[stereo_idx] = 0.0;
        self.output[stereo_idx + 1] = 0.0;
        self.weights[buf_idx] = 0.0;

        self.read_pos += 1;
        (l, r)
    }

    /// Process one WSOLA window.
    fn process_window(&mut self, source: &mut AudioClipSource) {
        let tps = 1.0 / self.sample_rate as f64;
        let synthesis_hop = (ANALYSIS_HOP as f64 / self.speed).round().max(1.0) as usize;

        // Determine read position with WSOLA correlation search
        let read_time = if self.first_window {
            self.first_window = false;
            self.actual_source_time
        } else {
            // Target: advance from previous actual position by analysis_hop
            self.target_source_time = self.actual_source_time + ANALYSIS_HOP as f64 * tps;

            self.find_best_offset(source, tps)
        };

        // Write windowed samples into output buffer
        for i in 0..WINDOW_SIZE {
            let t = read_time + (i as f64) * tps;
            let (l, r) = source.get_sample(t, self.sample_rate);
            let w = self.window[i];

            let out_frame = (self.write_pos + i) % BUFFER_FRAMES;
            let out_idx = out_frame * 2;
            self.output[out_idx] += l * w;
            self.output[out_idx + 1] += r * w;
            self.weights[out_frame] += w;
        }

        self.actual_source_time = read_time;
        self.write_pos += synthesis_hop;
    }

    /// WSOLA: find the best offset around target_source_time by cross-correlating
    /// with the tail of the previous output window.
    fn find_best_offset(&mut self, source: &mut AudioClipSource, tps: f64) -> f64 {
        // Extract the overlap region from the output buffer (what's already been written
        // at the current write position). We use the mono sum for correlation.
        let overlap_len = WINDOW_SIZE.min(ANALYSIS_HOP);
        let mut has_output = false;

        for i in 0..overlap_len {
            let buf_frame = (self.write_pos + i) % BUFFER_FRAMES;
            let buf_idx = buf_frame * 2;
            let w = self.weights[buf_frame];
            if w > 0.001 {
                self.overlap_buf[i] = (self.output[buf_idx] + self.output[buf_idx + 1]) / (2.0 * w);
                has_output = true;
            } else {
                self.overlap_buf[i] = 0.0;
            }
        }

        // If no previous output in overlap region, just use target directly
        if !has_output {
            return self.target_source_time;
        }

        let mut best_offset: i32 = 0;
        let mut best_corr = f64::NEG_INFINITY;
        let search = SEARCH_RANGE as i32;

        for offset in -search..=search {
            let candidate_time = self.target_source_time + (offset as f64) * tps;
            if candidate_time < 0.0 {
                continue;
            }

            // Read candidate window beginning and compute correlation with overlap
            let mut corr = 0.0f64;
            let mut energy_a = 0.0f64;
            let mut energy_b = 0.0f64;

            // Only correlate first overlap_len samples (the overlapping portion)
            // Use a stride to speed up correlation (every 4th sample)
            let stride = 4;
            for i in (0..overlap_len).step_by(stride) {
                let t = candidate_time + (i as f64) * tps;
                let (l, r) = source.get_sample(t, self.sample_rate);
                let candidate_mono = (l + r) * 0.5;
                let overlap_val = self.overlap_buf[i] as f64;
                let cand_val = candidate_mono as f64;

                corr += overlap_val * cand_val;
                energy_a += overlap_val * overlap_val;
                energy_b += cand_val * cand_val;
            }

            // Normalized cross-correlation
            let denom = (energy_a * energy_b).sqrt();
            let normalized = if denom > 1e-10 { corr / denom } else { 0.0 };

            if normalized > best_corr {
                best_corr = normalized;
                best_offset = offset;
            }
        }

        self.target_source_time + (best_offset as f64) * tps
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_sine_source(sample_rate: u32, duration_ms: u32, freq: f32) -> AudioClipSource {
        let num_samples = (sample_rate as u32 * duration_ms / 1000) as usize;
        let mut pcm = vec![0.0f32; num_samples * 2];
        for i in 0..num_samples {
            let t = i as f32 / sample_rate as f32;
            let val = (2.0 * std::f32::consts::PI * freq * t).sin();
            pcm[i * 2] = val;
            pcm[i * 2 + 1] = val;
        }
        AudioClipSource::new("test".to_string(), pcm, sample_rate, 2)
    }

    #[test]
    fn test_speed_1x_passthrough() {
        let mut source = make_sine_source(48000, 200, 440.0);
        let mut stretcher = TimeStretcher::new(48000);
        stretcher.reset(0.0, 1.0);

        let mut non_zero = 0;
        for _ in 0..4800 {
            let (l, _r) = stretcher.get_sample(&mut source);
            if l.abs() > 0.01 {
                non_zero += 1;
            }
        }
        assert!(non_zero > 2000, "Expected audio output, got {} non-zero samples", non_zero);
    }

    #[test]
    fn test_speed_2x_produces_output() {
        let mut source = make_sine_source(48000, 400, 440.0);
        let mut stretcher = TimeStretcher::new(48000);
        stretcher.reset(0.0, 2.0);

        let mut non_zero = 0;
        for _ in 0..4800 {
            let (l, _r) = stretcher.get_sample(&mut source);
            if l.abs() > 0.01 {
                non_zero += 1;
            }
        }
        assert!(non_zero > 1000, "Expected audio at 2x speed, got {} non-zero", non_zero);
    }

    #[test]
    fn test_speed_half_produces_output() {
        let mut source = make_sine_source(48000, 400, 440.0);
        let mut stretcher = TimeStretcher::new(48000);
        stretcher.reset(0.0, 0.5);

        let mut non_zero = 0;
        for _ in 0..4800 {
            let (l, _r) = stretcher.get_sample(&mut source);
            if l.abs() > 0.01 {
                non_zero += 1;
            }
        }
        assert!(non_zero > 2000, "Expected audio at 0.5x speed, got {} non-zero", non_zero);
    }
}
