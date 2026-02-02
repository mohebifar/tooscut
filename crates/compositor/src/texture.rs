//! Texture management for the compositor.

use std::collections::HashMap;

use wgpu::{
    Device, Extent3d, Queue, Sampler, SamplerDescriptor, Texture, TextureDescriptor,
    TextureDimension, TextureFormat, TextureUsages, TextureView, TextureViewDescriptor,
};

#[cfg(target_arch = "wasm32")]
use web_sys::ImageBitmap;

use crate::error::{CompositorError, Result};

/// Information about a stored texture.
#[derive(Debug)]
pub struct TextureInfo {
    pub texture: Texture,
    pub view: TextureView,
    pub width: u32,
    pub height: u32,
}

impl TextureInfo {
    /// Create a new texture with the given dimensions.
    pub fn new(device: &Device, width: u32, height: u32, label: &str) -> Result<Self> {
        if width == 0 || height == 0 {
            return Err(CompositorError::InvalidTextureDimensions { width, height });
        }

        // Use Rgba8Unorm (not Srgb) to avoid double gamma correction.
        // When using copyExternalImageToTexture, the source is already in sRGB
        // and the API handles the conversion. Using Rgba8UnormSrgb would apply
        // gamma correction twice, resulting in washed-out images.
        let texture = device.create_texture(&TextureDescriptor {
            label: Some(label),
            size: Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba8Unorm,
            usage: TextureUsages::TEXTURE_BINDING | TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let view = texture.create_view(&TextureViewDescriptor::default());

        Ok(Self {
            texture,
            view,
            width,
            height,
        })
    }

    /// Update texture data from RGBA pixels.
    pub fn update(&self, queue: &Queue, data: &[u8]) {
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &self.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            data,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(4 * self.width),
                rows_per_image: Some(self.height),
            },
            Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
        );
    }
}

/// Manages textures for the compositor.
pub struct TextureManager {
    textures: HashMap<String, TextureInfo>,
    sampler: Sampler,
}

impl TextureManager {
    /// Create a new texture manager.
    pub fn new(device: &Device) -> Self {
        let sampler = device.create_sampler(&SamplerDescriptor {
            label: Some("compositor_sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        Self {
            textures: HashMap::new(),
            sampler,
        }
    }

    /// Get the shared sampler.
    pub fn sampler(&self) -> &Sampler {
        &self.sampler
    }

    /// Upload a texture from RGBA pixel data.
    ///
    /// If a texture with the same ID exists, it will be replaced.
    pub fn upload(
        &mut self,
        device: &Device,
        queue: &Queue,
        texture_id: &str,
        width: u32,
        height: u32,
        data: &[u8],
    ) -> Result<()> {
        // Check if we can reuse existing texture
        if let Some(existing) = self.textures.get(texture_id) {
            if existing.width == width && existing.height == height {
                existing.update(queue, data);
                return Ok(());
            }
        }

        // Create new texture
        let info = TextureInfo::new(device, width, height, texture_id)?;
        info.update(queue, data);
        self.textures.insert(texture_id.to_string(), info);

        Ok(())
    }

    /// Get a texture by ID.
    pub fn get(&self, texture_id: &str) -> Option<&TextureInfo> {
        self.textures.get(texture_id)
    }

    /// Remove a texture.
    pub fn remove(&mut self, texture_id: &str) -> bool {
        self.textures.remove(texture_id).is_some()
    }

    /// Clear all textures.
    pub fn clear(&mut self) {
        self.textures.clear();
    }

    /// Get the number of stored textures.
    pub fn len(&self) -> usize {
        self.textures.len()
    }

    /// Check if there are no textures.
    pub fn is_empty(&self) -> bool {
        self.textures.is_empty()
    }

    /// List all texture IDs.
    pub fn texture_ids(&self) -> Vec<&str> {
        self.textures.keys().map(|s| s.as_str()).collect()
    }

    /// Upload a texture from an ImageBitmap using zero-copy GPU transfer.
    ///
    /// This uses `copy_external_image_to_texture` for efficient GPU upload
    /// without copying pixel data through JavaScript.
    #[cfg(target_arch = "wasm32")]
    pub fn upload_bitmap(
        &mut self,
        device: &Device,
        queue: &Queue,
        texture_id: &str,
        bitmap: &ImageBitmap,
    ) -> Result<()> {
        let width = bitmap.width();
        let height = bitmap.height();

        if width == 0 || height == 0 {
            return Err(CompositorError::InvalidTextureDimensions { width, height });
        }

        // Create or reuse texture
        let needs_create = match self.textures.get(texture_id) {
            Some(existing) => existing.width != width || existing.height != height,
            None => true,
        };

        if needs_create {
            let info = TextureInfo::new(device, width, height, texture_id)?;
            self.textures.insert(texture_id.to_string(), info);
        }

        let texture_info = self.textures.get(texture_id).unwrap();

        // Copy ImageBitmap directly to GPU texture (zero-copy)
        queue.copy_external_image_to_texture(
            &wgpu::CopyExternalImageSourceInfo {
                source: wgpu::ExternalImageSource::ImageBitmap(bitmap.clone()),
                origin: wgpu::Origin2d::ZERO,
                flip_y: false,
            },
            wgpu::CopyExternalImageDestInfo {
                texture: &texture_info.texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
                color_space: wgpu::PredefinedColorSpace::Srgb,
                premultiplied_alpha: false,
            },
            Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    // GPU tests require a WebGPU context which isn't available in unit tests.
    // Integration tests should be run in the browser.
}
