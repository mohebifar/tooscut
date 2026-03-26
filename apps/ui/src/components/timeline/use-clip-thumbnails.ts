/**
 * useClipThumbnails - Hook for viewport-aware video thumbnail loading
 *
 * Features:
 * - Viewport culling: only loads thumbnails visible in the viewport
 * - Concurrency limiting: max 3 concurrent loads to prevent resource exhaustion
 * - Priority loading: visible thumbnails loaded before buffer
 * - Cancellation: aborts in-flight requests when viewport changes
 * - LRU caching: reuses already-loaded thumbnails
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { VideoFrameLoaderManager, framesToSeconds } from "@tooscut/render-engine";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { getCachedBitmap, setCachedBitmap, clearThumbnailCache } from "./thumbnail-cache";
import { useAssetStore } from "./use-asset-store";

/** Width of each thumbnail slot in pixels */
const THUMBNAIL_SLOT_WIDTH = 80;
/** Height to resize thumbnails to (accounts for HiDPI) */
const THUMBNAIL_RESIZE_HEIGHT = Math.round(
  80 * (typeof window !== "undefined" ? (window.devicePixelRatio ?? 2) : 2),
);

/** Buffer zone - number of slots to preload beyond visible area */
const BUFFER_SLOTS = 2;

/** Debounce delay for thumbnail loading (ms) */
const LOAD_DEBOUNCE_MS = 150;

/** Maximum concurrent thumbnail loads */
const MAX_CONCURRENT_LOADS = 3;

export interface ThumbnailSlot {
  /** X position in timeline coordinates */
  x: number;
  /** Media timestamp for this thumbnail */
  timestamp: number;
  /** Loaded bitmap (null if not yet loaded) */
  image: ImageBitmap | null;
  /** True if the slot needs a load (no exact cache hit, may have nearest-cache fallback) */
  needsLoad: boolean;
  /** Unique key for React rendering */
  key: string;
  /** Asset ID for loading */
  assetId: string;
  /** Slot index within the clip */
  slotIndex: number;
}

export interface ClipThumbnailData {
  clipId: string;
  clipType: string;
  assetId: string;
  startTime: number;
  duration: number;
  slots: ThumbnailSlot[];
}

interface VideoClipLike {
  id: string;
  type: string;
  assetId?: string;
  startTime: number;
  duration: number;
  inPoint: number;
  speed: number;
}

interface UseClipThumbnailsParams {
  /** Clips to generate thumbnails for (will filter to video only) */
  clips: VideoClipLike[];
  /** Pixels per second (zoom level) */
  zoom: number;
  /** Track header width offset */
  trackHeaderWidth: number;
  /** Viewport width */
  viewportWidth: number;
}

/**
 * Hook that manages thumbnail loading for video clips in the timeline.
 * Returns thumbnail data for each visible clip with viewport-aware loading.
 */
