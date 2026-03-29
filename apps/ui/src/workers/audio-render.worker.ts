/// <reference lib="webworker" />

/**
 * Audio Render Worker
 *
 * Runs the WASM audio engine in an isolated worker. Uses windowed sources
 * (same as preview) to keep memory bounded — only ~30s of decoded PCM per
 * source is held in WASM at any time, regardless of video length.
 *
 * For each 10-second timeline window the worker:
 * 1. Computes which source regions the active clips need
 * 2. Decodes those regions via MediaBunny (seeking directly to the range)
 * 3. Feeds decoded PCM to the WASM engine via update_source_buffer
 * 4. Renders the window and streams 1-second chunks to the main thread
 */

import initAudioWasm, {
  AudioEngine as WasmAudioEngine,
} from "@tooscut/render-engine/wasm/audio-engine/audio_engine.js";
import audioWasmUrl from "@tooscut/render-engine/wasm/audio-engine/audio_engine_bg.wasm?url";
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, type AudioSample } from "mediabunny";

// ===================== TYPES =====================

export interface AudioRenderStartRequest {
  type: "render";
  /** Audio source files keyed by sourceId */
  sources: Array<{
    sourceId: string;
    blob: Blob;
  }>;
  /** JSON-serialized AudioTimelineState */
  timelineStateJson: string;
  /** Total samples to render */
  totalSamples: number;
  /** Sample rate */
  sampleRate: number;
}

export interface AudioRenderAckMessage {
  type: "ack";
}

export interface AudioRenderCancelMessage {
  type: "cancel";
}

export interface AudioChunkMessage {
  type: "chunk";
  /** Interleaved stereo PCM data */
  pcm: Float32Array;
  /** Presentation timestamp in seconds */
  timestamp: number;
  /** Sample rate */
  sampleRate: number;
}

export interface AudioDoneMessage {
  type: "done";
}

export interface AudioErrorMessage {
  type: "error";
  message: string;
}

export type AudioRenderRequest =
  | AudioRenderStartRequest
  | AudioRenderAckMessage
  | AudioRenderCancelMessage;

export type AudioRenderMessage = AudioChunkMessage | AudioDoneMessage | AudioErrorMessage;

// ===================== CONSTANTS =====================

/** Timeline window size in seconds — decode + render this much at a time */
const WINDOW_SECONDS = 10;
/** Max WASM buffer per source in seconds (matches preview default) */
const MAX_BUFFER_SECONDS = 30;
/** Small padding around source regions for interpolation */
const SOURCE_PADDING = 0.1;

// ===================== UTILITIES =====================

function interleaveAudioSample(sample: AudioSample): Float32Array {
  const numberOfChannels = sample.numberOfChannels;
  const numberOfFrames = sample.numberOfFrames;

  if (numberOfChannels === 1) {
    const bytesNeeded = sample.allocationSize({ format: "f32", planeIndex: 0 });
    const pcmData = new Float32Array(bytesNeeded / 4);
    sample.copyTo(pcmData, { format: "f32", planeIndex: 0 });
    return pcmData;
  }

  const channelBuffers: Float32Array[] = [];
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const bytesNeeded = sample.allocationSize({ format: "f32-planar", planeIndex: ch });
    const channelData = new Float32Array(bytesNeeded / 4);
    sample.copyTo(channelData, { format: "f32-planar", planeIndex: ch });
    channelBuffers.push(channelData);
  }

  const pcmData = new Float32Array(numberOfFrames * numberOfChannels);
  for (let i = 0; i < numberOfFrames; i++) {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      pcmData[i * numberOfChannels + ch] = channelBuffers[ch][i];
    }
  }
  return pcmData;
}

interface ClipInfo {
  sourceId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  speed: number;
}

interface SourceInfo {
  sourceId: string;
  blob: Blob;
  duration: number;
  /** Ranges already decoded and in the WASM buffer */
  bufferedRanges: Array<{ start: number; end: number }>;
}

/**
 * Compute which source-time regions are needed for a timeline window.
 * Returns a map of sourceId → {from, to} in source-time seconds.
 */
