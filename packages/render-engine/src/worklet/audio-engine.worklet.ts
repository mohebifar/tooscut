/// <reference types="@types/audioworklet" />
import "./polyfills";

import { AudioEngine, initSync } from "../../wasm/audio-engine/audio_engine.js";

interface InitMessage {
  type: "init";
  wasmBinary: ArrayBuffer;
  sampleRate: number;
}

interface UploadAudioMessage {
  type: "upload-audio";
  sourceId: string;
  pcmData: Float32Array;
  sampleRate: number;
  channels: number;
}

interface RemoveAudioMessage {
  type: "remove-audio";
  sourceId: string;
}

interface SetTimelineMessage {
  type: "set-timeline";
  timelineJson: string;
}

interface SetPlayingMessage {
  type: "set-playing";
  playing: boolean;
}

interface SeekMessage {
  type: "seek";
  time: number;
}

interface SetMasterVolumeMessage {
  type: "set-master-volume";
  volume: number;
}

interface CreateStreamingSourceMessage {
  type: "create-streaming-source";
  sourceId: string;
  sampleRate: number;
  channels: number;
  estimatedDuration: number;
}

interface AppendAudioChunkMessage {
  type: "append-audio-chunk";
  sourceId: string;
  pcmData: Float32Array;
}

interface FinalizeAudioMessage {
  type: "finalize-audio";
  sourceId: string;
}

type WorkletMessage =
  | InitMessage
  | UploadAudioMessage
  | RemoveAudioMessage
  | SetTimelineMessage
  | SetPlayingMessage
  | SeekMessage
  | SetMasterVolumeMessage
  | CreateStreamingSourceMessage
  | AppendAudioChunkMessage
  | FinalizeAudioMessage;

/**
 * AudioWorkletProcessor that uses WASM for audio mixing.
 */
class AudioEngineProcessor extends AudioWorkletProcessor {
  private engine: AudioEngine | null = null;
  private isPlaying = false;
  private frameCount = 0;
  private outputSampleRate: number;
  private interleavedBuffer: Float32Array;

  constructor() {
    super();
    this.outputSampleRate = sampleRate; // Global from AudioWorkletGlobalScope
    this.interleavedBuffer = new Float32Array(128 * 2);

    this.port.onmessage = this.handleMessage.bind(this);
    this.port.start();
    this.port.postMessage({ type: "worklet-ready" });
  }

  private handleMessage(event: MessageEvent<WorkletMessage>): void {
    const message = event.data;

    switch (message.type) {
      case "init":
        void this.initEngine(message.wasmBinary, message.sampleRate);
        break;

      case "upload-audio":
        this.engine?.upload_audio(
          message.sourceId,
          message.pcmData,
          message.sampleRate,
          message.channels,
        );
        break;

      case "remove-audio":
        this.engine?.remove_audio(message.sourceId);
        break;

      case "set-timeline":
        this.engine?.set_timeline(message.timelineJson);
        break;

      case "set-playing":
        this.isPlaying = message.playing;
        this.engine?.set_playing(message.playing);
        break;

      case "seek":
        this.engine?.seek(message.time);
        break;

      case "set-master-volume":
        this.engine?.set_master_volume(message.volume);
        break;

      case "create-streaming-source":
        this.engine?.create_streaming_source(
          message.sourceId,
          message.sampleRate,
          message.channels,
          message.estimatedDuration,
        );
        break;

      case "append-audio-chunk":
        this.engine?.append_audio_chunk(message.sourceId, message.pcmData);
        break;

      case "finalize-audio":
        this.engine?.finalize_audio(message.sourceId);
        break;
    }
  }

  private async initEngine(wasmBinary: ArrayBuffer, outputSampleRate: number): Promise<void> {
    this.outputSampleRate = outputSampleRate;

    try {
      const wasmModule = await WebAssembly.compile(wasmBinary);
      initSync({ module: wasmModule });
      this.engine = new AudioEngine(outputSampleRate);
      this.port.postMessage({ type: "ready" });
    } catch (error) {
      console.error("[AudioEngineProcessor] Failed to init WASM:", error);
      this.port.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const left = output[0];
    const right = output[1];
    const numFrames = left?.length ?? 128;

    if (!this.engine || !this.isPlaying) {
      left?.fill(0);
      right?.fill(0);
      return true;
    }

    if (this.interleavedBuffer.length < numFrames * 2) {
      this.interleavedBuffer = new Float32Array(numFrames * 2);
    }

    this.engine.render(this.interleavedBuffer, numFrames);

    for (let i = 0; i < numFrames; i++) {
      if (left) left[i] = this.interleavedBuffer[i * 2] ?? 0;
      if (right) right[i] = this.interleavedBuffer[i * 2 + 1] ?? 0;
    }

    // Report time ~10 times per second
    this.frameCount += numFrames;
    if (this.frameCount >= Math.floor(this.outputSampleRate / 10)) {
      this.frameCount = 0;
      this.port.postMessage({
        type: "time-update",
        time: this.engine.get_current_time(),
      });
    }

    return true;
  }
}

registerProcessor("audio-engine-processor", AudioEngineProcessor);
