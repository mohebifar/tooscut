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

export interface CompositorApiConfig {
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
  /** Clear a specific texture */
  clearTexture(textureId: string): Promise<void>;
  /** Clear all textures */
  clearAllTextures(): Promise<void>;
  /** Flush pending GPU operations */
  flush(): Promise<void>;
  /** Dispose the compositor and worker */
  dispose(): Promise<void>;
  /** Whether the compositor is ready */
  isReady: boolean;
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

  const compositorApi: CompositorApi = {
    get isReady() {
      return isReady;
    },

    async initialize() {
      if (isReady) return;

      // Create worker
      worker = new Worker(new URL("./compositor.worker.ts", import.meta.url), {
        type: "module",
      });

      // Listen for worker errors
      worker.onerror = (e) => {
        console.error("[CompositorApi] Worker error:", e);
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
      void api.resize(newWidth, newHeight);
    },

    async loadFont(fontId: string, fontData: Uint8Array): Promise<boolean> {
      if (!api || !isReady) return false;
      // Transfer the font data to avoid copying
      return api.loadFont(fontId, Comlink.transfer(fontData, [fontData.buffer]));
    },

    async isFontLoaded(fontId: string): Promise<boolean> {
      if (!api || !isReady) return false;
      return api.isFontLoaded(fontId);
    },

    async uploadBitmap(bitmap: ImageBitmap, textureId: string) {
      if (!api || !isReady) {
        bitmap.close();
        return;
      }
      // Transfer bitmap to worker (zero-copy)
      await api.uploadBitmap(Comlink.transfer(bitmap, [bitmap]), textureId);
    },

    async renderFrame(frame: RenderFrame) {
      if (!api || !isReady) return;
      await api.renderFrame(frame);
    },

    async renderToPixels(frame: RenderFrame): Promise<Uint8Array> {
      if (!api || !isReady) throw new Error("Compositor not ready");
      return api.renderToPixels(frame);
    },

    async captureThumbnail(
      frame: RenderFrame,
      thumbWidth: number,
      thumbHeight: number,
    ): Promise<ArrayBuffer> {
      if (!api || !isReady) throw new Error("Compositor not ready");
      return api.captureThumbnail(frame, thumbWidth, thumbHeight);
    },

    async clearTexture(textureId: string) {
      if (!api || !isReady) return;
      await api.clearTexture(textureId);
    },

    async clearAllTextures() {
      if (!api || !isReady) return;
      await api.clearAllTextures();
    },

    async flush() {
      if (!api || !isReady) return;
      await api.flush();
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

/**
 * Create ImageBitmaps from video elements for transfer to worker.
 * Uses createImageBitmap for optimal performance.
 */
export async function createTexturesFromVideos(
  videoElements: Map<string, HTMLVideoElement>,
): Promise<Map<string, ImageBitmap>> {
  const textures = new Map<string, ImageBitmap>();

  const entries = Array.from(videoElements.entries());

  // Create all bitmaps in parallel
  const results = await Promise.allSettled(
    entries.map(async ([textureId, video]) => {
      // Skip if video not ready
      if (video.readyState < 2 || video.videoWidth === 0) {
        return { textureId, bitmap: null };
      }

      try {
        const bitmap = await createImageBitmap(video);
        return { textureId, bitmap };
      } catch {
        return { textureId, bitmap: null };
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.bitmap) {
      textures.set(result.value.textureId, result.value.bitmap);
    }
  }

  return textures;
}

/**
 * Create ImageBitmaps from image elements for transfer to worker.
 */
export async function createTexturesFromImages(
  imageElements: Map<string, HTMLImageElement>,
): Promise<Map<string, ImageBitmap>> {
  const textures = new Map<string, ImageBitmap>();

  const entries = Array.from(imageElements.entries());

  const results = await Promise.allSettled(
    entries.map(async ([textureId, image]) => {
      if (!image.complete || image.naturalWidth === 0) {
        return { textureId, bitmap: null };
      }

      try {
        const bitmap = await createImageBitmap(image);
        return { textureId, bitmap };
      } catch {
        return { textureId, bitmap: null };
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.bitmap) {
      textures.set(result.value.textureId, result.value.bitmap);
    }
  }

  return textures;
}
