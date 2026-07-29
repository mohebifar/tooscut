/**
 * Transient (not undo-tracked, not persisted) state for the color matching
 * workflow: the user scrubs to a reference frame, captures it, scrubs to a
 * target frame, then applies a correction derived from the two.
 */

import type { ChannelStats } from "@tooscut/render-engine";

import { create } from "zustand";

interface ColorMatchState {
  referenceStats: ChannelStats | null;
  /** Human-readable description of when the reference was captured. */
  referenceLabel: string | null;
  setReference: (stats: ChannelStats, label: string) => void;
  clearReference: () => void;
}

export const useColorMatchStore = create<ColorMatchState>((set) => ({
  referenceStats: null,
  referenceLabel: null,
  setReference: (stats, label) => set({ referenceStats: stats, referenceLabel: label }),
  clearReference: () => set({ referenceStats: null, referenceLabel: null }),
}));
