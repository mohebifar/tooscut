//! Main compositor implementation.

use std::sync::Arc;

use bytemuck::cast_slice;
use wasm_bindgen::prelude::*;
use wgpu::{
    BindGroupDescriptor, BindGroupEntry, BindGroupLayout, BindingResource, Buffer,
    BufferDescriptor, BufferUsages, CommandEncoderDescriptor, Device, LoadOp, Operations, Queue,
    RenderPassColorAttachment, RenderPassDescriptor, RenderPipeline, StoreOp, Surface,
    SurfaceConfiguration, TextureViewDescriptor,
};

use crate::error::{CompositorError, Result};
use crate::pipeline::{create_bind_group_layout, create_pipeline};
use crate::texture::{TextureInfo, TextureManager};
use crate::uniforms::LayerUniforms;
use tooscut_types::{Effects, LayerData, RenderFrame};

#[cfg(target_arch = "wasm32")]
use web_sys::{HtmlCanvasElement, HtmlVideoElement, ImageBitmap, OffscreenCanvas};

/// GPU-accelerated video compositor.
#[wasm_bindgen]
pub struct Compositor {
    device: Arc<Device>,
    queue: Arc<Queue>,
    surface: Surface<'static>,
    surface_config: SurfaceConfiguration,
    pipeline: RenderPipeline,
    bind_group_layout: BindGroupLayout,
    textures: TextureManager,
    uniform_buffer: Buffer,
    width: u32,
    height: u32,
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
impl Compositor {
    /// Create a new compositor from an HTML canvas element.
    #[wasm_bindgen]
    pub async fn from_canvas(
        canvas: HtmlCanvasElement,
    ) -> std::result::Result<Compositor, JsValue> {
        Self::create_from_canvas(canvas).await.map_err(Into::into)
    }

    /// Create a compositor for offscreen rendering.
    #[wasm_bindgen]
    pub async fn from_offscreen_canvas(
        canvas: OffscreenCanvas,
    ) -> std::result::Result<Compositor, JsValue> {
        Self::create_from_offscreen(canvas)
            .await
            .map_err(Into::into)
    }

    /// Upload texture from an HTML video element.
    #[wasm_bindgen]
    pub fn upload_video(&mut self, video: &HtmlVideoElement, texture_id: &str) {
        let width = video.video_width();
        let height = video.video_height();

        if width == 0 || height == 0 {
            return;
        }

        // Create placeholder texture if needed
        if self.textures.get(texture_id).is_none() {
            let _ = self.textures.upload(
                &self.device,
                &self.queue,
                texture_id,
                width,
                height,
                &vec![0u8; (width * height * 4) as usize],
            );
        }
    }

    /// Upload texture from an ImageBitmap.
    #[wasm_bindgen]
    pub fn upload_bitmap(&mut self, bitmap: &ImageBitmap, texture_id: &str) {
        let width = bitmap.width();
        let height = bitmap.height();

        if width == 0 || height == 0 {
            return;
        }

        if self.textures.get(texture_id).is_none() {
            let _ = self.textures.upload(
                &self.device,
                &self.queue,
                texture_id,
                width,
                height,
                &vec![255u8; (width * height * 4) as usize],
            );
        }
    }
}

#[wasm_bindgen]
impl Compositor {
    /// Get the canvas width.
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Get the canvas height.
    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Resize the compositor canvas.
    #[wasm_bindgen]
    pub fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }

        self.width = width;
        self.height = height;
        self.surface_config.width = width;
        self.surface_config.height = height;
        self.surface.configure(&self.device, &self.surface_config);
    }

    /// Upload texture data from RGBA pixel array.
    #[wasm_bindgen]
    pub fn upload_rgba(
        &mut self,
        texture_id: &str,
        width: u32,
        height: u32,
        data: &[u8],
    ) -> std::result::Result<(), JsValue> {
        self.textures
            .upload(&self.device, &self.queue, texture_id, width, height, data)
            .map_err(Into::into)
    }

    /// Clear a specific texture.
    #[wasm_bindgen]
    pub fn clear_texture(&mut self, texture_id: &str) {
        self.textures.remove(texture_id);
    }

    /// Clear all textures.
    #[wasm_bindgen]
    pub fn clear_all_textures(&mut self) {
        self.textures.clear();
    }

    /// Render layers from JSON data.
    #[wasm_bindgen]
    pub fn render_layers(&mut self, layers_json: &str) -> std::result::Result<(), JsValue> {
        let frame: RenderFrame =
            serde_json::from_str(layers_json).map_err(|e| JsValue::from_str(&e.to_string()))?;

        self.render_frame(&frame).map_err(Into::into)
    }

    /// Render a single layer by texture ID.
    #[wasm_bindgen]
    pub fn render_single_layer(
        &mut self,
        texture_id: &str,
        opacity: f32,
    ) -> std::result::Result<(), JsValue> {
        let layer = LayerData::new(texture_id).with_effects(Effects::with_opacity(opacity));

        let frame = RenderFrame {
            layers: vec![layer],
            timeline_time: 0.0,
            width: self.width,
            height: self.height,
        };

        self.render_frame(&frame).map_err(Into::into)
    }

    /// Flush any pending GPU commands.
    #[wasm_bindgen]
    pub fn flush(&self) {
        self.device.poll(wgpu::Maintain::Wait);
    }

    /// Get the number of loaded textures.
    #[wasm_bindgen]
    pub fn texture_count(&self) -> usize {
        self.textures.len()
    }

    /// Clean up resources.
    #[wasm_bindgen]
    pub fn dispose(self) {
        // Resources are automatically cleaned up when dropped
    }
}

