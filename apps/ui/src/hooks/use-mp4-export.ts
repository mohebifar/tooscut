/**
 * MP4 Export Hook
 *
 * Uses MediaBunny to encode video frames and audio into an MP4 file.
 * Renders frames using parallel Web Workers with WASM compositors,
 * mixes audio using Web Audio API, and muxes everything into MP4.
 */

import { EvaluatorManager, framesToSeconds, type AudioTimelineState } from "@tooscut/render-engine";
import initAudioWasm, {
  AudioEngine as WasmAudioEngine,
} from "@tooscut/render-engine/wasm/audio-engine/audio_engine.js";
import audioWasmUrl from "@tooscut/render-engine/wasm/audio-engine/audio_engine_bg.wasm?url";
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";
import { useCallback, useRef, useState } from "react";

import type { RenderFrameTask } from "../workers/frame-renderer.worker";

import { useAssetStore } from "../components/timeline/use-asset-store";
import { downloadAllSubsets, findNearestWeight } from "../lib/font-service";
import { FrameRendererPool } from "../lib/frame-renderer-pool";
import { buildLayersForTime, calculateSourceTime, getExportFrames } from "../lib/layer-builder";
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
  /** Number of parallel workers for rendering (default: optimal) */
  workerCount?: number;
}

export interface ExportProgress {
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
  /** Error message if stage is "error" */
  error?: string;
}

export interface ExportResult {
  /** The exported MP4 file as a Blob */
  blob: Blob;
  /** MIME type with codecs */
  mimeType: string;
  /** Duration in seconds */
  duration: number;
  /** File size in bytes */
  size: number;
  /** Time taken to render in seconds */
  renderTime: number;
}

export interface Mp4ExportHandle {
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
  const cores = navigator.hardwareConcurrency ?? 4;
  // Use 2/3 of available cores, minimum 2, maximum 8
  return Math.max(2, Math.min(8, Math.ceil((cores * 2) / 3)));
}

/**
 * Decode audio from a Blob into an AudioBuffer
 */
async function decodeAudioFromBlob(blob: Blob): Promise<AudioBuffer | null> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();

    try {
      return await audioContext.decodeAudioData(arrayBuffer);
    } finally {
      await audioContext.close();
    }
  } catch (error) {
    console.error("[MP4Export] Failed to decode audio:", error);
    return null;
  }
}

// ===================== EXPORT HOOK =====================

