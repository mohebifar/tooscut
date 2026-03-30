/**
 * MP4 Export Hook
 *
 * Uses MediaBunny to mux video frames and audio into an MP4 file.
 * Renders frames using parallel Web Workers with WASM compositors (GPU stays on GPU),
 * mixes audio using WASM AudioEngine in chunks, and streams output to disk
 * via the File System Access API.
 */

import { EvaluatorManager, framesToSeconds } from "@tooscut/render-engine";
import {
  AudioSample,
  AudioSampleSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
} from "mediabunny";
import { useCallback, useRef, useState, type RefObject } from "react";

import type {
  AudioRenderMessage,
  AudioRenderRequest,
  AudioRenderStartRequest,
} from "../workers/audio-render.worker";
import type { RenderFrameTask } from "../workers/frame-renderer.worker";

import { useAssetStore } from "../components/timeline/use-asset-store";
import { trackEvent } from "../lib/analytics";
import { downloadAllSubsets, findNearestWeight } from "../lib/font-service";
import { FrameRendererPool } from "../lib/frame-renderer-pool";
import { buildLayersForTime, calculateSourceTime } from "../lib/layer-builder";
import { useFontStore } from "../state/font-store";
import { useVideoEditorStore, type TextClip } from "../state/video-editor-store";

// ===================== TYPES =====================

export interface ExportOptions {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Frame rate (fps) */
  frameRate: number;
  /** Video bitrate in bits per second (default: auto based on resolution) */
  videoBitrate?: number;
  /** Audio bitrate in bits per second (default: 128000) */
  audioBitrate?: number;
  /** File handle from showSaveFilePicker for streaming to disk */
  fileHandle: FileSystemFileHandle;
}

interface ExportProgress {
  /** Current stage of export */
  stage: "preparing" | "rendering" | "encoding" | "finalizing" | "complete" | "error";
  /** Progress percentage (0-100) */
  progress: number;
  /** Current frame being rendered */
  currentFrame: number;
  /** Total frames to render */
  totalFrames: number;
  /** Time elapsed since export started in seconds */
  elapsedTime: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining: number | null;
  /** Rendering speed in frames per second */
  fps: number | null;
  /** Error message if stage is "error" */
  error?: string;
}

export interface ExportResult {
  /** Duration in seconds */
  duration: number;
  /** Time taken to render in seconds */
  renderTime: number;
}

interface Mp4ExportHandle {
  /** Start the export process */
  startExport: (options: ExportOptions) => Promise<ExportResult>;
  /** Cancel the current export */
  cancelExport: () => void;
  /** Current export progress */
  progress: ExportProgress | null;
  /** Whether an export is in progress */
  isExporting: boolean;
}

// ===================== UTILITIES =====================

/**
 * Get optimal number of worker threads based on hardware
 */
function getOptimalWorkerCount(): number {
  // Single worker with sequential decode + batched Comlink calls.
  // Sequential iterator: 0.9ms/frame (vs 20ms random-access).
  // Batching amortizes Comlink round-trip overhead.
  return 1;
}

const PROGRESS_UPDATE_INTERVAL_MS = 200;
const MAX_ENCODED_CHUNK_QUEUE_SIZE = 8;
const MAX_VIDEO_ENCODER_QUEUE_SIZE = 4;

/**
 * Render audio using WASM engine and stream chunks to AudioSampleSource.
 * Audio is decoded, rendered, and streamed in one pass. The WASM engine is
 * freed immediately after, but WASM linear memory persists (can't shrink).
 */
