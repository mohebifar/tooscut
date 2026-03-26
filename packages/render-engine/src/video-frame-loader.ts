/**
 * Video frame loader with adapter-based architecture.
 *
 * Supports two backends:
 * - HTMLVideoElement: Browser-optimized for real-time preview playback
 * - MediaBunny: Frame-accurate decoding for export rendering
 *
 * Usage:
 * ```ts
 * // For real-time preview (uses HTMLVideoElement)
 * const loader = await VideoFrameLoader.fromBlob(blob, { mode: 'preview' });
 *
 * // For export (uses MediaBunny for frame accuracy)
 * const loader = await VideoFrameLoader.fromBlob(blob, { mode: 'export' });
 *
 * // Get frame
 * const bitmap = await loader.getImageBitmap(5.0);
 * // ... use bitmap
 * bitmap.close();
 *
 * loader.dispose();
 * ```
 */

import {
  Input,
  ALL_FORMATS,
  BlobSource,
  UrlSource,
  VideoSampleSink,
  AudioSampleSink,
  type VideoSample,
  type AudioSample,
  type InputVideoTrack,
  type InputAudioTrack,
} from "mediabunny";

// ============================================================================
// Types
// ============================================================================

export interface VideoAssetInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export interface FrameResult {
  sample: VideoSample;
  timestamp: number;
  duration: number;
}

export type VideoFrameMode = "preview" | "export";

export interface VideoFrameLoaderOptions {
  /** 'preview' uses HTMLVideoElement, 'export' uses MediaBunny */
  mode?: VideoFrameMode;
}

/**
 * Common interface for video frame sources.
 */
interface VideoFrameSourceAdapter {
  readonly info: VideoAssetInfo;
  readonly disposed: boolean;

  /** Get an ImageBitmap at the specified timestamp (seconds) */
  getImageBitmap(timestamp: number): Promise<ImageBitmap>;

  /** Get the underlying video element (preview mode only) */
  getVideoElement?(): HTMLVideoElement | null;

  /** Start playback at the given time (preview mode only) */
  play?(startTime: number): void;

  /** Pause playback (preview mode only) */
  pause?(): void;

  /** Check if currently playing (preview mode only) */
  isPlaying?(): boolean;

  /** Dispose and release resources */
  dispose(): void;
}

// ============================================================================
// HTMLVideoElement Adapter (Preview Mode)
// ============================================================================

class HTMLVideoElementAdapter implements VideoFrameSourceAdapter {
  private video: HTMLVideoElement;
  private _info: VideoAssetInfo;
  private _disposed = false;
  private objectUrl: string | null = null;
  private seekPromise: Promise<void> | null = null;
  private seekResolve: (() => void) | null = null;
  /** Mutex to serialize getImageBitmap calls (prevents seek race conditions) */
  private frameLock: Promise<void> = Promise.resolve();

  private constructor(video: HTMLVideoElement, info: VideoAssetInfo, objectUrl: string | null) {
    this.video = video;
    this._info = info;
    this.objectUrl = objectUrl;

    // Listen for seeked events
    this.video.addEventListener("seeked", this.onSeeked);
  }

  private onSeeked = () => {
    if (this.seekResolve) {
      this.seekResolve();
      this.seekResolve = null;
      this.seekPromise = null;
    }
  };

  static async fromBlob(blob: Blob): Promise<HTMLVideoElementAdapter> {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;

    // Wait for metadata to load
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video"));
    });

    const info: VideoAssetInfo = {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      hasAudio: true, // Assume true, we can't easily check
    };

    return new HTMLVideoElementAdapter(video, info, objectUrl);
  }

  static async fromUrl(url: string): Promise<HTMLVideoElementAdapter> {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = url;

    // Wait for metadata to load
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video"));
    });

    const info: VideoAssetInfo = {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      hasAudio: true,
    };

    return new HTMLVideoElementAdapter(video, info, null);
  }

  get info(): VideoAssetInfo {
    return this._info;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  getVideoElement(): HTMLVideoElement {
    return this.video;
  }

  async getImageBitmap(timestamp: number): Promise<ImageBitmap> {
    if (this._disposed) {
      throw new Error("VideoFrameLoader has been disposed");
    }

    // Serialize access to the video element to prevent seek race conditions.
    let resolve!: () => void;
    const nextLock = new Promise<void>((r) => {
      resolve = r;
    });
    const prevLock = this.frameLock;
    this.frameLock = nextLock;

    await prevLock;

    try {
      const clampedTime = Math.max(0, Math.min(timestamp, this._info.duration));

      // Seek if needed
      if (Math.abs(this.video.currentTime - clampedTime) > 0.01) {
        await this.seekTo(clampedTime);
      }

      // Wait for video to have data
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((r) => {
          const onCanPlay = () => {
            this.video.removeEventListener("canplay", onCanPlay);
            r();
          };
          this.video.addEventListener("canplay", onCanPlay);
        });
      }

      return await createImageBitmap(this.video);
    } finally {
      resolve();
    }
  }

  private async seekTo(time: number): Promise<void> {
    // If already seeking, wait for it to complete first
    if (this.seekPromise) {
      await this.seekPromise;
    }

    // Create new seek promise
    this.seekPromise = new Promise<void>((resolve) => {
      this.seekResolve = resolve;
    });

    this.video.currentTime = time;

    // Wait for seek to complete (with timeout)
    await Promise.race([
      this.seekPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 5000)), // 5s timeout for long/4K videos
    ]);
  }

  play(startTime: number): void {
    if (this._disposed) return;
    this.video.currentTime = startTime;
    this.video.play().catch(() => {});
  }

  pause(): void {
    if (this._disposed) return;
    this.video.pause();
  }

  isPlaying(): boolean {
    return !this.video.paused;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    this.video.removeEventListener("seeked", this.onSeeked);
    this.video.pause();
    this.video.src = "";
    this.video.load();

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}