export function useMp4Export(): Mp4ExportHandle {
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const cancelledRef = useRef(false);
  const outputRef = useRef<Output | null>(null);
  const poolRef = useRef<FrameRendererPool | null>(null);

  const cancelExport = useCallback(() => {
    cancelledRef.current = true;
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
    const {
      width,
      height,
      frameRate,
      videoBitrate,
      audioBitrate = 128000,
      workerCount: requestedWorkers,
    } = options;

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
    const totalFrames = contentDuration;
    const workerCount = requestedWorkers ?? getOptimalWorkerCount();

    let pool: FrameRendererPool | null = null;

    try {
      const exportStartTime = Date.now();
      const frameDuration = 1 / frameRate;
      const evaluatorManager = new EvaluatorManager();

      setProgress({
        stage: "preparing",
        progress: 0,
        currentFrame: 0,
        totalFrames,
        elapsedTime: 0,
        estimatedTimeRemaining: null,
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

      setProgress((prev) =>
        prev
          ? {
              ...prev,
              progress: 10,
              elapsedTime: (Date.now() - exportStartTime) / 1000,
            }
          : null,
      );

      // Initialize worker pool
      pool = new FrameRendererPool({ workerCount, width, height });
      poolRef.current = pool;
      await pool.init();

      if (cancelledRef.current) {
        pool.dispose();
        throw new Error("Export cancelled");
      }

      // Load fonts into workers
      await fontStore.fetchCatalog();
      const textClips = clips.filter((c): c is TextClip => c.type === "text");
      if (textClips.length > 0) {
        // Collect unique font variants from text clips
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

          // Snap weight to nearest available
          const actualWeight = findNearestWeight(fontEntry.weights, font_weight);

          fontVariants.push({
            fontId: fontEntry.id,
            family: font_family,
            weight: actualWeight,
            italic: italic && fontEntry.styles.includes("italic"),
            subsets: fontEntry.subsets,
          });
        }

        // Download and load each font variant into workers
        for (const variant of fontVariants) {
          try {
            console.log(`[MP4Export] Loading font ${variant.family} (${variant.weight})`);
            const subsetResults = await downloadAllSubsets(
              variant.fontId,
              variant.weight,
              variant.italic,
              variant.subsets,
            );

            // Merge all subsets into one Uint8Array for the worker
            // Each subset is a complete TTF file, load them all
            for (const { subset, data } of subsetResults) {
              console.log(
                `[MP4Export] Loading font subset ${subset} (${data.byteLength} bytes) for ${variant.family}`,
              );
              await pool.loadFont(variant.family, data);
            }
          } catch (error) {
            console.error(`[MP4Export] Failed to load font ${variant.family}:`, error);
          }
        }
      }

      // Upload image textures to all workers
      for (const [assetId, bitmap] of imageBitmaps) {
        await pool.uploadBitmap(bitmap, assetId);
      }

      // For image clips involved in cross transitions, also upload under their clip ID
      // so the compositor can reference each clip's texture separately during cross-fades.
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

      setProgress((prev) =>
        prev
          ? {
              ...prev,
              progress: 20,
              elapsedTime: (Date.now() - exportStartTime) / 1000,
            }
          : null,
      );

      // Mix audio using WASM AudioEngine (preserves pitch during speed changes)
      const sampleRate = 48000;
      const audioClips = clips.filter((c) => c.type === "audio");
      let mixedAudio: AudioBuffer | null = null;

      if (audioClips.length > 0) {
        try {
          await initAudioWasm({ module_or_path: audioWasmUrl });
          const engine = new WasmAudioEngine(sampleRate);

          // Decode and upload audio sources
          const uploadedSources = new Set<string>();
          for (const clip of audioClips) {
            const sourceId = clip.assetId || clip.id;
            if (uploadedSources.has(sourceId)) continue;

            const asset = assetMap.get(sourceId);
            if (!asset?.file) continue;

            const audioBuffer = await decodeAudioFromBlob(asset.file);
            if (!audioBuffer) continue;

            // Convert AudioBuffer to interleaved stereo Float32Array
            const numFrames = audioBuffer.length;
            const pcmData = new Float32Array(numFrames * 2);
            const leftChannel = audioBuffer.getChannelData(0);
            const rightChannel =
              audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

            for (let i = 0; i < numFrames; i++) {
              pcmData[i * 2] = leftChannel[i];
              pcmData[i * 2 + 1] = rightChannel[i];
            }

            engine.upload_audio(sourceId, pcmData, audioBuffer.sampleRate, 2);
            uploadedSources.add(sourceId);
          }

          // Build timeline state matching WASM AudioTimelineState format
          const timelineClips = audioClips
            .filter((clip) => uploadedSources.has(clip.assetId || clip.id))
            .map((clip) => ({
              id: clip.id,
              sourceId: clip.assetId || clip.id,
              trackId: clip.trackId,
              startTime: framesToSeconds(clip.startTime, settings.fps),
              duration: framesToSeconds(clip.duration, settings.fps),
              inPoint: framesToSeconds(clip.inPoint, settings.fps),
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

          const timelineState: AudioTimelineState = {
            clips: timelineClips,
            tracks: audioTracks,
            crossTransitions: [],
          };

          engine.set_timeline(JSON.stringify(timelineState));
          engine.seek(0);
          engine.set_playing(true);

          // Render all audio in chunks
          const durationSeconds = framesToSeconds(contentDuration, settings.fps);
          const totalSamples = Math.ceil(durationSeconds * sampleRate);
          const fullOutput = new Float32Array(totalSamples * 2);
          const chunkSize = 4096;
          let rendered = 0;

          while (rendered < totalSamples) {
            const framesToRender = Math.min(chunkSize, totalSamples - rendered);
            const chunkBuffer = new Float32Array(framesToRender * 2);
            engine.render(chunkBuffer, framesToRender);
            fullOutput.set(chunkBuffer, rendered * 2);
            rendered += framesToRender;
          }

          engine.free();

          // Convert interleaved stereo to AudioBuffer for MediaBunny
          mixedAudio = new AudioBuffer({
            length: totalSamples,
            numberOfChannels: 2,
            sampleRate,
          });
          const left = mixedAudio.getChannelData(0);
          const right = mixedAudio.getChannelData(1);
          for (let i = 0; i < totalSamples; i++) {
            left[i] = fullOutput[i * 2];
            right[i] = fullOutput[i * 2 + 1];
          }
        } catch (error) {
          console.error("[MP4Export] WASM audio mixing failed:", error);
        }
      }

      if (cancelledRef.current) {
        pool.dispose();
        throw new Error("Export cancelled");
      }

      // Create encoding canvas
      const encodeCanvas = new OffscreenCanvas(width, height);
      const encodeCtx = encodeCanvas.getContext("2d")!;

      // Create MediaBunny output
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: new BufferTarget(),
      });
      outputRef.current = output;

      const videoSource = new CanvasSource(encodeCanvas, {
        codec: "avc",
        bitrate: videoBitrate ?? QUALITY_HIGH,
      });

      output.addVideoTrack(videoSource, { frameRate });

      let audioSource: AudioBufferSource | null = null;
      if (mixedAudio) {
        audioSource = new AudioBufferSource({
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

      setProgress({
        stage: "rendering",
        progress: 25,
        currentFrame: 0,
        totalFrames,
        elapsedTime: (Date.now() - exportStartTime) / 1000,
        estimatedTimeRemaining: null,
      });

      // Build frame tasks
      const exportFrames = getExportFrames(totalFrames);
      const frameTasks: RenderFrameTask[] = [];
      const exportFps = settings.fps;

      for (const { frameIndex } of exportFrames) {
        // Build render frame using layer-builder (timelineTime in frames)
        const { frame, visibleMediaClips, crossTransitionTextureMap } = buildLayersForTime({
          clips,
          tracks,
          crossTransitions,
          settings: { ...settings, width, height },
          timelineTime: frameIndex,
          evaluatorManager,
          includeMutedTracks: false,
        });

        // Build texture requests
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

        frameTasks.push({
          frameIndex,
          timelineFrame: frameIndex,
          frame,
          textureRequests,
        });
      }

      // Render frames in batches and encode
      const pendingFrames = new Map<
        number,
        { pixels: Uint8Array; width: number; height: number }
      >();
      let nextFrameToMux = 0;

      for await (const result of pool.renderFrames(frameTasks, (rendered, total) => {
        const overallProgress = 25 + Math.round((rendered / total) * 65);
        const elapsed = (Date.now() - exportStartTime) / 1000;
        const framesPerSecond = rendered / elapsed;
        const remainingFrames = total - rendered;
        const estimatedTimeRemaining =
          framesPerSecond > 0 ? remainingFrames / framesPerSecond : null;

        setProgress({
          stage: "rendering",
          progress: overallProgress,
          currentFrame: rendered,
          totalFrames,
          elapsedTime: elapsed,
          estimatedTimeRemaining,
        });
      })) {
        // Store frame result
        pendingFrames.set(result.frameIndex, {
          pixels: result.pixels,
          width: result.width,
          height: result.height,
        });

        // Mux frames in order
        while (pendingFrames.has(nextFrameToMux)) {
          const frameData = pendingFrames.get(nextFrameToMux)!;
          pendingFrames.delete(nextFrameToMux);

          // Create ImageData from pixels and draw to canvas
          const imageData = new ImageData(
            new Uint8ClampedArray(frameData.pixels),
            frameData.width,
            frameData.height,
          );
          encodeCtx.putImageData(imageData, 0, 0);

          const timestamp = nextFrameToMux * frameDuration;
          await videoSource.add(timestamp, frameDuration);
          nextFrameToMux++;
        }
      }

      // Close video source
      videoSource.close();

      // Add audio
      if (audioSource && mixedAudio) {
        setProgress((prev) =>
          prev
            ? {
                ...prev,
                stage: "encoding",
                progress: 92,
                elapsedTime: (Date.now() - exportStartTime) / 1000,
              }
            : null,
        );
        await audioSource.add(mixedAudio);
        audioSource.close();
      }

      // Finalize
      setProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: "finalizing",
              progress: 95,
              elapsedTime: (Date.now() - exportStartTime) / 1000,
            }
          : null,
      );

      await output.finalize();

      // Get result
      const target = output.target;
      const buffer = target.buffer;
      const mimeType = await output.getMimeType();

      if (!buffer) {
        throw new Error("Export failed: no output buffer");
      }

      // Clean up
      pool.dispose();
      poolRef.current = null;

      for (const bitmap of imageBitmaps.values()) {
        bitmap.close();
      }

      const blob = new Blob([buffer], { type: mimeType });
      const renderTime = (Date.now() - exportStartTime) / 1000;

      setProgress({
        stage: "complete",
        progress: 100,
        currentFrame: totalFrames,
        totalFrames,
        elapsedTime: renderTime,
        estimatedTimeRemaining: 0,
      });

      outputRef.current = null;

      return {
        blob,
        mimeType,
        duration: framesToSeconds(contentDuration, settings.fps),
        size: buffer.byteLength,
        renderTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Export failed";

      if (errorMessage !== "Export cancelled") {
        setProgress({
          stage: "error",
          progress: 0,
          currentFrame: 0,
          totalFrames,
          elapsedTime: 0,
          estimatedTimeRemaining: null,
          error: errorMessage,
        });
      }

      throw error;
    } finally {
      setIsExporting(false);
      if (pool) {
        pool.dispose();
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
