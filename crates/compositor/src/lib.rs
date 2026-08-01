//! GPU-accelerated video compositor using wgpu.
//!
//! This crate provides a WebGPU-based compositor for rendering video layers,
//! text overlays, and shapes with transforms, effects, and transitions.

mod color_grading_shader;
mod color_grading_uniforms;
mod compositor;
mod error;
mod pipeline;
mod shape_pipeline;
mod text;
mod texture;
mod uniforms;

pub use color_grading_uniforms::ColorGradingUniforms;

pub use compositor::Compositor;
pub use error::CompositorError;

// Re-export types for convenience
pub use tooscut_types::*;

use std::cell::RefCell;
use std::panic;

use wasm_bindgen::prelude::*;

thread_local! {
    /// The most recent panic's formatted message, including the Rust
    /// `file:line:col` source location, captured by our custom panic hook.
    ///
    /// A Rust panic in WASM aborts with an `unreachable` trap that surfaces to
    /// JS as a stackless `RuntimeError` carrying no message. We stash the real
    /// message here first so the worker can recover it after catching the trap.
    static LAST_PANIC: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Take (clearing it) the message from the most recent Rust panic, if any.
///
/// The worker calls this immediately after a call into the compositor throws,
/// to turn the otherwise-anonymous `RuntimeError: unreachable` into a real,
/// attributable error message (payload + Rust source location) for error
/// tracking. Reading a thread-local is safe even after a trap — it does not
/// touch the compositor's (possibly inconsistent) GPU state.
#[wasm_bindgen]
pub fn take_last_panic() -> Option<String> {
    LAST_PANIC.with(|slot| slot.borrow_mut().take())
}

/// Initialize the compositor module.
///
/// This installs a panic hook that both logs to the console (as
/// `console_error_panic_hook` did) and records the panic message so it can be
/// forwarded across the WASM boundary, plus sets up logging for WASM.
#[wasm_bindgen(start)]
pub fn init() {
    panic::set_hook(Box::new(|info| {
        // `PanicHookInfo`'s `Display` includes both the panic payload and the
        // `file:line:col` location, e.g.
        // "panicked at crates/compositor/src/texture.rs:206:14:\n<message>".
        let message = info.to_string();

        // Preserve the previous console-logging behaviour for local debugging.
        web_sys::console::error_1(&JsValue::from_str(&message));

        LAST_PANIC.with(|slot| {
            *slot.borrow_mut() = Some(message);
        });
    }));

    // Initialize console_log for WASM - logs will appear in browser console
    console_log::init_with_level(log::Level::Info).ok();
}
