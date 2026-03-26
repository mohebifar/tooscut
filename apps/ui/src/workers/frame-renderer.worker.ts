/**
 * Frame Renderer Web Worker
 *
 * Renders individual frames using the WASM compositor for parallel export.
 * Each worker maintains its own compositor instance with OffscreenCanvas.
 *
 * Architecture:
 * - Uses 'export' mode VideoFrameLoader for frame-accurate decoding
 * - Compositor renders to OffscreenCanvas, then reads back pixels
 * - Returns ImageBitmap for zero-copy transfer back to main thread
 */

import {
  Compositor,
  initCompositorWasm,
  VideoFrameLoaderManager,
  EvaluatorManager,
  type RenderFrame,
} from "@tooscut/render-engine";
import * as Comlink from "comlink";

// ===================== TYPES =====================

export interface FrameRendererConfig {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
}

export interface RenderFrameTask {
  frameIndex: number;
  timelineFrame: number;
  frame: RenderFrame;
  /** Asset IDs that need texture upload with their source timestamps */
  textureRequests: Array<{
    assetId: string;
    sourceTime: number;
    type: "video" | "image";
    /** Texture ID to upload as (may differ from assetId for cross-transition clips) */
    textureId?: string;
  }>;
}

export interface RenderFrameResult {
  frameIndex: number;
  pixels: Uint8Array;
  width: number;
  height: number;
}

// ===================== WORKER STATE =====================

let compositor: Compositor | null = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let isInitialized = false;
let renderWidth = 0;
let renderHeight = 0;

/** Unique worker ID for debugging */
const workerId = Math.random().toString(36).slice(2, 8);

/** Video frame loaders in 'export' mode for frame-accurate decoding */
const loaderManager = new VideoFrameLoaderManager({ mode: "export" });

/** Evaluator manager for keyframes */
const evaluatorManager = new EvaluatorManager();

/** Track which textures are uploaded */
const uploadedTextures = new Set<string>();

/** Loaded fonts */
const loadedFonts = new Set<string>();

// ===================== WORKER API =====================

/**
 * Initialize the compositor for frame rendering.
 */
async function initialize(config: FrameRendererConfig): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    const { width, height } = config;
    renderWidth = width;
    renderHeight = height;

    // Initialize WASM module
    await initCompositorWasm();

    // Create OffscreenCanvas for this worker
    offscreenCanvas = new OffscreenCanvas(width, height);

    // Create compositor from OffscreenCanvas
    compositor = await Compositor.fromOffscreenCanvas(offscreenCanvas);
    compositor.resize(width, height);

    isInitialized = true;
    console.log(`[FrameRenderer:${workerId}] Initialized (${width}x${height})`);
  } catch (error) {
    console.error("[FrameRenderer] Initialization failed:", error);
    throw error;
  }
}

/**
 * Resize the compositor output.
 */
function resize(width: number, height: number): void {
  if (!compositor || !offscreenCanvas) {
    console.warn("[FrameRenderer] Cannot resize - not initialized");
    return;
  }

  renderWidth = width;
  renderHeight = height;
  offscreenCanvas.width = width;
  offscreenCanvas.height = height;
  compositor.resize(width, height);
}

/**
 * Load a font into the compositor.
 */
function loadFont(fontFamily: string, fontData: Uint8Array): boolean {
  if (!compositor) {
    console.warn("[FrameRenderer] Cannot load font - not initialized");
    return false;
  }

  if (loadedFonts.has(fontFamily)) {
    return true;
  }

  try {
    const result = compositor.loadFont(fontFamily, fontData);
    if (result) {
      loadedFonts.add(fontFamily);
    }
    return result;
  } catch (error) {
    console.error(`[FrameRenderer] Failed to load font ${fontFamily}:`, error);
    return false;
  }
}

/**
 * Check if a font is loaded.
 */
function isFontLoaded(fontFamily: string): boolean {
  return loadedFonts.has(fontFamily);
}

/**
 * Load a video asset for frame extraction.
 */
async function loadVideoAsset(assetId: string, blob: Blob): Promise<boolean> {
  try {
    await loaderManager.getLoader(assetId, blob, { mode: "export" });
    return true;
  } catch (error) {
    console.error(`[FrameRenderer] Failed to load video asset ${assetId}:`, error);
    return false;
  }
}

/**
 * Upload an ImageBitmap as a texture.
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
    console.warn(`[FrameRenderer] Failed to upload texture ${textureId}:`, error);
  }
  bitmap.close();
}

/**
 * Render a single frame and return pixels.
 *
 * @param task - Frame render task with RenderFrame data
 * @returns Rendered frame as Uint8Array (RGBA pixels)
 */
async function renderFrame(task: RenderFrameTask): Promise<RenderFrameResult> {
  if (!compositor) {
    throw new Error("Compositor not initialized");
  }

  const startTime = performance.now();
  const { frameIndex, frame, textureRequests } = task;

  // Decode video frames in parallel, then upload all textures
  await Promise.all(
    textureRequests.map(async (req) => {
      const uploadId = req.textureId ?? req.assetId;
      if (req.type === "video") {
        const loader = loaderManager.getExistingLoader(req.assetId);
        if (loader) {
          try {
            const bitmap = await loader.getImageBitmap(req.sourceTime);
            compositor?.uploadBitmap(bitmap, uploadId);
            bitmap.close();
          } catch (error) {
            console.warn(
              `[FrameRenderer:${workerId}] Failed to get frame for ${req.assetId}:`,
              error,
            );
          }
        }
      }
      // Image textures are pre-uploaded during init (including cross-transition IDs)
    }),
  );

  // Render frame to pixels
  const pixels = await compositor.renderToPixels(frame);

  const elapsed = performance.now() - startTime;
  console.log(
    `[FrameRenderer:${workerId}] Frame ${frameIndex} rendered in ${elapsed.toFixed(1)}ms`,
  );

  return {
    frameIndex,
    pixels,
    width: renderWidth,
    height: renderHeight,
  };
}

/**
 * Clear all uploaded textures.
 */
function clearAllTextures(): void {
  if (!compositor) return;
  compositor.clearAllTextures();
  uploadedTextures.clear();
}

/**
 * Dispose the worker and clean up resources.
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

  loaderManager.disposeAll();
  evaluatorManager.clear();
  uploadedTextures.clear();
  loadedFonts.clear();

  offscreenCanvas = null;
  isInitialized = false;
}

// ===================== EXPORT =====================

const workerApi = {
  initialize,
  resize,
  loadFont,
  isFontLoaded,
  loadVideoAsset,
  uploadBitmap,
  renderFrame,
  clearAllTextures,
  dispose,
};

export type FrameRendererWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
