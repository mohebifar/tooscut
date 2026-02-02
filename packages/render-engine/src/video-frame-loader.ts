/**
 * Video frame loader using MediaBunny.
 *
 * This provides frame-accurate video decoding without using HTMLVideoElement.
 * Key benefits:
 * - Microsecond-precision seeking via getSample(timestamp)
 * - No video element pool management
 * - No drift correction needed
 * - Direct access to decoded frames
 *
 * Trade-offs:
 * - Must manually manage sample lifecycle (call close())
 * - No browser-optimized buffering (we control it ourselves)
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

/**
 * Loads and decodes video frames from a video file.
 *
 * Usage:
 * ```ts
 * const loader = await VideoFrameLoader.fromBlob(videoBlob);
 *
 * // Get frame at specific time
 * const frame = await loader.getFrame(5.0); // 5 seconds
 * frame.sample.draw(ctx, 0, 0);
 * frame.sample.close(); // MUST close to release VRAM
 *
 * // Get video info
 * console.log(loader.info.duration, loader.info.width, loader.info.height);
 *
 * // Cleanup
 * loader.dispose();
 * ```
 */
export class VideoFrameLoader {
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

  /**
   * Create a loader from a Blob or File.
   *
   * For local files, this reads from disk on-demand without loading
   * the entire file into memory.
   */
  static async fromBlob(blob: Blob): Promise<VideoFrameLoader> {
    return VideoFrameLoader.fromSource(new BlobSource(blob));
  }

  /**
   * Create a loader from a URL with streaming support.
   *
   * This uses HTTP range requests to stream the video without downloading
   * the entire file into memory. Ideal for large remote files.
   *
   * @param url - URL to the video file
   * @param options - Optional fetch request options (headers, credentials, etc.)
   */
  static async fromUrl(
    url: string,
    options?: RequestInit,
  ): Promise<VideoFrameLoader> {
    // Use UrlSource for streaming - only downloads bytes as needed
    const request = options ? new Request(url, options) : url;
    const source = new UrlSource(request);
    return VideoFrameLoader.fromSource(source);
  }

  /**
   * Create a loader from any MediaBunny source.
   *
   * Supported sources:
   * - `BlobSource` - Local File or Blob
   * - `UrlSource` - Remote URL with streaming
   * - `BufferSource` - ArrayBuffer (entire file in memory)
   * - `StreamSource` - Custom streaming implementation
   */
  static async fromSource(
    source: ConstructorParameters<typeof Input>[0]["source"],
  ): Promise<VideoFrameLoader> {
    const input = new Input({
      formats: ALL_FORMATS,
      source,
    });

    // Get video track
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error("No video track found in file");
    }

    const canDecode = await videoTrack.canDecode();
    if (!canDecode) {
      throw new Error("Video codec not supported for decoding");
    }

    const videoSink = new VideoSampleSink(videoTrack);

