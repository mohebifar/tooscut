//! GPU-accelerated video compositor using wgpu.
//!
//! This crate provides a WebGPU-based compositor for rendering video layers,
//! text overlays, and shapes with transforms, effects, and transitions.

mod compositor;
mod error;
mod pipeline;
mod shape_pipeline;
mod text;
mod texture;
mod uniforms;

pub use compositor::Compositor;
pub use error::CompositorError;

// Re-export types for convenience
pub use tooscut_types::*;

use wasm_bindgen::prelude::*;

/// Initialize the compositor module.
///
/// This sets up panic hooks and logging for better debugging in WASM.
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    // Initialize console_log for WASM - logs will appear in browser console
    console_log::init_with_level(log::Level::Info).ok();
}
