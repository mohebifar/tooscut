//! Core types for the Tooscut video editor compositor.
//!
//! These types serve as the source of truth for both Rust WASM modules
//! and TypeScript code. TypeScript definitions are generated via wasm-bindgen.

mod color;
mod color_grading;
mod easing;
mod effects;
mod keyframe;
mod layer;
mod shape;
mod text;
mod transform;
mod transition;

pub use color::*;
pub use color_grading::*;
pub use easing::*;
pub use effects::*;
pub use keyframe::*;
pub use layer::*;
pub use shape::*;
pub use text::*;
pub use transform::*;
pub use transition::*;

/// Re-export for consumers
pub use glam;