function getNeededSourceRegions(
  clips: ClipInfo[],
  sources: Map<string, SourceInfo>,
  windowStart: number,
  windowEnd: number,
): Map<string, { from: number; to: number }> {
  const regions = new Map<string, { from: number; to: number }>();

  for (const clip of clips) {
    const clipEnd = clip.startTime + clip.duration;
    // Skip clips that don't overlap this window
    if (clip.startTime >= windowEnd || clipEnd <= windowStart) continue;

    const overlapStart = Math.max(windowStart, clip.startTime);
    const overlapEnd = Math.min(windowEnd, clipEnd);

    const sourceFrom = clip.inPoint + (overlapStart - clip.startTime) * clip.speed - SOURCE_PADDING;
    const sourceTo = clip.inPoint + (overlapEnd - clip.startTime) * clip.speed + SOURCE_PADDING;

    const source = sources.get(clip.sourceId);
    const sourceDuration = source?.duration ?? Infinity;
    const clampedFrom = Math.max(0, sourceFrom);
    const clampedTo = Math.min(sourceDuration, sourceTo);

    const existing = regions.get(clip.sourceId);
    if (existing) {
      existing.from = Math.min(existing.from, clampedFrom);
      existing.to = Math.max(existing.to, clampedTo);
    } else {
      regions.set(clip.sourceId, { from: clampedFrom, to: clampedTo });
    }
  }

  return regions;
}

/**
 * Check if a time range is already covered by buffered ranges.
 */
function isRangeCovered(
  bufferedRanges: Array<{ start: number; end: number }>,
  from: number,
  to: number,
): boolean {
  for (const range of bufferedRanges) {
    if (range.start <= from + 0.001 && range.end >= to - 0.001) {
      return true;
    }
  }
  return false;
}

/**
 * Add a range to buffered ranges, merging overlapping/adjacent entries.
 */
function addBufferedRange(
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number,
): void {
  // Fast path: merge with last range if contiguous
  const last = ranges[ranges.length - 1];
  if (last && start <= last.end + 0.01 && start >= last.start) {
    last.end = Math.max(last.end, end);
    return;
  }

  ranges.push({ start, end });
  ranges.sort((a, b) => a.start - b.start);

  // Merge overlapping
  let i = 0;
  while (i < ranges.length - 1) {
    if (ranges[i].end >= ranges[i + 1].start - 0.01) {
      ranges[i].end = Math.max(ranges[i].end, ranges[i + 1].end);
      ranges.splice(i + 1, 1);
    } else {
      i++;
    }
  }
}

// ===================== WORKER =====================

let cancelled = false;
let ackWaiter: (() => void) | null = null;

function waitForAck(): Promise<void> {
  if (cancelled) {
    return Promise.reject(new Error("Audio render cancelled"));
  }

  return new Promise<void>((resolve) => {
    ackWaiter = resolve;
  });
}

