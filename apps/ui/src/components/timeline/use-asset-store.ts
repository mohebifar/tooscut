import { secondsToFrames } from "@tooscut/render-engine";
import { create } from "zustand";

import {
  useVideoEditorStore,
  type MediaAsset as StoreMediaAsset,
} from "../../state/video-editor-store";

export interface MediaAsset {
  id: string;
  type: "video" | "audio" | "image" | "lut";
  name: string;
  /** URL used for playback/preview */
  url: string;
  /** Duration in seconds (0 for unknown/non-temporal sources) */
  duration: number;
  /** File size in bytes (0 when unavailable) */
  size: number;
  /** Optional file reference for in-memory/local sources */
  file?: File;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

interface AssetState {
  assets: MediaAsset[];
  isLoading: boolean;
  error: string | null;

  addAsset: (asset: MediaAsset) => void;
  addAssets: (assets: MediaAsset[]) => void;
  removeAsset: (id: string) => void;
  clearAssets: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAssetStore = create<AssetState>((set) => ({
  assets: [],
  isLoading: false,
  error: null,

  addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),

  addAssets: (assets) =>
    set((state) => {
      const existing = new Set(state.assets.map((a) => a.id));
      const deduped = assets.filter((asset) => !existing.has(asset.id));
      return { assets: [...state.assets, ...deduped] };
    }),

  removeAsset: (id) =>
    set((state) => {
      const asset = state.assets.find((a) => a.id === id);
      if (asset) {
        URL.revokeObjectURL(asset.url);
        if (asset.thumbnailUrl) {
          URL.revokeObjectURL(asset.thumbnailUrl);
        }
      }
      return { assets: state.assets.filter((a) => a.id !== id) };
    }),

  clearAssets: () =>
    set((state) => {
      state.assets.forEach((asset) => {
        URL.revokeObjectURL(asset.url);
        if (asset.thumbnailUrl) {
          URL.revokeObjectURL(asset.thumbnailUrl);
        }
      });
      return { assets: [] };
    }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

export function addAssetsToStores(imported: MediaAsset[]) {
  useAssetStore.getState().addAssets(imported);
  const projectFps = useVideoEditorStore.getState().settings.fps;

  const editorAssets: StoreMediaAsset[] = imported.map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    url: a.url,
    duration: a.type === "image" ? 0 : secondsToFrames(a.duration, projectFps),
    width: a.width,
    height: a.height,
    thumbnailUrl: a.thumbnailUrl,
  }));

  useVideoEditorStore.getState().addAssets(editorAssets);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