function buildAudioTimelineState(
  audioClips: Array<{
    id: string;
    assetId?: string;
    trackId: string;
    startTime: number;
    duration: number;
    inPoint: number;
    speed?: number;
    volume?: number;
    audioEffects?: import("@tooscut/render-engine").AudioEffectsParams;
  }>,
  tracks: Array<{ id: string; type: string; volume: number; muted: boolean }>,
  assetMap: Map<string, { id: string; file?: Blob; type: string }>,
  contentDuration: number,
  fps: import("@tooscut/render-engine").FrameRate,
  sampleRate: number,
): {
  sources: Array<{ sourceId: string; blob: Blob }>;
  timelineStateJson: string;
  totalSamples: number;
} {
  const uploadedSources = new Set<string>();
  const sources: Array<{ sourceId: string; blob: Blob }> = [];

  for (const clip of audioClips) {
    const sourceId = clip.assetId || clip.id;
    if (uploadedSources.has(sourceId)) continue;
    const asset = assetMap.get(sourceId);
    if (!asset?.file) continue;
    uploadedSources.add(sourceId);
    sources.push({ sourceId, blob: asset.file });
  }

  const timelineClips = audioClips
    .filter((clip) => uploadedSources.has(clip.assetId || clip.id))
    .map((clip) => ({
      id: clip.id,
      sourceId: clip.assetId || clip.id,
      trackId: clip.trackId,
      startTime: framesToSeconds(clip.startTime, fps),
      duration: framesToSeconds(clip.duration, fps),
      inPoint: framesToSeconds(clip.inPoint, fps),
      speed: clip.speed ?? 1,
      gain: clip.volume ?? 1,
      fadeIn: 0,
      fadeOut: 0,
      effects: clip.audioEffects,
    }));

  const audioTracks = tracks
    .filter((t) => t.type === "audio")
    .map((track) => ({
      id: track.id,
      volume: track.volume,
      pan: 0,
      mute: track.muted,
      solo: false,
    }));

  const durationSeconds = framesToSeconds(contentDuration, fps);
  return {
    sources,
    timelineStateJson: JSON.stringify({
      clips: timelineClips,
      tracks: audioTracks,
      crossTransitions: [],
    }),
    totalSamples: Math.ceil(durationSeconds * sampleRate),
  };
}

async function renderAudioToSource(
  audioClips: Array<{
    id: string;
    assetId?: string;
    trackId: string;
    startTime: number;
    duration: number;
    inPoint: number;
    speed?: number;
    volume?: number;
    audioEffects?: import("@tooscut/render-engine").AudioEffectsParams;
  }>,
  tracks: Array<{ id: string; type: string; volume: number; muted: boolean }>,
  assetMap: Map<string, { id: string; file?: Blob; type: string }>,
  contentDuration: number,
  fps: import("@tooscut/render-engine").FrameRate,
  sampleRate: number,
  audioSource: AudioSampleSource,
  workerRef: RefObject<Worker | null>,
  rejectRef: RefObject<((error: Error) => void) | null>,
): Promise<void> {
  const { sources, timelineStateJson, totalSamples } = buildAudioTimelineState(
    audioClips,
    tracks,
    assetMap,
    contentDuration,
    fps,
    sampleRate,
  );

  if (sources.length === 0 || totalSamples <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/audio-render.worker.ts", import.meta.url), {
      type: "module",
    });

    const cleanup = () => {
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
      if (rejectRef.current === rejectWithCleanup) {
        rejectRef.current = null;
      }
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    const rejectWithCleanup = (error: Error) => {
      cleanup();
      reject(error);
    };

    workerRef.current = worker;
    rejectRef.current = rejectWithCleanup;

    worker.onmessage = (event: MessageEvent<AudioRenderMessage>) => {
      void (async () => {
        const data = event.data;

        try {
          if (data.type === "chunk") {
            const audioSample = new AudioSample({
              data: data.pcm,
              format: "f32",
              numberOfChannels: 2,
              sampleRate: data.sampleRate,
              timestamp: data.timestamp,
            });
            try {
              await audioSource.add(audioSample);
            } finally {
              audioSample.close();
            }

            const ack: AudioRenderRequest = { type: "ack" };
            worker.postMessage(ack);
            return;
          }

          if (data.type === "done") {
            cleanup();
            resolve();
            return;
          }

          rejectWithCleanup(new Error(data.message));
        } catch (error) {
          rejectWithCleanup(
            error instanceof Error ? error : new Error("Audio render worker failed"),
          );
        }
      })();
    };

    worker.onerror = (event) => {
      rejectWithCleanup(new Error(event.message || "Audio render worker failed"));
    };

    const request: AudioRenderStartRequest = {
      type: "render",
      sources,
      timelineStateJson,
      totalSamples,
      sampleRate,
    };

    worker.postMessage(request);
  });
}

