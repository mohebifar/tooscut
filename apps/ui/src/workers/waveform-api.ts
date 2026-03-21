/**
 * API for the waveform extraction worker.
 */

import * as Comlink from "comlink";
import type { WaveformWorkerApi, WaveformResult } from "./waveform.worker";

let workerInstance: Comlink.Remote<WaveformWorkerApi> | null = null;
let workerRef: Worker | null = null;

function getWorker(): Comlink.Remote<WaveformWorkerApi> {
  if (!workerInstance) {
    workerRef = new Worker(new URL("./waveform.worker.ts", import.meta.url), {
      type: "module",
    });
    workerInstance = Comlink.wrap<WaveformWorkerApi>(workerRef);
  }
  return workerInstance;
}

/**
 * Extract waveform data from an audio/video file.
 * The number of waveform samples is calculated automatically based on
 * the audio duration for consistent visual density across all clip lengths.
 */
export async function extractWaveform(
  assetId: string,
  url: string,
): Promise<WaveformResult | null> {
  const worker = getWorker();
  return worker.extractWaveform(assetId, url);
}

/**
 * Clear cached data for an asset.
 */
export async function clearWaveformCache(assetId?: string): Promise<void> {
  const worker = getWorker();
  return worker.clearCache(assetId);
}

/**
 * Terminate the worker.
 */
export function terminateWaveformWorker(): void {
  if (workerRef) {
    workerRef.terminate();
    workerRef = null;
    workerInstance = null;
  }
}
