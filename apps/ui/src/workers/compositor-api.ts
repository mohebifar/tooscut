/**
 * Compositor Worker API
 *
 * Main thread interface for the compositor worker.
 * Handles canvas transfer and provides methods for rendering.
 *
 * Zero-copy optimizations:
 * - Canvas transferred once via transferControlToOffscreen()
 * - ImageBitmaps transferred via Comlink.transfer()
 * - No data copied back (rendering visible directly on canvas)
 */

import type { RenderFrame } from "@tooscut/render-engine";

import * as Comlink from "comlink";

import type { CompositorWorkerApi } from "./compositor.worker";

interface CompositorApiConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface CompositorApi {
  /** Initialize the compositor (transfers canvas to worker) */
  initialize(): Promise<void>;
  /** Resize the compositor output */
  resize(width: number, height: number): void;
  /** Load a font into the compositor */
  loadFont(fontId: string, fontData: Uint8Array): Promise<boolean>;
  /** Check if a font is loaded */
  isFontLoaded(fontId: string): Promise<boolean>;
  /** Upload an ImageBitmap texture */
  uploadBitmap(bitmap: ImageBitmap, textureId: string): Promise<void>;
  /** Render a frame */
  renderFrame(frame: RenderFrame): Promise<void>;
  /** Render a frame and return pixel data (RGBA) */
  renderToPixels(frame: RenderFrame): Promise<Uint8Array>;
  /** Render a frame and return a downscaled JPEG thumbnail as ArrayBuffer */
  captureThumbnail(
    frame: RenderFrame,
    thumbWidth: number,
    thumbHeight: number,
  ): Promise<ArrayBuffer>;
  /**
   * Snapshot whatever is currently displayed on the preview canvas as RGBA
   * pixels — does not re-render, so it works for any frame already on
   * screen (e.g. after scrubbing) without needing fresh texture uploads.
   */
  captureCurrentFramePixels(): Promise<{ data: ArrayBuffer; width: number; height: number }>;
  /** Clear a specific texture */
  clearTexture(textureId: string): Promise<void>;
  /** Upload a 3D LUT */
  uploadLut(lutId: string, size: number, data: Float32Array): Promise<void>;
  /** Remove the active LUT */
  removeLut(): Promise<void>;
  /** Clear all textures */
  clearAllTextures(): Promise<void>;
  /** Flush pending GPU operations */
  flush(): Promise<void>;
  /** Dispose the compositor and worker */
  dispose(): Promise<void>;
  /** Whether the compositor is ready */
  isReady: boolean;
  /** Whether the compositor worker has crashed and can no longer render */
  crashed: boolean;
  /**
   * Register a callback invoked once when the worker crashes (a render call
   * threw, or the worker itself errored/terminated unexpectedly). The
   * compositor cannot recover in place — callers must dispose() this
   * instance and create a new one against a fresh canvas.
   */
  onCrash(callback: (error: unknown) => void): () => void;
}

/**
 * Create a compositor that runs in a web worker.
 * The canvas is transferred to the worker for zero-copy rendering.
 */
