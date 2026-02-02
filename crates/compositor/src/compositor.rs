//! Main compositor implementation.

use std::sync::Arc;

use bytemuck::cast_slice;
use wasm_bindgen::prelude::*;
use wgpu::{
    util::DeviceExt, BindGroupDescriptor, BindGroupEntry, BindGroupLayout, BindingResource, Buffer,
    BufferDescriptor, BufferUsages, CommandEncoderDescriptor, Device, LoadOp, Operations, Queue,
    RenderPassColorAttachment, RenderPassDescriptor, RenderPipeline, StoreOp, Surface,
    SurfaceConfiguration, TextureViewDescriptor,
};

use crate::error::{CompositorError, Result};
use crate::pipeline::{create_bind_group_layout, create_pipeline};
use crate::shape_pipeline::{create_shape_bind_group_layout, create_shape_pipeline, ShapeUniforms};
use crate::text::TextRenderer;
use crate::texture::{TextureInfo, TextureManager};
use crate::uniforms::LayerUniforms;
use tooscut_types::{
    Effects, LineLayerData, MediaLayerData, RenderFrame, ShapeLayerData, TextLayerData,
};

#[cfg(target_arch = "wasm32")]
use web_sys::{HtmlCanvasElement, HtmlVideoElement, ImageBitmap, OffscreenCanvas};