#[cfg(target_arch = "wasm32")]
impl Compositor {
    /// Create compositor from HTML canvas.
    async fn create_from_canvas(canvas: HtmlCanvasElement) -> Result<Self> {
        let width = canvas.width();
        let height = canvas.height();

        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU | wgpu::Backends::GL,
            ..Default::default()
        });

        let surface: Surface<'static> = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(|e| CompositorError::Canvas(e.to_string()))?;

        Self::create_with_surface(instance, surface, width, height).await
    }

    /// Create compositor from offscreen canvas.
    async fn create_from_offscreen(canvas: OffscreenCanvas) -> Result<Self> {
        let width = canvas.width();
        let height = canvas.height();

        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU | wgpu::Backends::GL,
            ..Default::default()
        });

        let surface: Surface<'static> = instance
            .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas))
            .map_err(|e| CompositorError::Canvas(e.to_string()))?;

        Self::create_with_surface(instance, surface, width, height).await
    }
}

impl Compositor {
    /// Create compositor with a surface.
    async fn create_with_surface(
        instance: wgpu::Instance,
        surface: Surface<'static>,
        width: u32,
        height: u32,
    ) -> Result<Self> {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| CompositorError::AdapterRequest("No suitable adapter found".into()))?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("compositor_device"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
                    memory_hints: Default::default(),
                },
                None,
            )
            .await
            .map_err(|e| CompositorError::DeviceRequest(e.to_string()))?;

        let device = Arc::new(device);
        let queue = Arc::new(queue);

        let surface_caps = surface.get_capabilities(&adapter);
        let surface_format = surface_caps
            .formats
            .iter()
            .find(|f| f.is_srgb())
            .copied()
            .unwrap_or(surface_caps.formats[0]);

        let surface_config = SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: width.max(1),
            height: height.max(1),
            present_mode: wgpu::PresentMode::AutoVsync,
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };

        surface.configure(&device, &surface_config);

        let bind_group_layout = create_bind_group_layout(&device);
        let pipeline = create_pipeline(&device, &bind_group_layout, surface_format)?;
        let textures = TextureManager::new(&device);

        let uniform_buffer = device.create_buffer(&BufferDescriptor {
            label: Some("layer_uniform_buffer"),
            size: std::mem::size_of::<LayerUniforms>() as u64,
            usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Ok(Self {
            device,
            queue,
            surface,
            surface_config,
            pipeline,
            bind_group_layout,
            textures,
            uniform_buffer,
            width: width.max(1),
            height: height.max(1),
        })
    }

    /// Render a complete frame.
    pub fn render_frame(&mut self, frame: &RenderFrame) -> Result<()> {
        let output = self
            .surface
            .get_current_texture()
            .map_err(|e| CompositorError::SurfaceTexture(e.to_string()))?;

        let view = output
            .texture
            .create_view(&TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&CommandEncoderDescriptor {
                label: Some("render_encoder"),
            });

        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("compositor_render_pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(wgpu::Color::BLACK),
                        store: StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_pipeline(&self.pipeline);

            // Render each layer
            for layer in &frame.layers {
                if let Some(texture_info) = self.textures.get(&layer.texture_id) {
                    self.render_layer(&mut render_pass, layer, texture_info, frame.timeline_time);
                }
            }
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();

        Ok(())
    }

    /// Render a single layer.
    fn render_layer<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        layer: &LayerData,
        texture_info: &'a TextureInfo,
        _timeline_time: f64,
    ) {
        // Calculate transform matrix
        let matrix = layer.transform.to_matrix(
            self.width,
            self.height,
            texture_info.width as f32,
            texture_info.height as f32,
        );

        // Build uniforms
        let mut uniforms = LayerUniforms::from_matrix(matrix)
            .with_effects(&layer.effects)
            .with_texture_size(texture_info.width, texture_info.height);

        if let Some(crop) = &layer.crop {
            uniforms = uniforms.with_crop(crop);
        }

        // TODO: Apply keyframe animations here
        // TODO: Apply transitions here

        // Upload uniforms
        self.queue
            .write_buffer(&self.uniform_buffer, 0, cast_slice(&[uniforms]));

        // Create bind group for this layer
        let bind_group = self.device.create_bind_group(&BindGroupDescriptor {
            label: Some("layer_bind_group"),
            layout: &self.bind_group_layout,
            entries: &[
                BindGroupEntry {
                    binding: 0,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
                BindGroupEntry {
                    binding: 1,
                    resource: BindingResource::TextureView(&texture_info.view),
                },
                BindGroupEntry {
                    binding: 2,
                    resource: BindingResource::Sampler(self.textures.sampler()),
                },
            ],
        });

        render_pass.set_bind_group(0, &bind_group, &[]);
        render_pass.draw(0..3, 0..1); // Draw fullscreen triangle
    }
}
