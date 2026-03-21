//! Dynamics Compressor
//!
//! Peak envelope follower with gain reduction. Uses exponential
//! attack/release smoothing and dB-domain processing.

use serde::Deserialize;

/// Compressor parameters
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressorParams {
    /// Threshold in dB (-60 to 0)
    #[serde(default = "default_threshold")]
    pub threshold: f32,
    /// Compression ratio (1:1 to 20:1)
    #[serde(default = "default_ratio")]
    pub ratio: f32,
    /// Attack time in milliseconds
    #[serde(default = "default_attack")]
    pub attack: f32,
    /// Release time in milliseconds
    #[serde(default = "default_release")]
    pub release: f32,
    /// Makeup gain in dB
    #[serde(default)]
    pub makeup_gain: f32,
}

fn default_threshold() -> f32 {
    -20.0
}
fn default_ratio() -> f32 {
    4.0
}
fn default_attack() -> f32 {
    10.0
}
fn default_release() -> f32 {
    100.0
}

impl Default for CompressorParams {
    fn default() -> Self {
        Self {
            threshold: -20.0,
            ratio: 4.0,
            attack: 10.0,
            release: 100.0,
            makeup_gain: 0.0,
        }
    }
}

/// Compressor processor (stereo-linked)
pub struct CompressorProcessor {
    /// Current envelope level in dB
    envelope_db: f32,
    sample_rate: f32,
}

impl CompressorProcessor {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            envelope_db: -96.0,
            sample_rate: sample_rate as f32,
        }
    }

    /// Reset state (call on seek)
    pub fn reset(&mut self) {
        self.envelope_db = -96.0;
    }

    /// Process a single stereo sample
    #[inline]
    pub fn process(&mut self, params: &CompressorParams, left: f32, right: f32) -> (f32, f32) {
        // Peak detection (stereo-linked: use max of both channels)
        let peak = left.abs().max(right.abs());
        let input_db = linear_to_db(peak);

        // Envelope follower (exponential attack/release)
        let attack_coeff = time_constant(params.attack, self.sample_rate);
        let release_coeff = time_constant(params.release, self.sample_rate);

        if input_db > self.envelope_db {
            // Attack
            self.envelope_db += attack_coeff * (input_db - self.envelope_db);
        } else {
            // Release
            self.envelope_db += release_coeff * (input_db - self.envelope_db);
        }

        // Gain computation in dB domain
        let gain_db = if self.envelope_db > params.threshold {
            let over = self.envelope_db - params.threshold;
            let compressed_over = over / params.ratio;
            params.threshold + compressed_over - self.envelope_db
        } else {
            0.0
        };

        // Apply makeup gain and convert to linear
        let total_gain = db_to_linear(gain_db + params.makeup_gain);

        (left * total_gain, right * total_gain)
    }
}

/// Convert linear amplitude to dB
#[inline]
fn linear_to_db(linear: f32) -> f32 {
    if linear < 1e-10 {
        -96.0
    } else {
        20.0 * linear.log10()
    }
}

/// Convert dB to linear amplitude
#[inline]
fn db_to_linear(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

/// Calculate smoothing coefficient from time constant in ms
#[inline]
fn time_constant(time_ms: f32, sample_rate: f32) -> f32 {
    if time_ms <= 0.0 {
        1.0
    } else {
        1.0 - (-1.0 / (time_ms * 0.001 * sample_rate)).exp()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_below_threshold_passthrough() {
        let mut comp = CompressorProcessor::new(48000);
        let params = CompressorParams {
            threshold: 0.0, // 0 dB = 1.0 linear
            ratio: 4.0,
            attack: 0.01, // Very fast
            release: 100.0,
            makeup_gain: 0.0,
        };

        // Signal well below threshold
        let (l, r) = comp.process(&params, 0.1, 0.1);
        assert!((l - 0.1).abs() < 0.01);
        assert!((r - 0.1).abs() < 0.01);
    }

    #[test]
    fn test_above_threshold_reduces() {
        let mut comp = CompressorProcessor::new(48000);
        let params = CompressorParams {
            threshold: -20.0,
            ratio: 4.0,
            attack: 0.01,
            release: 100.0,
            makeup_gain: 0.0,
        };

        // Feed loud signal for enough samples to trigger compression
        for _ in 0..1000 {
            comp.process(&params, 0.9, 0.9);
        }

        // At this point envelope should have caught up
        let (l, _) = comp.process(&params, 0.9, 0.9);
        assert!(l < 0.9, "Compressor should reduce signal above threshold");
        assert!(l > 0.0, "Signal should still be positive");
    }

    #[test]
    fn test_db_conversions() {
        assert!((linear_to_db(1.0)).abs() < 0.001);
        assert!((db_to_linear(0.0) - 1.0).abs() < 0.001);
        assert!((db_to_linear(-6.0) - 0.5012).abs() < 0.01);
    }
}