export function useClipThumbnails({
  clips,
  zoom,
  trackHeaderWidth,
  viewportWidth,
}: UseClipThumbnailsParams): ClipThumbnailData[] {
  const [thumbnailData, setThumbnailData] = useState<ClipThumbnailData[]>([]);
  const loaderManagerRef = useRef<VideoFrameLoaderManager | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAbortRef = useRef<AbortController | null>(null);
  const loadVersionRef = useRef(0);
  const thumbnailDataRef = useRef<ClipThumbnailData[]>([]);

  const assets = useAssetStore((state) => state.assets);
  const fps = useVideoEditorStore((s) => s.settings.fps);

  // Initialize loader manager (dedicated instance for thumbnails)
  useEffect(() => {
    loaderManagerRef.current = new VideoFrameLoaderManager({ mode: "preview" });

    return () => {
      loaderManagerRef.current?.disposeAll();
      loaderManagerRef.current = null;
      clearThumbnailCache();
    };
  }, []);

  // Calculate thumbnail slots for a clip.
  // Only depends on clip properties and zoom — NOT scrollX.
  // Slot screen positions are computed at render time via slotIndex.
  const calculateSlots = useCallback(
    (clip: VideoClipLike & { assetId: string }): ThumbnailSlot[] => {
      const clipWidth = clip.duration * zoom;
      const slots: ThumbnailSlot[] = [];

      // Calculate number of slots based on clip width
      const numSlots = Math.max(1, Math.ceil(clipWidth / THUMBNAIL_SLOT_WIDTH));

      for (let i = 0; i < numSlots; i++) {
        // Image clips use timestamp 0 for all slots (same image, no time variation)
        // Video clips compute media time from inPoint and speed (all in frames),
        // then convert to seconds for video frame extraction
        const mediaTimeFrames =
          clip.type === "image"
            ? 0
            : clip.inPoint + (i + 0.5) * (clip.duration / numSlots) * clip.speed;
        const mediaTime = framesToSeconds(mediaTimeFrames, fps);

        const image = getCachedBitmap(clip.assetId, mediaTime, THUMBNAIL_SLOT_WIDTH);

        slots.push({
          x: 0, // Not used — render positions via slotIndex
          timestamp: mediaTime,
          image,
          needsLoad: !image,
          key: `${clip.id}-${i}`,
          assetId: clip.assetId,
          slotIndex: i,
        });
      }

      return slots;
    },
    [zoom],
  );

  // Prioritize slots: visible first, then buffer before, then buffer after.
  // Uses current scrollX at call time for viewport-aware prioritization.
  const prioritizeSlots = useCallback(
    (slots: ThumbnailSlot[], clipStartTime: number, clipDuration: number): ThumbnailSlot[] => {
      if (slots.length === 0) return [];

      // Read current scrollX from store at load time (not as a dependency)
      const currentScrollX = useVideoEditorStore.getState().scrollX;
      const clipStartX = trackHeaderWidth + clipStartTime * zoom - currentScrollX;
      const clipWidth = clipDuration * zoom;
      const numSlots = slots.length;
      const slotWidth = clipWidth / numSlots;

      const visibleStart = trackHeaderWidth;
      const visibleEnd = viewportWidth;

      const visible: ThumbnailSlot[] = [];
      const bufferBefore: ThumbnailSlot[] = [];
      const bufferAfter: ThumbnailSlot[] = [];

      for (const slot of slots) {
        if (!slot.needsLoad) continue; // Skip already loaded (exact cache hit)

        const slotX = clipStartX + slot.slotIndex * slotWidth;
        const slotEnd = slotX + slotWidth;

        if (slotX >= visibleStart && slotEnd <= visibleEnd) {
          visible.push(slot);
        } else if (slotEnd < visibleStart) {
          bufferBefore.push(slot);
        } else if (slotX > visibleEnd) {
          bufferAfter.push(slot);
        } else {
          // Partially visible - treat as visible
          visible.push(slot);
        }
      }

      // Limit buffer slots
      const limitedBefore = bufferBefore.slice(-BUFFER_SLOTS);
      const limitedAfter = bufferAfter.slice(0, BUFFER_SLOTS);

      return [...visible, ...limitedBefore.reverse(), ...limitedAfter];
    },
    [trackHeaderWidth, viewportWidth, zoom],
  );

  // Load a bitmap for an image asset (fetch + createImageBitmap)
  const loadImageBitmap = useCallback(async (assetUrl: string): Promise<ImageBitmap> => {
    const response = await fetch(assetUrl);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }, []);

  // Load thumbnails with concurrency limiting and progressive updates
  const loadThumbnails = useCallback(
    async (data: ClipThumbnailData[], signal: AbortSignal, version: number) => {
      const manager = loaderManagerRef.current;
      if (!manager) return;

      // Collect all slots that need loading, prioritized
      const allSlotsToLoad: Array<{
        clipIdx: number;
        slot: ThumbnailSlot;
        assetUrl: string;
        clipType: string;
      }> = [];

      for (let clipIdx = 0; clipIdx < data.length; clipIdx++) {
        const clipData = data[clipIdx];
        const asset = assets.find((a) => a.id === clipData.assetId);
        if (!asset?.url) continue;

        const prioritized = prioritizeSlots(clipData.slots, clipData.startTime, clipData.duration);
        for (const slot of prioritized) {
          allSlotsToLoad.push({
            clipIdx,
            slot,
            assetUrl: asset.url,
            clipType: clipData.clipType,
          });
        }
      }

      if (allSlotsToLoad.length === 0) return;

      // Mutable snapshot for progressive updates
      const updates = data.map((d) => ({
        ...d,
        slots: [...d.slots],
      }));
      let activeLoads = 0;
      let loadIndex = 0;

      let rafPending = false;
      const emitUpdate = () => {
        if (rafPending || signal.aborted || loadVersionRef.current !== version) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          if (!signal.aborted && loadVersionRef.current === version) {
            setThumbnailData(updates.map((d) => ({ ...d, slots: [...d.slots] })));
          }
        });
      };

      const loadNext = async (): Promise<void> => {
        while (loadIndex < allSlotsToLoad.length && !signal.aborted) {
          // Wait if at concurrency limit
          if (activeLoads >= MAX_CONCURRENT_LOADS) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            continue;
          }

          const item = allSlotsToLoad[loadIndex++];
          if (!item) break;

          const { clipIdx, slot, assetUrl, clipType } = item;

          // Check cache again (might have been loaded)
          const cached = getCachedBitmap(slot.assetId, slot.timestamp, THUMBNAIL_SLOT_WIDTH);
          if (cached) {
            const slotIdx = updates[clipIdx].slots.findIndex((s) => s.key === slot.key);
            if (slotIdx !== -1) {
              updates[clipIdx].slots[slotIdx] = {
                ...slot,
                image: cached,
                needsLoad: false,
              };
              emitUpdate();
            }
            continue;
          }

          activeLoads++;

          try {
            let bitmap: ImageBitmap;

            if (clipType === "image") {
              bitmap = await loadImageBitmap(assetUrl);
            } else {
              const loader = await manager.getLoader(slot.assetId, assetUrl);
              if (signal.aborted) {
                activeLoads--;
                break;
              }
              const fullBitmap = await loader.getImageBitmap(slot.timestamp);
              const aspect = fullBitmap.width / fullBitmap.height;
              bitmap = await createImageBitmap(fullBitmap, {
                resizeWidth: Math.round(THUMBNAIL_RESIZE_HEIGHT * aspect),
                resizeHeight: THUMBNAIL_RESIZE_HEIGHT,
                resizeQuality: "high",
              });
              fullBitmap.close();
            }

            if (signal.aborted) {
              bitmap.close();
              activeLoads--;
              break;
            }

            setCachedBitmap(slot.assetId, slot.timestamp, THUMBNAIL_SLOT_WIDTH, bitmap);

            // For image clips, all slots share the same bitmap — update all of them
            if (clipType === "image") {
              for (let si = 0; si < updates[clipIdx].slots.length; si++) {
                const s = updates[clipIdx].slots[si];
                if (s.needsLoad) {
                  updates[clipIdx].slots[si] = {
                    ...s,
                    image: bitmap,
                    needsLoad: false,
                  };
                }
              }
            } else {
              const slotIdx = updates[clipIdx].slots.findIndex((s) => s.key === slot.key);
              if (slotIdx !== -1) {
                updates[clipIdx].slots[slotIdx] = {
                  ...slot,
                  image: bitmap,
                  needsLoad: false,
                };
              }
            }
            emitUpdate();
          } catch (err) {
            if (!signal.aborted) {
              console.warn(`[useClipThumbnails] Failed to load thumbnail:`, err);
            }
          } finally {
            activeLoads--;
          }
        }
      };

      // Start concurrent loaders
      const loaders = Array(MAX_CONCURRENT_LOADS)
        .fill(null)
        .map(() => loadNext());
      await Promise.all(loaders);
    },
    [assets, prioritizeSlots, loadImageBitmap],
  );

  // Recalculate slots and trigger loading when dependencies change
  useEffect(() => {
    // Cancel any pending operations
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    loadVersionRef.current += 1;

    // Filter to video and image clips with asset IDs
    const videoClips = clips.filter(
      (c): c is VideoClipLike & { assetId: string } =>
        (c.type === "video" || c.type === "image") && !!c.assetId,
    );

    const newData: ClipThumbnailData[] = videoClips.map((clip) => ({
      clipId: clip.id,
      clipType: clip.type,
      assetId: clip.assetId,
      startTime: clip.startTime,
      duration: clip.duration,
      slots: calculateSlots(clip),
    }));

    setThumbnailData(newData);

    // Schedule loading with debounce
    const currentVersion = loadVersionRef.current;
    loadTimeoutRef.current = setTimeout(() => {
      abortControllerRef.current = new AbortController();
      void loadThumbnails(newData, abortControllerRef.current.signal, currentVersion);
    }, LOAD_DEBOUNCE_MS);

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // Note: scrollX is intentionally excluded — slot data doesn't depend on scroll.
    // Scroll-triggered loading is handled by a separate subscription below.
  }, [clips, zoom, calculateSlots, loadThumbnails]);

  // Keep ref in sync for the scroll subscription to read
  thumbnailDataRef.current = thumbnailData;

  // Re-trigger loading when scrollX changes so newly visible slots get loaded
  useEffect(() => {
    const unsub = useVideoEditorStore.subscribe(
      (state) => state.scrollX,
      () => {
        // Debounce scroll-triggered loads
        if (scrollLoadTimeoutRef.current) {
          clearTimeout(scrollLoadTimeoutRef.current);
        }
        if (scrollAbortRef.current) {
          scrollAbortRef.current.abort();
        }

        scrollLoadTimeoutRef.current = setTimeout(() => {
          const data = thumbnailDataRef.current;
          // Only trigger if there are unloaded slots
          const hasUnloaded = data.some((d) => d.slots.some((s) => s.needsLoad));
          if (!hasUnloaded) return;

          const version = loadVersionRef.current;
          scrollAbortRef.current = new AbortController();
          void loadThumbnails(data, scrollAbortRef.current.signal, version);
        }, LOAD_DEBOUNCE_MS);
      },
    );

    return () => {
      unsub();
      if (scrollLoadTimeoutRef.current) {
        clearTimeout(scrollLoadTimeoutRef.current);
      }
      if (scrollAbortRef.current) {
        scrollAbortRef.current.abort();
      }
    };
  }, [loadThumbnails]);

  return thumbnailData;
}

/**
 * Get thumbnail data for a specific clip.
 */
export function getThumbnailsForClip(
  thumbnailData: ClipThumbnailData[],
  clipId: string,
): ThumbnailSlot[] {
  const data = thumbnailData.find((d) => d.clipId === clipId);
  return data?.slots ?? [];
}
