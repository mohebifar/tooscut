/**
 * Audio Engine - Browser integration for WASM audio mixer
 *
 * This module provides a high-level API for audio playback in the video editor.
 * It manages:
 * - AudioContext and AudioWorklet setup
 * - WASM module loading
 * - Windowed audio decode-ahead via MediaBunny (O(1) memory)
 * - Timeline state synchronization
 */

import { Input, ALL_FORMATS, BlobSource, AudioSampleSink, type AudioSample } from "mediabunny";
import type { KeyframeTracks } from "./types.js";

/**
 * 3-band parametric EQ parameters
 */
export interface AudioEqParams {
  /** Low shelf gain in dB (-24 to +24) */
  lowGain?: number;
  /** Mid peaking gain in dB (-24 to +24) */
  midGain?: number;
  /** High shelf gain in dB (-24 to +24) */
  highGain?: number;
  /** Low shelf frequency in Hz (default: 200) */
  lowFreq?: number;
  /** Mid peaking frequency in Hz (default: 1000) */
  midFreq?: number;
  /** High shelf frequency in Hz (default: 5000) */
  highFreq?: number;
}

/**
 * Dynamics compressor parameters
 */
export interface AudioCompressorParams {
  /** Threshold in dB (-60 to 0) */
  threshold?: number;
  /** Compression ratio (1:1 to 20:1) */
  ratio?: number;
  /** Attack time in milliseconds */
  attack?: number;
  /** Release time in milliseconds */
  release?: number;
  /** Makeup gain in dB */
  makeupGain?: number;
}

/**
 * Noise gate parameters
 */
export interface AudioNoiseGateParams {
  /** Threshold in dB (-80 to 0) */
  threshold?: number;
  /** Attack time in milliseconds (gate opening) */
  attack?: number;
  /** Release time in milliseconds (gate closing) */
  release?: number;
}

/**
 * Reverb parameters
 */
export interface AudioReverbParams {
  /** Room size (0.0 to 1.0) */
  roomSize?: number;
  /** Damping - high frequency absorption (0.0 to 1.0) */
  damping?: number;
  /** Stereo width (0.0 to 1.0) */
  width?: number;
  /** Dry/wet mix (0.0 = fully dry, 1.0 = fully wet) */
  dryWet?: number;
}

/**
 * Per-clip audio effects parameters
 *
 * Each effect is optional — only present effects are processed.
 */
export interface AudioEffectsParams {
  eq?: AudioEqParams;
  compressor?: AudioCompressorParams;
  noiseGate?: AudioNoiseGateParams;
  reverb?: AudioReverbParams;
}

/**
 * Audio clip state for the timeline
 */
export interface AudioClipState {
  id: string;
  sourceId: string;
  trackId: string;
  startTime: number;
  duration: number;
  inPoint: number;
  speed: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  keyframes?: KeyframeTracks;
  effects?: AudioEffectsParams;
}

/**
 * Audio track state
 */
