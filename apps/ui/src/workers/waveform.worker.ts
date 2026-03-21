/**
 * Web Worker for extracting audio waveform data using MediaBunny.
 * Runs off the main thread for better performance.
 */

import * as Comlink from "comlink";
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";

export interface WaveformResult {
  assetId: string;
  waveformData: number[];
  duration: number;
}

/**
 * Copy the first channel of an AudioData into a Float32Array normalized to [-1, 1].
 *
 * For interleaved formats (s16, s32, f32, u8) copyTo writes all channels interleaved,
 * so the destination must hold frames * numberOfChannels elements and we stride by
 * numberOfChannels to extract just channel 0.
 *
 * For planar formats (s16-planar, etc.) planeIndex: 0 gives exactly `frames` elements
 * for just the first channel.
 */
function copyAudioDataAsFloat(audioData: AudioData): Float32Array {
  const format = audioData.format;
  const frames = audioData.numberOfFrames;
  const channels = audioData.numberOfChannels;
  const isPlanar = format?.endsWith("-planar") ?? false;

  // For planar formats, planeIndex:0 gives `frames` samples for channel 0.
  // For interleaved formats, planeIndex:0 gives `frames * channels` interleaved samples.
  const copySize = isPlanar ? frames : frames * channels;
  const stride = isPlanar ? 1 : channels;

  const result = new Float32Array(frames);

  if (format === "f32" || format === "f32-planar") {
    const raw = new Float32Array(copySize);
    audioData.copyTo(raw, { planeIndex: 0 });
    for (let i = 0; i < frames; i++) {
      result[i] = raw[i * stride];
    }
    return result;
  }

  if (format === "s16" || format === "s16-planar") {
    const raw = new Int16Array(copySize);
    audioData.copyTo(raw, { planeIndex: 0 });
    for (let i = 0; i < frames; i++) {
      result[i] = raw[i * stride] / 32768;
    }
    return result;
  }

  if (format === "s32" || format === "s32-planar") {
    const raw = new Int32Array(copySize);
    audioData.copyTo(raw, { planeIndex: 0 });
    for (let i = 0; i < frames; i++) {
      result[i] = raw[i * stride] / 2147483648;
    }
    return result;
  }

  if (format === "u8" || format === "u8-planar") {
    const raw = new Uint8Array(copySize);
    audioData.copyTo(raw, { planeIndex: 0 });
    for (let i = 0; i < frames; i++) {
      result[i] = (raw[i * stride] - 128) / 128;
    }
    return result;
  }

  // Fallback: try f32 and hope for the best
  console.warn(`[WaveformWorker] Unknown audio format "${format}", falling back to f32`);
  const raw = new Float32Array(copySize);
  audioData.copyTo(raw, { planeIndex: 0 });
  for (let i = 0; i < frames; i++) {
    result[i] = raw[i * stride];
  }
  return result;
}

// Samples per second of audio - determines waveform resolution
// 30 samples/sec provides good visual density at typical zoom levels
const SAMPLES_PER_SECOND = 30;

// Cache inputs to avoid re-parsing
// Key format: "assetId:url" to invalidate when URL changes (e.g., blob URL refresh)
const inputCache = new Map<string, Input>();

function getInputCacheKey(assetId: string, url: string): string {
  return `${assetId}:${url}`;
}

function clearCacheForAsset(assetId: string): void {
  for (const key of inputCache.keys()) {
    if (key.startsWith(`${assetId}:`)) {
      inputCache.delete(key);
    }
  }
}

async function getOrCreateInput(assetId: string, url: string): Promise<Input | null> {
  const cacheKey = getInputCacheKey(assetId, url);

  if (inputCache.has(cacheKey)) {
    return inputCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(url);
    const blob = await response.blob();

    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(blob),
    });

    inputCache.set(cacheKey, input);
    return input;
  } catch (error) {
    console.error("[WaveformWorker] Failed to create input:", error);
    clearCacheForAsset(assetId);
    return null;
  }
}

const workerApi = {
  /**
   * Extract waveform data from an audio/video file.
   * Returns normalized RMS values (0-1) for visualization.
   *
   * The number of samples is calculated based on the audio duration
   * using SAMPLES_PER_SECOND to ensure consistent visual density
   * regardless of clip length.
   */
  async extractWaveform(assetId: string, url: string): Promise<WaveformResult | null> {
    const input = await getOrCreateInput(assetId, url);
    if (!input) return null;

    try {
      const audioTrack = await input.getPrimaryAudioTrack();
      if (!audioTrack) {
        return null;
      }

      const canDecode = await audioTrack.canDecode();
      if (!canDecode) {
        return null;
      }

      const duration = (await input.computeDuration()) ?? 0;

      const targetSamples = Math.max(100, Math.ceil(duration * SAMPLES_PER_SECOND));

      const sink = new AudioSampleSink(audioTrack);

      const sampleRate = audioTrack.sampleRate ?? 48000;
      const totalSamples = sampleRate * duration;
      const samplesPerBar = Math.max(1, Math.floor(totalSamples / targetSamples));

      const waveformData: number[] = [];
      let currentBarSamples: number[] = [];

      for await (const sample of sink.samples()) {
        const audioData = sample.toAudioData();
        if (!audioData) {
          sample.close();
          continue;
        }

        // Read raw bytes and convert to normalized float [-1, 1] based on actual format
        const floats = copyAudioDataAsFloat(audioData);

        for (let i = 0; i < floats.length; i++) {
          const absVal = Math.abs(floats[i]);
          currentBarSamples.push(absVal);

          if (currentBarSamples.length >= samplesPerBar) {
            const rms = Math.sqrt(
              currentBarSamples.reduce((sum, v) => sum + v * v, 0) / currentBarSamples.length,
            );
            waveformData.push(rms);
            currentBarSamples = [];
          }
        }

        audioData.close();
        sample.close();

        if (waveformData.length >= targetSamples) break;
      }

      // Handle remaining samples
      if (currentBarSamples.length > 0) {
        const rms = Math.sqrt(
          currentBarSamples.reduce((sum, v) => sum + v * v, 0) / currentBarSamples.length,
        );
        waveformData.push(rms);
      }

      // Normalize to 0-1 range (loop instead of spread to avoid stack overflow on long audio)
      let maxRms = 0.001;
      for (let i = 0; i < waveformData.length; i++) {
        if (waveformData[i] > maxRms) maxRms = waveformData[i];
      }
      const normalizedData = waveformData.map((v) => Math.min(1, v / maxRms));

      return {
        assetId,
        waveformData: normalizedData,
        duration,
      };
    } catch (error) {
      console.error("[WaveformWorker] Failed to extract waveform:", error);
      clearCacheForAsset(assetId);
      return null;
    }
  },

  /**
   * Clear cached inputs for an asset.
   */
  clearCache(assetId?: string) {
    if (assetId) {
      clearCacheForAsset(assetId);
    } else {
      inputCache.clear();
    }
  },
};

export type WaveformWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
