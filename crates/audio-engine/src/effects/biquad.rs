//! Biquad IIR Filter - Direct Form II Transposed
//!
//! Building block for the parametric EQ. Implements low shelf, high shelf,
//! and peaking filters using coefficients from Robert Bristow-Johnson's
//! Audio EQ Cookbook.

use std::f64::consts::PI;

/// Biquad filter coefficients
#[derive(Debug, Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f64,
    pub b1: f64,
    pub b2: f64,
    pub a1: f64,
    pub a2: f64,
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        // Pass-through (unity gain, no filtering)
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }
}

impl BiquadCoeffs {
    /// Low shelf filter
    ///
    /// * `freq` - Center frequency in Hz
    /// * `gain_db` - Gain in dB
    /// * `sample_rate` - Sample rate in Hz
    pub fn low_shelf(freq: f64, gain_db: f64, sample_rate: f64) -> Self {
        if gain_db.abs() < 0.01 {
            return Self::default();
        }

        let a = 10.0_f64.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        // S = 1.0 (slope parameter)
        let alpha = sin_w0 / 2.0 * ((a + 1.0 / a) * (1.0 / 1.0 - 1.0) + 2.0).sqrt();
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;

        Self {
            b0: (a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha)) / a0,
            b1: (2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0)) / a0,
            b2: (a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha)) / a0,
            a1: (-2.0 * ((a - 1.0) + (a + 1.0) * cos_w0)) / a0,
            a2: ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha) / a0,
        }
    }

    /// High shelf filter
    ///
    /// * `freq` - Center frequency in Hz
    /// * `gain_db` - Gain in dB
    /// * `sample_rate` - Sample rate in Hz
    pub fn high_shelf(freq: f64, gain_db: f64, sample_rate: f64) -> Self {
        if gain_db.abs() < 0.01 {
            return Self::default();
        }

        let a = 10.0_f64.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / 2.0 * ((a + 1.0 / a) * (1.0 / 1.0 - 1.0) + 2.0).sqrt();
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;

        Self {
            b0: (a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha)) / a0,
            b1: (-2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0)) / a0,
            b2: (a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha)) / a0,
            a1: (2.0 * ((a - 1.0) - (a + 1.0) * cos_w0)) / a0,
            a2: ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha) / a0,
        }
    }

    /// Peaking EQ filter
    ///
    /// * `freq` - Center frequency in Hz
    /// * `gain_db` - Gain in dB
    /// * `q` - Quality factor (bandwidth)
    /// * `sample_rate` - Sample rate in Hz
    pub fn peaking(freq: f64, gain_db: f64, q: f64, sample_rate: f64) -> Self {
        if gain_db.abs() < 0.01 {
            return Self::default();
        }

        let a = 10.0_f64.powf(gain_db / 40.0);
        let w0 = 2.0 * PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);

        let a0 = 1.0 + alpha / a;

        Self {
            b0: (1.0 + alpha * a) / a0,
            b1: (-2.0 * cos_w0) / a0,
            b2: (1.0 - alpha * a) / a0,
            a1: (-2.0 * cos_w0) / a0,
            a2: (1.0 - alpha / a) / a0,
        }
    }
}

/// Biquad filter state (Direct Form II Transposed)
///
/// Processes one channel. Use two instances for stereo.
#[derive(Debug, Clone)]
pub struct BiquadFilter {
    coeffs: BiquadCoeffs,
    // State variables (DF2T)
    z1: f64,
    z2: f64,
}

impl BiquadFilter {
    pub fn new() -> Self {
        Self {
            coeffs: BiquadCoeffs::default(),
            z1: 0.0,
            z2: 0.0,
        }
    }

    /// Update filter coefficients
    pub fn set_coeffs(&mut self, coeffs: BiquadCoeffs) {
        self.coeffs = coeffs;
    }

    /// Reset filter state (call on seek)
    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }

    /// Process a single sample
    #[inline]
    pub fn process(&mut self, input: f64) -> f64 {
        let c = &self.coeffs;
        let output = c.b0 * input + self.z1;
        self.z1 = c.b1 * input - c.a1 * output + self.z2;
        self.z2 = c.b2 * input - c.a2 * output;
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_passthrough() {
        let mut filter = BiquadFilter::new();
        // Default coefficients should pass through
        assert!((filter.process(1.0) - 1.0).abs() < 1e-10);
        assert!((filter.process(0.5) - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_low_shelf_zero_gain() {
        let coeffs = BiquadCoeffs::low_shelf(200.0, 0.0, 48000.0);
        let mut filter = BiquadFilter::new();
        filter.set_coeffs(coeffs);
        // Zero gain should pass through
        assert!((filter.process(1.0) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_peaking_zero_gain() {
        let coeffs = BiquadCoeffs::peaking(1000.0, 0.0, 1.0, 48000.0);
        let mut filter = BiquadFilter::new();
        filter.set_coeffs(coeffs);
        assert!((filter.process(1.0) - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_coefficients_finite() {
        // Ensure all coefficient calculations produce finite values
        let coeffs = BiquadCoeffs::low_shelf(200.0, 12.0, 48000.0);
        assert!(coeffs.b0.is_finite());
        assert!(coeffs.b1.is_finite());

        let coeffs = BiquadCoeffs::high_shelf(5000.0, -6.0, 48000.0);
        assert!(coeffs.b0.is_finite());

        let coeffs = BiquadCoeffs::peaking(1000.0, 10.0, 1.0, 48000.0);
        assert!(coeffs.b0.is_finite());
    }
}
