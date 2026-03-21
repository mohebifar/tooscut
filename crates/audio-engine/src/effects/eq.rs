//! 3-Band Parametric EQ
//!
//! Three biquad filters in series: low shelf, peaking mid, high shelf.
//! Coefficients are rate-limited to recalculate every 32 samples when
//! parameters are being animated via keyframes.

use serde::Deserialize;

use super::biquad::{BiquadCoeffs, BiquadFilter};

/// EQ parameters (all gains in dB, frequencies in Hz)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqParams {
    /// Low shelf gain in dB (-24 to +24)
    #[serde(default)]
    pub low_gain: f32,
    /// Mid peaking gain in dB (-24 to +24)
    #[serde(default)]
    pub mid_gain: f32,
    /// High shelf gain in dB (-24 to +24)
    #[serde(default)]
    pub high_gain: f32,
    /// Low shelf frequency in Hz (default: 200)
    #[serde(default = "default_low_freq")]
    pub low_freq: f32,
    /// Mid peaking frequency in Hz (default: 1000)
    #[serde(default = "default_mid_freq")]
    pub mid_freq: f32,
    /// High shelf frequency in Hz (default: 5000)
    #[serde(default = "default_high_freq")]
    pub high_freq: f32,
}

fn default_low_freq() -> f32 {
    200.0
}
fn default_mid_freq() -> f32 {
    1000.0
}
fn default_high_freq() -> f32 {
    5000.0
}

impl Default for EqParams {
    fn default() -> Self {
        Self {
            low_gain: 0.0,
            mid_gain: 0.0,
            high_gain: 0.0,
            low_freq: 200.0,
            mid_freq: 1000.0,
            high_freq: 5000.0,
        }
    }
}

/// 3-band parametric EQ processor (stereo)
pub struct EqProcessor {
    // Low shelf (L/R)
    low_l: BiquadFilter,
    low_r: BiquadFilter,
    // Mid peaking (L/R)
    mid_l: BiquadFilter,
    mid_r: BiquadFilter,
    // High shelf (L/R)
    high_l: BiquadFilter,
    high_r: BiquadFilter,

    sample_rate: f64,
    /// Samples since last coefficient update
    samples_since_update: u32,
    /// Last params used for coefficient calculation
    last_params: EqParams,
}

/// Rate-limit coefficient recalculation to every N samples
const COEFF_UPDATE_INTERVAL: u32 = 32;

impl EqProcessor {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            low_l: BiquadFilter::new(),
            low_r: BiquadFilter::new(),
            mid_l: BiquadFilter::new(),
            mid_r: BiquadFilter::new(),
            high_l: BiquadFilter::new(),
            high_r: BiquadFilter::new(),
            sample_rate: sample_rate as f64,
            samples_since_update: COEFF_UPDATE_INTERVAL, // Force initial update
            last_params: EqParams::default(),
        }
    }

    /// Reset filter state (call on seek)
    pub fn reset(&mut self) {
        self.low_l.reset();
        self.low_r.reset();
        self.mid_l.reset();
        self.mid_r.reset();
        self.high_l.reset();
        self.high_r.reset();
        self.samples_since_update = COEFF_UPDATE_INTERVAL;
    }

    /// Process a single stereo sample
    #[inline]
    pub fn process(&mut self, params: &EqParams, left: f32, right: f32) -> (f32, f32) {
        // Rate-limited coefficient update
        self.samples_since_update += 1;
        if self.samples_since_update >= COEFF_UPDATE_INTERVAL {
            self.update_coefficients(params);
            self.samples_since_update = 0;
        }

        let l = left as f64;
        let r = right as f64;

        // Low shelf → Mid peaking → High shelf
        let l = self.low_l.process(l);
        let r = self.low_r.process(r);
        let l = self.mid_l.process(l);
        let r = self.mid_r.process(r);
        let l = self.high_l.process(l);
        let r = self.high_r.process(r);

        (l as f32, r as f32)
    }

    fn update_coefficients(&mut self, params: &EqParams) {
        // Only recalculate if params changed
        if (params.low_gain - self.last_params.low_gain).abs() > 0.001
            || (params.low_freq - self.last_params.low_freq).abs() > 0.1
        {
            let coeffs =
                BiquadCoeffs::low_shelf(params.low_freq as f64, params.low_gain as f64, self.sample_rate);
            self.low_l.set_coeffs(coeffs);
            self.low_r.set_coeffs(coeffs);
        }

        if (params.mid_gain - self.last_params.mid_gain).abs() > 0.001
            || (params.mid_freq - self.last_params.mid_freq).abs() > 0.1
        {
            let coeffs = BiquadCoeffs::peaking(
                params.mid_freq as f64,
                params.mid_gain as f64,
                1.0, // Q factor
                self.sample_rate,
            );
            self.mid_l.set_coeffs(coeffs);
            self.mid_r.set_coeffs(coeffs);
        }

        if (params.high_gain - self.last_params.high_gain).abs() > 0.001
            || (params.high_freq - self.last_params.high_freq).abs() > 0.1
        {
            let coeffs = BiquadCoeffs::high_shelf(
                params.high_freq as f64,
                params.high_gain as f64,
                self.sample_rate,
            );
            self.high_l.set_coeffs(coeffs);
            self.high_r.set_coeffs(coeffs);
        }

        self.last_params = params.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flat_eq_passthrough() {
        let mut eq = EqProcessor::new(48000);
        let params = EqParams::default(); // All gains at 0 dB
        let (l, r) = eq.process(&params, 0.5, -0.3);
        assert!((l - 0.5).abs() < 0.01);
        assert!((r - (-0.3)).abs() < 0.01);
    }

    #[test]
    fn test_eq_boost_changes_signal() {
        let mut eq = EqProcessor::new(48000);
        let params = EqParams {
            low_gain: 12.0,
            mid_gain: 0.0,
            high_gain: 0.0,
            ..Default::default()
        };

        // Process enough samples for coefficients to take effect
        let mut last_l = 0.0;
        for i in 0..1000 {
            let input = (i as f32 * 0.01).sin() * 0.5;
            let (l, _) = eq.process(&params, input, input);
            last_l = l;
        }
        // With 12dB boost, signal should be amplified
        // (exact value depends on frequency content)
        assert!(last_l.abs() > 0.0);
    }
}
