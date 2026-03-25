/**
 * Asset store for managing imported media files.
 */
import { create } from "zustand";
import { secondsToFrames } from "@tooscut/render-engine";
import { db } from "../../state/db";
import {
  useVideoEditorStore,
  type MediaAsset as StoreMediaAsset,
} from "../../state/video-editor-store";

export interface MediaAsset {
  id: string;
  type: "video" | "audio" | "image";
  name: string;
  /** Object URL for playback/preview */
  url: string;
  /** Duration in seconds (0 for images) */
  duration: number;
  /** File size in bytes */
  size: number;
  /** Original file reference */
  file: File;
  /** Video/image dimensions */
  width?: number;
  height?: number;
  /** Thumbnail data URL (for video/image) */
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

  addAssets: (assets) => set((state) => ({ assets: [...state.assets, ...assets] })),

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

/**
 * Get file type from MIME type.
 */
function getAssetType(mimeType: string): "video" | "audio" | "image" | null {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}

/**
 * Generate a unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get video duration and dimensions.
 */
async function getVideoMetadata(
  file: File,
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Get audio duration.
 */
async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      reject(new Error("Failed to load audio metadata"));
    };

    audio.src = URL.createObjectURL(file);
  });
}

/**
 * Get image dimensions.
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate a thumbnail for video or image.
 */
async function generateThumbnail(file: File, type: "video" | "image"): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  const thumbnailSize = 120;

  if (type === "image") {
    const img = new Image();
    const url = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
      img.onload = () => {
        const scale = Math.min(thumbnailSize / img.width, thumbnailSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image for thumbnail"));
      };
      img.src = url;
    });
  }

  // Video thumbnail
  const video = document.createElement("video");
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };

    video.onseeked = () => {
      const scale = Math.min(thumbnailSize / video.videoWidth, thumbnailSize / video.videoHeight);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video for thumbnail"));
    };

    video.src = url;
  });
}

/**
 * Import files and create MediaAsset objects.
 * Optionally accepts FileSystemFileHandles for persistence across sessions.
 */
export async function importFiles(
  files: FileList | File[],
  fileHandles?: FileSystemFileHandle[],
): Promise<MediaAsset[]> {
  const assets: MediaAsset[] = [];
  const fileArray = Array.from(files);

  // Build a set of existing assets for dedup (match by name + size + type)
  const existingAssets = useAssetStore.getState().assets;
  const existingKeys = new Set(existingAssets.map((a) => `${a.name}|${a.size}|${a.type}`));

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    const type = getAssetType(file.type);
    if (!type) {
      console.warn(`Unsupported file type: ${file.type}`);
      continue;
    }

    // Skip duplicates (same name, size, and type already imported)
    const dedupeKey = `${file.name}|${file.size}|${type}`;
    if (existingKeys.has(dedupeKey)) {
      continue;
    }
    existingKeys.add(dedupeKey);

    try {
      const id = generateId();
      const url = URL.createObjectURL(file);

      let duration = 0;
      let width: number | undefined;
      let height: number | undefined;
      let thumbnailUrl: string | undefined;

      if (type === "video") {
        const meta = await getVideoMetadata(file);
        duration = meta.duration;
        width = meta.width;
        height = meta.height;
        thumbnailUrl = await generateThumbnail(file, "video");
      } else if (type === "audio") {
        duration = await getAudioDuration(file);
      } else if (type === "image") {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
        duration = 10; // Default duration for images (can be freely extended)
        thumbnailUrl = await generateThumbnail(file, "image");
      }

      // Store file handle in IndexedDB for persistence
      const handle = fileHandles?.[i];
      if (handle) {
        await db.fileHandles.put({
          id,
          handle,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          storedAt: Date.now(),
        });
      }

      assets.push({
        id,
        type,
        name: file.name,
        url,
        duration,
        size: file.size,
        file,
        width,
        height,
        thumbnailUrl,
      });
    } catch (error) {
      console.error(`Failed to import ${file.name}:`, error);
    }
  }

  return assets;
}

/** Map accept strings like "video/*" to file extensions for showOpenFilePicker */
const ACCEPT_MAP: Record<string, string[]> = {
  "video/*": [".mp4", ".webm", ".mov", ".avi", ".mkv"],
  "audio/*": [".mp3", ".wav", ".ogg", ".aac", ".flac"],
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
};

/**
 * Import files using the File System Access API (showOpenFilePicker).
 * This provides FileSystemFileHandles that persist across sessions.
 * @param accept - Comma-separated accept string (e.g. "video/*,audio/*,image/*")
 */
