//! GPU-accelerated text rendering using glyphon.
//!
//! Uses glyphon for text rendering with cosmic-text for text shaping.
//! cosmic-text uses rustybuzz (HarfBuzz-compatible) for proper complex script support
//! including RTL scripts (Arabic, Persian, Hebrew) and ligatures.
//!
//! ## Embedded Fonts
//! - DejaVu Sans (~750KB) - Latin, Cyrillic, Greek
//! - Noto Sans (~570KB) - Extended Latin coverage
//! - Noto Sans Arabic (~240KB) - Arabic, Persian, Urdu (RTL)
//!
//! ## CJK Support
//! Chinese/Japanese/Korean fonts are NOT embedded due to size (~15-20MB).
//! To render CJK text, load a CJK font dynamically via `load_font()`.

use std::collections::{HashMap, HashSet};

use glyphon::{
    Attrs, Buffer, Cache, Color, Family, FontSystem, Metrics, Resolution, Shaping, SwashCache,
    TextArea, TextAtlas, TextBounds, TextRenderer as GlyphonTextRenderer, Viewport, Weight,
};
use wgpu::{Device, MultisampleState, Queue, TextureFormat, TextureView};

use tooscut_types::{TextAlign, TextLayerData, VerticalAlign};

// Embedded fonts (total ~1.5MB)
const DEJAVU_SANS: &[u8] = include_bytes!("../fonts/DejaVuSans.ttf");
const NOTO_SANS: &[u8] = include_bytes!("../fonts/NotoSans-Regular.ttf");
const NOTO_SANS_ARABIC: &[u8] = include_bytes!("../fonts/NotoSansArabic-Regular.ttf");

/// GPU-accelerated text renderer using glyphon.
pub struct TextRenderer {
    font_system: FontSystem,
    swash_cache: SwashCache,
    cache: Cache,
    viewport: Viewport,
    atlas: TextAtlas,
    renderer: GlyphonTextRenderer,
    buffers: Vec<Buffer>,
    width: u32,
    height: u32,
    loaded_fonts: HashSet<String>,
    font_info: HashMap<String, LoadedFontInfo>,
}

/// Stored info about a loaded font variant.
#[derive(Debug, Clone)]
struct LoadedFontInfo {
    family: String,
    weight: u16,
    is_italic: bool,
}

impl TextRenderer {
    /// Create a new text renderer with embedded fonts.
    pub fn new(
        device: &Device,
        queue: &Queue,
        width: u32,
        height: u32,
        format: TextureFormat,
    ) -> Result<Self, String> {
        // Create font system with embedded fonts
        let mut font_system = FontSystem::new();

        // Load embedded fonts - order matters for fallback
        // DejaVu Sans as primary default (good Latin coverage)
        font_system.db_mut().load_font_data(DEJAVU_SANS.to_vec());
        // Noto Sans for extended Latin/Cyrillic
        font_system.db_mut().load_font_data(NOTO_SANS.to_vec());
        // Noto Sans Arabic for RTL scripts (Persian, Arabic, Urdu)
        font_system.db_mut().load_font_data(NOTO_SANS_ARABIC.to_vec());
        // Note: CJK fonts not embedded due to size - load via load_font() if needed

        // Set DejaVu Sans as the default sans-serif font
        // This is required for WASM where there are no system fonts
        font_system.db_mut().set_sans_serif_family("DejaVu Sans");

        // Create swash cache for glyph rasterization
        let swash_cache = SwashCache::new();

        // Create shared cache for pipelines/layouts
        let cache = Cache::new(device);

        // Create viewport
        let mut viewport = Viewport::new(device, &cache);
        viewport.update(
            queue,
            Resolution {
                width,
                height,
            },
        );

        // Create texture atlas for glyphs
        let mut atlas = TextAtlas::new(device, queue, &cache, format);

        // Create the glyphon text renderer
        let renderer =
            GlyphonTextRenderer::new(&mut atlas, device, MultisampleState::default(), None);

        Ok(Self {
            font_system,
            swash_cache,
            cache,
            viewport,
            atlas,
            renderer,
            buffers: Vec::new(),
            width,
            height,
            loaded_fonts: HashSet::new(),
            font_info: HashMap::new(),
        })
    }

