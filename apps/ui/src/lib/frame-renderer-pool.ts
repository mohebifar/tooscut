/**
 * Frame Renderer Worker Pool
 *
 * Manages a pool of frame renderer workers for parallel export.
 * Each worker has its own WASM compositor instance.
 *
 * Architecture:
 * - Round-robin task distribution
 * - Async generator yields results as they complete
 * - Handles font and texture preloading across all workers
 */

import * as Comlink from "comlink";
import { VideoFrameLoader } from "@tooscut/render-engine";
import type {
  FrameRendererWorkerApi,
  RenderFrameTask,
  RenderFrameResult,
  FrameRendererConfig,
} from "../workers/frame-renderer.worker";

export interface FrameRendererPoolConfig {
  /** Number of workers in the pool */
  workerCount: number;
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
}

interface WorkerEntry {
  worker: Worker;
  api: Comlink.Remote<FrameRendererWorkerApi>;
  busy: boolean;
}

/**
 * Pool of frame renderer workers for parallel export.
 */
export class FrameRendererPool {
  private workers: WorkerEntry[] = [];
  private workerCount: number;
  private width: number;
  private height: number;
  private initialized = false;

  /**
   * Main-thread fallback loaders for videos that WebCodecs can't decode.
   * Uses HTMLVideoElement which supports more codecs via platform media decoders.
   */
  private fallbackLoaders = new Map<string, VideoFrameLoader>();

  /**
   * Per-asset lock to serialize fallback frame extraction (avoids seek races).
   */
  private fallbackLocks = new Map<string, Promise<void>>();

  constructor(config: FrameRendererPoolConfig) {
    this.workerCount = config.workerCount;
    this.width = config.width;
    this.height = config.height;
  }

  /**
   * Initialize all workers in the pool.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    console.log(`[FrameRendererPool] Initializing ${this.workerCount} workers...`);
    const initPromises: Promise<void>[] = [];

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(new URL("../workers/frame-renderer.worker.ts", import.meta.url), {
        type: "module",
      });

      const api = Comlink.wrap<FrameRendererWorkerApi>(worker);

      const config: FrameRendererConfig = {
        width: this.width,
        height: this.height,
      };

      initPromises.push(api.initialize(config));

      this.workers.push({
        worker,
        api,
        busy: false,
      });
    }

    await Promise.all(initPromises);
    this.initialized = true;
    console.log(`[FrameRendererPool] All ${this.workerCount} workers initialized`);
  }

  /**
   * Resize all workers.
   */
  async resize(width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;

    await Promise.all(this.workers.map((entry) => entry.api.resize(width, height)));
  }

  /**
   * Load a font into all workers.
   */
  async loadFont(fontFamily: string, fontData: Uint8Array): Promise<void> {
    // Load font into each worker (need to transfer a copy of the data)
    await Promise.all(
      this.workers.map(async (entry) => {
        // Create a copy for each worker since we're transferring
        const dataCopy = new Uint8Array(fontData);
        return entry.api.loadFont(fontFamily, Comlink.transfer(dataCopy, [dataCopy.buffer]));
      }),
    );
  }

  /**
   * Load a video asset into all workers for frame extraction.
   *
   * If MediaBunny/WebCodecs can't decode the video in the worker (codec not
   * supported), falls back to an HTMLVideoElement-based loader on the main
   * thread. Frames are then extracted on the main thread and transferred to
   * workers before each render call.
   */
  async loadVideoAsset(assetId: string, blob: Blob): Promise<void> {
    const results = await Promise.all(
      this.workers.map((entry) => entry.api.loadVideoAsset(assetId, blob)),
    );

    const allSucceeded = results.every((r) => r);
    if (!allSucceeded) {
      console.warn(
        `[FrameRendererPool] WebCodecs decode failed for ${assetId}, using HTMLVideoElement fallback`,
      );
      try {
        const loader = await VideoFrameLoader.fromBlob(blob, { mode: "preview" });
        this.fallbackLoaders.set(assetId, loader);
      } catch (error) {
        console.error(`[FrameRendererPool] Fallback loader also failed for ${assetId}:`, error);
      }
    }
  }

  /**
   * Upload an image texture to all workers.
   */
  async uploadBitmap(bitmap: ImageBitmap, textureId: string): Promise<void> {
    // Create a bitmap copy for each worker
    await Promise.all(
      this.workers.map(async (entry) => {
        // Create a copy of the bitmap for each worker
        const copy = await createImageBitmap(bitmap);
        await entry.api.uploadBitmap(Comlink.transfer(copy, [copy]), textureId);
      }),
    );
  }