export async function importFilesWithPicker(
  accept = "video/*,audio/*,image/*",
): Promise<MediaAsset[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- File System Access API not in TS lib
  const picker = (window as any).showOpenFilePicker as
    | ((options: Record<string, unknown>) => Promise<FileSystemFileHandle[]>)
    | undefined;

  if (!picker) {
    // Fall back to regular file picker (no handles → assets won't persist)
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = accept;
      input.onchange = async () => {
        if (input.files && input.files.length > 0) {
          resolve(await importFiles(input.files));
        } else {
          resolve([]);
        }
      };
      input.click();
    });
  }

  // Build accept entries from the accept string
  const acceptEntries: Record<string, string[]> = {};
  for (const part of accept.split(",")) {
    const key = part.trim();
    if (ACCEPT_MAP[key]) {
      acceptEntries[key] = ACCEPT_MAP[key];
    }
  }

  try {
    const handles = await picker({
      multiple: true,
      types: [
        {
          description: "Media files",
          accept: acceptEntries,
        },
      ],
    });

    const files = await Promise.all(handles.map((h: FileSystemFileHandle) => h.getFile()));
    return importFiles(files, handles);
  } catch (err) {
    // User cancelled picker
    if (err instanceof DOMException && err.name === "AbortError") {
      return [];
    }
    throw err;
  }
}

export interface HydratedAsset extends StoreMediaAsset {
  file: File;
  size: number;
}

/**
 * Hydrate assets from stored file handles.
 * Only restores assets where permission is already "granted".
 * Assets needing permission (state="prompt") are returned in `pendingIds` —
 * these require a user gesture to call requestPermission().
 */
export async function hydrateAssets(assets: StoreMediaAsset[]): Promise<{
  hydrated: HydratedAsset[];
  pendingIds: string[];
  failedIds: string[];
}> {
  const hydrated: HydratedAsset[] = [];
  const pendingIds: string[] = [];
  const failedIds: string[] = [];

  for (const asset of assets) {
    // Assets that already have URLs (e.g. remote) don't need file handle hydration
    if (asset.url !== "") continue;

    try {
      const stored = await db.fileHandles.get(asset.id);
      if (!stored) {
        failedIds.push(asset.id);
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- queryPermission not in TS lib
      const handle = stored.handle as any;
      const permission: string = await handle.queryPermission({ mode: "read" });

      if (permission === "granted") {
        const file = await stored.handle.getFile();
        const url = URL.createObjectURL(file);
        hydrated.push({ ...asset, url, file, size: file.size });
      } else if (permission === "prompt") {
        // Needs user gesture to request — can't do it automatically
        pendingIds.push(asset.id);
      } else {
        failedIds.push(asset.id);
      }
    } catch (err) {
      console.error(`[hydrate] asset ${asset.id}: error`, err);
      failedIds.push(asset.id);
    }
  }

  return { hydrated, pendingIds, failedIds };
}

/**
 * Request file permission for pending assets. MUST be called from a user gesture (click).
 * For each asset ID, looks up the stored handle, requests permission, and restores the file.
 */
export async function requestPermissionAndHydrate(
  assetIds: string[],
  allAssets: StoreMediaAsset[],
): Promise<HydratedAsset[]> {
  const hydrated: HydratedAsset[] = [];

  for (const assetId of assetIds) {
    const asset = allAssets.find((a) => a.id === assetId);
    if (!asset) continue;

    try {
      const stored = await db.fileHandles.get(assetId);
      if (!stored) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- requestPermission not in TS lib
      const handle = stored.handle as any;
      const result: string = await handle.requestPermission({ mode: "read" });

      if (result === "granted") {
        const file = await stored.handle.getFile();
        const url = URL.createObjectURL(file);
        hydrated.push({ ...asset, url, file, size: file.size });
      }
    } catch (err) {
      console.error(`[permission] asset ${assetId}: error`, err);
    }
  }

  return hydrated;
}

/**
 * Format file size for display.
 */
/**
 * Handle a native file drop event, extracting FileSystemFileHandles when available.
 */
export function handleNativeFileDrop(
  e: DragEvent,
  onDrop: (files: FileList, handles?: FileSystemFileHandle[]) => void,
) {
  if (!e.dataTransfer || e.dataTransfer.files.length === 0) return;

  const files = e.dataTransfer.files;
  const items = e.dataTransfer.items;

  if (items.length > 0 && "getAsFileSystemHandle" in DataTransferItem.prototype) {
    const handlePromises = Array.from(items)
      .filter((item) => item.kind === "file")
      .map((item) =>
        (
          item as unknown as { getAsFileSystemHandle(): Promise<FileSystemHandle> }
        ).getAsFileSystemHandle(),
      );

    void Promise.all(handlePromises)
      .then((results) => {
        const handles = results.filter(
          (h): h is FileSystemFileHandle => h != null && h.kind === "file",
        );
        onDrop(files, handles.length > 0 ? handles : undefined);
      })
      .catch(() => {
        onDrop(files);
      });
  } else {
    onDrop(files);
  }
}

/**
 * Sync imported assets to both stores:
 * - useAssetStore (UI: thumbnails, File objects, drag-to-timeline)
 * - useVideoEditorStore (persistence: auto-saved to IndexedDB)
 */
export function addAssetsToStores(imported: MediaAsset[]) {
  useAssetStore.getState().addAssets(imported);
  const projectFps = useVideoEditorStore.getState().settings.fps;
  const editorAssets: StoreMediaAsset[] = imported.map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    url: a.url,
    // Convert source duration (seconds) to project frames
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

/**
 * Format duration for display.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
