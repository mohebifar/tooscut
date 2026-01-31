//! GPU uniform buffer structures.
//!
//! These structs are laid out for direct upload to GPU uniform buffers.
//! They must be 16-byte aligned and use repr(C) for binary compatibility.

use bytemuck::{Pod, Zeroable};
use glam::Mat4;
use tooscut_types::{Crop, Effects, TransitionType};

/// Layer uniforms for the GPU shader.
///
/// This struct is 128 bytes, aligned to 16 bytes for WebGPU requirements.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct LayerUniforms {
    /// 4x4 transformation matrix (64 bytes).
    pub transform: [[f32; 4]; 4],
    /// Opacity (0.0-1.0).
    pub opacity: f32,
    /// Brightness multiplier.
    pub brightness: f32,
    /// Contrast multiplier.
    pub contrast: f32,
    /// Saturation multiplier.
    pub saturation: f32,
    // 80 bytes so far
    /// Hue rotation in radians.
    pub hue_rotate: f32,
    /// Transition type enum value.
    pub transition_type: u32,
    /// Transition progress (0.0-1.0).
    pub transition_progress: f32,
    /// Crop from top (0.0-1.0).
    pub crop_top: f32,
    // 96 bytes
    /// Crop from right (0.0-1.0).
    pub crop_right: f32,
    /// Crop from bottom (0.0-1.0).
    pub crop_bottom: f32,
    /// Crop from left (0.0-1.0).
    pub crop_left: f32,
    /// Blur radius in pixels.
    pub blur: f32,
    // 112 bytes
    /// Texture width (for blur calculations).
    pub texture_width: f32,
    /// Texture height (for blur calculations).
    pub texture_height: f32,
    /// Whether to mirror edges for blur (0.0 or 1.0).
    pub mirror_edges: f32,
    /// Motion blur amount.
    pub motion_blur: f32,
    // 128 bytes total
}

impl Default for LayerUniforms {
    fn default() -> Self {
        Self {
            transform: Mat4::IDENTITY.to_cols_array_2d(),
            opacity: 1.0,
            brightness: 1.0,
            contrast: 1.0,
            saturation: 1.0,
            hue_rotate: 0.0,
            transition_type: 0, // None
            transition_progress: 0.0,
            crop_top: 0.0,
            crop_right: 0.0,
            crop_bottom: 0.0,
            crop_left: 0.0,
            blur: 0.0,
            texture_width: 1.0,
            texture_height: 1.0,
            mirror_edges: 0.0,
            motion_blur: 0.0,
        }
    }
}

impl LayerUniforms {
    /// Create uniforms from a transformation matrix.
    pub fn from_matrix(matrix: Mat4) -> Self {
        Self {
            transform: matrix.to_cols_array_2d(),
            ..Default::default()
        }
    }

    /// Apply effects to the uniforms.
    pub fn with_effects(mut self, effects: &Effects) -> Self {
        self.opacity = effects.opacity;
        self.brightness = effects.brightness;
        self.contrast = effects.contrast;
        self.saturation = effects.saturation;
        self.hue_rotate = effects.hue_rotate.to_radians();
        self.blur = effects.blur;
        self
    }

    /// Apply crop to the uniforms.
    pub fn with_crop(mut self, crop: &Crop) -> Self {
        self.crop_top = crop.top;
        self.crop_right = crop.right;
        self.crop_bottom = crop.bottom;
        self.crop_left = crop.left;
        self
    }

    /// Set texture dimensions (needed for blur).
    pub fn with_texture_size(mut self, width: u32, height: u32) -> Self {
        self.texture_width = width as f32;
        self.texture_height = height as f32;
        self
    }

    /// Set transition state.
    pub fn with_transition(mut self, transition_type: TransitionType, progress: f32) -> Self {
        self.transition_type = transition_type_to_u32(transition_type);
        self.transition_progress = progress;
        self
    }
}

/// Convert transition type enum to u32 for GPU.
fn transition_type_to_u32(t: TransitionType) -> u32 {
    match t {
        TransitionType::None => 0,
        TransitionType::Fade => 1,
        TransitionType::Dissolve => 2,
        TransitionType::WipeLeft => 3,
        TransitionType::WipeRight => 4,
        TransitionType::WipeUp => 5,
        TransitionType::WipeDown => 6,
        TransitionType::SlideLeft => 7,
        TransitionType::SlideRight => 8,
        TransitionType::SlideUp => 9,
        TransitionType::SlideDown => 10,
        TransitionType::ZoomIn => 11,
        TransitionType::ZoomOut => 12,
        TransitionType::RotateCw => 13,
        TransitionType::RotateCcw => 14,
        TransitionType::FlipH => 15,
        TransitionType::FlipV => 16,
    }
}

/// Verify that LayerUniforms is exactly 128 bytes.
const _: () = assert!(std::mem::size_of::<LayerUniforms>() == 128);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uniforms_size() {
        assert_eq!(std::mem::size_of::<LayerUniforms>(), 128);
    }

    #[test]
    fn uniforms_alignment() {
        assert_eq!(std::mem::align_of::<LayerUniforms>(), 4);
    }

    #[test]
    fn default_uniforms() {
        let uniforms = LayerUniforms::default();
        assert_eq!(uniforms.opacity, 1.0);
        assert_eq!(uniforms.brightness, 1.0);
        assert_eq!(uniforms.contrast, 1.0);
        assert_eq!(uniforms.saturation, 1.0);
    }
}
