/**
 * Font store — manages font catalog, per-variant loading state,
 * and the bridge to the WASM compositor's loadFont() pipeline.
 */
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import type { EditorClip } from "./video-editor-store";

import {
  fetchFontCatalog,
  downloadAllSubsets,
  findNearestWeight,
  type FontsourceFontEntry,
} from "../lib/font-service";

type FontVariantStatus = "idle" | "loading" | "loaded" | "error";

type LoadFontFn = (family: string, data: Uint8Array) => Promise<boolean>;

/** Build a unique key for a font variant. */
function variantKey(fontId: string, weight: number, italic: boolean): string {
  return `${fontId}|${weight}|${italic ? "italic" : "normal"}`;
}

/** Fonts embedded in the WASM compositor — always considered loaded. */
const EMBEDDED_FAMILIES = new Set(["DejaVu Sans", "Noto Sans", "Noto Sans Arabic"]);

/** Synchronous lock to prevent race conditions in ensureFontVariant. */
const inFlightLoads = new Set<string>();

/** Module-level promise so concurrent fetchCatalog callers can await the same fetch. */
let catalogFetchPromise: Promise<void> | null = null;

interface FontStoreState {
  // Catalog
  catalog: FontsourceFontEntry[];
  catalogLoading: boolean;
  catalogError: string | null;

  // Per-variant status keyed by "fontId|weight|normal/italic"
  variantStatus: Record<string, FontVariantStatus>;

  // Incremented each time a font finishes loading — used to trigger preview re-renders
  fontLoadVersion: number;

  // Compositor bridge
  compositorLoadFont: LoadFontFn | null;
  compositorReady: boolean;

  // Queued loads waiting for compositor
  pendingQueue: Array<{
    fontId: string;
    family: string;
    weight: number;
    italic: boolean;
    subsets: string[];
  }>;

  // Actions
  fetchCatalog: () => Promise<void>;
  setCompositorFunctions: (loadFont: LoadFontFn) => void;
  clearCompositorFunctions: () => void;
  ensureFontVariant: (
    fontId: string,
    family: string,
    weight: number,
    italic: boolean,
    subsets: string[],
  ) => Promise<boolean>;
  ensureClipFonts: (clips: EditorClip[]) => Promise<void>;

  // Selectors
  getFontByFamily: (family: string) => FontsourceFontEntry | undefined;
  getVariantStatus: (fontId: string, weight: number, italic: boolean) => FontVariantStatus;
  isVariantLoaded: (fontId: string, weight: number, italic: boolean) => boolean;
  isVariantLoading: (fontId: string, weight: number, italic: boolean) => boolean;
}

