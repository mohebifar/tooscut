/**
 * Audio Engine - Browser integration for WASM audio mixer
 *
 * This module provides a high-level API for audio playback in the video editor.
 * It manages:
 * - AudioContext and AudioWorklet setup
 * - WASM module loading
 * - Streaming audio decode via MediaBunny
 * - Timeline state synchronization
 */

import { Input, ALL_FORMATS, UrlSource, BlobSource, AudioSampleSink } from "mediabunny";
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
}

/**
 * Audio Engine - manages audio playback via AudioWorklet + WASM
 */
export class BrowserAudioEngine {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private isReady = false;
  private config: Required<AudioEngineConfig>;

  // Track active streaming operations to avoid duplicates
  private activeStreams = new Map<string, AbortController>();
  // Track sources that have been fully streamed
  private streamedSources = new Set<string>();

  constructor(config: AudioEngineConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate ?? 48000,
      workletPath: config.workletPath ?? "/audio-engine.worklet.js",
      wasmPath: config.wasmPath ?? "/wasm/audio-engine/audio_engine_bg.wasm",
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

    // Fetch WASM binary and send to worklet
    const wasmResponse = await fetch(this.config.wasmPath);
    const wasmBinary = await wasmResponse.arrayBuffer();

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
        // Could emit an event or callback here
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

  /**
   * Decode and upload audio from a URL using streaming decode
   *
   * Uses MediaBunny to decode audio incrementally, sending PCM chunks
   * to the WASM engine as they become available. Audio is playable
   * immediately (silence for regions not yet decoded).
   *
   * @param sourceId - Unique identifier for this audio source
   * @param url - URL to fetch audio from
   */
  async uploadAudioFromUrl(sourceId: string, url: string): Promise<void> {
    return this.streamAudioFromUrl(sourceId, url);
  }

  /**
   * Stream-decode audio from a URL and upload PCM chunks incrementally
   *
   * @param sourceId - Unique identifier for this audio source
   * @param url - URL to fetch audio from
   */
  async streamAudioFromUrl(sourceId: string, url: string): Promise<void> {
    if (!this.isReady || !this.workletNode) {
      throw new Error("Audio engine not initialized");
    }

    // Already fully streamed
    if (this.streamedSources.has(sourceId)) return;

    // Already streaming
    if (this.activeStreams.has(sourceId)) return;

    const abortController = new AbortController();
    this.activeStreams.set(sourceId, abortController);

    try {
      // Use BlobSource for blob: URLs (local files), UrlSource for remote URLs
      let source;
      if (url.startsWith("blob:")) {
        const response = await fetch(url);
        const blob = await response.blob();
        source = new BlobSource(blob);
      } else {
        source = new UrlSource(url);
      }
      const input = new Input({ formats: ALL_FORMATS, source });

      const audioTrack = await input.getPrimaryAudioTrack();
      if (!audioTrack || !(await audioTrack.canDecode())) {
        // No decodable audio track — fall back to bulk decode
        await this.decodeAndUploadFallback(sourceId, url);
        return;
      }

      const sourceSampleRate = audioTrack.sampleRate;
      const sourceChannels = audioTrack.numberOfChannels;
      const estimatedDuration = (await input.computeDuration()) ?? 0;

      // Create streaming source in WASM engine
      this.workletNode!.port.postMessage({
        type: "create-streaming-source",
        sourceId,
        sampleRate: sourceSampleRate,
        channels: sourceChannels,
        estimatedDuration,
      });

      const sink = new AudioSampleSink(audioTrack);

      for await (const sample of sink.samples()) {
        if (abortController.signal.aborted) break;

        const numberOfChannels = sample.numberOfChannels;
        const numberOfFrames = sample.numberOfFrames;

        // Interleave channels into a single Float32Array
        let pcmData: Float32Array;

        if (numberOfChannels === 1) {
          // Mono: copy single channel directly
          const bytesNeeded = sample.allocationSize({ format: "f32", planeIndex: 0 });
          pcmData = new Float32Array(bytesNeeded / 4);
          sample.copyTo(pcmData, { format: "f32", planeIndex: 0 });
        } else {
          // Multi-channel: interleave (typically stereo)
          const channelBuffers: Float32Array[] = [];
          for (let ch = 0; ch < numberOfChannels; ch++) {
            const bytesNeeded = sample.allocationSize({ format: "f32-planar", planeIndex: ch });
            const channelData = new Float32Array(bytesNeeded / 4);
            sample.copyTo(channelData, { format: "f32-planar", planeIndex: ch });
            channelBuffers.push(channelData);
          }

          // Interleave: L, R, L, R, ...
          pcmData = new Float32Array(numberOfFrames * numberOfChannels);
          for (let i = 0; i < numberOfFrames; i++) {
            for (let ch = 0; ch < numberOfChannels; ch++) {
              pcmData[i * numberOfChannels + ch] = channelBuffers[ch][i];
            }
          }
        }

        sample.close();

        // Transfer the buffer to the worklet (zero-copy)
        const buffer = pcmData.buffer as ArrayBuffer;
        this.workletNode!.port.postMessage(
          {
            type: "append-audio-chunk",
            sourceId,
            pcmData: new Float32Array(buffer),
          },
          [buffer],
        );
      }

      // All chunks sent — finalize
      this.workletNode!.port.postMessage({
        type: "finalize-audio",
        sourceId,
      });

      this.streamedSources.add(sourceId);
    } catch (err) {
      console.warn(`[AudioEngine] Streaming decode failed for ${sourceId}, falling back:`, err);
      try {
        await this.decodeAndUploadFallback(sourceId, url);
      } catch (fallbackErr) {
        console.error(`[AudioEngine] Fallback decode also failed for ${sourceId}:`, fallbackErr);
        throw fallbackErr;
      }
    } finally {
      this.activeStreams.delete(sourceId);
    }
  }

  /**
   * Fallback: decode audio using Web Audio API's decodeAudioData and upload in bulk
   */
  private async decodeAndUploadFallback(sourceId: string, url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);

    // Convert to interleaved stereo
    const numFrames = audioBuffer.length;
    const pcmData = new Float32Array(numFrames * 2);

    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel =
      audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

    for (let i = 0; i < numFrames; i++) {
      pcmData[i * 2] = leftChannel[i];
      pcmData[i * 2 + 1] = rightChannel[i];
    }

    // Transfer the buffer for zero-copy
    const buffer = pcmData.buffer.slice(0) as ArrayBuffer;

    this.workletNode!.port.postMessage(
      {
        type: "upload-audio",
        sourceId,
        pcmData: new Float32Array(buffer),
        sampleRate: this.config.sampleRate,
        channels: 2,
      },
      [buffer],
    );

    this.streamedSources.add(sourceId);
  }

  /**
   * Remove audio source
   */
  removeAudio(sourceId: string): void {
    if (!this.workletNode) return;

    this.streamedSources.delete(sourceId);

    // Abort any in-progress streaming
    const activeStream = this.activeStreams.get(sourceId);
    if (activeStream) {
      activeStream.abort();
      this.activeStreams.delete(sourceId);
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

    // Abort all active streams
    for (const controller of this.activeStreams.values()) {
      controller.abort();
    }
    this.activeStreams.clear();
    this.streamedSources.clear();
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