self.onmessage = async (event: MessageEvent<AudioRenderRequest>) => {
  if (event.data.type === "ack") {
    const resolve = ackWaiter;
    ackWaiter = null;
    resolve?.();
    return;
  }

  if (event.data.type === "cancel") {
    cancelled = true;
    const resolve = ackWaiter;
    ackWaiter = null;
    resolve?.();
    return;
  }

  const { sources, timelineStateJson, totalSamples, sampleRate } = event.data;
  cancelled = false;

  try {
    await initAudioWasm({ module_or_path: audioWasmUrl });
    const engine = new WasmAudioEngine(sampleRate);

    // Parse clip data from timeline state for source region computation
    const timelineState = JSON.parse(timelineStateJson) as {
      clips: Array<{
        id: string;
        sourceId: string;
        startTime: number;
        duration: number;
        inPoint: number;
        speed: number;
      }>;
    };
    const clips: ClipInfo[] = timelineState.clips.map((c) => ({
      sourceId: c.sourceId,
      startTime: c.startTime,
      duration: c.duration,
      inPoint: c.inPoint,
      speed: c.speed,
    }));

    // Probe sources and create windowed sources in WASM
    const sourceMap = new Map<string, SourceInfo>();
    let uploadedSourceCount = 0;

    for (const { sourceId, blob } of sources) {
      if (cancelled) throw new Error("Audio render cancelled");

      try {
        const input = new Input({
          formats: ALL_FORMATS,
          source: new BlobSource(blob),
        });
        const audioTrack = await input.getPrimaryAudioTrack();
        if (!audioTrack || !(await audioTrack.canDecode())) {
          console.warn(`[AudioRenderWorker] No decodable audio track for ${sourceId}`);
          continue;
        }

        const sourceSampleRate = audioTrack.sampleRate ?? sampleRate;
        const channels = audioTrack.numberOfChannels;
        const duration = (await input.computeDuration()) ?? 0;

        engine.create_windowed_source(
          sourceId,
          sourceSampleRate,
          channels,
          duration,
          MAX_BUFFER_SECONDS,
        );
        uploadedSourceCount++;

        sourceMap.set(sourceId, {
          sourceId,
          blob,
          duration,
          bufferedRanges: [],
        });
      } catch (error) {
        console.error(`[AudioRenderWorker] Failed to probe source ${sourceId}:`, error);
      }
    }

    if (sources.length > 0 && uploadedSourceCount === 0) {
      throw new Error("No decodable audio sources found");
    }

    engine.set_timeline(timelineStateJson);
    engine.seek(0);
    engine.set_playing(true);

    const totalDurationSeconds = totalSamples / sampleRate;
    const renderChunkSize = 4096;
    let rendered = 0;

    // Process timeline in windows: decode needed source regions, then render
    for (let windowStart = 0; windowStart < totalDurationSeconds; windowStart += WINDOW_SECONDS) {
      if (cancelled) throw new Error("Audio render cancelled");

      const windowEnd = Math.min(windowStart + WINDOW_SECONDS, totalDurationSeconds);

      // Phase A: Decode source regions needed for this window
      const neededRegions = getNeededSourceRegions(clips, sourceMap, windowStart, windowEnd);

      for (const [sourceId, { from, to }] of neededRegions) {
        const source = sourceMap.get(sourceId);
        if (!source) continue;

        // Skip if already buffered
        if (isRangeCovered(source.bufferedRanges, from, to)) continue;

        // Decode the needed range
        const input = new Input({
          formats: ALL_FORMATS,
          source: new BlobSource(source.blob),
        });
        const audioTrack = await input.getPrimaryAudioTrack();
        if (!audioTrack || !(await audioTrack.canDecode())) continue;

        const sink = new AudioSampleSink(audioTrack);

        for await (const sample of sink.samples(from, to)) {
          if (cancelled) {
            sample.close();
            throw new Error("Audio render cancelled");
          }

          const sampleTimestamp = sample.timestamp;
          const chunkDuration = sample.numberOfFrames / sampleRate;
          const pcmData = interleaveAudioSample(sample);
          sample.close();

          engine.update_source_buffer(sourceId, sampleTimestamp, pcmData);
          addBufferedRange(source.bufferedRanges, sampleTimestamp, sampleTimestamp + chunkDuration);
        }
      }

      // Phase B: Render this window in 1-second sub-chunks
      const windowEndSample = Math.min(Math.ceil(windowEnd * sampleRate), totalSamples);

      while (rendered < windowEndSample) {
        if (cancelled) throw new Error("Audio render cancelled");

        const samplesThisChunk = Math.min(sampleRate, windowEndSample - rendered);
        const interleaved = new Float32Array(samplesThisChunk * 2);
        let offset = 0;

        while (offset < samplesThisChunk) {
          const toRender = Math.min(renderChunkSize, samplesThisChunk - offset);
          const buf = new Float32Array(toRender * 2);
          engine.render(buf, toRender);
          interleaved.set(buf, offset * 2);
          offset += toRender;
        }

        const msg: AudioChunkMessage = {
          type: "chunk",
          pcm: interleaved,
          timestamp: rendered / sampleRate,
          sampleRate,
        };
        self.postMessage(msg, [interleaved.buffer]);
        await waitForAck();

        rendered += samplesThisChunk;
      }
    }

    engine.free();

    const doneMsg: AudioDoneMessage = { type: "done" };
    self.postMessage(doneMsg);
  } catch (error) {
    if (error instanceof Error && error.message === "Audio render cancelled") {
      return;
    }

    const errMsg: AudioErrorMessage = {
      type: "error",
      message: error instanceof Error ? error.message : "Audio render failed",
    };
    self.postMessage(errMsg);
  }
};