export interface AudioTrackState {
  id: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

/**
 * Cross-transition for audio crossfades
 */
export interface AudioCrossTransition {
  id: string;
  outgoingClipId: string;
  incomingClipId: string;
  duration: number;
  easing: {
    preset: "Linear" | "EaseIn" | "EaseOut" | "EaseInOut" | "Custom";
    customBezier?: { x1: number; y1: number; x2: number; y2: number };
  };
}

/**
 * Full audio timeline state
 */
export interface AudioTimelineState {
  clips: AudioClipState[];
  tracks: AudioTrackState[];
  crossTransitions: AudioCrossTransition[];
}

/**
 * Configuration for the audio engine
 */
export interface AudioEngineConfig {
  /** Sample rate (default: 48000) */
  sampleRate?: number;
  /** Path to the audio worklet script (default: /audio-engine.worklet.js) */
  workletPath?: string;
  /** Path to the WASM binary (default: /wasm/audio-engine/audio_engine_bg.wasm) */
  wasmPath?: string;
  /** Maximum seconds of PCM to buffer per source in WASM (default: 30) */
  maxBufferSeconds?: number;
  /** Seconds of audio to decode ahead of playhead (default: 10) */
  prefetchAhead?: number;
  /** Seconds of audio to keep behind playhead (default: 2) */
  prefetchBehind?: number;
}

// --- Decode-ahead manager internals ---

/** Buffered time range */
interface BufferedRange {
  start: number;
  end: number;
}

/** Per-source decode state */
interface SourceDecodeState {
  sourceId: string;
  file: File | Blob;
  sampleRate: number;
  channels: number;
  duration: number;
  /** Ranges of source-time that have been sent to WASM */
  bufferedRanges: BufferedRange[];
  /** AbortController for current decode operation */
  decodeAbort: AbortController | null;
  /** Time range of the currently active decode */
  activeDecodeRange?: BufferedRange;
  /** Whether initial probe has completed */
  isReady: boolean;
}

/**
 * Interleave an AudioSample into a Float32Array.
 */
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

/**
 * Subtract buffered ranges from a desired range, returning unbuffered gaps.
 */
function subtractRanges(desired: BufferedRange, buffered: BufferedRange[]): BufferedRange[] {
  let gaps: BufferedRange[] = [{ start: desired.start, end: desired.end }];

  for (const buf of buffered) {
    const nextGaps: BufferedRange[] = [];
    for (const gap of gaps) {
      if (buf.end <= gap.start || buf.start >= gap.end) {
        // No overlap
        nextGaps.push(gap);
      } else {
        // Overlap: split gap around buffered region
        if (gap.start < buf.start) {
          nextGaps.push({ start: gap.start, end: buf.start });
        }
        if (gap.end > buf.end) {
          nextGaps.push({ start: buf.end, end: gap.end });
        }
      }
    }
    gaps = nextGaps;
  }

  return gaps;
}

/**
 * Audio Engine - manages audio playback via AudioWorklet + WASM
 */
export class BrowserAudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isReady = false;
  private config: Required<AudioEngineConfig>;

  // Decode-ahead state
  private sources = new Map<string, SourceDecodeState>();
  private currentClips: AudioClipState[] = [];
  private lastPlayheadTime = 0;