  /**
   * Render frames using the worker pool.
   * Yields results as they complete (not necessarily in order).
   *
   * @param tasks - Array of frame render tasks
   * @param onProgress - Optional callback for progress updates
   */
  async *renderFrames(
    tasks: RenderFrameTask[],
    onProgress?: (rendered: number, total: number) => void,
  ): AsyncGenerator<RenderFrameResult> {
    if (!this.initialized) {
      throw new Error("FrameRendererPool not initialized");
    }

    const total = tasks.length;
    let rendered = 0;
    let taskIndex = 0;

    // Queue of pending promises with their task indices
    const pending = new Map<number, Promise<RenderFrameResult>>();

    // Function to assign work to an available worker (capped to prevent unbounded buffering)
    const assignWork = () => {
      while (taskIndex < total && pending.size < this.workerCount) {
        // Find an available worker
        const workerIndex = this.workers.findIndex((w) => !w.busy);
        if (workerIndex === -1) break;

        const availableWorker = this.workers[workerIndex];
        const task = tasks[taskIndex];
        const currentIndex = taskIndex;
        taskIndex++;

        availableWorker.busy = true;
        const busyCount = this.workers.filter((w) => w.busy).length;
        console.log(
          `[FrameRendererPool] Worker ${workerIndex} rendering frame ${task.frameIndex} (${busyCount}/${this.workerCount} workers busy)`,
        );

        const promise = (async () => {
          try {
            // Pre-extract and upload frames for videos that need main-thread fallback
            await this.uploadFallbackTextures(task, availableWorker);

            const result = await availableWorker.api.renderFrame(task);
            return result;
          } finally {
            availableWorker.busy = false;
          }
        })();

        pending.set(currentIndex, promise);
      }
    };

    // Initial work assignment
    assignWork();
    console.log(`[FrameRendererPool] Initial assignment: ${pending.size} frames queued`);

    // Process results as they complete
    while (pending.size > 0) {
      // Wait for any pending promise to complete
      const results = await Promise.race(
        Array.from(pending.entries()).map(async ([idx, promise]) => {
          const result = await promise;
          return { idx, result };
        }),
      );

      pending.delete(results.idx);
      rendered++;

      if (onProgress) {
        onProgress(rendered, total);
      }

      // Assign more work if available
      assignWork();

      yield results.result;
    }
  }

  /**
   * Extract a frame on the main thread using HTMLVideoElement fallback
   * and upload it to the target worker. Serializes per-asset to avoid
   * HTMLVideoElement seek races.
   */
  private async uploadFallbackTextures(task: RenderFrameTask, worker: WorkerEntry): Promise<void> {
    for (const req of task.textureRequests) {
      if (req.type !== "video" || !this.fallbackLoaders.has(req.assetId)) continue;

      const uploadId = req.textureId ?? req.assetId;

      // Serialize per-asset to avoid concurrent HTMLVideoElement seeks
      const prevLock = this.fallbackLocks.get(req.assetId);
      if (prevLock) await prevLock;

      let releaseLock: () => void;
      const lock = new Promise<void>((r) => {
        releaseLock = r;
      });
      this.fallbackLocks.set(req.assetId, lock);

      try {
        const loader = this.fallbackLoaders.get(req.assetId)!;
        const bitmap = await loader.getImageBitmap(req.sourceTime);
        await worker.api.uploadBitmap(Comlink.transfer(bitmap, [bitmap]), uploadId);
      } catch (error) {
        console.warn(
          `[FrameRendererPool] Fallback frame extraction failed for ${req.assetId} at ${req.sourceTime}:`,
          error,
        );
      } finally {
        releaseLock!();
        if (this.fallbackLocks.get(req.assetId) === lock) {
          this.fallbackLocks.delete(req.assetId);
        }
      }
    }
  }

  /**
   * Render frames in order.
   * Waits for all frames to complete and returns them sorted by frameIndex.
   */
  async renderFramesInOrder(
    tasks: RenderFrameTask[],
    onProgress?: (rendered: number, total: number) => void,
  ): Promise<RenderFrameResult[]> {
    const results: RenderFrameResult[] = [];

    for await (const result of this.renderFrames(tasks, onProgress)) {
      results.push(result);
    }

    // Sort by frame index
    results.sort((a, b) => a.frameIndex - b.frameIndex);

    return results;
  }

  /**
   * Clear textures from all workers.
   */
  async clearAllTextures(): Promise<void> {
    await Promise.all(this.workers.map((entry) => entry.api.clearAllTextures()));
  }

  /**
   * Dispose all workers and clean up resources.
   */
  dispose(): void {
    for (const entry of this.workers) {
      try {
        void entry.api.dispose();
      } catch {
        // Ignore
      }
      entry.worker.terminate();
    }
    this.workers = [];
    this.initialized = false;

    // Clean up fallback loaders
    for (const loader of this.fallbackLoaders.values()) {
      loader.dispose();
    }
    this.fallbackLoaders.clear();
    this.fallbackLocks.clear();
  }

  /**
   * Get the number of workers in the pool.
   */
  get size(): number {
    return this.workerCount;
  }
}
