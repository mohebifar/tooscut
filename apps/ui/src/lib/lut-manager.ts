/**
 * LUT asset management — import, persist, hydrate, and upload to GPU.
 *
 * LUT files (.cube) are stored as assets in the editor store with their
 * FileSystemFileHandle persisted in IndexedDB. On page load, LUT assets
 * are re-parsed and uploaded to the compositor GPU.
 */

import type { MediaAsset } from "../state/video-editor-store";

import { db } from "../state/db";
import { useVideoEditorStore } from "../state/video-editor-store";
import { getSharedCompositor } from "../workers/compositor-api";
import { parseCubeFile, type CubeLut } from "./cube-parser";

/**
 * Import a .cube LUT file via the File System Access API picker.
 * Falls back to <input type="file"> if the API is unavailable.
 */
export async function importLutWithPicker(): Promise<{ id: string; name: string } | null> {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "3D LUT Files",
            accept: { "application/x-cube": [".cube"] },
          },
        ],
        multiple: false,
      });
      return importLutFromHandle(handle);
    } catch {
      // User cancelled
      return null;
    }
  }

  // Fallback: <input type="file"> — no persistence across refreshes
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".cube";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        const parsed = parseCubeFile(text);
        const lutName = parsed.title || file.name.replace(/\.cube$/i, "");
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        useVideoEditorStore.getState().addAssets([
          {
            id,
            type: "lut",
            name: lutName,
            url: "",
            duration: 0,
            lutSize: parsed.size,
          },
        ]);

        await uploadLutToGpu(id, parsed);
        resolve({ id, name: lutName });
      } catch (err) {
        console.error("Failed to import LUT:", err);
        resolve(null);
      }
    };
    input.click();
  });
}

/**
 * Hydrate a LUT asset on page load — re-parse the file and upload to GPU.
 *
 * Called during project hydration for each LUT asset.
 */
export async function hydrateLutAsset(asset: MediaAsset): Promise<boolean> {
  if (asset.type !== "lut") return false;

  const stored = await db.fileHandles.get(asset.id);
  if (!stored) {
    console.warn(`[lut-manager] No stored handle for LUT asset ${asset.id}`);
    return false;
  }

  try {
    // Check/request permission
    const permission = await (stored.handle as any).queryPermission({ mode: "read" });
    if (permission !== "granted") {
      const requested = await (stored.handle as any).requestPermission({ mode: "read" });
      if (requested !== "granted") {
        console.warn(`[lut-manager] Permission denied for LUT ${asset.id}`);
        return false;
      }
    }

    const file = await stored.handle.getFile();
    const text = await file.text();
    const parsed = parseCubeFile(text);
    await uploadLutToGpu(asset.id, parsed);
    return true;
  } catch (err) {
    console.error(`[lut-manager] Failed to hydrate LUT ${asset.id}:`, err);
    return false;
  }
}

/**
 * Upload parsed LUT data to the GPU compositor.
 */
async function uploadLutToGpu(lutId: string, parsed: CubeLut): Promise<void> {
  const compositor = getSharedCompositor();
  if (compositor) {
    await compositor.uploadLut(lutId, parsed.size, parsed.data);
  }
}