  constructor(config: AudioEngineConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate ?? 48000,
      workletPath: config.workletPath ?? "/audio-engine.worklet.js",
      wasmPath: config.wasmPath ?? "/wasm/audio-engine/audio_engine_bg.wasm",
      maxBufferSeconds: config.maxBufferSeconds ?? 30,
      prefetchAhead: config.prefetchAhead ?? 10,
      prefetchBehind: config.prefetchBehind ?? 2,
    };
  }

  /**
   * Initialize the audio engine
   */
  async init(): Promise<void> {
    if (this.isReady) return;

    // Create AudioContext
    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
    });

    // Load the worklet module
    await this.audioContext.audioWorklet.addModule(this.config.workletPath);

    // Guard: audioContext may have been disposed/closed during the async gap (React Strict Mode)
    if (!this.audioContext || (this.audioContext.state as string) === "closed") {
      throw new Error("AudioContext was closed during initialization");
    }

    // Create the worklet node with stereo output
    this.workletNode = new AudioWorkletNode(this.audioContext, "audio-engine-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2], // Stereo output
    });

    // Connect to destination
    this.workletNode.connect(this.audioContext.destination);

    // Set up message handling
    this.workletNode.port.onmessage = this.handleWorkletMessage.bind(this);

    // Wait for worklet to signal it's ready to receive messages
    await new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === "worklet-ready") {
          this.workletNode!.port.removeEventListener("message", handler);
          resolve();
        }
      };
      this.workletNode!.port.addEventListener("message", handler);
    });

    // Guard again after second async gap
    if (!this.audioContext || (this.audioContext.state as string) === "closed") {
      throw new Error("AudioContext was closed during initialization");
    }

    // Fetch WASM binary and send to worklet
    const wasmResponse = await fetch(this.config.wasmPath);
    const wasmBinary = await wasmResponse.arrayBuffer();

    // Guard again after fetch
    if (!this.workletNode) {
      throw new Error("Audio engine was disposed during initialization");
    }

    // Initialize the worklet with WASM binary
    this.workletNode.port.postMessage(
      {
        type: "init",
        wasmBinary,
        sampleRate: this.config.sampleRate,
      },
      [wasmBinary],
    );

    // Wait for ready signal
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Audio engine initialization timeout"));
      }, 10000);

      const handler = (event: MessageEvent) => {
        if (event.data.type === "ready") {
          clearTimeout(timeout);
          this.workletNode!.port.removeEventListener("message", handler);
          resolve();
        } else if (event.data.type === "error") {
          clearTimeout(timeout);
          this.workletNode!.port.removeEventListener("message", handler);
          reject(new Error(event.data.message));
        }
      };

      this.workletNode!.port.addEventListener("message", handler);
    });

    this.isReady = true;
  }

  /**
   * Handle messages from the worklet
   */
  private handleWorkletMessage(event: MessageEvent): void {
    const { type } = event.data;

    switch (type) {
      case "time-update":
        this.lastPlayheadTime = event.data.time as number;
        this.prefetchForPlayhead(this.lastPlayheadTime);
        break;
      case "error":
        console.error("[AudioEngine] Worklet error:", event.data.message);
        break;
    }
  }

  /**
   * Resume audio context (required after user interaction)
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /**
   * Suspend audio context
   */
  async suspend(): Promise<void> {
    if (this.audioContext?.state === "running") {
      await this.audioContext.suspend();
    }
  }

  // --- Windowed audio source management ---

  /**
   * Register an audio source for windowed decode-ahead playback.
   *
   * Probes the file for codec metadata, creates a windowed source in WASM,
   * and begins initial prefetch from the start of the file.
   *
   * @param sourceId - Unique identifier for this audio source (asset ID)
   * @param file - The original compressed audio/video file
   */
  async registerAudioSource(sourceId: string, file: File | Blob): Promise<void> {
    if (!this.isReady || !this.workletNode) {
      throw new Error("Audio engine not initialized");
    }

    // Already registered
    if (this.sources.has(sourceId)) return;

    // Probe the file for metadata
    const source = new BlobSource(file);
    const input = new Input({ formats: ALL_FORMATS, source });

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack || !(await audioTrack.canDecode())) {
      console.warn(`[AudioEngine] No decodable audio track in source ${sourceId}`);
      return;
    }

    const sampleRate = audioTrack.sampleRate;
    const channels = audioTrack.numberOfChannels;
    const duration = (await input.computeDuration()) ?? 0;

    if (duration <= 0) {
      console.warn(`[AudioEngine] Cannot determine duration for source ${sourceId}`);
      return;
    }

    // Create windowed source in WASM
    this.workletNode.port.postMessage({
      type: "create-windowed-source",
      sourceId,
      sampleRate,
      channels,
      duration,
      maxBufferSeconds: this.config.maxBufferSeconds,
    });

    const state: SourceDecodeState = {
      sourceId,
      file,
      sampleRate,
      channels,
      duration,
      bufferedRanges: [],
      decodeAbort: null,
      isReady: true,
    };

    this.sources.set(sourceId, state);

    // Start initial prefetch from time 0
    this.prefetchSource(state, 0);
  }

  /**
   * Prefetch audio data for all sources based on the current playhead position.
   */
  private prefetchForPlayhead(playheadTime: number): void {
    // Group clips by source
    const sourceClips = new Map<string, AudioClipState[]>();
    for (const clip of this.currentClips) {
      const existing = sourceClips.get(clip.sourceId);
      if (existing) {
        existing.push(clip);
      } else {
        sourceClips.set(clip.sourceId, [clip]);
      }
    }

    for (const [sourceId, state] of this.sources) {
      if (!state.isReady) continue;

      const clips = sourceClips.get(sourceId);

      if (!clips || clips.length === 0) {
        // No clip info yet — prefetch a window around the playhead as a best-effort
        // This covers the case where registerAudioSource runs before setTimeline
        const desiredStart = Math.max(0, playheadTime - this.config.prefetchBehind);
        const desiredEnd = Math.min(state.duration, playheadTime + this.config.prefetchAhead);
        if (desiredEnd <= desiredStart) continue;

        const gaps = subtractRanges({ start: desiredStart, end: desiredEnd }, state.bufferedRanges);
        if (gaps.length > 0) {
          const decodeEnd = Math.min(state.duration, gaps[0].start + this.config.prefetchAhead);
          this.prefetchSource(state, gaps[0].start, decodeEnd);
        }
        continue;
      }

      // Find the source-time ranges needed for each active clip
      for (const clip of clips) {
        // Is this clip active or about to be active?
        const clipEnd = clip.startTime + clip.duration;
        if (playheadTime > clipEnd + this.config.prefetchBehind) continue;
        if (playheadTime < clip.startTime - this.config.prefetchAhead) continue;

        // Calculate source-time for the current playhead position
        const sourceTime = clip.inPoint + (playheadTime - clip.startTime) * clip.speed;
        const sourceAhead = this.config.prefetchAhead * clip.speed;
        const sourceBehind = this.config.prefetchBehind * clip.speed;

        const desiredStart = Math.max(0, sourceTime - sourceBehind);
        const desiredEnd = Math.min(state.duration, sourceTime + sourceAhead);

        if (desiredEnd <= desiredStart) continue;

        // Check what's already buffered
        const gaps = subtractRanges({ start: desiredStart, end: desiredEnd }, state.bufferedRanges);

        if (gaps.length === 0) continue;

        // Always decode a full prefetchAhead window from the gap start,
        // not just the tiny gap. Avoids spawning a new decode session
        // every 100ms for tiny 0.1s slices.
        const decodeEnd = Math.min(
          state.duration,
          gaps[0].start + this.config.prefetchAhead * clip.speed,
        );
        this.prefetchSource(state, gaps[0].start, decodeEnd);
      }
    }
  }

  /**
   * Decode and send a range of audio from a source file to the WASM buffer.
   * Skips if there's already an active decode whose range overlaps with the requested range.
   * This prevents constant abort-restart cycles from time-update driven prefetching.
   */
  private prefetchSource(state: SourceDecodeState, fromTime: number, toTime?: number): void {
    const targetEnd = toTime ?? Math.min(fromTime + this.config.prefetchAhead, state.duration);

    // Skip if an active decode is already running and its range overlaps with what we need.
    // The active decode will eventually cover the gap as it progresses sequentially.
    if (state.decodeAbort && !state.decodeAbort.signal.aborted && state.activeDecodeRange) {
      const active = state.activeDecodeRange;
      // Active decode overlaps or will reach the requested range
      if (active.end >= fromTime && active.start <= targetEnd) {
        return;
      }
    }

    // Abort any existing decode for this source
    if (state.decodeAbort) {
      state.decodeAbort.abort();
    }

    const abortController = new AbortController();
    state.decodeAbort = abortController;
    state.activeDecodeRange = { start: fromTime, end: targetEnd };

    void this.decodeRange(state, fromTime, targetEnd, abortController.signal)
      .catch((err) => {
        if (!abortController.signal.aborted) {
          console.error(`[AudioEngine] Decode failed for ${state.sourceId}:`, err);
        }
      })
      .finally(() => {
        // Clear active range if this is still the current decode
        if (state.decodeAbort === abortController) {
          state.decodeAbort = null;
          state.activeDecodeRange = undefined;
        }
      });
  }

  /**
   * Decode a specific time range from a source file and send to WASM.
   */
  private async decodeRange(
    state: SourceDecodeState,
    fromTime: number,
    toTime: number,
    signal: AbortSignal,
  ): Promise<void> {
    const source = new BlobSource(state.file);
    const input = new Input({ formats: ALL_FORMATS, source });

    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack || !(await audioTrack.canDecode())) return;

    const sink = new AudioSampleSink(audioTrack);

    // Use startTimestamp/endTimestamp to seek directly to the range
    for await (const sample of sink.samples(fromTime, toTime)) {
      if (signal.aborted) break;

      const sampleTimestamp = sample.timestamp;
      const pcmData = interleaveAudioSample(sample);
      const chunkDuration = sample.numberOfFrames / state.sampleRate;

      sample.close();

      // Send to WASM worklet
      const buffer = pcmData.buffer as ArrayBuffer;
      this.workletNode!.port.postMessage(
        {
          type: "update-source-buffer",
          sourceId: state.sourceId,
          startTime: sampleTimestamp,
          pcmData: new Float32Array(buffer),
        },
        [buffer],
      );

      // Track buffered range
      this.addBufferedRange(state, sampleTimestamp, sampleTimestamp + chunkDuration);
    }
  }

  /**
   * Add a buffered range and merge overlapping/adjacent ranges.
   */
  private addBufferedRange(state: SourceDecodeState, start: number, end: number): void {
    // Fast path: merge with last range if contiguous (sequential decode)
    const last = state.bufferedRanges[state.bufferedRanges.length - 1];
    if (last && start <= last.end + 0.001 && start >= last.start) {
      last.end = Math.max(last.end, end);
      return;
    }

    // General path: insert, sort, and merge
    state.bufferedRanges.push({ start, end });
    state.bufferedRanges.sort((a, b) => a.start - b.start);
    const merged: BufferedRange[] = [];
    for (const range of state.bufferedRanges) {
      const prev = merged[merged.length - 1];
      if (prev && range.start <= prev.end + 0.001) {
        prev.end = Math.max(prev.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }
    state.bufferedRanges = merged;
  }

  /**
   * Handle seek: reset buffered ranges (WASM may evict old data),
   * abort decodes that don't cover the new position, and re-prefetch.
   */
  private onSeek(time: number): void {
    for (const [, state] of this.sources) {
      if (!state.isReady) continue;

      // Reset JS-side buffered ranges — WASM manages its own eviction,
      // so our tracking may be stale after a seek. This forces re-evaluation
      // of what needs to be decoded.
      state.bufferedRanges = [];

      // Only abort if the active decode doesn't cover the new position
      if (state.decodeAbort && state.activeDecodeRange) {
        const active = state.activeDecodeRange;
        if (time >= active.start && time <= active.end) {
          continue; // Active decode covers the seek target, keep it
        }
      }

      // Abort and restart from new position
      if (state.decodeAbort) {
        state.decodeAbort.abort();
        state.decodeAbort = null;
        state.activeDecodeRange = undefined;
      }
    }

    // Prefetch from the new position
    this.prefetchForPlayhead(time);
  }

  // --- Public API ---

  /**
   * Remove audio source
   */
  removeAudio(sourceId: string): void {
    if (!this.workletNode) return;

    const state = this.sources.get(sourceId);
    if (state) {
      if (state.decodeAbort) {
        state.decodeAbort.abort();
      }
      this.sources.delete(sourceId);
    }

    this.workletNode.port.postMessage({
      type: "remove-audio",
      sourceId,
    });
  }

  /**
   * Update the timeline state
   */
  setTimeline(state: AudioTimelineState): void {
    if (!this.workletNode) return;

    this.currentClips = state.clips;

    this.workletNode.port.postMessage({
      type: "set-timeline",
      timelineJson: JSON.stringify(state),
    });
  }

  /**
   * Set playback state
   */
  setPlaying(playing: boolean): void {
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: "set-playing",
      playing,
    });
  }

  /**
   * Seek to a specific time
   */
  seek(time: number): void {
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: "seek",
      time,
    });

    // Clear and re-prefetch windowed sources
    this.onSeek(time);
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    if (!this.workletNode) return;

    this.workletNode.port.postMessage({
      type: "set-master-volume",
      volume: Math.max(0, Math.min(1, volume)),
    });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    // Abort all decode-ahead operations
    for (const state of this.sources.values()) {
      if (state.decodeAbort) {
        state.decodeAbort.abort();
      }
    }
    this.sources.clear();
    this.isReady = false;
  }

  /**
   * Check if the engine is ready
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Get the audio context (for advanced use)
   */
  get context(): AudioContext | null {
    return this.audioContext;
  }
}
