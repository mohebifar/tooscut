/**
 * LRU cache for video thumbnails.
 * Stores ImageBitmaps keyed by asset ID, timestamp, and width.
 * Supports nearest-timestamp lookup for smooth zoom transitions.
 */

const MAX_CACHE_SIZE = 500;

interface CacheEntry {
  bitmap: ImageBitmap;
  key: string;
  lastAccessed: number;
  assetId: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Secondary index: sorted timestamp arrays per asset for nearest-neighbor lookup.
 */
const assetTimestamps = new Map<string, number[]>();

/**
 * Generate cache key from parameters.
 * Timestamp is rounded to reduce cache misses from minor variations.
 */
function getCacheKey(assetId: string, timestamp: number, width: number): string {
  const roundedTimestamp = Math.round(timestamp * 100) / 100; // Round to 2 decimal places
  return `${assetId}:${roundedTimestamp}:${width}`;
}

/**
 * Insert a timestamp into the sorted array for an asset, maintaining sort order.
 */
function insertSorted(arr: number[], value: number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  // Avoid duplicates (same rounded timestamp)
  if (lo < arr.length && arr[lo] === value) return;
  arr.splice(lo, 0, value);
}

/**
 * Remove a timestamp from the sorted array for an asset.
 */
function removeSorted(arr: number[], value: number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  if (lo < arr.length && arr[lo] === value) {
    arr.splice(lo, 1);
  }
}

/**
 * Get a cached thumbnail bitmap.
 */
export function getCachedBitmap(
  assetId: string,
  timestamp: number,
  width: number,
): ImageBitmap | null {
  const key = getCacheKey(assetId, timestamp, width);
  const entry = cache.get(key);

  if (entry) {
    // Update last accessed time
    entry.lastAccessed = Date.now();
    return entry.bitmap;
  }

  return null;
}

/**
 * Find the nearest cached bitmap for an asset within a time tolerance.
 * Uses binary search on the sorted timestamp index for O(log n) lookup.
 */
export function getNearestCachedBitmap(
  assetId: string,
  timestamp: number,
  width: number,
  maxDelta: number = 2.0,
): ImageBitmap | null {
  const timestamps = assetTimestamps.get(assetId);
  if (!timestamps || timestamps.length === 0) return null;

  // Binary search for the closest timestamp
  let lo = 0;
  let hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (timestamps[mid] < timestamp) lo = mid + 1;
    else hi = mid;
  }

  // Check lo and lo-1 for closest match
  let bestIdx = lo;
  if (lo > 0) {
    const diffLo = Math.abs(timestamps[lo] - timestamp);
    const diffPrev = Math.abs(timestamps[lo - 1] - timestamp);
    if (diffPrev < diffLo) bestIdx = lo - 1;
  }

  const bestTimestamp = timestamps[bestIdx];
  if (Math.abs(bestTimestamp - timestamp) > maxDelta) return null;

  const key = getCacheKey(assetId, bestTimestamp, width);
  const entry = cache.get(key);
  if (entry) {
    entry.lastAccessed = Date.now();
    return entry.bitmap;
  }

  return null;
}

/**
 * Store a thumbnail bitmap in the cache.
 */
export function setCachedBitmap(
  assetId: string,
  timestamp: number,
  width: number,
  bitmap: ImageBitmap,
): void {
  const key = getCacheKey(assetId, timestamp, width);
  const roundedTimestamp = Math.round(timestamp * 100) / 100;

  // Evict oldest entries if cache is full
  if (cache.size >= MAX_CACHE_SIZE) {
    evictOldest();
  }

  cache.set(key, {
    bitmap,
    key,
    lastAccessed: Date.now(),
    assetId,
    timestamp: roundedTimestamp,
  });

  // Update secondary index
  if (!assetTimestamps.has(assetId)) {
    assetTimestamps.set(assetId, []);
  }
  insertSorted(assetTimestamps.get(assetId)!, roundedTimestamp);
}

/**
 * Evict the oldest entry from the cache.
 */
function evictOldest(): void {
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  let oldestEntry: CacheEntry | null = null;

  for (const [key, entry] of cache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
      oldestEntry = entry;
    }
  }

  if (oldestKey && oldestEntry) {
    // Remove from secondary index
    const timestamps = assetTimestamps.get(oldestEntry.assetId);
    if (timestamps) {
      removeSorted(timestamps, oldestEntry.timestamp);
      if (timestamps.length === 0) {
        assetTimestamps.delete(oldestEntry.assetId);
      }
    }

    oldestEntry.bitmap.close();
    cache.delete(oldestKey);
  }
}

/**
 * Clear cache entries for a specific asset, or all entries.
 */
export function clearThumbnailCache(assetId?: string): void {
  if (assetId) {
    for (const [key, entry] of cache) {
      if (key.startsWith(`${assetId}:`)) {
        entry.bitmap.close();
        cache.delete(key);
      }
    }
    assetTimestamps.delete(assetId);
  } else {
    for (const entry of cache.values()) {
      entry.bitmap.close();
    }
    cache.clear();
    assetTimestamps.clear();
  }
}

/**
 * Get cache statistics.
 */
export function getThumbnailCacheStats(): { size: number; maxSize: number } {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
  };
}
