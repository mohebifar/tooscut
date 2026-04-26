/**
 * TAMS configuration store.
 * Persisted to localStorage, separate from project state (not undo-tracked).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TamsConfig } from "../lib/tams-client";

export type AssetSource = "local" | "tams";

interface TamsSettingsState {
  /** Active asset source in the Assets panel */
  assetSource: AssetSource;
  /** TAMS connection configuration */
  tamsConfig: TamsConfig | null;
  /** Whether the connection has been verified */
  isConnected: boolean;
  /** Last connection error */
  connectionError: string | null;

  setAssetSource: (source: AssetSource) => void;
  setTamsConfig: (config: TamsConfig | null) => void;
  setConnected: (connected: boolean) => void;
  setConnectionError: (error: string | null) => void;
}

export const useTamsSettingsStore = create<TamsSettingsState>()(
  persist(
    (set) => ({
      assetSource: "local",
      tamsConfig: null,
      isConnected: false,
      connectionError: null,

      setAssetSource: (source) => set({ assetSource: source }),
      setTamsConfig: (config) => set({ tamsConfig: config, isConnected: false, connectionError: null }),
      setConnected: (connected) => set({ isConnected: connected }),
      setConnectionError: (error) => set({ connectionError: error, isConnected: false }),
    }),
    {
      name: "tooscut-tams-settings",
      partialize: (state) => ({
        tamsConfig: state.tamsConfig,
        assetSource: state.assetSource,
      }),
    },
  ),
);
