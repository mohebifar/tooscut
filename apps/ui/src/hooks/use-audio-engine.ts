/**
 * useAudioEngine - React hook for audio playback
 *
 * Uses the WASM audio engine with windowed decode-ahead via MediaBunny.
 * All store values are in frames; this hook converts to seconds at the
 * audio engine boundary.
 */

import {
  BrowserAudioEngine,
  framesToSeconds,
  type AudioTimelineState,
} from "@tooscut/render-engine";
import audioWorkletUrl from "@tooscut/render-engine/dist/worklet/audio-engine.worklet.iife.js?url";
import audioWasmUrl from "@tooscut/render-engine/wasm/audio-engine/audio_engine_bg.wasm?url";
import { useEffect, useRef, useCallback, useState } from "react";

import { useAssetStore } from "../components/timeline/use-asset-store";
import { useVideoEditorStore } from "../state/video-editor-store";

/** Module-level ref so other components can access the engine for metering */
let _audioEngineInstance: BrowserAudioEngine | null = null;

/** Get the current audio engine instance (for metering, etc.) */
export function getAudioEngine(): BrowserAudioEngine | null {
  return _audioEngineInstance;
}

/**
 * Hook to manage audio playback in the video editor
 */
export function useAudioEngine() {
  const engineRef = useRef<BrowserAudioEngine | null>(null);
  const [isWasmReady, setIsWasmReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Keep track of uploaded sources to avoid re-uploading
  const uploadedSourcesRef = useRef<Set<string>>(new Set());

  // Store selectors
  const clips = useVideoEditorStore((state) => state.clips);
  const tracks = useVideoEditorStore((state) => state.tracks);
  const isPlaying = useVideoEditorStore((state) => state.isPlaying);
  const currentFrame = useVideoEditorStore((state) => state.currentFrame);
  const seekVersion = useVideoEditorStore((state) => state.seekVersion);
  const fps = useVideoEditorStore((state) => state.settings.fps);

  const assets = useAssetStore((state) => state.assets);

  // Initialize WASM engine
  useEffect(() => {
    const engine = new BrowserAudioEngine({
      sampleRate: 48000,
      workletPath: audioWorkletUrl,
      wasmPath: audioWasmUrl,
    });

    engineRef.current = engine;
    _audioEngineInstance = engine;

    engine
      .init()
      .then(() => {
        setIsWasmReady(true);
        setError(null);
      })
      .catch((err: unknown) => {
        console.error("[useAudioEngine] Failed to initialize WASM:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      });

    const uploadedSources = uploadedSourcesRef.current;
    return () => {
      engine.dispose();
      engineRef.current = null;
      _audioEngineInstance = null;
      uploadedSources.clear();
    };
  }, []);

  // Register audio sources for windowed decode-ahead playback
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isWasmReady) return;

    const audioAssets = assets.filter((a) => a.type === "video" || a.type === "audio");

    for (const asset of audioAssets) {
      if (uploadedSourcesRef.current.has(asset.id)) continue;
      uploadedSourcesRef.current.add(asset.id);

      engine.registerAudioSource(asset.id, asset.file).catch((err) => {
        console.error(`[useAudioEngine] Failed to register audio for ${asset.id}:`, err);
        uploadedSourcesRef.current.delete(asset.id);
      });
    }
  }, [assets, isWasmReady]);

  // Sync timeline state to WASM engine (convert frames → seconds)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isWasmReady) return;

    const audioClips = clips
      .filter((c) => c.type === "audio")
      .map((clip) => ({
        id: clip.id,
        sourceId: clip.assetId || clip.id,
        trackId: clip.trackId,
        startTime: framesToSeconds(clip.startTime, fps),
        duration: framesToSeconds(clip.duration, fps),
        inPoint: framesToSeconds(clip.inPoint, fps),
        speed: clip.speed,
        gain: clip.volume ?? 1.0,
        fadeIn: 0,
        fadeOut: 0,
        keyframes: clip.keyframes,
        effects: clip.audioEffects,
      }));

    const audioTracks = tracks
      .filter((t) => t.type === "audio")
      .map((track) => ({
        id: track.id,
        volume: track.volume,
        pan: 0,
        mute: track.muted,
        solo: false,
      }));

    const timelineState: AudioTimelineState = {
      clips: audioClips,
      tracks: audioTracks,
      crossTransitions: [],
    };

    engine.setTimeline(timelineState);
  }, [clips, tracks, fps, isWasmReady]);

  // Sync playback state (convert frame → seconds for seek)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isWasmReady) return;

    if (isPlaying) {
      const frame = useVideoEditorStore.getState().currentFrame;
      const seekFps = useVideoEditorStore.getState().settings.fps;
      void engine.resume().then(() => {
        engine.seek(framesToSeconds(frame, seekFps));
        engine.setPlaying(true);
      });
    } else {
      engine.setPlaying(false);
    }
  }, [isPlaying, isWasmReady]);

  // Seek audio on explicit user action (works during playback and when paused)
  useEffect(() => {
    if (seekVersion === 0) return;
    const engine = engineRef.current;
    if (engine && isWasmReady) {
      const state = useVideoEditorStore.getState();
      engine.seek(framesToSeconds(state.currentFrame, state.settings.fps));
    }
  }, [seekVersion, isWasmReady]);

  // Sync seek position when not playing (for undo/redo, programmatic time changes)
  useEffect(() => {
    if (isPlaying) return;
    const engine = engineRef.current;
    if (engine && isWasmReady) {
      engine.seek(framesToSeconds(currentFrame, fps));
    }
  }, [currentFrame, isPlaying, fps, isWasmReady]);

  // Resume audio context on user interaction
  const resume = useCallback(async () => {
    const engine = engineRef.current;
    if (engine) {
      await engine.resume();
    }
  }, []);

  return {
    isReady: isWasmReady,
    isWasmReady,
    error,
    resume,
    engineRef,
  };
}