// ============================================================================
// MediaBunny Adapter (Export Mode)
// ============================================================================

class MediaBunnyAdapter implements VideoFrameSourceAdapter {
  private input: Input;
  private videoTrack: InputVideoTrack;
  private videoSink: VideoSampleSink;
  private audioTrack: InputAudioTrack | null = null;
  private audioSink: AudioSampleSink | null = null;
  private _info: VideoAssetInfo;
  private _disposed = false;

  private constructor(
    input: Input,
    videoTrack: InputVideoTrack,
    videoSink: VideoSampleSink,
    audioTrack: InputAudioTrack | null,
    audioSink: AudioSampleSink | null,
    info: VideoAssetInfo,
  ) {
    this.input = input;
    this.videoTrack = videoTrack;
    this.videoSink = videoSink;
    this.audioTrack = audioTrack;
    this.audioSink = audioSink;
    this._info = info;
  }

  static async fromBlob(blob: Blob): Promise<MediaBunnyAdapter> {
    return MediaBunnyAdapter.fromSource(new BlobSource(blob));
  }

  static async fromUrl(url: string, options?: RequestInit): Promise<MediaBunnyAdapter> {
    const request = options ? new Request(url, options) : url;
    const source = new UrlSource(request);
    return MediaBunnyAdapter.fromSource(source);
  }