// ===================== EXPORT HOOK =====================

export function useMp4Export(): Mp4ExportHandle {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const cancelledRef = useRef(false);
  const outputRef = useRef<Output | null>(null);
  const poolRef = useRef<FrameRendererPool | null>(null);
  const audioWorkerRef = useRef<Worker | null>(null);
  const audioRejectRef = useRef<((error: Error) => void) | null>(null);

  const cancelExport = useCallback(() => {
    cancelledRef.current = true;
    if (audioWorkerRef.current) {
      try {
        const cancelMsg: AudioRenderRequest = { type: "cancel" };
        audioWorkerRef.current.postMessage(cancelMsg);
      } catch {
        // Ignore
      }
      audioWorkerRef.current.terminate();
      audioWorkerRef.current = null;
    }
    if (audioRejectRef.current) {
      audioRejectRef.current(new Error("Export cancelled"));
      audioRejectRef.current = null;
    }
    if (outputRef.current) {
      outputRef.current.cancel().catch(console.error);
      outputRef.current = null;
    }
    if (poolRef.current) {
      poolRef.current.dispose();
      poolRef.current = null;
    }
    setIsExporting(false);
    setProgress(null);
  }, []);

  const startExport = useCallback(async (options: ExportOptions): Promise<ExportResult> => {
    const { width, height, frameRate, videoBitrate, audioBitrate = 128000, fileHandle } = options;

    cancelledRef.current = false;
    setIsExporting(true);

    // Get current state
    const state = useVideoEditorStore.getState();
    const assetStore = useAssetStore.getState();
    const fontStore = useFontStore.getState();

    const { clips, tracks, crossTransitions, settings } = state;
    const assets = assetStore.assets;

    // Calculate actual content duration from clips (not the store's padded duration)
    const contentDuration =
      clips.length > 0 ? Math.max(...clips.map((c) => c.startTime + c.duration)) : 0;

    if (contentDuration <= 0) {
      throw new Error("No content to export");
    }

    // contentDuration is in frames (project frame rate)
    const totalFrames = Math.ceil(contentDuration);
    const resolvedBitrate = videoBitrate ?? QUALITY_HIGH;

    let pool: FrameRendererPool | null = null;
    let fileWritable: FileSystemWritableFileStream | null = null;

    try {
      const exportStartTime = Date.now();
      const frameDuration = 1 / frameRate;
      const frameDurationMicros = Math.round(frameDuration * 1_000_000);
      const evaluatorManager = new EvaluatorManager();

      const updateProgress = (progress: number) => {
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                progress,
                elapsedTime: (Date.now() - exportStartTime) / 1000,
              }
            : null,
        );
      };

      setProgress({
        stage: "preparing",
        progress: 0,
        currentFrame: 0,
        totalFrames,
        elapsedTime: 0,
        estimatedTimeRemaining: null,
        fps: null,
      });

      // Create asset map
      const assetMap = new Map(assets.map((a) => [a.id, a]));

      // Pre-load image assets as ImageBitmaps
      const imageBitmaps = new Map<string, ImageBitmap>();
      const mediaClips = clips.filter((c) => c.type === "video" || c.type === "image");

      for (const clip of mediaClips) {
        const asset = assetMap.get(clip.assetId || clip.id);
        if (!asset?.file || asset.type !== "image") continue;
        if (imageBitmaps.has(asset.id)) continue;

        try {
          const bitmap = await createImageBitmap(asset.file);
          imageBitmaps.set(asset.id, bitmap);
        } catch (error) {
          console.error(`[MP4Export] Failed to load image ${asset.id}:`, error);
        }
      }

      if (cancelledRef.current) {
        throw new Error("Export cancelled");
      }

      updateProgress(0);

      // Initialize multi-worker pool for parallel decoding
      const workerCount = getOptimalWorkerCount();
      pool = new FrameRendererPool({ workerCount, width, height });
      poolRef.current = pool;
      await pool.init();

      if (cancelledRef.current) {
        pool.dispose();
        throw new Error("Export cancelled");
      }

      updateProgress(0);

      // Load fonts into workers
      await fontStore.fetchCatalog();
      const textClips = clips.filter((c): c is TextClip => c.type === "text");
      if (textClips.length > 0) {
        const seenFonts = new Set<string>();
        const fontVariants: Array<{
          fontId: string;
          family: string;
          weight: number;
          italic: boolean;
          subsets: string[];
        }> = [];

        for (const clip of textClips) {
          const { font_family, font_weight, italic } = clip.textStyle;
          const key = `${font_family}|${font_weight}|${italic}`;
          if (seenFonts.has(key)) continue;
          seenFonts.add(key);

          const fontEntry = fontStore.getFontByFamily(font_family);
          if (!fontEntry) continue;

          const actualWeight = findNearestWeight(fontEntry.weights, font_weight);

          fontVariants.push({
            fontId: fontEntry.id,
            family: font_family,
            weight: actualWeight,
            italic: italic && fontEntry.styles.includes("italic"),
            subsets: fontEntry.subsets,
          });
        }

        for (const variant of fontVariants) {
          try {
            const subsetResults = await downloadAllSubsets(
              variant.fontId,
              variant.weight,
              variant.italic,
              variant.subsets,
            );

            for (const { data } of subsetResults) {
              await pool.loadFont(variant.family, data);
            }
          } catch (error) {
            console.error(`[MP4Export] Failed to load font ${variant.family}:`, error);
          }
        }
      }

      updateProgress(1);

      // Upload image textures to all workers
      for (const [assetId, bitmap] of imageBitmaps) {
        await pool.uploadBitmap(bitmap, assetId);
      }

      // For image clips involved in cross transitions, also upload under their clip ID
      for (const ct of crossTransitions) {
        for (const clipId of [ct.outgoingClipId, ct.incomingClipId]) {
          const clip = clips.find((c) => c.id === clipId);
          if (!clip || clip.type !== "image") continue;
          const assetId = clip.assetId || clip.id;
          const bitmap = imageBitmaps.get(assetId);
          if (bitmap) {
            await pool.uploadBitmap(bitmap, clipId);
          }
        }
      }

      updateProgress(1);

      // Load video assets into workers
      const loadedVideoAssets = new Set<string>();
      for (const clip of mediaClips) {
        const assetId = clip.assetId || clip.id;
        const asset = assetMap.get(assetId);
        if (!asset?.file || asset.type !== "video") continue;
        if (loadedVideoAssets.has(asset.id)) continue;
        loadedVideoAssets.add(asset.id);
        await pool.loadVideoAsset(asset.id, asset.file);
      }

      updateProgress(1);

      const sampleRate = 48000;
      const audioClips = clips.filter((c) => c.type === "audio");
      const hasAudio = audioClips.length > 0;

      if (cancelledRef.current) {
        pool.dispose();
        throw new Error("Export cancelled");
      }

      // Open file for streaming writes
      fileWritable = await fileHandle.createWritable();

      const streamTarget = new StreamTarget(fileWritable);

      const output = new Output({
        format: new Mp4OutputFormat({
          fastStart: "fragmented",
          minimumFragmentDuration: 1,
        }),
        target: streamTarget,
      });
      outputRef.current = output;

      // Pre-encoded video source — main thread encodes (non-blocking) and muxes
      const videoSource = new EncodedVideoPacketSource("avc");

      output.addVideoTrack(videoSource, { frameRate });

      // Non-blocking VideoEncoder on main thread
      // encoder.encode() is ~0ms (just queues to GPU), actual encoding runs async
      let encoderSequenceNumber = 0;
      let firstChunkReceived = false;

      const encodedChunkQueue: Array<{
        packet: EncodedPacket;
        meta?: EncodedVideoChunkMetadata;
      }> = [];
      let muxError: Error | null = null;
      let drainingEncodedChunks = false;
      let encodedDrainPromise: Promise<void> | null = null;
      let resolveQueueBelowLimit: (() => void) | null = null;

      const mainEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);

          const packet = new EncodedPacket(
            data,
            chunk.type,
            chunk.timestamp / 1_000_000,
            (chunk.duration ?? 0) / 1_000_000,
            encoderSequenceNumber++,
          );

          encodedChunkQueue.push({ packet, meta });
          void pumpEncodedChunks();
        },
        error: (e) => {
          console.error("[MP4Export] Encoder error:", e);
          muxError = e instanceof Error ? e : new Error(String(e));
        },
      });

      mainEncoder.configure({
        codec: "avc1.640032",
        width,
        height,
        bitrate: typeof resolvedBitrate === "number" ? resolvedBitrate : 20_000_000,
        framerate: frameRate,
        hardwareAcceleration: "prefer-hardware",
        latencyMode: "realtime",
      });

      let audioSource: AudioSampleSource | null = null;
      if (hasAudio) {
        audioSource = new AudioSampleSource({
          codec: "aac",
          bitrate: audioBitrate,
        });
        output.addAudioTrack(audioSource);
      }

      output.setMetadataTags({
        title: "Exported Video",
        date: new Date(),
      });

      await output.start();

      if (cancelledRef.current) {
        await output.cancel();
        pool.dispose();
        throw new Error("Export cancelled");
      }

      // Start audio rendering concurrently with video — the audio worker
      // decodes and encodes in the background while the main thread renders
      // video frames. Both feed into the same Output muxer via separate tracks.
      let audioPromise: Promise<void> | null = null;
      if (audioSource && hasAudio) {
        audioPromise = renderAudioToSource(
          audioClips,
          tracks,
          assetMap as Map<string, { id: string; file?: Blob; type: string }>,
          contentDuration,
          settings.fps,
          sampleRate,
          audioSource,
          audioWorkerRef,
          audioRejectRef,
        ).then(() => {
          audioSource!.close();
        });
      }

      setProgress({
        stage: "rendering",
        progress: 1,
        currentFrame: 0,
        totalFrames,
        elapsedTime: (Date.now() - exportStartTime) / 1000,
        estimatedTimeRemaining: null,
        fps: null,
      });

      // Lazy frame task generator — builds tasks on-demand as workers need them.
      // Avoids building 148K+ tasks upfront for long videos.
      const exportFps = settings.fps;
      const exportSettings = { ...settings, width, height };

      function* generateFrameTasks(): Generator<RenderFrameTask> {
        for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
          const { frame, visibleMediaClips, crossTransitionTextureMap } = buildLayersForTime({
            clips,
            tracks,
            crossTransitions,
            settings: exportSettings,
            timelineTime: frameIndex,
            evaluatorManager,
            includeMutedTracks: false,
          });

          const textureRequests: RenderFrameTask["textureRequests"] = [];
          for (const clip of visibleMediaClips) {
            const assetId = clip.assetId || clip.id;
            const textureId = crossTransitionTextureMap.get(clip.id) ?? assetId;
            const asset = assetMap.get(assetId);
            if (!asset) continue;

            const sourceTime = calculateSourceTime(frameIndex, clip, exportFps);
            textureRequests.push({
              assetId,
              sourceTime,
              type: asset.type as "video" | "image",
              textureId: textureId !== assetId ? textureId : undefined,
            });
          }

          yield {
            frameIndex,
            timelineFrame: frameIndex,
            frame,
            textureRequests,
            timestampMicros: frameIndex * frameDurationMicros,
            durationMicros: frameDurationMicros,
          };
        }
      }

      // Drain encoded chunk queue into muxer
      const drainEncodedChunks = async () => {
        while (encodedChunkQueue.length > 0) {
          const { packet, meta } = encodedChunkQueue.shift()!;
          const enrichedMeta =
            !firstChunkReceived && meta?.decoderConfig
              ? {
                  decoderConfig: {
                    ...meta.decoderConfig,
                    codedWidth: width,
                    codedHeight: height,
                  } as VideoDecoderConfig,
                }
              : meta;
          if (!firstChunkReceived && meta?.decoderConfig) {
            firstChunkReceived = true;
          }
          await videoSource.add(packet, enrichedMeta);
        }

        if (
          encodedChunkQueue.length < MAX_ENCODED_CHUNK_QUEUE_SIZE &&
          resolveQueueBelowLimit !== null
        ) {
          resolveQueueBelowLimit();
          resolveQueueBelowLimit = null;
        }
      };

      const pumpEncodedChunks = (): Promise<void> => {
        if (drainingEncodedChunks) {
          return encodedDrainPromise ?? Promise.resolve();
        }

        drainingEncodedChunks = true;
        encodedDrainPromise = (async () => {
          try {
            await drainEncodedChunks();
          } catch (error) {
            muxError = error instanceof Error ? error : new Error("Failed to mux encoded chunks");
            throw muxError;
          } finally {
            drainingEncodedChunks = false;
          }
        })();

        return encodedDrainPromise;
      };

      const waitForChunkBackpressure = async () => {
        if (encodedChunkQueue.length < MAX_ENCODED_CHUNK_QUEUE_SIZE) {
          return;
        }

        await pumpEncodedChunks();
        if (encodedChunkQueue.length < MAX_ENCODED_CHUNK_QUEUE_SIZE) {
          return;
        }

        await new Promise<void>((resolve) => {
          resolveQueueBelowLimit = resolve;
        });
      };

      const waitForVideoEncoderBackpressure = async () => {
        if (mainEncoder.encodeQueueSize < MAX_VIDEO_ENCODER_QUEUE_SIZE) {
          return;
        }

        await new Promise<void>((resolve, reject) => {
          const onDequeue = () => {
            if (muxError) {
              mainEncoder.removeEventListener("dequeue", onDequeue);
              reject(muxError);
              return;
            }

            if (mainEncoder.encodeQueueSize < MAX_VIDEO_ENCODER_QUEUE_SIZE) {
              mainEncoder.removeEventListener("dequeue", onDequeue);
              resolve();
            }
          };

          mainEncoder.addEventListener("dequeue", onDequeue);
        });
      };

      // EMA-smoothed FPS (α=0.05 → heavy smoothing, stable display)
      const FPS_EMA_ALPHA = 0.05;
      const PROFILE_TRACK_INTERVAL = 1000;
      let smoothedFps: number | null = null;
      let lastFpsTime = Date.now();
      let lastFpsFrame = 0;
      let lastProgressCommitTime = 0;
      let lastProfileFrame = 0;

      // Receive VideoFrames from workers, encode (non-blocking), mux in order
      const pendingFrames = new Map<number, VideoFrame | null>();
      let nextFrameToEncode = 0;
      const keyFrameInterval = Math.max(1, Math.round(frameRate));

      for await (const result of pool.renderFrames(
        generateFrameTasks(),
        totalFrames,
        (rendered, total) => {
          const now = Date.now();
          const dt = now - lastFpsTime;

          // Update instantaneous FPS every ~200ms to avoid noise from single-frame jitter
          if (dt >= 200) {
            const instantFps = ((rendered - lastFpsFrame) / dt) * 1000;
            lastFpsTime = now;
            lastFpsFrame = rendered;

            if (smoothedFps === null) {
              smoothedFps = instantFps;
            } else {
              smoothedFps = FPS_EMA_ALPHA * instantFps + (1 - FPS_EMA_ALPHA) * smoothedFps;
            }
          }

          const overallProgress = 1 + Math.round((rendered / total) * 94);
          const elapsed = (now - exportStartTime) / 1000;
          const currentFps = smoothedFps !== null ? Math.round(smoothedFps * 10) / 10 : null;

          const remainingFrames = total - rendered;
          const estimatedTimeRemaining =
            currentFps && currentFps > 0 ? remainingFrames / currentFps : null;

          const shouldCommitProgress =
            rendered === total || now - lastProgressCommitTime >= PROGRESS_UPDATE_INTERVAL_MS;
          if (!shouldCommitProgress) {
            return;
          }

          lastProgressCommitTime = now;
          setProgress({
            stage: "rendering",
            progress: overallProgress,
            currentFrame: rendered,
            totalFrames,
            elapsedTime: elapsed,
            estimatedTimeRemaining,
            fps: currentFps,
          });

          // Collect worker profiling data every 1000 frames
          if (rendered - lastProfileFrame >= PROFILE_TRACK_INTERVAL) {
            lastProfileFrame = rendered;
            void pool!.getAndResetProfile().then((profile) => {
              if (profile) {
                trackEvent("render-export-profile", { ...profile });
              }
            });
          }
        },
      )) {
        // Buffer out-of-order frames
        if (result.videoFrame) {
          pendingFrames.set(result.frameIndex, result.videoFrame);
        } else {
          // Failed frame — skip it to keep export going
          pendingFrames.set(result.frameIndex, null);
        }

        // Encode frames in order (non-blocking — just queues to GPU)
        while (pendingFrames.has(nextFrameToEncode)) {
          const videoFrame = pendingFrames.get(nextFrameToEncode)!;
          pendingFrames.delete(nextFrameToEncode);

          if (videoFrame) {
            mainEncoder.encode(videoFrame, {
              keyFrame: nextFrameToEncode % keyFrameInterval === 0,
            });
            videoFrame.close();
            await waitForVideoEncoderBackpressure();
          }

          nextFrameToEncode++;
        }

        if (muxError) {
          throw muxError;
        }

        await waitForChunkBackpressure();
      }

      // Workers done — free WASM/GPU memory before encoder flush + finalize
      pool.dispose();
      poolRef.current = null;
      for (const bitmap of imageBitmaps.values()) {
        bitmap.close();
      }

      // Flush encoder to get remaining pipelined frames
      await mainEncoder.flush();
      await pumpEncodedChunks();
      mainEncoder.close();
      pendingFrames.clear();

      // Close video source
      videoSource.close();
      encodedChunkQueue.length = 0;

      // Wait for audio rendering to complete (it ran concurrently with video)
      if (audioPromise) {
        await audioPromise;
      }

      setProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: "finalizing",
              progress: 98,
              elapsedTime: (Date.now() - exportStartTime) / 1000,
            }
          : null,
      );

      // mediabunny writes directly to the FileSystemWritableFileStream
      // and closes it internally during finalize.
      await output.finalize();
      fileWritable = null;

      const renderTime = (Date.now() - exportStartTime) / 1000;

      setProgress({
        stage: "complete",
        progress: 100,
        currentFrame: totalFrames,
        totalFrames,
        elapsedTime: renderTime,
        estimatedTimeRemaining: 0,
        fps: null,
      });

      outputRef.current = null;

      return {
        duration: framesToSeconds(contentDuration, settings.fps),
        renderTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Export failed";

      if (errorMessage !== "Export cancelled") {
        console.error("[MP4Export] Export failed:", error);
        setProgress({
          stage: "error",
          progress: 0,
          currentFrame: 0,
          totalFrames,
          elapsedTime: 0,
          estimatedTimeRemaining: null,
          fps: null,
          error: errorMessage,
        });
      }

      throw error;
    } finally {
      setIsExporting(false);
      if (audioWorkerRef.current) {
        audioWorkerRef.current.terminate();
        audioWorkerRef.current = null;
      }
      audioRejectRef.current = null;
      if (pool) {
        pool.dispose();
      }
      if (fileWritable) {
        try {
          await fileWritable.close();
        } catch {
          // Ignore close errors during cleanup
        }
      }
    }
  }, []);

  return {
    startExport,
    cancelExport,
    progress,
    isExporting,
  };
}