    /// Resize the text renderer viewport.
    pub fn resize(&mut self, queue: &Queue, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }
        self.width = width;
        self.height = height;
        self.viewport.update(queue, Resolution { width, height });
    }

    /// Load a custom font from TTF/OTF data.
    ///
    /// The `font_family` parameter should match how you'll reference this font
    /// in text layers. When a text layer uses this font_family, cosmic-text
    /// will look up the font by its internal family name.
    ///
    /// Returns true if the font was loaded, false if already loaded.
    pub fn load_font(&mut self, font_family: &str, font_data: Vec<u8>) -> bool {
        if self.loaded_fonts.contains(font_family) {
            return false;
        }

        // Count faces before loading
        let faces_before: Vec<_> = self.font_system.db().faces().map(|f| f.id).collect();

        // Load the font
        self.font_system.db_mut().load_font_data(font_data);

        // Find the newly added face and log info
        for face in self.font_system.db().faces() {
            if !faces_before.contains(&face.id) {
                let internal_family_name = face
                    .families
                    .first()
                    .map(|(n, _)| n.to_string())
                    .unwrap_or_else(|| "unknown".to_string());

                let is_italic = matches!(
                    face.style,
                    glyphon::fontdb::Style::Italic | glyphon::fontdb::Style::Oblique
                );

                // Log the mapping so users can see the actual font family name
                log::info!(
                    "Loaded font: requested='{}' -> internal family='{}', weight={}, italic={}",
                    font_family,
                    internal_family_name,
                    face.weight.0,
                    is_italic
                );

                self.font_info.insert(
                    font_family.to_string(),
                    LoadedFontInfo {
                        family: internal_family_name,
                        weight: face.weight.0,
                        is_italic,
                    },
                );
                break;
            }
        }

        self.loaded_fonts.insert(font_family.to_string());
        true
    }

    /// Check if a font family has been loaded.
    pub fn is_font_loaded(&self, font_family: &str) -> bool {
        self.loaded_fonts.contains(font_family)
    }

    /// Calculate text metrics: (width, is_rtl).
    fn calculate_text_metrics(buffer: &Buffer) -> (f32, bool) {
        let mut max_width: f32 = 0.0;
        let mut is_rtl = false;

        for run in buffer.layout_runs() {
            if run.line_w > max_width {
                max_width = run.line_w;
            }
            if run.rtl {
                is_rtl = true;
            }
        }

        (max_width, is_rtl)
    }

    /// Calculate total text height.
    fn calculate_text_height(buffer: &Buffer) -> f32 {
        let mut total_height: f32 = 0.0;
        for run in buffer.layout_runs() {
            total_height = total_height.max(run.line_top + run.line_height);
        }
        total_height
    }

    /// Split text into word spans with indices for highlighting.
    fn split_into_word_spans(text: &str) -> Vec<(&str, Option<usize>)> {
        let mut spans = Vec::new();
        let mut word_index = 0;
        let mut span_start = 0;
        let mut in_word = false;

        for (i, c) in text.char_indices() {
            let is_whitespace = c.is_whitespace();

            if is_whitespace && in_word {
                // End of word
                if i > span_start {
                    spans.push((&text[span_start..i], Some(word_index)));
                    word_index += 1;
                }
                span_start = i;
                in_word = false;
            } else if !is_whitespace && !in_word {
                // Start of word
                if i > span_start {
                    spans.push((&text[span_start..i], None));
                }
                span_start = i;
                in_word = true;
            }
        }

        // Emit final span
        if span_start < text.len() {
            if in_word {
                spans.push((&text[span_start..], Some(word_index)));
            } else {
                spans.push((&text[span_start..], None));
            }
        }

        spans
    }

    /// Calculate word bounds from buffer layout.
    fn calculate_word_bounds(
        buffer: &Buffer,
        text: &str,
    ) -> HashMap<usize, (f32, f32, f32, f32)> {
        let mut word_bounds: HashMap<usize, (f32, f32, f32, f32)> = HashMap::new();

        // Build byte offset -> word index map
        let mut byte_to_word: HashMap<usize, usize> = HashMap::new();
        let mut word_index = 0;
        let mut in_word = false;

        for (byte_offset, c) in text.char_indices() {
            if c.is_whitespace() {
                in_word = false;
            } else {
                if !in_word {
                    in_word = true;
                }
                byte_to_word.insert(byte_offset, word_index);
                let next_offset = byte_offset + c.len_utf8();
                if next_offset >= text.len()
                    || text[next_offset..]
                        .chars()
                        .next()
                        .map_or(true, |c| c.is_whitespace())
                {
                    word_index += 1;
                }
            }
        }

        // Build word bounds from glyphs
        for run in buffer.layout_runs() {
            let line_top = run.line_top;
            let line_height = run.line_height;

            for glyph in run.glyphs.iter() {
                let byte_offset = glyph.start;

                if let Some(&w_idx) = byte_to_word.get(&byte_offset) {
                    let glyph_x = glyph.x;
                    let glyph_w = glyph.w;

                    word_bounds
                        .entry(w_idx)
                        .and_modify(|(x, y, w, h)| {
                            let x_end = (*x + *w).max(glyph_x + glyph_w);
                            *x = (*x).min(glyph_x);
                            *y = (*y).min(line_top);
                            *w = x_end - *x;
                            *h = (*h).max(line_height);
                        })
                        .or_insert((glyph_x, line_top, glyph_w, line_height));
                }
            }
        }

        word_bounds
    }

    /// Render text layers.
    ///
    /// This should be called after the main render pass ends.
    /// The text pass uses LoadOp::Load to preserve existing content.
    pub fn render_layers(
        &mut self,
        device: &Device,
        queue: &Queue,
        encoder: &mut wgpu::CommandEncoder,
        view: &TextureView,
        layers: &[TextLayerData],
    ) -> Result<(), String> {
        if layers.is_empty() {
            return Ok(());
        }

        // Clear previous buffers
        self.buffers.clear();

        // First pass: create text buffers
        for layer in layers {
            if layer.text.is_empty() || layer.opacity <= 0.0 {
                continue;
            }

            // Calculate box size in pixels
            let box_width = (layer.text_box.width / 100.0) * self.width as f32;
            let box_height = (layer.text_box.height / 100.0) * self.height as f32;

            // Scale font size based on canvas height (design at 1080p)
            let scaled_font_size = (layer.style.font_size / 1080.0) * self.height as f32;
            let line_height = scaled_font_size * layer.style.line_height;

            let metrics = Metrics::new(scaled_font_size, line_height);
            let mut buffer = Buffer::new(&mut self.font_system, metrics);

            buffer.set_size(
                &mut self.font_system,
                Some(box_width),
                Some(box_height),
            );

            // Create base color
            let alpha_u8 = (layer.style.color[3] * layer.opacity * 255.0) as u8;
            let base_color = Color::rgba(
                (layer.style.color[0] * 255.0) as u8,
                (layer.style.color[1] * 255.0) as u8,
                (layer.style.color[2] * 255.0) as u8,
                alpha_u8,
            );

            // Create base attributes
            // Use the specified font family, cosmic-text will fallback gracefully
            let mut base_attrs = Attrs::new().color(base_color);
            if layer.style.font_family.is_empty()
                || layer.style.font_family.eq_ignore_ascii_case("sans-serif")
            {
                base_attrs = base_attrs.family(Family::SansSerif);
            } else {
                // Use the named font - cosmic-text will fallback to sans-serif if not found
                base_attrs = base_attrs.family(Family::Name(&layer.style.font_family));
            }
            base_attrs = base_attrs.weight(Weight(layer.style.font_weight));

            // Note: We don't apply italic style by default since our embedded fonts
            // may not have italic variants. Italic is only applied when the user
            // explicitly loads an italic font variant.

            // Check for word highlighting
            let has_highlighting = layer.highlight_style.is_some()
                && layer
                    .highlighted_word_indices
                    .as_ref()
                    .map_or(false, |indices| !indices.is_empty());

            if has_highlighting {
                let highlight_style = layer.highlight_style.as_ref().unwrap();
                let highlighted_indices = layer.highlighted_word_indices.as_ref().unwrap();
                let highlighted_set: HashSet<usize> = highlighted_indices.iter().copied().collect();

                // Create highlight color
                let highlight_color = if let Some(ref color) = highlight_style.color {
                    Color::rgba(
                        (color[0] * 255.0) as u8,
                        (color[1] * 255.0) as u8,
                        (color[2] * 255.0) as u8,
                        (color[3] * layer.opacity * 255.0) as u8,
                    )
                } else {
                    base_color
                };

                // Create highlight attributes with same font fallback logic
                let mut highlight_attrs = Attrs::new().color(highlight_color);
                if layer.style.font_family.is_empty()
                    || layer.style.font_family.eq_ignore_ascii_case("sans-serif")
                {
                    highlight_attrs = highlight_attrs.family(Family::SansSerif);
                } else {
                    highlight_attrs = highlight_attrs.family(Family::Name(&layer.style.font_family));
                }
                let highlight_weight = highlight_style.font_weight.unwrap_or(layer.style.font_weight);
                highlight_attrs = highlight_attrs.weight(Weight(highlight_weight));
                // Note: Italic not applied to highlights either (same reason as base)

                // Split into word spans
                let word_spans = Self::split_into_word_spans(&layer.text);

                let rich_text: Vec<(&str, Attrs)> = word_spans
                    .iter()
                    .map(|(text, word_idx)| {
                        let attrs = match word_idx {
                            Some(idx) if highlighted_set.contains(idx) => highlight_attrs,
                            _ => base_attrs,
                        };
                        (*text, attrs)
                    })
                    .collect();

                buffer.set_rich_text(
                    &mut self.font_system,
                    rich_text,
                    base_attrs,
                    Shaping::Advanced, // Enable RTL support
                );
            } else {
                buffer.set_text(
                    &mut self.font_system,
                    &layer.text,
                    base_attrs,
                    Shaping::Advanced, // Enable RTL support
                );
            }

            // Shape the text
            buffer.shape_until_scroll(&mut self.font_system, false);

            self.buffers.push(buffer);
        }

        if self.buffers.is_empty() {
            return Ok(());
        }

        // Second pass: create text areas with positioning
        let mut text_areas: Vec<TextArea> = Vec::new();
        let mut buffer_idx = 0;

        for layer in layers {
            if layer.text.is_empty() || layer.opacity <= 0.0 {
                continue;
            }

            let buffer = &self.buffers[buffer_idx];
            buffer_idx += 1;

            // Calculate box position and size in pixels
            let box_x = (layer.text_box.x / 100.0) * self.width as f32;
            let box_y = (layer.text_box.y / 100.0) * self.height as f32;
            let box_width = (layer.text_box.width / 100.0) * self.width as f32;
            let box_height = (layer.text_box.height / 100.0) * self.height as f32;

            // Calculate text metrics
            let (text_width, is_rtl) = Self::calculate_text_metrics(buffer);
            let text_height = Self::calculate_text_height(buffer);

            // Calculate horizontal alignment offset
            let h_offset = match layer.style.text_align {
                TextAlign::Left => 0.0,
                TextAlign::Center => (box_width - text_width) / 2.0,
                TextAlign::Right => box_width - text_width,
            };

            // Calculate vertical alignment offset
            let v_offset = match layer.style.vertical_align {
                VerticalAlign::Top => 0.0,
                VerticalAlign::Middle => (box_height - text_height) / 2.0,
                VerticalAlign::Bottom => box_height - text_height,
            };

            // Adjust for RTL text
            let adjusted_x = if is_rtl {
                box_x + h_offset + (text_width - box_width)
            } else {
                box_x + h_offset
            };
            let adjusted_y = box_y + v_offset;

            // Create default color with opacity
            let alpha_u8 = (layer.style.color[3] * layer.opacity * 255.0) as u8;
            let color = Color::rgba(
                (layer.style.color[0] * 255.0) as u8,
                (layer.style.color[1] * 255.0) as u8,
                (layer.style.color[2] * 255.0) as u8,
                alpha_u8,
            );

            text_areas.push(TextArea {
                buffer,
                left: adjusted_x,
                top: adjusted_y,
                scale: 1.0,
                bounds: TextBounds {
                    left: box_x as i32,
                    top: box_y as i32,
                    right: (box_x + box_width) as i32,
                    bottom: (box_y + box_height) as i32,
                },
                default_color: color,
                custom_glyphs: &[],
            });
        }

        if text_areas.is_empty() {
            return Ok(());
        }

        // Prepare text for rendering
        self.renderer
            .prepare(
                device,
                queue,
                &mut self.font_system,
                &mut self.atlas,
                &self.viewport,
                text_areas,
                &mut self.swash_cache,
            )
            .map_err(|e| format!("Failed to prepare text: {:?}", e))?;

        // Create render pass for text (uses LoadOp::Load to preserve existing content)
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("text_render_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load, // Preserve existing content
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            self.renderer
                .render(&self.atlas, &self.viewport, &mut pass)
                .map_err(|e| format!("Failed to render text: {:?}", e))?;
        }

        Ok(())
    }
}
