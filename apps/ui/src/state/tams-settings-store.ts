/**
 * TAMS configuration store.
 * Persisted to localStorage, separate from project state (not undo-tracked).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { TamsConfig } from "../lib/tams-client";

interface TamsSettingsState {
  /** TAMS connection configuration */
  tamsConfig: TamsConfig | null;
  /** Whether the connection has been verified */
  isConnected: boolean;
  /** Last connection error */
  connectionError: string | null;

  setTamsConfig: (config: TamsConfig | null) => void;
  setConnected: (connected: boolean) => void;
  setConnectionError: (error: string | null) => void;
}

export const useTamsSettingsStore = create<TamsSettingsState>()(
  persist(
    (set) => ({
      tamsConfig: null,
      isConnected: false,
      connectionError: null,

      setTamsConfig: (config) => set({ tamsConfig: config, isConnected: false, connectionError: null }),
      setConnected: (connected) => set({ isConnected: connected }),
      setConnectionError: (error) => set({ connectionError: error, isConnected: false }),
    }),
    {
      name: "tooscut-tams-settings",
      partialize: (state) => ({
        tamsConfig: state.tamsConfig,
      }),
    },
  ),
);
