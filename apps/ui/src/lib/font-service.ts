/**
 * Fontsource API client and TTF download service.
 *
 * Fetches the font catalog from the Fontsource API and downloads TTF files
 * from the jsDelivr CDN for loading into the WASM compositor.
 */

export interface FontsourceFontEntry {
  id: string; // "roboto"
  family: string; // "Roboto"
  subsets: string[]; // ["latin", "latin-ext", "arabic", ...]
  weights: number[]; // [100, 200, ..., 900]
  styles: string[]; // ["normal", "italic"]
  category: string; // "sans-serif"
  variable: boolean;
}

const FONTSOURCE_API = "https://api.fontsource.org/v1/fonts";
const CDN_BASE = "https://cdn.jsdelivr.net/fontsource/fonts";

/** Module-level cache for the font catalog. */
let catalogCache: FontsourceFontEntry[] | null = null;
let catalogPromise: Promise<FontsourceFontEntry[]> | null = null;

/**
 * Fetch the full font catalog from Fontsource API. Cached in module-level variable.
 * Only fonts with latin subset are returned.
 */
export async function fetchFontCatalog(): Promise<FontsourceFontEntry[]> {
  if (catalogCache) return catalogCache;
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    const res = await fetch(`${FONTSOURCE_API}?subsets=latin`);
    if (!res.ok) {
      throw new Error(`Failed to fetch font catalog: ${res.status}`);
    }
    const data: FontsourceFontEntry[] = await res.json();
    catalogCache = data;
    return data;
  })();

  try {
    return await catalogPromise;
  } catch (err) {
    catalogPromise = null;
    throw err;
  }
}

/**
 * Build CDN URL for a specific font variant's TTF.
 *
 * URL pattern: https://cdn.jsdelivr.net/fontsource/fonts/{fontId}@latest/{subset}-{weight}-{style}.ttf
 */
export function getTtfUrl(fontId: string, weight: number, italic: boolean, subset: string): string {
  const style = italic ? "italic" : "normal";
  return `${CDN_BASE}/${fontId}@latest/${subset}-${weight}-${style}.ttf`;
}

/**
 * Download a single subset's TTF font data as Uint8Array.
 */
export async function downloadSubsetTtf(
  fontId: string,
  weight: number,
  italic: boolean,
  subset: string,
): Promise<Uint8Array> {
  const url = getTtfUrl(fontId, weight, italic, subset);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to download font ${fontId} ${subset}-${weight}-${italic ? "italic" : "normal"}: ${res.status}`,
    );
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Download TTF data for all subsets of a font variant.
 * Returns an array of { subset, data } for each successfully downloaded subset.
 * Individual subset failures are logged but don't fail the whole operation.
 */
export async function downloadAllSubsets(
  fontId: string,
  weight: number,
  italic: boolean,
  subsets: string[],
): Promise<Array<{ subset: string; data: Uint8Array }>> {
  const results = await Promise.allSettled(
    subsets.map(async (subset) => ({
      subset,
      data: await downloadSubsetTtf(fontId, weight, italic, subset),
    })),
  );

  const successful: Array<{ subset: string; data: Uint8Array }> = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      successful.push(result.value);
    } else {
      console.warn(`[FontService] Subset download failed:`, result.reason);
    }
  }
  return successful;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

/** Get human-readable weight name. */
export function getWeightName(weight: number): string {
  return WEIGHT_NAMES[weight] ?? `${weight}`;
}

/** Find the nearest available weight for a font. */
export function findNearestWeight(available: number[], target: number): number {
  if (available.length === 0) return 400;
  let nearest = available[0];
  let minDist = Math.abs(target - nearest);
  for (const w of available) {
    const dist = Math.abs(target - w);
    if (dist < minDist) {
      minDist = dist;
      nearest = w;
    }
  }
  return nearest;
}