/// A renderable item with its z-index for sorting.
#[derive(Debug)]
enum RenderItem<'a> {
    Media(&'a MediaLayerData),
    Shape(&'a ShapeLayerData),
    Line(&'a LineLayerData),
    Text(&'a TextLayerData),
}

impl<'a> RenderItem<'a> {
    fn z_index(&self) -> i32 {
        match self {
            RenderItem::Media(m) => m.z_index,
            RenderItem::Shape(s) => s.z_index,
            RenderItem::Line(l) => l.z_index,
            RenderItem::Text(t) => t.z_index,
        }
    }
}

/// GPU-accelerated video compositor.
#[wasm_bindgen]
pub struct Compositor {
    device: Arc<Device>,
    queue: Arc<Queue>,
    surface: Surface<'static>,
    surface_config: SurfaceConfiguration,
    // Media layer rendering
    pipeline: RenderPipeline,
    bind_group_layout: BindGroupLayout,
    uniform_buffer: Buffer,
    // Shape/line rendering
    shape_pipeline: RenderPipeline,
    shape_bind_group_layout: BindGroupLayout,
    shape_uniform_buffer: Buffer,
    // Textures
    textures: TextureManager,
    width: u32,
    height: u32,
    // Offscreen render target for pixel readback
    render_texture: Option<wgpu::Texture>,
    readback_buffer: Option<Buffer>,
    // Text rendering
    text_renderer: Option<TextRenderer>,
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

    /// Upload texture from an ImageBitmap using zero-copy GPU transfer.
    ///
    /// This uses `copy_external_image_to_texture` for efficient GPU upload
    /// without copying pixel data through JavaScript.
    #[wasm_bindgen]
    pub fn upload_bitmap(
        &mut self,
        bitmap: &ImageBitmap,
        texture_id: &str,
    ) -> std::result::Result<(), JsValue> {
        self.textures
            .upload_bitmap(&self.device, &self.queue, texture_id, bitmap)
            .map_err(Into::into)
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

        // Resize text renderer if initialized
        if let Some(ref mut text_renderer) = self.text_renderer {
            text_renderer.resize(&self.queue, width, height);
        }
    }

    /// Load a custom font from TTF/OTF data.
    ///
    /// The `font_family` should be the font's internal family name (e.g., "Roboto", "Open Sans").
    /// Use this same name in text layer `fontFamily` to use this font.
    ///
    /// Returns true if the font was loaded, false if already loaded.
    #[wasm_bindgen]
    pub fn load_font(&mut self, font_family: &str, font_data: &[u8]) -> bool {
        self.ensure_text_renderer();
        if let Some(ref mut text_renderer) = self.text_renderer {
            text_renderer.load_font(font_family, font_data.to_vec())
        } else {
            false
        }
    }

    /// Check if a font family has been loaded.
    #[wasm_bindgen]
    pub fn is_font_loaded(&self, font_family: &str) -> bool {
        if let Some(ref text_renderer) = self.text_renderer {
            text_renderer.is_font_loaded(font_family)
        } else {
            false
        }
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

    /// Render layers from a RenderFrame object.
    #[wasm_bindgen]
    pub fn render_layers(&mut self, frame: JsValue) -> std::result::Result<(), JsValue> {
        let frame: RenderFrame =
            serde_wasm_bindgen::from_value(frame).map_err(|e| JsValue::from_str(&e.to_string()))?;

        self.render_frame(&frame).map_err(Into::into)
    }

    /// Render a single layer by texture ID.
    #[wasm_bindgen]
    pub fn render_single_layer(
        &mut self,
        texture_id: &str,
        opacity: f32,
    ) -> std::result::Result<(), JsValue> {
        let layer = MediaLayerData::new(texture_id).with_effects(Effects::with_opacity(opacity));

        let frame = RenderFrame {
            media_layers: vec![layer],
            text_layers: vec![],
            shape_layers: vec![],
            line_layers: vec![],
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

    /// Render a frame and return the pixel data as RGBA bytes.
    /// This bypasses the surface and renders to an internal texture for reliable readback.
    #[wasm_bindgen]
    pub async fn render_to_pixels(
        &mut self,
        frame: JsValue,
    ) -> std::result::Result<Vec<u8>, JsValue> {
        let frame: RenderFrame =
            serde_wasm_bindgen::from_value(frame).map_err(|e| JsValue::from_str(&e.to_string()))?;

        self.render_frame_to_pixels(&frame)
            .await
            .map_err(Into::into)
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

        // Use Rgba8Unorm if available, otherwise first format
        let surface_format = if surface_caps
            .formats
            .contains(&wgpu::TextureFormat::Rgba8Unorm)
        {
            wgpu::TextureFormat::Rgba8Unorm
        } else {
            surface_caps.formats[0]
        };

        // Use whatever alpha mode the surface supports
        let alpha_mode = surface_caps.alpha_modes[0];

        let surface_config = SurfaceConfiguration {
            // Need COPY_DST for the workaround where we render to offscreen then copy to surface
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_DST,
            format: surface_format,
            width: width.max(1),
            height: height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };

        surface.configure(&device, &surface_config);

        // Media layer pipeline
        let bind_group_layout = create_bind_group_layout(&device);
        let pipeline = create_pipeline(&device, &bind_group_layout, surface_format)?;
        let textures = TextureManager::new(&device);

        let uniform_buffer = device.create_buffer(&BufferDescriptor {
            label: Some("layer_uniform_buffer"),
            size: std::mem::size_of::<LayerUniforms>() as u64,
            usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Shape/line pipeline
        let shape_bind_group_layout = create_shape_bind_group_layout(&device);
        let shape_pipeline =
            create_shape_pipeline(&device, &shape_bind_group_layout, surface_format);

        let shape_uniform_buffer = device.create_buffer(&BufferDescriptor {
            label: Some("shape_uniform_buffer"),
            size: std::mem::size_of::<ShapeUniforms>() as u64,
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
            uniform_buffer,
            shape_pipeline,
            shape_bind_group_layout,
            shape_uniform_buffer,
            textures,
            width: width.max(1),
            height: height.max(1),
            render_texture: None,
            readback_buffer: None,
            text_renderer: None, // Lazy initialized on first text render
        })
    }

    /// Ensure the text renderer is initialized.
    fn ensure_text_renderer(&mut self) {
        if self.text_renderer.is_none() {
            match TextRenderer::new(
                &self.device,
                &self.queue,
                self.width,
                self.height,
                self.surface_config.format,
            ) {
                Ok(renderer) => {
                    self.text_renderer = Some(renderer);
                }
                Err(e) => {
                    log::error!("Failed to create text renderer: {}", e);
                }
            }
        }
    }

    /// Ensure the render texture exists and matches the current size.
    fn ensure_render_texture(&mut self) {
        let needs_create = self.render_texture.is_none()
            || self.render_texture.as_ref().unwrap().size().width != self.width
            || self.render_texture.as_ref().unwrap().size().height != self.height;

        if needs_create {
            self.render_texture = Some(self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("render_texture"),
                size: wgpu::Extent3d {
                    width: self.width,
                    height: self.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: self.surface_config.format,
                // COPY_SRC needed for copying to surface, RENDER_ATTACHMENT for drawing
                usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::COPY_SRC
                    | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            }));
        }
    }

    /// Render a complete frame.
    pub fn render_frame(&mut self, frame: &RenderFrame) -> Result<()> {
        let output = self
            .surface
            .get_current_texture()
            .map_err(|e| CompositorError::SurfaceTexture(e.to_string()))?;

        let surface_view = output
            .texture
            .create_view(&TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&CommandEncoderDescriptor {
                label: Some("render_encoder"),
            });

        // Main render pass for media, shapes, lines, and text backgrounds
        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("compositor_render_pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &surface_view,
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

            // Collect and sort all renderable items by z-index
            let mut items: Vec<RenderItem> = Vec::new();
            for layer in &frame.media_layers {
                items.push(RenderItem::Media(layer));
            }
            for shape in &frame.shape_layers {
                items.push(RenderItem::Shape(shape));
            }
            for line in &frame.line_layers {
                items.push(RenderItem::Line(line));
            }
            for text in &frame.text_layers {
                items.push(RenderItem::Text(text));
            }
            items.sort_by_key(|item| item.z_index());

            // Render each item (text backgrounds only, glyphs rendered in separate pass)
            for item in &items {
                match item {
                    RenderItem::Media(layer) => {
                        if let Some(texture_info) = self.textures.get(&layer.texture_id) {
                            self.render_media_layer(&mut render_pass, layer, texture_info);
                        }
                    }
                    RenderItem::Shape(shape) => {
                        self.render_shape(&mut render_pass, shape);
                    }
                    RenderItem::Line(line) => {
                        self.render_line(&mut render_pass, line);
                    }
                    RenderItem::Text(text) => {
                        // Render text background only; glyphs are rendered via glyphon below
                        self.render_text(&mut render_pass, text);
                    }
                }
            }
        }

        // Text glyph rendering pass (uses glyphon, separate from main pass)
        if !frame.text_layers.is_empty() {
            self.ensure_text_renderer();
            if let Some(ref mut text_renderer) = self.text_renderer {
                if let Err(e) = text_renderer.render_layers(
                    &self.device,
                    &self.queue,
                    &mut encoder,
                    &surface_view,
                    &frame.text_layers,
                ) {
                    log::error!("Text rendering failed: {}", e);
                }
            }
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();

        Ok(())
    }

    /// Render a frame to an internal texture and return the pixel data.
    /// This is used for testing where Surface presentation doesn't work.
    pub async fn render_frame_to_pixels(&mut self, frame: &RenderFrame) -> Result<Vec<u8>> {
        let width = self.width;
        let height = self.height;

        // Ensure render texture exists
        self.ensure_render_texture();

        // Ensure readback buffer exists
        let bytes_per_row = ((width * 4 + 255) / 256) * 256;
        if self.readback_buffer.is_none() {
            self.readback_buffer = Some(self.device.create_buffer(&BufferDescriptor {
                label: Some("readback_buffer"),
                size: (bytes_per_row * height) as u64,
                usage: BufferUsages::COPY_DST | BufferUsages::MAP_READ,
                mapped_at_creation: false,
            }));
        }

        // Ensure text renderer is initialized before we start borrowing textures
        if !frame.text_layers.is_empty() {
            self.ensure_text_renderer();
        }

        let render_texture = self.render_texture.as_ref().unwrap();
        let view = render_texture.create_view(&TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&CommandEncoderDescriptor {
                label: Some("offscreen_render_encoder"),
            });

        // Main render pass for media, shapes, lines, and text backgrounds
        {
            let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("offscreen_render_pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: Operations {
                        // Clear to transparent black for proper compositing
                        load: LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 0.0,
                        }),
                        store: StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            // Render all items
            let mut items: Vec<RenderItem> = Vec::new();
            for layer in &frame.media_layers {
                items.push(RenderItem::Media(layer));
            }
            for shape in &frame.shape_layers {
                items.push(RenderItem::Shape(shape));
            }
            for line in &frame.line_layers {
                items.push(RenderItem::Line(line));
            }
            for text in &frame.text_layers {
                items.push(RenderItem::Text(text));
            }
            items.sort_by_key(|item| item.z_index());

            for item in &items {
                match item {
                    RenderItem::Media(layer) => {
                        if let Some(texture_info) = self.textures.get(&layer.texture_id) {
                            self.render_media_layer(&mut render_pass, layer, texture_info);
                        }
                    }
                    RenderItem::Shape(shape) => {
                        self.render_shape(&mut render_pass, shape);
                    }
                    RenderItem::Line(line) => {
                        self.render_line(&mut render_pass, line);
                    }
                    RenderItem::Text(text) => {
                        // Render text background only; glyphs are rendered via glyphon below
                        self.render_text(&mut render_pass, text);
                    }
                }
            }
        }

        // Text glyph rendering pass (uses glyphon, separate from main pass)
        // Note: ensure_text_renderer was already called above before creating the view
        if !frame.text_layers.is_empty() {
            if let Some(ref mut text_renderer) = self.text_renderer {
                if let Err(e) = text_renderer.render_layers(
                    &self.device,
                    &self.queue,
                    &mut encoder,
                    &view,
                    &frame.text_layers,
                ) {
                    log::error!("Text rendering failed: {}", e);
                }
            }
        }

        let readback_buffer = self.readback_buffer.as_ref().unwrap();
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: render_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: readback_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        self.queue.submit(std::iter::once(encoder.finish()));

        // Poll immediately to flush commands to GPU
        self.device.poll(wgpu::Maintain::Poll);

        let buffer_slice = readback_buffer.slice(..);
        let (tx, rx) = futures::channel::oneshot::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = tx.send(result);
        });

        // Yield multiple times to ensure GPU work completes
        for _ in 0..3 {
            let promise = js_sys::Promise::new(&mut |resolve, _| {
                let window = web_sys::window().unwrap();
                let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(&resolve, 10);
            });
            let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
            self.device.poll(wgpu::Maintain::Poll);
        }

        rx.await
            .map_err(|_| CompositorError::BufferMap("Channel closed".into()))?
            .map_err(|e| CompositorError::BufferMap(e.to_string()))?;

        // Read data and remove padding
        let mapped = buffer_slice.get_mapped_range();
        let mut result = Vec::with_capacity((width * height * 4) as usize);

        for y in 0..height {
            let start = (y * bytes_per_row) as usize;
            let end = start + (width * 4) as usize;
            result.extend_from_slice(&mapped[start..end]);
        }

        drop(mapped);
        readback_buffer.unmap();

        Ok(result)
    }

    /// Render a media layer.
    fn render_media_layer<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        layer: &MediaLayerData,
        texture_info: &'a TextureInfo,
    ) {
        render_pass.set_pipeline(&self.pipeline);

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
        render_pass.draw(0..6, 0..1); // Triangle list (6 vertices, 2 triangles)
    }

    /// Render a shape layer.
    fn render_shape<'a>(&'a self, render_pass: &mut wgpu::RenderPass<'a>, shape: &ShapeLayerData) {
        render_pass.set_pipeline(&self.shape_pipeline);

        let uniforms = ShapeUniforms::from_shape(shape, self.width, self.height);

        // Create a new buffer with the uniform data immediately available
        // (using create_buffer_init ensures data is ready for this draw call)
        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("shape_uniform_buffer"),
            contents: cast_slice(&[uniforms]),
            usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
        });

        let bind_group = self.device.create_bind_group(&BindGroupDescriptor {
            label: Some("shape_bind_group"),
            layout: &self.shape_bind_group_layout,
            entries: &[BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        render_pass.set_bind_group(0, &bind_group, &[]);
        render_pass.draw(0..6, 0..1); // Triangle list (6 vertices, 2 triangles)
    }

    /// Render a line layer.
    fn render_line<'a>(&'a self, render_pass: &mut wgpu::RenderPass<'a>, line: &LineLayerData) {
        render_pass.set_pipeline(&self.shape_pipeline);

        let uniforms = ShapeUniforms::from_line(line, self.width, self.height);

        // Create a new buffer with the uniform data immediately available
        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("line_uniform_buffer"),
            contents: cast_slice(&[uniforms]),
            usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
        });

        let bind_group = self.device.create_bind_group(&BindGroupDescriptor {
            label: Some("line_bind_group"),
            layout: &self.shape_bind_group_layout,
            entries: &[BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        render_pass.set_bind_group(0, &bind_group, &[]);
        render_pass.draw(0..4, 0..1); // Triangle strip
    }

    /// Render a text layer.
    ///
    /// NOTE: Currently renders text as a background box.
    /// Full text rendering requires glyphon integration.
    fn render_text<'a>(&'a self, render_pass: &mut wgpu::RenderPass<'a>, text: &TextLayerData) {
        // For now, render a background box if text has a background color
        // Full text rendering with glyphon will be added later

        // If there's a background color, render it as a rounded rectangle
        if let Some(bg_color) = &text.style.background_color {
            render_pass.set_pipeline(&self.shape_pipeline);

            let padding = text.style.background_padding.unwrap_or(0.0);
            let radius = text.style.background_border_radius.unwrap_or(0.0);

            // Create a shape for the text background
            let cw = self.width as f32;
            let ch = self.height as f32;

            // Convert percentage to pixels with padding
            let x = text.text_box.x * cw / 100.0 - padding;
            let y = text.text_box.y * ch / 100.0 - padding;
            let w = text.text_box.width * cw / 100.0 + padding * 2.0;
            let h = text.text_box.height * ch / 100.0 + padding * 2.0;

            let scale_factor = ch / 1080.0;

            let uniforms = ShapeUniforms {
                bbox: [x, y, w, h],
                canvas: [cw, ch, 1.0 / cw, 1.0 / ch],
                fill_color: *bg_color,
                stroke_color: [0.0, 0.0, 0.0, 0.0],
                shape_type: crate::shape_pipeline::SHAPE_RECTANGLE,
                sides: 0,
                corner_radius: radius * scale_factor,
                stroke_width: 0.0,
                opacity: text.opacity,
                has_stroke: 0,
                stroke_style: 0,
                _pad1: 0,
                line_start: [0.0, 0.0],
                line_end: [0.0, 0.0],
                start_head_type: 0,
                start_head_size: 0.0,
                end_head_type: 0,
                end_head_size: 0.0,
                transition_type: 0,
                transition_progress: 0.0,
                offset_x: 0.0,
                offset_y: 0.0,
                scale: 1.0,
                _pad2: [0.0; 3],
            };

            // Create a new buffer with the uniform data immediately available
            let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("text_bg_uniform_buffer"),
                contents: cast_slice(&[uniforms]),
                usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
            });

            let bind_group = self.device.create_bind_group(&BindGroupDescriptor {
                label: Some("text_bg_bind_group"),
                layout: &self.shape_bind_group_layout,
                entries: &[BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                }],
            });

            render_pass.set_bind_group(0, &bind_group, &[]);
            render_pass.draw(0..4, 0..1); // Triangle strip
        }
    }
}
