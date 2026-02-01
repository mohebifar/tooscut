//! GPU-accelerated video compositor using wgpu.
//!
//! This crate provides a WebGPU-based compositor for rendering video layers,
//! text overlays, and shapes with transforms, effects, and transitions.

mod compositor;
mod error;
mod pipeline;
mod texture;
mod uniforms;

pub use compositor::Compositor;
pub use error::CompositorError;

// Re-export types for convenience
pub use tooscut_types::*;

use wasm_bindgen::prelude::*;

/// Initialize the compositor module.
///
/// This sets up panic hooks for better error messages in WASM.
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}
