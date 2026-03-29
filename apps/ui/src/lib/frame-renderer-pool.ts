/**
 * Frame Renderer Worker Pool
 *
 * Manages multiple decode+render workers for parallel export.
 * Each worker has its own WASM compositor instance.
 * Workers return GPU-backed VideoFrames; encoding happens on main thread.
 *
 * Architecture:
 * - N workers decode + render in parallel (decode is the bottleneck)
 * - Queue-based dispatch with result notification
 * - Handles font and texture preloading across all workers
 */

import { VideoFrameLoader } from "@tooscut/render-engine";
import * as Comlink from "comlink";

import type {
  FrameRendererWorkerApi,
  RenderFrameTask,
  RenderFrameResult,
  RenderProfileData,
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
  private static readonly DEFAULT_BATCH_SIZE = 8;
  private workers: WorkerEntry[] = [];
  private workerCount: number;
  private width: number;
  private height: number;
  private batchSize: number;
  private initialized = false;

  /**
   * Main-thread fallback loaders for videos that WebCodecs can't decode.
   */
  private fallbackLoaders = new Map<string, VideoFrameLoader>();
  private fallbackLocks = new Map<string, Promise<void>>();

  constructor(config: FrameRendererPoolConfig) {
    this.workerCount = config.workerCount;
    this.width = config.width;
    this.height = config.height;
    this.batchSize = FrameRendererPool.DEFAULT_BATCH_SIZE;
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
   * Load a font into all workers.
   */
  async loadFont(fontFamily: string, fontData: Uint8Array): Promise<void> {
    await Promise.all(
      this.workers.map(async (entry) => {
        const dataCopy = new Uint8Array(fontData);
        return entry.api.loadFont(fontFamily, Comlink.transfer(dataCopy, [dataCopy.buffer]));
      }),
    );
  }

  /**
   * Load a video asset into all workers for frame extraction.
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
    await Promise.all(
      this.workers.map(async (entry) => {
        const copy = await createImageBitmap(bitmap);
        await entry.api.uploadBitmap(Comlink.transfer(copy, [copy]), textureId);
      }),
    );
  }

  /**
   * Render frames using the worker pool.
   * Tasks are pulled lazily from the iterable. Workers dispatch via queue.
   * Yields results as they complete (not necessarily in order).
   */
  async *renderFrames(
    tasks: Iterable<RenderFrameTask>,
    total: number,
    onProgress?: (rendered: number, total: number) => void,
  ): AsyncGenerator<RenderFrameResult> {
    if (!this.initialized) {
      throw new Error("FrameRendererPool not initialized");
    }

    let rendered = 0;
    const taskIterator = tasks[Symbol.iterator]();
    let tasksDone = false;

    // Result queue — workers push completed frames, main loop pulls
    const resultQueue: RenderFrameResult[] = [];
    let resolveWait: (() => void) | null = null;

    const notifyResult = () => {
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    const waitForResult = () =>
      new Promise<void>((resolve) => {
        if (resultQueue.length > 0) {
          resolve();
        } else {
          resolveWait = resolve;
        }
      });

    let inFlight = 0;

    const pullBatch = (): RenderFrameTask[] => {
      const batch: RenderFrameTask[] = [];

      while (batch.length < this.batchSize) {
        const next = taskIterator.next();
        if (next.done) {
          tasksDone = true;
          break;
        }
        batch.push(next.value);
      }

      return batch;
    };

    // Assign work to available workers, pulling tasks lazily
    const assignWork = () => {
      while (!tasksDone && inFlight < this.workerCount) {
        const workerIndex = this.workers.findIndex((w) => !w.busy);
        if (workerIndex === -1) break;

        const batch = pullBatch();
        if (batch.length === 0) {
          break;
        }

        const availableWorker = this.workers[workerIndex];

        availableWorker.busy = true;
        inFlight++;

        void (async () => {
          try {
            await this.uploadFallbackTextures(batch, availableWorker);
            const results = await availableWorker.api.renderFrames(batch);
            resultQueue.push(...results);
          } catch (error) {
            const failedFrames = batch.map((task) => task.frameIndex).join(", ");
            console.error(`[FrameRendererPool] Frames ${failedFrames} failed:`, error);
            resultQueue.push(
              ...batch.map((task) => ({
                frameIndex: task.frameIndex,
                videoFrame: null,
              })),
            );
          } finally {
            availableWorker.busy = false;
            inFlight--;
            assignWork();
            notifyResult();
          }
        })();
      }
    };

    // Initial work assignment
    assignWork();

    // Yield results as they arrive
    while (rendered < total) {
      if (resultQueue.length === 0) {
        await waitForResult();
      }

      while (resultQueue.length > 0) {
        const result = resultQueue.shift()!;
        rendered++;

        if (onProgress) {
          onProgress(rendered, total);
        }

        yield result;
      }
    }
  }

  /**
   * Extract a frame on the main thread using HTMLVideoElement fallback
   * and upload it to the target worker.
   */
  private async uploadFallbackTextures(
    tasks: RenderFrameTask[],
    worker: WorkerEntry,
  ): Promise<void> {
    for (const task of tasks) {
      for (const req of task.textureRequests) {
        if (req.type !== "video" || !this.fallbackLoaders.has(req.assetId)) continue;

        const uploadId = req.textureId ?? req.assetId;

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
            `[FrameRendererPool] Fallback frame extraction failed for ${req.assetId}:`,
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
  }

  /**
   * Collect and reset render profiling data from all workers.
   */
  async getAndResetProfile(): Promise<RenderProfileData | null> {
    const profiles = await Promise.all(this.workers.map((entry) => entry.api.getAndResetProfile()));
    return profiles.find((p) => p != null) ?? null;
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

    for (const loader of this.fallbackLoaders.values()) {
      loader.dispose();
    }
    this.fallbackLoaders.clear();
    this.fallbackLocks.clear();
  }

  get size(): number {
    return this.workerCount;
  }
}
