/**
 * Compositor Web Worker
 *
 * Runs the WASM compositor on a dedicated thread for real-time preview rendering.
 * Uses OffscreenCanvas (transferred from main thread) for zero-copy display.
 *
 * Performance optimizations:
 * - Canvas transferred once, rendering happens directly on it
 * - ImageBitmaps transferred (not copied) for video frames
 * - No data returned to main thread (canvas updates visible automatically)
 */

import * as Comlink from "comlink";
import type { RenderFrame } from "@tooscut/render-engine";

// ===================== TYPES =====================

export interface CompositorWorkerConfig {
  /** OffscreenCanvas transferred from main thread */
  canvas: OffscreenCanvas;
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
}

// ===================== WORKER STATE =====================

let compositor: Awaited<
  ReturnType<typeof import("@tooscut/render-engine").Compositor.fromOffscreenCanvas>
> | null = null;
let canvas: OffscreenCanvas | null = null;
let isInitialized = false;

// Track which textures are currently uploaded to avoid re-uploading
const uploadedTextures = new Set<string>();

// ===================== WORKER API =====================

/**
 * Initialize the compositor with a transferred OffscreenCanvas.
 * The canvas is transferred once and owned by the worker.
 */
async function initialize(config: CompositorWorkerConfig): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    canvas = config.canvas;
    const { width, height } = config;

    // Import and initialize the compositor module
    const { Compositor, initCompositorWasm } = await import("@tooscut/render-engine");

    // Initialize WASM module
    await initCompositorWasm();

    // Set canvas dimensions before creating the WebGPU context so the
    // initial surface size matches the project settings.
    canvas.width = width;
    canvas.height = height;

    // Create compositor for OffscreenCanvas
    compositor = await Compositor.fromOffscreenCanvas(canvas);
    compositor.resize(width, height);

    isInitialized = true;
  } catch (error) {
    console.error("[CompositorWorker] Initialization failed:", error);
    throw error;
  }
}

/**
 * Resize the compositor output.
 */
function resize(width: number, height: number): void {
  if (!compositor || !canvas) {
    console.warn("[CompositorWorker] Cannot resize - not initialized");
    return;
  }

  canvas.width = width;
  canvas.height = height;
  compositor.resize(width, height);
}

/**
 * Load a font into the WASM compositor.
 */
function loadFont(fontId: string, fontData: Uint8Array): boolean {
  if (!compositor) {
    console.warn("[CompositorWorker] Cannot load font - not initialized");
    return false;
  }

  try {
    return compositor.loadFont(fontId, fontData);
  } catch (error) {
    console.error(`[CompositorWorker] Failed to load font ${fontId}:`, error);
    return false;
  }
}

/**
 * Check if a font is loaded.
 */
function isFontLoaded(fontId: string): boolean {
  if (!compositor) return false;

  try {
    return compositor.isFontLoaded(fontId);
  } catch {
    return false;
  }
}

/**
 * Upload an ImageBitmap texture.
 * ImageBitmaps are transferred (not copied) for zero-copy performance.
 */
function uploadBitmap(bitmap: ImageBitmap, textureId: string): void {
  if (!compositor) {
    bitmap.close();
    return;
  }

  try {
    compositor.uploadBitmap(bitmap, textureId);
    uploadedTextures.add(textureId);
  } catch (error) {
    console.warn(`[CompositorWorker] Failed to upload texture ${textureId}:`, error);
  }
  // Close bitmap after GPU upload to free memory
  bitmap.close();
}

/**
 * Render a single frame.
 * Rendering happens directly on the OffscreenCanvas - no return value needed.
 */
function renderFrame(frame: RenderFrame): void {
  if (!compositor || !canvas) {
    return;
  }

  compositor.renderFrame(frame);
}

/**
 * Render a frame and return pixel data as Uint8Array (RGBA).
 * Uses the WASM compositor's GPU buffer readback for reliable capture.
 */
async function renderToPixels(frame: RenderFrame): Promise<Uint8Array> {
  if (!compositor) {
    throw new Error("Compositor not initialized");
  }

  return compositor.renderToPixels(frame);
}

/**
 * Render a frame and return a downscaled JPEG thumbnail as an ArrayBuffer.
 * Performs all scaling in the worker to minimize data transferred back.
 */
async function captureThumbnail(
  frame: RenderFrame,
  thumbWidth: number,
  thumbHeight: number,
): Promise<ArrayBuffer> {
  if (!compositor || !canvas) {
    throw new Error("Compositor not initialized");
  }

  const pixels = await compositor.renderToPixels(frame);
  const fullWidth = canvas.width;
  const fullHeight = canvas.height;

  // Create full-size ImageData from RGBA pixels
  const imageData = new ImageData(new Uint8ClampedArray(pixels), fullWidth, fullHeight);

  // Draw to a full-size scratch canvas
  const fullCanvas = new OffscreenCanvas(fullWidth, fullHeight);
  const fullCtx = fullCanvas.getContext("2d")!;
  fullCtx.putImageData(imageData, 0, 0);

  // Scale down to thumbnail size
  const thumbCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
  const thumbCtx = thumbCanvas.getContext("2d")!;
  thumbCtx.drawImage(fullCanvas, 0, 0, thumbWidth, thumbHeight);

  const blob = await thumbCanvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  return blob.arrayBuffer();
}

/**
 * Clear a specific texture from GPU memory.
 */
function clearTexture(textureId: string): void {
  if (!compositor) return;

  try {
    compositor.clearTexture(textureId);
    uploadedTextures.delete(textureId);
  } catch {
    // Ignore
  }
}

/**
 * Clear all textures from GPU memory.
 */
function clearAllTextures(): void {
  if (!compositor) return;

  try {
    compositor.clearAllTextures();
    uploadedTextures.clear();
  } catch {
    // Ignore
  }
}

/**
 * Flush pending GPU operations.
 */
function flush(): void {
  if (!compositor) return;

  try {
    compositor.flush();
  } catch {
    // Ignore
  }
}

/**
 * Dispose the compositor and clean up resources.
 */
function dispose(): void {
  if (compositor) {
    try {
      compositor.dispose();
    } catch {
      // Ignore
    }
    compositor = null;
  }
  canvas = null;
  isInitialized = false;
  uploadedTextures.clear();
}

// ===================== EXPORT =====================

const workerApi = {
  initialize,
  resize,
  loadFont,
  isFontLoaded,
  uploadBitmap,
  renderFrame,
  renderToPixels,
  captureThumbnail,
  clearTexture,
  clearAllTextures,
  flush,
  dispose,
};

export type CompositorWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
