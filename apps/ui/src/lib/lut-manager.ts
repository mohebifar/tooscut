/**
 * LUT asset management.
 * LUT data is fetched from asset URLs and uploaded to the compositor.
 */

import type { MediaAsset } from "../state/video-editor-store";

import { getSharedCompositor } from "../workers/compositor-api";
import { parseCubeFile, type CubeLut } from "./cube-parser";

export async function hydrateLutAsset(asset: MediaAsset): Promise<boolean> {
  if (asset.type !== "lut" || !asset.url) return false;

  try {
    const response = await fetch(asset.url);
    if (!response.ok) return false;

    const text = await response.text();
    const parsed = parseCubeFile(text);
    await uploadLutToGpu(asset.id, parsed);
    return true;
  } catch (err) {
    console.error(`[lut-manager] Failed to hydrate LUT ${asset.id}:`, err);
    return false;
  }
}

async function uploadLutToGpu(lutId: string, parsed: CubeLut): Promise<void> {
  const compositor = getSharedCompositor();
  if (compositor) {
    await compositor.uploadLut(lutId, parsed.size, parsed.data);
  }
}
