//! Main compositor implementation.

use std::sync::Arc;

use bytemuck::cast_slice;
use wasm_bindgen::prelude::*;
use wgpu::{
    util::DeviceExt, BindGroup, BindGroupDescriptor, BindGroupEntry, BindGroupLayout,
    BindingResource, Buffer, BufferDescriptor, BufferUsages, CommandEncoderDescriptor, Device,
    LoadOp, Operations, Queue, RenderPassColorAttachment, RenderPassDescriptor, RenderPipeline,
    StoreOp, Surface, SurfaceConfiguration, TextureViewDescriptor,
};

use crate::color_grading_uniforms::ColorGradingUniforms;
use crate::error::{CompositorError, Result};
use crate::pipeline::{
    create_bind_group_layout, create_color_grading_bind_group_layout, create_pipeline,
};
use crate::shape_pipeline::{create_shape_bind_group_layout, create_shape_pipeline, ShapeUniforms};
use crate::text::TextRenderer;
use crate::texture::{TextureInfo, TextureManager};
use crate::uniforms::LayerUniforms;
use tooscut_types::{
    Effects, LineLayerData, MediaLayerData, RenderFrame, ShapeLayerData, TextLayerData,
    TransitionEffect,
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
    // Color grading
    color_grading_bind_group_layout: BindGroupLayout,
    default_cg_bind_group: BindGroup,
    // Shape/line rendering
    shape_pipeline: RenderPipeline,
    shape_bind_group_layout: BindGroupLayout,
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

        // Media layer pipeline with color grading support
        let bind_group_layout = create_bind_group_layout(&device);
        let color_grading_bind_group_layout = create_color_grading_bind_group_layout(&device);
        let pipeline = create_pipeline(
            &device,
            &bind_group_layout,
            &color_grading_bind_group_layout,
            surface_format,
        )?;

        // Create cached default color grading bind group (no-op)
        let default_cg_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("default_cg_buffer"),
            contents: cast_slice(&[ColorGradingUniforms::default()]),
            usage: BufferUsages::UNIFORM,
        });
        let default_cg_bind_group = device.create_bind_group(&BindGroupDescriptor {
            label: Some("default_cg_bind_group"),
            layout: &color_grading_bind_group_layout,
            entries: &[BindGroupEntry {
                binding: 0,
                resource: default_cg_buffer.as_entire_binding(),
            }],
        });

        let textures = TextureManager::new(&device);

        // Shape/line pipeline
        let shape_bind_group_layout = create_shape_bind_group_layout(&device);
        let shape_pipeline =
            create_shape_pipeline(&device, &shape_bind_group_layout, surface_format);

        Ok(Self {
            device,
            queue,
            surface,
            surface_config,
            pipeline,
            bind_group_layout,
            color_grading_bind_group_layout,
            default_cg_bind_group,
            shape_pipeline,
            shape_bind_group_layout,
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

    /// Render a frame to the given view.
    /// This is the core rendering logic shared by both surface and offscreen rendering.
    fn render_to_view(
        &mut self,
        encoder: &mut wgpu::CommandEncoder,
        view: &wgpu::TextureView,
        frame: &RenderFrame,
        clear_color: wgpu::Color,
    ) {
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

        // Collect unique z-indices in sorted order
        let mut z_indices: Vec<i32> = items.iter().map(|i| i.z_index()).collect();
        z_indices.sort();
        z_indices.dedup();

        let mut is_first_pass = true;

        // Collect all text items across all z-indices for a single batched
        // render_layers() call at the end.  glyphon's prepare() overwrites
        // internal GPU buffers, so calling it per-z-index means only the last
        // group's glyphs survive deferred command execution.  Text backgrounds
        // (shape pipeline) are still rendered per-z-index for correct ordering.
        let mut all_text_items: Vec<TextLayerData> = Vec::new();

        for z in z_indices {
            // Collect non-text items at this z-index
            let non_text_items: Vec<&RenderItem> = items
                .iter()
                .filter(|item| item.z_index() == z && !matches!(item, RenderItem::Text(_)))
                .collect();

            // Collect text items at this z-index, applying transition opacity
            let text_items: Vec<TextLayerData> = items
                .iter()
                .filter_map(|item| {
                    if item.z_index() == z {
                        if let RenderItem::Text(t) = item {
                            let cw = self.width as f32;
                            let ch = self.height as f32;
                            let t_opacity = ShapeUniforms::transition_opacity(
                                &t.transition_in,
                                &t.transition_out,
                                cw,
                                ch,
                            );
                            if t_opacity < 1.0 {
                                let mut modified = (*t).clone();
                                modified.opacity *= t_opacity;
                                return Some(modified);
                            }
                            return Some((*t).clone());
                        }
                    }
                    None
                })
                .collect();

            // Render non-text items in a main render pass
            if !non_text_items.is_empty() {
                let load_op = if is_first_pass {
                    is_first_pass = false;
                    LoadOp::Clear(clear_color)
                } else {
                    LoadOp::Load
                };

                let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                    label: Some("compositor_render_pass"),
                    color_attachments: &[Some(RenderPassColorAttachment {
                        view,
                        resolve_target: None,
                        ops: Operations {
                            load: load_op,
                            store: StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    timestamp_writes: None,
                    occlusion_query_set: None,
                });

                for item in &non_text_items {
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
                            self.render_text(&mut render_pass, text);
                        }
                    }
                }
            }

            // Render text background boxes at this z-index (uses shape pipeline,
            // safe to call per-z-index for correct z-ordering)
            if !text_items.is_empty() {
                // If this is the first pass (no non-text items rendered yet), clear first
                if is_first_pass {
                    is_first_pass = false;
                    let _clear_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                        label: Some("clear_pass"),
                        color_attachments: &[Some(RenderPassColorAttachment {
                            view,
                            resolve_target: None,
                            ops: Operations {
                                load: LoadOp::Clear(clear_color),
                                store: StoreOp::Store,
                            },
                        })],
                        depth_stencil_attachment: None,
                        timestamp_writes: None,
                        occlusion_query_set: None,
                    });
                }

                // Render text backgrounds
                {
                    let mut render_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                        label: Some("text_background_pass"),
                        color_attachments: &[Some(RenderPassColorAttachment {
                            view,
                            resolve_target: None,
                            ops: Operations {
                                load: LoadOp::Load,
                                store: StoreOp::Store,
                            },
                        })],
                        depth_stencil_attachment: None,
                        timestamp_writes: None,
                        occlusion_query_set: None,
                    });

                    for text in &text_items {
                        self.render_text(&mut render_pass, text);
                    }
                }

                // Accumulate text items for batched glyph rendering
                all_text_items.extend(text_items);
            }
        }

        // Render ALL text glyphs in a single batched call.
        // This is necessary because glyphon's prepare() overwrites internal
        // vertex/index buffers — calling it multiple times with deferred wgpu
        // command encoding means only the last call's data survives.
        if !all_text_items.is_empty() {
            if let Some(ref mut text_renderer) = self.text_renderer {
                if let Err(e) = text_renderer.render_layers(
                    &self.device,
                    &self.queue,
                    encoder,
                    view,
                    &all_text_items,
                ) {
                    log::error!("Text rendering failed: {}", e);
                }
            }
        }

        // Handle case where there are no items at all
        if is_first_pass {
            let _clear_pass = encoder.begin_render_pass(&RenderPassDescriptor {
                label: Some("clear_pass"),
                color_attachments: &[Some(RenderPassColorAttachment {
                    view,
                    resolve_target: None,
                    ops: Operations {
                        load: LoadOp::Clear(clear_color),
                        store: StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
        }
    }

    /// Render a complete frame to the surface.
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

        // Ensure text renderer is ready if we have text
        if !frame.text_layers.is_empty() {
            self.ensure_text_renderer();
        }

        self.render_to_view(&mut encoder, &surface_view, frame, wgpu::Color::BLACK);

        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();

        Ok(())
    }

    /// Render a frame to an internal texture and return the pixel data.
    /// This is used for testing and export where Surface presentation doesn't work.
    pub async fn render_frame_to_pixels(&mut self, frame: &RenderFrame) -> Result<Vec<u8>> {
        let width = self.width;
        let height = self.height;

        // Ensure render texture exists
        self.ensure_render_texture();

        // Ensure readback buffer exists
        let bytes_per_row = (width * 4).div_ceil(256) * 256;
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

        let mut encoder = self
            .device
            .create_command_encoder(&CommandEncoderDescriptor {
                label: Some("offscreen_render_encoder"),
            });

        // Use transparent clear color for offscreen rendering (for proper compositing)
        let clear_color = wgpu::Color {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            a: 0.0,
        };

        // Render to view in a separate scope to release borrows
        {
            let render_texture = self.render_texture.as_ref().unwrap();
            let view = render_texture.create_view(&TextureViewDescriptor::default());
            self.render_to_view(&mut encoder, &view, frame, clear_color);
        }

        // Re-borrow for copy operation
        let render_texture = self.render_texture.as_ref().unwrap();
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

        // Yield to event loop multiple times to let GPU work complete.
        // wgpu's on_submitted_work_done isn't implemented for WebGPU backend,
        // so we use setTimeout to yield to the browser's event loop.
        // Uses js_sys::global() instead of web_sys::window() to work in Web Workers.
        for _ in 0..10 {
            let promise = js_sys::Promise::new(&mut |resolve, _| {
                let global = js_sys::global();
                let set_timeout = js_sys::Reflect::get(&global, &"setTimeout".into())
                    .expect("setTimeout not found")
                    .dyn_into::<js_sys::Function>()
                    .expect("setTimeout is not a function");
                let _ = set_timeout.call2(&global, &resolve, &1.into());
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

    /// Calculate the combined transition effect for a media layer.
    ///
    /// Combines transition_in, transition_out, and cross_transition effects.
    /// Returns the merged TransitionEffect (opacity multiplier, offsets, scale, rotation).
    fn calculate_transition_effect(layer: &MediaLayerData, canvas_width: f32, canvas_height: f32) -> TransitionEffect {
        let mut effect = TransitionEffect::NONE;

        // Apply transition in (direction = 1.0 for "in")
        if let Some(ref t_in) = layer.transition_in {
            let e = TransitionEffect::calculate(
                t_in.transition.transition_type,
                t_in.eased_progress(),
                canvas_width,
                canvas_height,
                1.0,
            );
            // Skip opacity for wipe transitions — shader handles wipe masking
            if !t_in.transition.transition_type.is_wipe() {
                effect.opacity *= e.opacity;
            }
            effect.x_offset += e.x_offset;
            effect.y_offset += e.y_offset;
            effect.scale_x *= e.scale_x;
            effect.scale_y *= e.scale_y;
            effect.rotation += e.rotation;
        }

        // Apply transition out: invert progress so 0→1 means disappearing.
        // TransitionEffect::calculate is designed for "in" (0=invisible, 1=visible),
        // so we pass (1 - progress) to reverse the effect direction.
        if let Some(ref t_out) = layer.transition_out {
            let e = TransitionEffect::calculate(
                t_out.transition.transition_type,
                1.0 - t_out.eased_progress(),
                canvas_width,
                canvas_height,
                -1.0,
            );
            // Skip opacity for wipe transitions — shader handles wipe masking
            if !t_out.transition.transition_type.is_wipe() {
                effect.opacity *= e.opacity;
            }
            effect.x_offset += e.x_offset;
            effect.y_offset += e.y_offset;
            effect.scale_x *= e.scale_x;
            effect.scale_y *= e.scale_y;
            effect.rotation += e.rotation;
        }

        // Apply cross-transition
        if let Some(ref ct) = layer.cross_transition {
            if ct.cross_transition.transition_type.is_wipe() {
                // Wipe transitions use shader-based masking on the incoming clip.
                // The outgoing clip stays fully visible underneath; the incoming
                // clip renders on top with a wipe mask that progressively covers it.
                // No opacity modification needed here.
            } else {
                // Dissolve/Fade: opacity-based blending
                effect.opacity *= ct.opacity();
            }
        }

        effect
    }

    /// Render a media layer.
    fn render_media_layer<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        layer: &MediaLayerData,
        texture_info: &'a TextureInfo,
    ) {
        render_pass.set_pipeline(&self.pipeline);

        let cw = self.width as f32;
        let ch = self.height as f32;

        // Calculate transition effect (modifies transform + opacity)
        let t_effect = Self::calculate_transition_effect(layer, cw, ch);

        // Apply transition to a copy of the transform
        let mut transform = layer.transform;
        transform.x += t_effect.x_offset;
        transform.y += t_effect.y_offset;
        transform.scale_x *= t_effect.scale_x;
        transform.scale_y *= t_effect.scale_y;
        transform.rotation += t_effect.rotation;

        // Calculate transform matrix with transition-modified transform
        let matrix = transform.to_matrix(
            self.width,
            self.height,
            texture_info.width as f32,
            texture_info.height as f32,
        );

        // Apply transition opacity to effects
        let mut effects = layer.effects;
        effects.opacity *= t_effect.opacity;

        // Build uniforms
        let mut uniforms = LayerUniforms::from_matrix(matrix)
            .with_effects(&effects)
            .with_texture_size(texture_info.width, texture_info.height);

        if let Some(crop) = &layer.crop {
            uniforms = uniforms.with_crop(crop);
        }

        // Set wipe transition uniforms for shader-based wipe masking.
        // Priority: cross-transition wipe > clip transition-in wipe > clip transition-out wipe
        if let Some(ref ct) = layer.cross_transition {
            if ct.cross_transition.transition_type.is_wipe() && !ct.is_outgoing {
                uniforms = uniforms.with_transition(
                    ct.cross_transition.transition_type.to_transition_type(),
                    ct.eased_progress(),
                );
            }
        } else if let Some(ref t_in) = layer.transition_in {
            if t_in.transition.transition_type.is_wipe() {
                // For transition-in: progress 0→1 reveals the clip
                uniforms = uniforms.with_transition(
                    t_in.transition.transition_type,
                    t_in.eased_progress(),
                );
            }
        } else if let Some(ref t_out) = layer.transition_out {
            if t_out.transition.transition_type.is_wipe() {
                // For transition-out: progress 0→1 hides the clip, so invert
                uniforms = uniforms.with_transition(
                    t_out.transition.transition_type,
                    1.0 - t_out.eased_progress(),
                );
            }
        }

        // Create a per-layer uniform buffer with data immediately available.
        // Using create_buffer_init ensures each layer has its own uniform data,
        // preventing later layers from overwriting earlier layers' uniforms
        // (which happens with queue.write_buffer on a shared buffer since
        // all writes execute before the render pass).
        let uniform_buffer = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("layer_uniform_buffer"),
                contents: cast_slice(&[uniforms]),
                usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
            });

        // Create bind group for this layer
        let bind_group = self.device.create_bind_group(&BindGroupDescriptor {
            label: Some("layer_bind_group"),
            layout: &self.bind_group_layout,
            entries: &[
                BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
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

        // Set color grading bind group (group 1)
        if let Some(cg) = &layer.color_grading {
            let cg_uniforms = ColorGradingUniforms::from_color_grading(cg);
            let cg_buffer = self
                .device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("cg_uniform_buffer"),
                    contents: cast_slice(&[cg_uniforms]),
                    usage: BufferUsages::UNIFORM | BufferUsages::COPY_DST,
                });
            let cg_bind_group = self.device.create_bind_group(&BindGroupDescriptor {
                label: Some("cg_bind_group"),
                layout: &self.color_grading_bind_group_layout,
                entries: &[BindGroupEntry {
                    binding: 0,
                    resource: cg_buffer.as_entire_binding(),
                }],
            });
            render_pass.set_bind_group(1, &cg_bind_group, &[]);
        } else {
            render_pass.set_bind_group(1, &self.default_cg_bind_group, &[]);
        }

        render_pass.draw(0..6, 0..1); // Triangle list (6 vertices, 2 triangles)
    }

    /// Render a shape layer.
    fn render_shape<'a>(&'a self, render_pass: &mut wgpu::RenderPass<'a>, shape: &ShapeLayerData) {
        render_pass.set_pipeline(&self.shape_pipeline);

        let uniforms = ShapeUniforms::from_shape(shape, self.width, self.height);

        // Create a new buffer with the uniform data immediately available
        // (using create_buffer_init ensures data is ready for this draw call)
        let uniform_buffer = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
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
        let uniform_buffer = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
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

        let cw = self.width as f32;
        let ch = self.height as f32;

        // Calculate transition opacity for text
        let t_opacity = ShapeUniforms::transition_opacity(
            &text.transition_in,
            &text.transition_out,
            cw,
            ch,
        );
        let effective_opacity = text.opacity * t_opacity;

        // If there's a background color, render it as a rounded rectangle
        if let Some(bg_color) = &text.style.background_color {
            render_pass.set_pipeline(&self.shape_pipeline);

            let padding = text.style.background_padding.unwrap_or(0.0);
            let radius = text.style.background_border_radius.unwrap_or(0.0);

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
                opacity: effective_opacity,
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
            let uniform_buffer =
                self.device
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
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