export const useFontStore = create<FontStoreState>()(
  subscribeWithSelector((set, get) => ({
    catalog: [],
    catalogLoading: false,
    catalogError: null,
    variantStatus: {},
    fontLoadVersion: 0,
    compositorLoadFont: null,
    compositorReady: false,
    pendingQueue: [],

    fetchCatalog: async () => {
      // Already fetched
      if (get().catalog.length > 0) return;

      // Another fetch is in flight — wait for it instead of starting a new one
      if (catalogFetchPromise) return catalogFetchPromise;

      catalogFetchPromise = (async () => {
        set({ catalogLoading: true, catalogError: null });

        try {
          const catalog = await fetchFontCatalog();
          set({ catalog, catalogLoading: false });
        } catch (err) {
          set({
            catalogLoading: false,
            catalogError: err instanceof Error ? err.message : "Failed to fetch catalog",
          });
        } finally {
          catalogFetchPromise = null;
        }
      })();

      return catalogFetchPromise;
    },

    setCompositorFunctions: (loadFont: LoadFontFn) => {
      set({ compositorLoadFont: loadFont, compositorReady: true });

      // Drain pending queue
      const pending = get().pendingQueue;
      if (pending.length > 0) {
        set({ pendingQueue: [] });
        for (const item of pending) {
          void get().ensureFontVariant(
            item.fontId,
            item.family,
            item.weight,
            item.italic,
            item.subsets,
          );
        }
      }
    },

    clearCompositorFunctions: () => {
      set({ compositorLoadFont: null, compositorReady: false });
    },

    ensureFontVariant: async (
      fontId: string,
      family: string,
      weight: number,
      italic: boolean,
      subsets: string[],
    ): Promise<boolean> => {
      // Embedded fonts are always available
      if (EMBEDDED_FAMILIES.has(family)) return true;

      const key = variantKey(fontId, weight, italic);
      const status = get().variantStatus[key];

      // Already loaded or in progress (check both Zustand state and sync lock)
      if (status === "loaded") return true;
      if (status === "loading" || inFlightLoads.has(key)) return false;

      // Queue if compositor not ready yet
      if (!get().compositorReady || !get().compositorLoadFont) {
        set((s) => ({
          pendingQueue: [...s.pendingQueue, { fontId, family, weight, italic, subsets }],
        }));
        return false;
      }

      // Synchronously acquire lock before any async operation
      inFlightLoads.add(key);

      // Mark as loading in Zustand
      set((s) => ({
        variantStatus: { ...s.variantStatus, [key]: "loading" },
      }));

      try {
        // Download all subsets for this variant in parallel
        console.log(`[FontStore] Downloading ${subsets.length} subsets for ${family}:`, subsets);
        const subsetResults = await downloadAllSubsets(fontId, weight, italic, subsets);
        console.log(
          `[FontStore] Downloaded ${subsetResults.length} subsets for ${family}:`,
          subsetResults.map((r) => r.subset),
        );

        const loadFont = get().compositorLoadFont;
        if (!loadFont) {
          set((s) => ({
            variantStatus: { ...s.variantStatus, [key]: "error" },
          }));
          inFlightLoads.delete(key);
          return false;
        }

        // Load each subset into the compositor (cosmic-text merges them in fontdb)
        let anySuccess = false;
        for (const { subset, data } of subsetResults) {
          console.log(
            `[FontStore] Loading subset ${subset} (${data.byteLength} bytes) for ${family}`,
          );
          const success = await loadFont(family, data);
          console.log(`[FontStore] Loaded subset ${subset} for ${family}: ${success}`);
          if (success) anySuccess = true;
        }

        set((s) => ({
          variantStatus: { ...s.variantStatus, [key]: anySuccess ? "loaded" : "error" },
          // Increment version to trigger preview re-render
          fontLoadVersion: anySuccess ? s.fontLoadVersion + 1 : s.fontLoadVersion,
        }));
        inFlightLoads.delete(key);
        return anySuccess;
      } catch (err) {
        console.error(`[FontStore] Failed to load font variant ${key}:`, err);
        set((s) => ({
          variantStatus: { ...s.variantStatus, [key]: "error" },
        }));
        inFlightLoads.delete(key);
        return false;
      }
    },

    ensureClipFonts: async (clips: EditorClip[]) => {
      // Ensure catalog is available before looking up font families
      await get().fetchCatalog();

      const state = get();
      const catalog = state.catalog;

      // Build family→FontsourceFontEntry lookup
      const familyMap = new Map<string, FontsourceFontEntry>();
      for (const entry of catalog) {
        familyMap.set(entry.family, entry);
      }

      // Extract unique (family, weight, italic) tuples from text clips
      const seen = new Set<string>();
      const variants: Array<{
        fontId: string;
        family: string;
        weight: number;
        italic: boolean;
        subsets: string[];
      }> = [];

      for (const clip of clips) {
        if (clip.type !== "text") continue;
        const { font_family, font_weight, italic } = clip.textStyle;

        // Skip embedded fonts
        if (EMBEDDED_FAMILIES.has(font_family)) continue;

        const key = `${font_family}|${font_weight}|${italic}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const entry = familyMap.get(font_family);
        if (!entry) continue;

        // Snap weight to nearest available
        const actualWeight = findNearestWeight(entry.weights, font_weight);

        variants.push({
          fontId: entry.id,
          family: font_family,
          weight: actualWeight,
          italic: italic && entry.styles.includes("italic"),
          subsets: entry.subsets,
        });
      }

      // Fire all variant loads concurrently
      await Promise.allSettled(
        variants.map((v) =>
          state.ensureFontVariant(v.fontId, v.family, v.weight, v.italic, v.subsets),
        ),
      );
    },

    getFontByFamily: (family: string) => {
      return get().catalog.find((f) => f.family === family);
    },

    getVariantStatus: (fontId: string, weight: number, italic: boolean) => {
      return get().variantStatus[variantKey(fontId, weight, italic)] ?? "idle";
    },

    isVariantLoaded: (fontId: string, weight: number, italic: boolean) => {
      if (EMBEDDED_FAMILIES.has(fontId)) return true;
      return get().variantStatus[variantKey(fontId, weight, italic)] === "loaded";
    },

    isVariantLoading: (fontId: string, weight: number, italic: boolean) => {
      return get().variantStatus[variantKey(fontId, weight, italic)] === "loading";
    },
  })),
);
