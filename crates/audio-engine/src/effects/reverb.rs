//! Freeverb Reverb
//!
//! Implementation of the Freeverb algorithm by Jezar at Dreampoint.
//! 8 parallel comb filters → 4 series allpass filters, stereo with
//! 23-sample spread between L/R channels.

use serde::Deserialize;

/// Reverb parameters
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverbParams {
    /// Room size (0.0 to 1.0)
    #[serde(default = "default_room_size")]
    pub room_size: f32,
    /// Damping (0.0 to 1.0) - high frequency absorption
    #[serde(default = "default_damping")]
    pub damping: f32,
    /// Stereo width (0.0 to 1.0)
    #[serde(default = "default_width")]
    pub width: f32,
    /// Dry/wet mix (0.0 = fully dry, 1.0 = fully wet)
    #[serde(default = "default_dry_wet")]
    pub dry_wet: f32,
}

fn default_room_size() -> f32 {
    0.5
}
fn default_damping() -> f32 {
    0.5
}
fn default_width() -> f32 {
    1.0
}
fn default_dry_wet() -> f32 {
    0.3
}

impl Default for ReverbParams {
    fn default() -> Self {
        Self {
            room_size: 0.5,
            damping: 0.5,
            width: 1.0,
            dry_wet: 0.3,
        }
    }
}

// Freeverb tuning constants (at 44100 Hz, scaled for other rates)
const COMB_TUNING: [usize; 8] = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING: [usize; 4] = [556, 441, 341, 225];
const STEREO_SPREAD: usize = 23;

// Freeverb scaling constants
const FIXED_GAIN: f32 = 0.015;
const SCALE_ROOM: f32 = 0.28;
const OFFSET_ROOM: f32 = 0.7;

/// Comb filter with damped feedback
struct CombFilter {
    buffer: Vec<f32>,
    index: usize,
    filter_store: f32,
}

impl CombFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            index: 0,
            filter_store: 0.0,
        }
    }

    fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.index = 0;
        self.filter_store = 0.0;
    }

    #[inline]
    fn process(&mut self, input: f32, feedback: f32, damp1: f32, damp2: f32) -> f32 {
        let output = self.buffer[self.index];

        // Damped feedback: simple one-pole lowpass on the feedback path
        self.filter_store = output * damp2 + self.filter_store * damp1;

        self.buffer[self.index] = input + self.filter_store * feedback;

        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }

        output
    }
}

/// Allpass filter
struct AllpassFilter {
    buffer: Vec<f32>,
    index: usize,
}

impl AllpassFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            index: 0,
        }
    }

    fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.index = 0;
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let buffered = self.buffer[self.index];
        let output = -input + buffered;
        self.buffer[self.index] = input + buffered * 0.5;

        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }

        output
    }
}

/// Freeverb processor (stereo)
pub struct ReverbProcessor {
    comb_l: Vec<CombFilter>,
    comb_r: Vec<CombFilter>,
    allpass_l: Vec<AllpassFilter>,
    allpass_r: Vec<AllpassFilter>,
}

impl ReverbProcessor {
    pub fn new(sample_rate: u32) -> Self {
        let scale = sample_rate as f64 / 44100.0;

        let comb_l: Vec<CombFilter> = COMB_TUNING
            .iter()
            .map(|&size| CombFilter::new(((size as f64) * scale) as usize))
            .collect();

        let comb_r: Vec<CombFilter> = COMB_TUNING
            .iter()
            .map(|&size| {
                CombFilter::new((((size + STEREO_SPREAD) as f64) * scale) as usize)
            })
            .collect();

        let allpass_l: Vec<AllpassFilter> = ALLPASS_TUNING
            .iter()
            .map(|&size| AllpassFilter::new(((size as f64) * scale) as usize))
            .collect();

        let allpass_r: Vec<AllpassFilter> = ALLPASS_TUNING
            .iter()
            .map(|&size| {
                AllpassFilter::new((((size + STEREO_SPREAD) as f64) * scale) as usize)
            })
            .collect();

        Self {
            comb_l,
            comb_r,
            allpass_l,
            allpass_r,
        }
    }

    /// Reset all filter state (call on seek)
    pub fn reset(&mut self) {
        for c in &mut self.comb_l {
            c.reset();
        }
        for c in &mut self.comb_r {
            c.reset();
        }
        for a in &mut self.allpass_l {
            a.reset();
        }
        for a in &mut self.allpass_r {
            a.reset();
        }
    }

    /// Process a single stereo sample
    #[inline]
    pub fn process(&mut self, params: &ReverbParams, left: f32, right: f32) -> (f32, f32) {
        let feedback = params.room_size * SCALE_ROOM + OFFSET_ROOM;
        let damp1 = params.damping;
        let damp2 = 1.0 - damp1;

        // Mix input to mono for reverb processing
        let input = (left + right) * FIXED_GAIN;

        // Parallel comb filters
        let mut out_l = 0.0f32;
        let mut out_r = 0.0f32;

        for comb in &mut self.comb_l {
            out_l += comb.process(input, feedback, damp1, damp2);
        }
        for comb in &mut self.comb_r {
            out_r += comb.process(input, feedback, damp1, damp2);
        }

        // Series allpass filters
        for allpass in &mut self.allpass_l {
            out_l = allpass.process(out_l);
        }
        for allpass in &mut self.allpass_r {
            out_r = allpass.process(out_r);
        }

        // Stereo width
        let wet1 = params.width / 2.0 + 0.5;
        let wet2 = (1.0 - params.width) / 2.0;

        let wet_l = out_l * wet1 + out_r * wet2;
        let wet_r = out_r * wet1 + out_l * wet2;

        // Dry/wet mix
        let dry = 1.0 - params.dry_wet;
        let wet = params.dry_wet;

        (left * dry + wet_l * wet, right * dry + wet_r * wet)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fully_dry() {
        let mut reverb = ReverbProcessor::new(48000);
        let params = ReverbParams {
            dry_wet: 0.0,
            ..Default::default()
        };

        let (l, r) = reverb.process(&params, 0.5, -0.3);
        assert!((l - 0.5).abs() < 0.001);
        assert!((r - (-0.3)).abs() < 0.001);
    }

    #[test]
    fn test_reverb_adds_tail() {
        let mut reverb = ReverbProcessor::new(48000);
        let params = ReverbParams {
            room_size: 0.8,
            dry_wet: 0.5,
            ..Default::default()
        };

        // Send an impulse
        reverb.process(&params, 1.0, 1.0);

        // After many silent samples, there should still be reverb tail
        let mut has_tail = false;
        for _ in 0..10000 {
            let (l, r) = reverb.process(&params, 0.0, 0.0);
            if l.abs() > 0.0001 || r.abs() > 0.0001 {
                has_tail = true;
            }
        }
        assert!(has_tail, "Reverb should produce a tail after an impulse");
    }

    #[test]
    fn test_reset_clears_tail() {
        let mut reverb = ReverbProcessor::new(48000);
        let params = ReverbParams {
            room_size: 0.8,
            dry_wet: 1.0,
            ..Default::default()
        };

        // Send impulse
        reverb.process(&params, 1.0, 1.0);

        // Reset
        reverb.reset();

        // Should be silent
        let (l, r) = reverb.process(&params, 0.0, 0.0);
        assert!(l.abs() < 0.0001);
        assert!(r.abs() < 0.0001);
    }
}