    // Get audio track (optional)
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
      // No audio track, that's fine
    }

    // Get video info - duration must be computed async
    const duration = await input.computeDuration();

    const info: VideoAssetInfo = {
      duration,
      width: videoTrack.displayWidth,
      height: videoTrack.displayHeight,
      hasAudio: audioTrack !== null,
    };

    return new VideoFrameLoader(
      input,
      videoTrack,
      videoSink,
      audioTrack,
      audioSink,
      info,
    );
  }

  /**
   * Get video asset information.
   */
  get info(): VideoAssetInfo {
    return this._info;
  }

  /**
   * Get a video frame at a specific timestamp.
   *
   * @param timestamp - Time in seconds
   * @returns Frame result with sample, timestamp, and duration
   *
   * IMPORTANT: You MUST call sample.close() after using the frame
   * to release GPU/VRAM resources.
   */
  async getFrame(timestamp: number): Promise<FrameResult> {
    if (this._disposed) {
      throw new Error("VideoFrameLoader has been disposed");
    }

    // Clamp to valid range
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
   * Get a VideoFrame (WebCodecs) at a specific timestamp.
   * This can be used with copy_external_image_to_texture.
   *
   * @param timestamp - Time in seconds
   * @returns WebCodecs VideoFrame
   *
   * IMPORTANT: You MUST call frame.close() after using.
   */
  async getVideoFrame(timestamp: number): Promise<VideoFrame> {
    const result = await this.getFrame(timestamp);
    const videoFrame = result.sample.toVideoFrame();
    result.sample.close();
    return videoFrame;
  }

  /**
   * Get raw RGBA pixel data at a specific timestamp.
   * This is useful when VideoFrame/ImageBitmap APIs aren't available.
   *
   * @param timestamp - Time in seconds
   * @returns Object with width, height, and RGBA data
   */
  async getRgbaData(timestamp: number): Promise<{
    width: number;
    height: number;
    data: Uint8Array;
    timestamp: number;
  }> {
    const result = await this.getFrame(timestamp);
    const sample = result.sample;

    const width = sample.displayWidth;
    const height = sample.displayHeight;

    // Allocate buffer for RGBA data
    const buffer = new ArrayBuffer(width * height * 4);
    await sample.copyTo(buffer, { format: "RGBX" });

    sample.close();

    return {
      width,
      height,
      data: new Uint8Array(buffer),
      timestamp: result.timestamp,
    };
  }

  /**
   * Iterate over frames in a time range.
   * Useful for thumbnail generation or frame-by-frame processing.
   *
   * @param startTime - Start time in seconds
   * @param endTime - End time in seconds
   *
   * IMPORTANT: You MUST call sample.close() on each yielded sample.
   */
  async *frames(
    startTime: number,
    endTime: number,
  ): AsyncGenerator<FrameResult> {
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

  /**
   * Get audio sample at a specific timestamp.
   * Returns null if no audio track exists.
   *
   * IMPORTANT: You MUST call sample.close() after using.
   */
  async getAudioSample(timestamp: number): Promise<AudioSample | null> {
    if (!this.audioSink) {
      return null;
    }

    const clampedTime = Math.max(0, Math.min(timestamp, this._info.duration));
    return this.audioSink.getSample(clampedTime);
  }

  /**
   * Check if the loader has been disposed.
   */
  get disposed(): boolean {
    return this._disposed;
  }

  /**
   * Dispose of the loader and release all resources.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    // MediaBunny cleanup
    // Note: Input/Sink don't have explicit dispose methods,
    // they're garbage collected
  }
}

/**
 * Manager for multiple video frame loaders.
 * Caches loaders by asset ID for efficient reuse.
 */
export class VideoFrameLoaderManager {
  private loaders = new Map<string, VideoFrameLoader>();
  private loadingPromises = new Map<string, Promise<VideoFrameLoader>>();

  /**
   * Get or create a loader for an asset.
   *
   * @param assetId - Unique identifier for the asset
   * @param blobOrUrl - Blob, File, or URL to load from
   */
  async getLoader(
    assetId: string,
    blobOrUrl: Blob | string,
  ): Promise<VideoFrameLoader> {
    // Return cached loader
    const existing = this.loaders.get(assetId);
    if (existing && !existing.disposed) {
      return existing;
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
          ? await VideoFrameLoader.fromUrl(blobOrUrl)
          : await VideoFrameLoader.fromBlob(blobOrUrl);

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
   * Get a frame from an asset.
   * Convenience method that combines getLoader and getFrame.
   */
  async getFrame(
    assetId: string,
    blobOrUrl: Blob | string,
    timestamp: number,
  ): Promise<FrameResult> {
    const loader = await this.getLoader(assetId, blobOrUrl);
    return loader.getFrame(timestamp);
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
   * Get the number of active loaders.
   */
  get size(): number {
    return this.loaders.size;
  }
}
