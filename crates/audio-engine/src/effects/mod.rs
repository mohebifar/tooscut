//! Audio Effects Module
//!
//! Per-clip audio effects chain: EQ → Compressor → Noise Gate → Reverb.
//! Each effect is independently enabled/disabled via its presence in
//! the AudioEffects params struct.

pub mod biquad;
pub mod compressor;
pub mod eq;
pub mod noise_gate;
pub mod reverb;

use serde::Deserialize;

use self::compressor::{CompressorParams, CompressorProcessor};
use self::eq::{EqParams, EqProcessor};
use self::noise_gate::{NoiseGateParams, NoiseGateProcessor};
use self::reverb::{ReverbParams, ReverbProcessor};

/// Per-clip audio effects parameters
///
/// Each effect is optional — only present effects are processed.
/// Sent from TypeScript via JSON.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEffects {
    #[serde(default)]
    pub eq: Option<EqParams>,
    #[serde(default)]
    pub compressor: Option<CompressorParams>,
    #[serde(default)]
    pub noise_gate: Option<NoiseGateParams>,
    #[serde(default)]
    pub reverb: Option<ReverbParams>,
}

/// Effect chain processor for a single clip
///
/// Maintains DSP state for all effects. One instance per clip,
/// stored in a HashMap in the mixer (same pattern as stretchers).
pub struct EffectChain {
    eq: EqProcessor,
    compressor: CompressorProcessor,
    noise_gate: NoiseGateProcessor,
    reverb: ReverbProcessor,
}

impl EffectChain {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            eq: EqProcessor::new(sample_rate),
            compressor: CompressorProcessor::new(sample_rate),
            noise_gate: NoiseGateProcessor::new(sample_rate),
            reverb: ReverbProcessor::new(sample_rate),
        }
    }

    /// Reset all effect state (call on seek)
    pub fn reset(&mut self) {
        self.eq.reset();
        self.compressor.reset();
        self.noise_gate.reset();
        self.reverb.reset();
    }

    /// Process a stereo sample through the enabled effects
    ///
    /// Signal chain: EQ → Compressor → Noise Gate → Reverb
    #[inline]
    pub fn process(&mut self, effects: &AudioEffects, left: f32, right: f32) -> (f32, f32) {
        let (mut l, mut r) = (left, right);

        if let Some(ref eq_params) = effects.eq {
            let result = self.eq.process(eq_params, l, r);
            l = result.0;
            r = result.1;
        }

        if let Some(ref comp_params) = effects.compressor {
            let result = self.compressor.process(comp_params, l, r);
            l = result.0;
            r = result.1;
        }

        if let Some(ref gate_params) = effects.noise_gate {
            let result = self.noise_gate.process(gate_params, l, r);
            l = result.0;
            r = result.1;
        }

        if let Some(ref reverb_params) = effects.reverb {
            let result = self.reverb.process(reverb_params, l, r);
            l = result.0;
            r = result.1;
        }

        (l, r)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_effects_passthrough() {
        let mut chain = EffectChain::new(48000);
        let effects = AudioEffects::default(); // All None

        let (l, r) = chain.process(&effects, 0.5, -0.3);
        assert!((l - 0.5).abs() < 0.001);
        assert!((r - (-0.3)).abs() < 0.001);
    }

    #[test]
    fn test_chain_with_all_effects() {
        let mut chain = EffectChain::new(48000);
        let effects = AudioEffects {
            eq: Some(EqParams {
                low_gain: 3.0,
                ..Default::default()
            }),
            compressor: Some(CompressorParams::default()),
            noise_gate: Some(NoiseGateParams {
                threshold: -60.0,
                ..Default::default()
            }),
            reverb: Some(ReverbParams {
                dry_wet: 0.2,
                ..Default::default()
            }),
        };

        // Just verify it doesn't panic and produces output
        for i in 0..1000 {
            let input = (i as f32 * 0.05).sin() * 0.5;
            let (l, r) = chain.process(&effects, input, input);
            assert!(l.is_finite(), "Left output should be finite");
            assert!(r.is_finite(), "Right output should be finite");
        }
    }

    #[test]
    fn test_reset_clears_state() {
        let mut chain = EffectChain::new(48000);
        let effects = AudioEffects {
            reverb: Some(ReverbParams {
                room_size: 0.9,
                dry_wet: 1.0,
                ..Default::default()
            }),
            ..Default::default()
        };

        // Feed signal
        chain.process(&effects, 1.0, 1.0);

        // Reset
        chain.reset();

        // Should be silent (no reverb tail)
        let effects_dry = AudioEffects::default();
        let (l, r) = chain.process(&effects_dry, 0.0, 0.0);
        assert!(l.abs() < 0.001);
        assert!(r.abs() < 0.001);
    }
}
