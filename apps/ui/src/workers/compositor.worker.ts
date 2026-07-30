/// <reference lib="webworker" />

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

import { Compositor, initCompositorWasm, type RenderFrame } from "@tooscut/render-engine";
import * as Comlink from "comlink";

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

let compositor: Awaited<ReturnType<typeof Compositor.fromOffscreenCanvas>> | null = null;
let canvas: OffscreenCanvas | null = null;
let isInitialized = false;

// Track which textures are currently uploaded to avoid re-uploading
const uploadedTextures = new Set<string>();

// Once a render call throws (e.g. a WASM panic trapped the instance), the
// linear memory may be left in an inconsistent state. Further calls into the
// same instance are unsafe, so we stop calling into it and fail fast instead
// — the main thread is responsible for tearing down and recreating the
// worker/compositor from a fresh canvas.
let crashed = false;

class CompositorCrashedError extends Error {
  constructor(cause?: unknown) {
    super("Compositor crashed and cannot continue rendering");
    this.name = "CompositorCrashedError";
    this.cause = cause;
  }
}

/**
 * Whether it's safe to call into the WASM compositor right now. Every entry
 * point below must check this — a trapped instance stays non-null, so a plain
 * `if (!compositor)` guard is NOT sufficient to keep callers out of it.
 */
function isUsable(): boolean {
  return compositor !== null && !crashed;
}

/**
 * Latch the crash so no further calls reach the (possibly corrupted) instance.
 * Returns the error to throw, for entry points whose contract is to throw;
 * callers that return a fallback value instead can ignore the return.
 */
function markCrashed(label: string, error: unknown): CompositorCrashedError {
  if (!crashed) {
    crashed = true;
    console.error(`[CompositorWorker] ${label} failed; compositor is now unusable:`, error);
  }
  return new CompositorCrashedError(error);
}

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
  if (!compositor || !canvas || crashed) {
    return;
  }

  try {
    canvas.width = width;
    canvas.height = height;
    compositor.resize(width, height);
  } catch (error) {
    markCrashed("resize", error);
  }
}

/**
 * Load a font into the WASM compositor.
 */
function loadFont(fontId: string, fontData: Uint8Array): boolean {
  if (!isUsable()) {
    return false;
  }

  try {
    return compositor!.loadFont(fontId, fontData);
  } catch (error) {
    markCrashed(`loadFont(${fontId})`, error);
    return false;
  }
}

/**
 * Check if a font is loaded.
 */
function isFontLoaded(fontId: string): boolean {
  if (!isUsable()) return false;

  try {
    return compositor!.isFontLoaded(fontId);
  } catch (error) {
    markCrashed(`isFontLoaded(${fontId})`, error);
    return false;
  }
}

/**
 * Upload an ImageBitmap texture.
 * ImageBitmaps are transferred (not copied) for zero-copy performance.
 */
function uploadBitmap(bitmap: ImageBitmap, textureId: string): void {
  if (!isUsable()) {
    bitmap.close();
    return;
  }

  try {
    compositor!.uploadBitmap(bitmap, textureId);
    uploadedTextures.add(textureId);
  } catch (error) {
    markCrashed(`uploadBitmap(${textureId})`, error);
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
  if (crashed) {
    throw new CompositorCrashedError();
  }

  try {
    compositor.renderFrame(frame);
  } catch (error) {
    throw markCrashed("renderFrame", error);
  }
}

/**
 * Render a frame and return pixel data as Uint8Array (RGBA).
 * Uses the WASM compositor's GPU buffer readback for reliable capture.
 */
async function renderToPixels(frame: RenderFrame): Promise<Uint8Array> {
  if (!compositor) {
    throw new Error("Compositor not initialized");
  }
  if (crashed) {
    throw new CompositorCrashedError();
  }

  try {
    return await compositor.renderToPixels(frame);
  } catch (error) {
    throw markCrashed("renderToPixels", error);
  }
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
  if (crashed) {
    throw new CompositorCrashedError();
  }

  let pixels: Uint8Array;
  try {
    pixels = await compositor.renderToPixels(frame);
  } catch (error) {
    throw markCrashed("captureThumbnail", error);
  }
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

  const blob = await thumbCanvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.7,
  });
  return blob.arrayBuffer();
}

/**
 * Snapshot whatever is currently drawn on the canvas as RGBA pixels.
 *
 * Unlike renderToPixels/captureThumbnail, this does NOT re-render through
 * the WASM compositor — it reads back the canvas's existing bitmap output
 * via createImageBitmap, so it works regardless of what's on screen (any
 * already-uploaded/rendered content) without needing a RenderFrame with
 * correctly-referenced texture IDs. Used for color matching, where the
 * two frames being compared may be arbitrary points in the timeline the
 * user scrubbed to, not necessarily ones with fresh texture uploads.
 */
async function captureCurrentFramePixels(): Promise<{
  data: ArrayBuffer;
  width: number;
  height: number;
}> {
  if (!canvas) {
    throw new Error("Canvas not initialized");
  }
  // Doesn't call into WASM, but after a trap the canvas holds whatever was
  // last successfully drawn — stale content that shouldn't be presented as a
  // capture of the current frame.
  if (crashed) {
    throw new CompositorCrashedError();
  }

  const bitmap = await createImageBitmap(canvas);
  try {
    const scratch = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = scratch.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context for pixel capture");
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: imageData.data.buffer, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

/**
 * Clear a specific texture from GPU memory.
 */
function clearTexture(textureId: string): void {
  if (!isUsable()) return;

  try {
    compositor!.clearTexture(textureId);
    uploadedTextures.delete(textureId);
  } catch (error) {
    markCrashed(`clearTexture(${textureId})`, error);
  }
}

/**
 * Clear all textures from GPU memory.
 */
function clearAllTextures(): void {
  if (!isUsable()) return;

  try {
    compositor!.clearAllTextures();
    uploadedTextures.clear();
  } catch (error) {
    markCrashed("clearAllTextures", error);
  }
}

/**
 * Upload a 3D LUT to the compositor.
 */
function uploadLut(lutId: string, size: number, data: Float32Array): void {
  if (!isUsable()) return;

  try {
    compositor!.uploadLut(lutId, size, data);
  } catch (error) {
    markCrashed(`uploadLut(${lutId})`, error);
  }
}

/**
 * Remove the active LUT.
 */
function removeLut(): void {
  if (!isUsable()) return;

  try {
    compositor!.removeLut();
  } catch (error) {
    markCrashed("removeLut", error);
  }
}

/**
 * Flush pending GPU operations.
 */
function flush(): void {
  if (!isUsable()) return;

  try {
    compositor!.flush();
  } catch (error) {
    markCrashed("flush", error);
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
  captureCurrentFramePixels,
  clearTexture,
  clearAllTextures,
  uploadLut,
  removeLut,
  flush,
  dispose,
};

export type CompositorWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