  static async fromSource(
    source: ConstructorParameters<typeof Input>[0]["source"],
  ): Promise<MediaBunnyAdapter> {
    const input = new Input({
      formats: ALL_FORMATS,
      source,
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error("No video track found in file");
    }

    const canDecode = await videoTrack.canDecode();
    if (!canDecode) {
      throw new Error("Video codec not supported for decoding");
    }

    const videoSink = new VideoSampleSink(videoTrack);

    let audioTrack: InputAudioTrack | null = null;
    let audioSink: AudioSampleSink | null = null;
    try {
      audioTrack = await input.getPrimaryAudioTrack();
      if (audioTrack) {
        const canDecodeAudio = await audioTrack.canDecode();
        if (canDecodeAudio) {
          audioSink = new AudioSampleSink(audioTrack);
        }
      }
    } catch {
      // No audio track
    }

    const duration = await input.computeDuration();

    const info: VideoAssetInfo = {
      duration,
      width: videoTrack.displayWidth,
      height: videoTrack.displayHeight,
      hasAudio: audioTrack !== null,
    };

    return new MediaBunnyAdapter(input, videoTrack, videoSink, audioTrack, audioSink, info);
  }

  get info(): VideoAssetInfo {
    return this._info;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  async getImageBitmap(timestamp: number): Promise<ImageBitmap> {
    if (this._disposed) {
      throw new Error("VideoFrameLoader has been disposed");
    }

    const clampedTime = Math.max(0, Math.min(timestamp, this._info.duration));
    const sample = await this.videoSink.getSample(clampedTime);

    if (!sample) {
      throw new Error(`No frame found at timestamp ${clampedTime}`);
    }

    const videoFrame = sample.toVideoFrame();
    sample.close();

    const bitmap = await createImageBitmap(videoFrame);
    videoFrame.close();

    return bitmap;
  }

  /**
   * Get raw VideoSample for advanced use cases.
   * Caller is responsible for calling sample.close().
   */
  async getSample(timestamp: number): Promise<FrameResult> {
    if (this._disposed) {
      throw new Error("VideoFrameLoader has been disposed");
    }

    const clampedTime = Math.max(0, Math.min(timestamp, this._info.duration));
    const sample = await this.videoSink.getSample(clampedTime);

    if (!sample) {
      throw new Error(`No frame found at timestamp ${clampedTime}`);
    }

    return {
      sample,
      timestamp: sample.timestamp,
      duration: sample.duration,
    };
  }

  /**
   * Get audio sample at a specific timestamp.
   */
  async getAudioSample(timestamp: number): Promise<AudioSample | null> {
    if (!this.audioSink) {
      return null;
    }

    const clampedTime = Math.max(0, Math.min(timestamp, this._info.duration));
    return this.audioSink.getSample(clampedTime);
  }

  /**
   * Iterate over frames in a time range.
   */
  async *frames(startTime: number, endTime: number): AsyncGenerator<FrameResult> {
    if (this._disposed) {
      throw new Error("VideoFrameLoader has been disposed");
    }

    for await (const sample of this.videoSink.samples(startTime, endTime)) {
      yield {
        sample,
        timestamp: sample.timestamp,
        duration: sample.duration,
      };
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    // MediaBunny cleanup is handled by GC
  }
}

// ============================================================================
// VideoFrameLoader (Unified API)
// ============================================================================

/**
 * Unified video frame loader with pluggable backends.
 *
 * - `preview` mode: Uses HTMLVideoElement, optimized for real-time playback
 * - `export` mode: Uses MediaBunny, frame-accurate for rendering
 */
export class VideoFrameLoader {
  private adapter: VideoFrameSourceAdapter;
  private _mode: VideoFrameMode;

  private constructor(adapter: VideoFrameSourceAdapter, mode: VideoFrameMode) {
    this.adapter = adapter;
    this._mode = mode;
  }

  /**
   * Create a loader from a Blob or File.
   */
  static async fromBlob(
    blob: Blob,
    options: VideoFrameLoaderOptions = {},
  ): Promise<VideoFrameLoader> {
    const mode = options.mode ?? "preview";

    const adapter =
      mode === "preview"
        ? await HTMLVideoElementAdapter.fromBlob(blob)
        : await MediaBunnyAdapter.fromBlob(blob);

    return new VideoFrameLoader(adapter, mode);
  }

  /**
   * Create a loader from a URL.
   */
  static async fromUrl(
    url: string,
    options: VideoFrameLoaderOptions & { fetchOptions?: RequestInit } = {},
  ): Promise<VideoFrameLoader> {
    const mode = options.mode ?? "preview";

    const adapter =
      mode === "preview"
        ? await HTMLVideoElementAdapter.fromUrl(url)
        : await MediaBunnyAdapter.fromUrl(url, options.fetchOptions);

    return new VideoFrameLoader(adapter, mode);
  }

  /**
   * Get the loader mode.
   */
  get mode(): VideoFrameMode {
    return this._mode;
  }

  /**
   * Get video asset information.
   */
  get info(): VideoAssetInfo {
    return this.adapter.info;
  }

  /**
   * Check if the loader has been disposed.
   */
  get disposed(): boolean {
    return this.adapter.disposed;
  }

  /**
   * Get an ImageBitmap at the specified timestamp.
   *
   * @param timestamp - Time in seconds
   * @returns ImageBitmap that must be closed after use
   */
  async getImageBitmap(timestamp: number): Promise<ImageBitmap> {
    return this.adapter.getImageBitmap(timestamp);
  }

  /**
   * Get the underlying video element (preview mode only).
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.adapter.getVideoElement?.() ?? null;
  }

  /**
   * Start playback (preview mode only).
   */
  play(startTime: number): void {
    this.adapter.play?.(startTime);
  }

  /**
   * Pause playback (preview mode only).
   */
  pause(): void {
    this.adapter.pause?.();
  }

  /**
   * Check if currently playing (preview mode only).
   */
  isPlaying(): boolean {
    return this.adapter.isPlaying?.() ?? false;
  }

  /**
   * Get a VideoFrame at the specified timestamp.
   * Works in both preview and export modes.
   *
   * @param timestamp - Time in seconds
   * @returns VideoFrame that must be closed after use
   */
  async getVideoFrame(timestamp: number): Promise<VideoFrame> {
    if (this._mode === "export") {
      const { sample } = await this.getSample(timestamp);
      const videoFrame = sample.toVideoFrame();
      sample.close();
      return videoFrame;
    }
    const bitmap = await this.getImageBitmap(timestamp);
    const frame = new VideoFrame(bitmap, { timestamp: timestamp * 1_000_000 });
    bitmap.close();
    return frame;
  }

  /**
   * Get raw RGBA pixel data at the specified timestamp.
   * Works in both preview and export modes.
   *
   * @param timestamp - Time in seconds
   * @returns Object with width, height, and RGBA pixel data
   */
  async getRgbaData(
    timestamp: number,
  ): Promise<{ width: number; height: number; data: Uint8Array }> {
    const bitmap = await this.getImageBitmap(timestamp);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8Array(imageData.data.buffer),
    };
  }

  /**
   * Get raw VideoSample (export mode only).
   * Alias: getFrame
   * Caller is responsible for calling sample.close().
   */
  async getSample(timestamp: number): Promise<FrameResult> {
    if (this._mode !== "export") {
      throw new Error("getSample is only available in export mode");
    }
    return (this.adapter as MediaBunnyAdapter).getSample(timestamp);
  }

  /**
   * Alias for getSample (export mode only).
   */
  async getFrame(timestamp: number): Promise<FrameResult> {
    return this.getSample(timestamp);
  }

  /**
   * Get audio sample (export mode only).
   */
  async getAudioSample(timestamp: number): Promise<AudioSample | null> {
    if (this._mode !== "export") {
      throw new Error("getAudioSample is only available in export mode");
    }
    return (this.adapter as MediaBunnyAdapter).getAudioSample(timestamp);
  }

  /**
   * Iterate over frames (export mode only).
   */
  async *frames(startTime: number, endTime: number): AsyncGenerator<FrameResult> {
    if (this._mode !== "export") {
      throw new Error("frames is only available in export mode");
    }
    yield* (this.adapter as MediaBunnyAdapter).frames(startTime, endTime);
  }

  /**
   * Dispose and release resources.
   */
  dispose(): void {
    this.adapter.dispose();
  }
}

// ============================================================================
// VideoFrameLoaderManager
// ============================================================================

/**
 * Manager for multiple video frame loaders.
 * Caches loaders by asset ID for efficient reuse.
 */
export class VideoFrameLoaderManager {
  private loaders = new Map<string, VideoFrameLoader>();
  private loadingPromises = new Map<string, Promise<VideoFrameLoader>>();
  private defaultMode: VideoFrameMode;

  constructor(options: { mode?: VideoFrameMode } = {}) {
    this.defaultMode = options.mode ?? "preview";
  }

  /**
   * Get or create a loader for an asset.
   */
  async getLoader(
    assetId: string,
    blobOrUrl: Blob | string,
    options?: VideoFrameLoaderOptions,
  ): Promise<VideoFrameLoader> {
    const mode = options?.mode ?? this.defaultMode;

    // Check if we need to recreate due to mode change
    const existing = this.loaders.get(assetId);
    if (existing && !existing.disposed && existing.mode === mode) {
      return existing;
    }

    // Dispose existing if mode changed
    if (existing && existing.mode !== mode) {
      existing.dispose();
      this.loaders.delete(assetId);
    }

    // Return in-progress load
    const loading = this.loadingPromises.get(assetId);
    if (loading) {
      return loading;
    }

    // Start new load
    const promise = (async () => {
      const loader =
        typeof blobOrUrl === "string"
          ? await VideoFrameLoader.fromUrl(blobOrUrl, { mode })
          : await VideoFrameLoader.fromBlob(blobOrUrl, { mode });

      this.loaders.set(assetId, loader);
      this.loadingPromises.delete(assetId);
      return loader;
    })();

    this.loadingPromises.set(assetId, promise);
    return promise;
  }

  /**
   * Check if a loader exists for an asset.
   */
  hasLoader(assetId: string): boolean {
    const loader = this.loaders.get(assetId);
    return loader !== undefined && !loader.disposed;
  }

  /**
   * Get a loader if it exists (no loading).
   */
  getExistingLoader(assetId: string): VideoFrameLoader | null {
    const loader = this.loaders.get(assetId);
    return loader && !loader.disposed ? loader : null;
  }

  /**
   * Dispose of a specific loader.
   */
  disposeLoader(assetId: string): void {
    const loader = this.loaders.get(assetId);
    if (loader) {
      loader.dispose();
      this.loaders.delete(assetId);
    }
  }

  /**
   * Dispose of all loaders.
   */
  disposeAll(): void {
    for (const loader of this.loaders.values()) {
      loader.dispose();
    }
    this.loaders.clear();
    this.loadingPromises.clear();
  }

  /**
   * Convenience method: get a frame for an asset.
   * Creates or reuses a loader, then calls getFrame.
   */
  async getFrame(
    assetId: string,
    blobOrUrl: Blob | string,
    timestamp: number,
    options?: VideoFrameLoaderOptions,
  ): Promise<FrameResult> {
    const loader = await this.getLoader(assetId, blobOrUrl, {
      mode: "export",
      ...options,
    });
    return loader.getFrame(timestamp);
  }

  /**
   * Get the number of active loaders.
   */
  get size(): number {
    return this.loaders.size;
  }
}
