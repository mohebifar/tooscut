/**
 * GPU compositor for rendering video frames.
 *
 * Wraps the WASM compositor module with a TypeScript-friendly API.
 * Designed for stateless, parallel rendering across web workers.
 */

import type { RenderFrame } from "./types.js";

// WASM compositor instance type (from static factory methods)
type WasmCompositor = Awaited<
  ReturnType<typeof import("../wasm/compositor/compositor.js").Compositor.from_canvas>
>;

// WASM module - lazily loaded
let wasmModule: typeof import("../wasm/compositor/compositor.js") | null = null;
let wasmInitPromise: Promise<void> | null = null;

/**
 * Initialize the WASM compositor module.
 */
export async function initCompositorWasm(wasmUrl?: string | URL): Promise<void> {
  if (wasmModule) return;

  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      const module = await import("../wasm/compositor/compositor.js");
      if (wasmUrl) {
        await module.default(wasmUrl);
      } else {
        await module.default();
      }
      wasmModule = module;
    })();
  }

  await wasmInitPromise;
}

/**
 * GPU compositor for rendering video frames.
 *
 * Each instance wraps a WebGPU context and can render frames independently.
 * Create one per worker for parallel rendering.
 */
export class Compositor {
  private wasmCompositor: WasmCompositor;

  private constructor(wasmCompositor: WasmCompositor) {
    this.wasmCompositor = wasmCompositor;
  }

  /**
   * Create a compositor from an HTML canvas element.
   */
  static async fromCanvas(canvas: HTMLCanvasElement): Promise<Compositor> {
    await initCompositorWasm();
    if (!wasmModule) {
      throw new Error("WASM module not loaded");
    }
    const wasmCompositor = await wasmModule.Compositor.from_canvas(canvas);
    return new Compositor(wasmCompositor);
  }

  /**
   * Create a compositor from an OffscreenCanvas.
   * Use this in web workers.
   */
  static async fromOffscreenCanvas(canvas: OffscreenCanvas): Promise<Compositor> {
    await initCompositorWasm();
    if (!wasmModule) {
      throw new Error("WASM module not loaded");
    }
    const wasmCompositor = await wasmModule.Compositor.from_offscreen_canvas(canvas);
    return new Compositor(wasmCompositor);
  }

  /**
   * Upload a video element as a texture.
   */
  uploadVideo(video: HTMLVideoElement, textureId: string): void {
    this.wasmCompositor.upload_video(video, textureId);
  }

  /**
   * Upload an ImageBitmap as a texture.
   * ImageBitmaps can be transferred to workers efficiently.
   */
  uploadBitmap(bitmap: ImageBitmap, textureId: string): void {
    this.wasmCompositor.upload_bitmap(bitmap, textureId);
  }

  /**
   * Upload raw RGBA pixel data as a texture.
   */
  uploadRgba(textureId: string, width: number, height: number, data: Uint8Array): void {
    this.wasmCompositor.upload_rgba(textureId, width, height, data);
  }

  /**
   * Upload a 3D LUT from RGBA float data.
   * @param lutId - Unique identifier for this LUT
   * @param size - Cube dimension (e.g., 17, 33, 65)
   * @param data - Float32Array with size^3 * 4 elements (RGBA)
   */
  uploadLut(lutId: string, size: number, data: Float32Array): void {
    this.wasmCompositor.upload_lut(lutId, size, data);
  }

  /**
   * Remove the active LUT, reverting to passthrough.
   */
  removeLut(): void {
    this.wasmCompositor.remove_lut();
  }

  /**
   * Clear a specific texture.
   */
  clearTexture(textureId: string): void {
    this.wasmCompositor.clear_texture(textureId);
  }

  /**
   * Clear all textures.
   */
  clearAllTextures(): void {
    this.wasmCompositor.clear_all_textures();
  }

  /**
   * Load a custom font from TTF/OTF data.
   *
   * The fontFamily should be the font's internal family name (e.g., "Roboto", "Open Sans").
   * Use this same name in text layer `fontFamily` to render text with this font.
   *
   * @param fontFamily - The font family name (must match the font's internal name)
   * @param fontData - The font file data as Uint8Array
   * @returns true if font was loaded successfully, false if already loaded
   */
  loadFont(fontFamily: string, fontData: Uint8Array): boolean {
    return this.wasmCompositor.load_font(fontFamily, fontData);
  }

  /**
   * Check if a font family has been loaded.
   *
   * @param fontFamily - The font family name to check
   * @returns true if the font family is loaded
   */
  isFontLoaded(fontFamily: string): boolean {
    return this.wasmCompositor.is_font_loaded(fontFamily);
  }

  /**
   * Render a frame with multiple layers.
   *
   * All transform/effects values must be pre-evaluated (no keyframes).
   * This enables stateless parallel rendering.
   */
  renderFrame(frame: RenderFrame): void {
    this.wasmCompositor.render_layers(frame);
  }

  /**
   * Render a single layer with just opacity.
   * Useful for simple previews.
   */
  renderSingleLayer(textureId: string, opacity: number): void {
    this.wasmCompositor.render_single_layer(textureId, opacity);
  }

  /**
   * Resize the compositor canvas.
   */
  resize(width: number, height: number): void {
    this.wasmCompositor.resize(width, height);
  }

  /**
   * Get the current canvas width.
   */
  get width(): number {
    return this.wasmCompositor.width;
  }

  /**
   * Get the current canvas height.
   */
  get height(): number {
    return this.wasmCompositor.height;
  }

  /**
   * Get the number of loaded textures.
   */
  get textureCount(): number {
    return this.wasmCompositor.texture_count();
  }

  /**
   * Flush any pending GPU operations.
   */
  flush(): void {
    this.wasmCompositor.flush();
  }

  /**
   * Render a frame and return pixel data as Uint8Array.
   * This bypasses the canvas surface for reliable readback in tests.
   */
  async renderToPixels(frame: RenderFrame): Promise<Uint8Array> {
    return this.wasmCompositor.render_to_pixels(frame);
  }

  /**
   * Dispose of the compositor and release GPU resources.
   */
  dispose(): void {
    this.wasmCompositor.dispose();
  }
}
