//! Noise Gate
//!
//! Envelope-based noise gate with smoothed open/close transitions.
//! When the signal level drops below the threshold, the gate closes
//! (attenuates the signal to silence).

use serde::Deserialize;

/// Noise gate parameters
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoiseGateParams {
    /// Threshold in dB (-80 to 0)
    #[serde(default = "default_threshold")]
    pub threshold: f32,
    /// Attack time in milliseconds (gate opening)
    #[serde(default = "default_attack")]
    pub attack: f32,
    /// Release time in milliseconds (gate closing)
    #[serde(default = "default_release")]
    pub release: f32,
}

fn default_threshold() -> f32 {
    -40.0
}
fn default_attack() -> f32 {
    1.0
}
fn default_release() -> f32 {
    50.0
}

impl Default for NoiseGateParams {
    fn default() -> Self {
        Self {
            threshold: -40.0,
            attack: 1.0,
            release: 50.0,
        }
    }
}

/// Noise gate processor (stereo-linked)
pub struct NoiseGateProcessor {
    /// Current envelope level in dB
    envelope_db: f32,
    /// Smoothed gate gain (0.0 = closed, 1.0 = open)
    gate_gain: f32,
    sample_rate: f32,
}

impl NoiseGateProcessor {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            envelope_db: -96.0,
            gate_gain: 0.0,
            sample_rate: sample_rate as f32,
        }
    }

    /// Reset state (call on seek)
    pub fn reset(&mut self) {
        self.envelope_db = -96.0;
        self.gate_gain = 0.0;
    }

    /// Process a single stereo sample
    #[inline]
    pub fn process(
        &mut self,
        params: &NoiseGateParams,
        left: f32,
        right: f32,
    ) -> (f32, f32) {
        // Peak detection (stereo-linked)
        let peak = left.abs().max(right.abs());
        let input_db = if peak < 1e-10 { -96.0 } else { 20.0 * peak.log10() };

        // Envelope follower (fast attack for detection, slower release)
        let detect_coeff = time_constant(0.1, self.sample_rate); // Very fast detection
        if input_db > self.envelope_db {
            self.envelope_db += detect_coeff * (input_db - self.envelope_db);
        } else {
            let release_coeff = time_constant(10.0, self.sample_rate);
            self.envelope_db += release_coeff * (input_db - self.envelope_db);
        }

        // Gate decision
        let target_gain = if self.envelope_db > params.threshold {
            1.0
        } else {
            0.0
        };

        // Smooth the gate gain with attack/release
        let coeff = if target_gain > self.gate_gain {
            time_constant(params.attack, self.sample_rate)
        } else {
            time_constant(params.release, self.sample_rate)
        };
        self.gate_gain += coeff * (target_gain - self.gate_gain);

        (left * self.gate_gain, right * self.gate_gain)
    }
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
    fn test_loud_signal_passes() {
        let mut gate = NoiseGateProcessor::new(48000);
        let params = NoiseGateParams {
            threshold: -40.0,
            attack: 0.01, // Very fast
            release: 50.0,
        };

        // Feed loud signal to open gate
        for _ in 0..2000 {
            gate.process(&params, 0.5, 0.5);
        }

        let (l, r) = gate.process(&params, 0.5, 0.5);
        assert!(l > 0.4, "Loud signal should pass through open gate");
        assert!(r > 0.4);
    }

    #[test]
    fn test_quiet_signal_gated() {
        let mut gate = NoiseGateProcessor::new(48000);
        let params = NoiseGateParams {
            threshold: -20.0,
            attack: 0.01,
            release: 0.01, // Very fast release
        };

        // Feed very quiet signal
        for _ in 0..5000 {
            gate.process(&params, 0.001, 0.001);
        }

        let (l, _) = gate.process(&params, 0.001, 0.001);
        assert!(l.abs() < 0.001, "Quiet signal should be gated (got {})", l);
    }
}
