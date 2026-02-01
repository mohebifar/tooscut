//! Error types for the compositor.

use thiserror::Error;
use wasm_bindgen::JsValue;

/// Errors that can occur during compositing.
#[derive(Debug, Error)]
pub enum CompositorError {
    #[error("Failed to request GPU adapter: {0}")]
    AdapterRequest(String),

    #[error("Failed to request GPU device: {0}")]
    DeviceRequest(String),

    #[error("Failed to configure surface: {0}")]
    SurfaceConfiguration(String),

    #[error("Failed to get current texture: {0}")]
    SurfaceTexture(String),

    #[error("Texture not found: {0}")]
    TextureNotFound(String),

    #[error("Invalid texture dimensions: {width}x{height}")]
    InvalidTextureDimensions { width: u32, height: u32 },

    #[error("Shader compilation failed: {0}")]
    ShaderCompilation(String),

    #[error("Pipeline creation failed: {0}")]
    PipelineCreation(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Canvas error: {0}")]
    Canvas(String),

    #[error("Buffer map error: {0}")]
    BufferMap(String),
}

impl From<CompositorError> for JsValue {
    fn from(err: CompositorError) -> Self {
        JsValue::from_str(&err.to_string())
    }
}

impl From<serde_json::Error> for CompositorError {
    fn from(err: serde_json::Error) -> Self {
        CompositorError::Serialization(err.to_string())
    }
}

/// Result type for compositor operations.
pub type Result<T> = std::result::Result<T, CompositorError>;
