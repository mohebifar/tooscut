/**
 * useClipWaveform - Hook to get waveform data for audio clips.
 *
 * Extracts waveform data via a web worker (off main thread) and caches
 * results in a simple in-memory map keyed by assetId + url.
 */

import { useEffect, useRef, useState } from "react";

import { extractWaveform } from "../../workers/waveform-api";
import { useAssetStore } from "./use-asset-store";

export interface WaveformData {
  data: number[];
  duration: number;
}

// Global cache: assetId -> waveform data
const waveformCache = new Map<string, WaveformData>();
// Track in-flight extractions to avoid duplicates
const pendingExtractions = new Set<string>();

interface AudioClipLike {
  id: string;
  type: string;
  assetId?: string;
}

/**
 * Hook that returns a map of assetId -> WaveformData for all audio clips.
 * Triggers extraction for any audio clips whose waveform isn't cached yet.
 */
export function useClipWaveforms(clips: AudioClipLike[]): Map<string, WaveformData> {
  const [waveforms, setWaveforms] = useState<Map<string, WaveformData>>(() => new Map());
  const assets = useAssetStore((state) => state.assets);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Filter to audio clips with asset IDs
    const audioClips = clips.filter(
      (c): c is AudioClipLike & { assetId: string } => c.type === "audio" && !!c.assetId,
    );

    // Collect unique asset IDs that need waveform extraction
    const neededAssetIds = new Set<string>();
    const currentWaveforms = new Map<string, WaveformData>();

    for (const clip of audioClips) {
      const cached = waveformCache.get(clip.assetId);
      if (cached) {
        currentWaveforms.set(clip.assetId, cached);
      } else {
        neededAssetIds.add(clip.assetId);
      }
    }

    // Update state with cached waveforms immediately
    if (currentWaveforms.size > 0) {
      setWaveforms((prev) => {
        const next = new Map(prev);
        for (const [k, v] of currentWaveforms) {
          next.set(k, v);
        }
        return next;
      });
    }

    // Extract missing waveforms
    for (const assetId of neededAssetIds) {
      if (pendingExtractions.has(assetId)) continue;

      const asset = assets.find((a) => a.id === assetId);
      if (!asset?.url) continue;

      pendingExtractions.add(assetId);

      void extractWaveform(assetId, asset.url).then((result) => {
        pendingExtractions.delete(assetId);

        if (result && mountedRef.current) {
          const wfData: WaveformData = {
            data: result.waveformData,
            duration: result.duration,
          };
          waveformCache.set(assetId, wfData);

          setWaveforms((prev) => {
            const next = new Map(prev);
            next.set(assetId, wfData);
            return next;
          });
        }
      });
    }
  }, [clips, assets]);

  return waveforms;
}
