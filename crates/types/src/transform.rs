//! Transform types for positioning and scaling layers.

use glam::{Mat4, Vec3};
use serde::{Deserialize, Serialize};
use tsify_next::Tsify;

/// 2D transform for positioning layers on the canvas.
///
/// Coordinates are in pixels relative to canvas origin (top-left).
/// Anchor point (0.0-1.0) determines the center of rotation/scale.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Transform {
    /// X position in pixels.
    pub x: f32,
    /// Y position in pixels.
    pub y: f32,
    /// Horizontal scale (1.0 = 100%).
    pub scale_x: f32,
    /// Vertical scale (1.0 = 100%).
    pub scale_y: f32,
    /// Rotation in degrees (clockwise).
    pub rotation: f32,
    /// Anchor X (0.0 = left, 0.5 = center, 1.0 = right).
    pub anchor_x: f32,
    /// Anchor Y (0.0 = top, 0.5 = center, 1.0 = bottom).
    pub anchor_y: f32,
}

impl Transform {
    /// Create a new Transform instance.
    pub fn new(
        x: f32,
        y: f32,
        scale_x: f32,
        scale_y: f32,
        rotation: f32,
        anchor_x: f32,
        anchor_y: f32,
    ) -> Self {
        Self {
            x,
            y,
            scale_x,
            scale_y,
            rotation,
            anchor_x,
            anchor_y,
        }
    }

    /// Create a transform at the given position with centered anchor.
    pub fn at(x: f32, y: f32) -> Self {
        Self {
            x,
            y,
            ..Self::IDENTITY
        }
    }
}

impl Transform {
    /// Identity transform (no transformation).
    pub const IDENTITY: Self = Self {
        x: 0.0,
        y: 0.0,
        scale_x: 1.0,
        scale_y: 1.0,
        rotation: 0.0,
        anchor_x: 0.5,
        anchor_y: 0.5,
    };

    /// Build a 4x4 transformation matrix for GPU rendering.
    ///
    /// The matrix transforms from layer space (with anchor at origin)
    /// to normalized device coordinates (-1 to 1).
    ///
    /// Order: translate to anchor → scale → rotate → translate to position → NDC
    pub fn to_matrix(
        &self,
        canvas_width: u32,
        canvas_height: u32,
        layer_width: f32,
        layer_height: f32,
    ) -> Mat4 {
        let cw = canvas_width as f32;
        let ch = canvas_height as f32;

        // Anchor offset in layer pixels
        let anchor_offset_x = layer_width * self.anchor_x;
        let anchor_offset_y = layer_height * self.anchor_y;

        // Final position (where anchor point lands on canvas)
        let pos_x = self.x;
        let pos_y = self.y;

        // Convert degrees to radians
        let rotation_rad = self.rotation.to_radians();

        // Build matrix: NDC ← translate ← rotate ← scale ← anchor
        // We apply in reverse order (right to left multiplication)

        // 1. Translate anchor to origin (so rotation/scale happens around anchor)
        let anchor_to_origin =
            Mat4::from_translation(Vec3::new(-anchor_offset_x, -anchor_offset_y, 0.0));

        // 2. Scale
        let scale = Mat4::from_scale(Vec3::new(self.scale_x, self.scale_y, 1.0));

        // 3. Rotate around Z axis
        let rotate = Mat4::from_rotation_z(-rotation_rad); // Negative for clockwise

        // 4. Translate to final canvas position
        let translate = Mat4::from_translation(Vec3::new(pos_x, pos_y, 0.0));

        // 5. Convert to NDC (-1 to 1, Y flipped)
        let to_ndc = Mat4::from_cols(
            Vec3::new(2.0 / cw, 0.0, 0.0).extend(0.0),
            Vec3::new(0.0, -2.0 / ch, 0.0).extend(0.0),
            Vec3::new(0.0, 0.0, 1.0).extend(0.0),
            Vec3::new(-1.0, 1.0, 0.0).extend(1.0),
        );

        // Combine: NDC ← translate ← rotate ← scale ← anchor_to_origin
        to_ndc * translate * rotate * scale * anchor_to_origin
    }

    /// Check if this transform is effectively identity (no visual change).
    pub fn is_identity(&self) -> bool {
        (self.x.abs() < f32::EPSILON)
            && (self.y.abs() < f32::EPSILON)
            && ((self.scale_x - 1.0).abs() < f32::EPSILON)
            && ((self.scale_y - 1.0).abs() < f32::EPSILON)
            && (self.rotation.abs() < f32::EPSILON)
    }
}

impl Default for Transform {
    fn default() -> Self {
        Self::IDENTITY
    }
}

/// Crop region in normalized coordinates (0.0-1.0).
///
/// Each field represents how much to remove from that edge.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
pub struct Crop {
    /// Amount to crop from top (0.0-1.0).
    pub top: f32,
    /// Amount to crop from right (0.0-1.0).
    pub right: f32,
    /// Amount to crop from bottom (0.0-1.0).
    pub bottom: f32,
    /// Amount to crop from left (0.0-1.0).
    pub left: f32,
}

impl Crop {
    /// Create a new Crop instance.
    pub fn new(top: f32, right: f32, bottom: f32, left: f32) -> Self {
        Self {
            top,
            right,
            bottom,
            left,
        }
    }
}

impl Crop {
    /// No cropping.
    pub const NONE: Self = Self {
        top: 0.0,
        right: 0.0,
        bottom: 0.0,
        left: 0.0,
    };

    /// Create a uniform crop (same amount from all edges).
    pub const fn uniform(amount: f32) -> Self {
        Self {
            top: amount,
            right: amount,
            bottom: amount,
            left: amount,
        }
    }

    /// Check if any cropping is applied.
    pub fn is_cropped(&self) -> bool {
        self.top > 0.0 || self.right > 0.0 || self.bottom > 0.0 || self.left > 0.0
    }

    /// Get the visible width ratio (1.0 - left - right).
    pub fn visible_width_ratio(&self) -> f32 {
        (1.0 - self.left - self.right).max(0.0)
    }

    /// Get the visible height ratio (1.0 - top - bottom).
    pub fn visible_height_ratio(&self) -> f32 {
        (1.0 - self.top - self.bottom).max(0.0)
    }
}

impl Default for Crop {
    fn default() -> Self {
        Self::NONE
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_transform_is_identity() {
        assert!(Transform::IDENTITY.is_identity());
    }

    #[test]
    fn crop_visible_ratio() {
        let crop = Crop {
            top: 0.1,
            right: 0.2,
            bottom: 0.1,
            left: 0.2,
        };
        assert!((crop.visible_width_ratio() - 0.6).abs() < f32::EPSILON);
        assert!((crop.visible_height_ratio() - 0.8).abs() < f32::EPSILON);
    }
}