export function createCompositorApi(config: CompositorApiConfig): CompositorApi {
  const { canvas, width, height } = config;

  let worker: Worker | null = null;
  let api: Comlink.Remote<CompositorWorkerApi> | null = null;
  let offscreenCanvas: OffscreenCanvas | null = null;
  let isReady = false;
  let crashed = false;
  const crashCallbacks = new Set<(error: unknown) => void>();

  const reportCrash = (error: unknown) => {
    if (crashed) return;
    crashed = true;
    for (const callback of crashCallbacks) {
      callback(error);
    }
  };

  // The underlying WASM Compositor is not reentrant — a second call into it
  // while a prior one is still in flight (e.g. a fire-and-forget uploadBitmap
  // racing a renderFrame from the next animation frame) trips wasm-bindgen's
  // borrow guard ("recursive use of an object detected..."), which is a hard
  // panic (panic = "abort") that permanently wedges the instance. Serialize
  // every call that touches the compositor through this queue so callers can
  // keep firing-and-forgetting without needing to coordinate with each other.
  let callQueue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = callQueue.then(run, run);
    // Keep the chain alive even if this call rejects — don't let one
    // failure stall every call queued after it.
    callQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  const compositorApi: CompositorApi = {
    get isReady() {
      return isReady;
    },

    get crashed() {
      return crashed;
    },

    onCrash(callback) {
      crashCallbacks.add(callback);
      return () => crashCallbacks.delete(callback);
    },

    async initialize() {
      if (isReady) return;

      // Create worker
      worker = new Worker(new URL("./compositor.worker.ts", import.meta.url), {
        type: "module",
      });

      // Listen for worker errors (uncaught exceptions, e.g. the worker itself crashing)
      worker.onerror = (e) => {
        console.error("[CompositorApi] Worker error:", e);
        reportCrash(e);
      };

      api = Comlink.wrap<CompositorWorkerApi>(worker);

      // Transfer canvas control to worker
      offscreenCanvas = canvas.transferControlToOffscreen();

      // Initialize worker with transferred canvas
      await api.initialize(
        Comlink.transfer(
          {
            canvas: offscreenCanvas,
            width,
            height,
          },
          [offscreenCanvas],
        ),
      );

      isReady = true;
    },

    resize(newWidth: number, newHeight: number) {
      if (!api || !isReady) return;
      const remote = api;
      void enqueue(() => remote.resize(newWidth, newHeight));
    },

    async loadFont(fontId: string, fontData: Uint8Array): Promise<boolean> {
      if (!api || !isReady) return false;
      const remote = api;
      // Transfer the font data to avoid copying
      const transferred = Comlink.transfer(fontData, [fontData.buffer]);
      return enqueue(() => remote.loadFont(fontId, transferred));
    },

    async isFontLoaded(fontId: string): Promise<boolean> {
      if (!api || !isReady) return false;
      const remote = api;
      return enqueue(() => remote.isFontLoaded(fontId));
    },

    async uploadBitmap(bitmap: ImageBitmap, textureId: string) {
      if (!api || !isReady) {
        bitmap.close();
        return;
      }
      const remote = api;
      // Transfer bitmap to worker (zero-copy)
      const transferred = Comlink.transfer(bitmap, [bitmap]);
      await enqueue(() => remote.uploadBitmap(transferred, textureId));
    },

    async renderFrame(frame: RenderFrame) {
      if (!api || !isReady || crashed) return;
      const remote = api;
      try {
        await enqueue(() => remote.renderFrame(frame));
      } catch (error) {
        reportCrash(error);
        throw error;
      }
    },

    async renderToPixels(frame: RenderFrame): Promise<Uint8Array> {
      if (!api || !isReady) throw new Error("Compositor not ready");
      if (crashed) throw new Error("Compositor crashed");
      const remote = api;
      try {
        return await enqueue(() => remote.renderToPixels(frame));
      } catch (error) {
        reportCrash(error);
        throw error;
      }
    },

    async captureThumbnail(
      frame: RenderFrame,
      thumbWidth: number,
      thumbHeight: number,
    ): Promise<ArrayBuffer> {
      if (!api || !isReady) throw new Error("Compositor not ready");
      const remote = api;
      return enqueue(() => remote.captureThumbnail(frame, thumbWidth, thumbHeight));
    },

    async captureCurrentFramePixels() {
      if (!api || !isReady) throw new Error("Compositor not ready");
      const remote = api;
      // Doesn't touch the WASM compositor, but shares the same queue so it
      // can't snapshot a canvas that's mid-draw from a concurrent renderFrame.
      return enqueue(() => remote.captureCurrentFramePixels());
    },

    async uploadLut(lutId: string, size: number, data: Float32Array) {
      if (!api || !isReady) return;
      const remote = api;
      // Transfer the float data to avoid copying
      const transferred = Comlink.transfer(data, [data.buffer]);
      await enqueue(() => remote.uploadLut(lutId, size, transferred));
    },

    async removeLut() {
      if (!api || !isReady) return;
      const remote = api;
      await enqueue(() => remote.removeLut());
    },

    async clearTexture(textureId: string) {
      if (!api || !isReady) return;
      const remote = api;
      await enqueue(() => remote.clearTexture(textureId));
    },

    async clearAllTextures() {
      if (!api || !isReady) return;
      const remote = api;
      await enqueue(() => remote.clearAllTextures());
    },

    async flush() {
      if (!api || !isReady) return;
      const remote = api;
      await enqueue(() => remote.flush());
    },

    async dispose() {
      if (api) {
        await api.dispose();
        api = null;
      }
      if (worker) {
        worker.terminate();
        worker = null;
      }
      offscreenCanvas = null;
      isReady = false;
    },
  };

  return compositorApi;
}

// ===================== SHARED INSTANCE =====================

/** Module-level reference to the active compositor, set by the preview panel. */
let sharedCompositor: CompositorApi | null = null;

export function setSharedCompositor(compositor: CompositorApi | null): void {
  sharedCompositor = compositor;
}

export function getSharedCompositor(): CompositorApi | null {
  return sharedCompositor;
}
