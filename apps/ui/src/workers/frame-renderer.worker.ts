/// <reference lib="webworker" />

/**
 * Frame Renderer Web Worker
 *
 * Decodes source video and renders frames via WASM compositor.
 * Returns GPU-backed VideoFrames for zero-copy transfer to main thread.
 * Encoding happens on the main thread (non-blocking, hardware-accelerated).
 *
 * Architecture:
 * - Uses 'export' mode VideoFrameLoader for frame-accurate decoding
 * - Compositor renders to OffscreenCanvas (GPU)
 * - VideoFrame created from canvas (GPU-to-GPU, no readback)
 * - VideoFrame transferred to main thread (~0 cost)
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
  /** Timestamp in microseconds for the output VideoFrame */
  timestampMicros: number;
  /** Duration in microseconds for the output VideoFrame */
  durationMicros: number;
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
  videoFrame: VideoFrame | null;
}

export interface RenderProfileData {
  decodeTime: number;
  uploadTime: number;
  renderTime: number;
  videoFrameTime: number;
  totalTime: number;
  fps: number;
}

/** Call to get the current accumulated profile and reset counters. */
function getAndResetProfile(): RenderProfileData | null {
  if (profileFrameCount === 0) return null;
  return collectProfileData();
}

// ===================== WORKER STATE =====================

let compositor: Compositor | null = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let isInitialized = false;

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

// ===================== PROFILING =====================

let profileFrameCount = 0;
let profileDecodeTotal = 0;
let profileUploadTotal = 0;
let profileRenderTotal = 0;
let profileVideoFrameTotal = 0;
let profileTotalTotal = 0;

function collectProfileData(): RenderProfileData {
  const data: RenderProfileData = {
    decodeTime: profileDecodeTotal,
    uploadTime: profileUploadTotal,
    renderTime: profileRenderTotal,
    videoFrameTime: profileVideoFrameTotal,
    totalTime: profileTotalTotal,
    fps: (1000 * profileFrameCount) / profileTotalTotal,
  };
  profileDecodeTotal = 0;
  profileUploadTotal = 0;
  profileRenderTotal = 0;
  profileVideoFrameTotal = 0;
  profileTotalTotal = 0;
  profileFrameCount = 0;
  return data;
}

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
 * Render a batch of frames sequentially.
 *
 * decode source → upload texture → compositor render → transferToImageBitmap → VideoFrame
 *
 * Batching amortizes Comlink round-trip overhead and preserves sequential decode
 * locality for export workloads that render timeline frames in order.
 */
async function renderFrames(tasks: RenderFrameTask[]): Promise<RenderFrameResult[]> {
  const results: RenderFrameResult[] = [];
  const transferables: Transferable[] = [];
  const decodeStart = performance.now();
  const batchedBitmaps = new Map<number, Array<{ bitmap: ImageBitmap; uploadId: string }>>();

  const videoRequestsByAsset = new Map<
    string,
    Array<{ taskIndex: number; sourceTime: number; uploadId: string }>
  >();

  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
    const task = tasks[taskIndex]!;
    for (const req of task.textureRequests) {
      if (req.type !== "video") continue;
      const uploadId = req.textureId ?? req.assetId;
      const grouped = videoRequestsByAsset.get(req.assetId) ?? [];
      grouped.push({ taskIndex, sourceTime: req.sourceTime, uploadId });
      videoRequestsByAsset.set(req.assetId, grouped);
    }
  }

  await Promise.all(
    Array.from(videoRequestsByAsset.entries(), async ([assetId, requests]) => {
      const loader = loaderManager.getExistingLoader(assetId);
      if (!loader) return;

      try {
        const bitmaps = await loader.getImageBitmaps(requests.map((request) => request.sourceTime));
        for (let i = 0; i < requests.length; i++) {
          const bitmap = bitmaps[i];
          if (!bitmap) continue;

          const request = requests[i]!;
          const taskBitmaps = batchedBitmaps.get(request.taskIndex) ?? [];
          taskBitmaps.push({ bitmap, uploadId: request.uploadId });
          batchedBitmaps.set(request.taskIndex, taskBitmaps);
        }
      } catch (error) {
        console.warn(`[FrameRenderer:${workerId}] Failed batched decode for ${assetId}:`, error);
      }
    }),
  );
  const decodeEnd = performance.now();

  const uploadStart = performance.now();
  let renderTotal = 0;
  let videoFrameTotal = 0;

  for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
    const task = tasks[taskIndex]!;
    const taskBitmaps = batchedBitmaps.get(taskIndex) ?? [];
    for (const { bitmap, uploadId } of taskBitmaps) {
      compositor!.uploadBitmap(bitmap, uploadId);
      bitmap.close(); // Free GPU bitmap memory immediately after upload
    }

    const renderStart = performance.now();
    compositor!.renderFrame(task.frame);
    compositor!.flush();
    const renderEnd = performance.now();
    renderTotal += renderEnd - renderStart;

    const vfStart = performance.now();
    const bitmap = offscreenCanvas!.transferToImageBitmap();
    const videoFrame = new VideoFrame(bitmap, {
      timestamp: task.timestampMicros,
      duration: task.durationMicros,
    });
    bitmap.close();
    const vfEnd = performance.now();
    videoFrameTotal += vfEnd - vfStart;

    const result = { frameIndex: task.frameIndex, videoFrame };
    if (result.videoFrame) {
      transferables.push(result.videoFrame);
    }
    results.push(result);
  }

  const uploadEnd = performance.now();

  profileDecodeTotal += decodeEnd - decodeStart;
  profileUploadTotal += uploadEnd - uploadStart;
  profileRenderTotal += renderTotal;
  profileVideoFrameTotal += videoFrameTotal;
  profileTotalTotal +=
    decodeEnd - decodeStart + (uploadEnd - uploadStart) + renderTotal + videoFrameTotal;
  profileFrameCount += tasks.length;

  return Comlink.transfer(results, transferables);
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
  renderFrames,
  getAndResetProfile,
  clearAllTextures,
  dispose,
};

export type FrameRendererWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
