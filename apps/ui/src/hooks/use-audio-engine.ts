/**
 * useAudioEngine - React hook for audio playback
 *
 * Uses the WASM audio engine with streaming decode via MediaBunny.
 * Audio data is decoded and uploaded incrementally, so playback can
 * start as soon as the first chunks are available.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { BrowserAudioEngine, type AudioTimelineState } from "@tooscut/render-engine";
import { useVideoEditorStore } from "../state/video-editor-store";
import { useAssetStore } from "../components/timeline/use-asset-store";
import audioWasmUrl from "@tooscut/render-engine/wasm/audio-engine/audio_engine_bg.wasm?url";
import audioWorkletUrl from "@tooscut/render-engine/dist/worklet/audio-engine.worklet.iife.js?url";

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
  const currentTime = useVideoEditorStore((state) => state.currentTime);
  const seekVersion = useVideoEditorStore((state) => state.seekVersion);

  const assets = useAssetStore((state) => state.assets);

  // Initialize WASM engine
  useEffect(() => {
    const engine = new BrowserAudioEngine({
      sampleRate: 48000,
      workletPath: audioWorkletUrl,
      wasmPath: audioWasmUrl,
    });

    engineRef.current = engine;

    engine
      .init()
      .then(() => {
        setIsWasmReady(true);
        setError(null);
      })
      .catch((err) => {
        console.error("[useAudioEngine] Failed to initialize WASM:", err);
        setError(err);
      });

    return () => {
      engine.dispose();
      engineRef.current = null;
      uploadedSourcesRef.current.clear();
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

  // Sync timeline state to WASM engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isWasmReady) return;

    const audioClips = clips
      .filter((c) => c.type === "audio")
      .map((clip) => ({
        id: clip.id,
        sourceId: clip.assetId || clip.id,
        trackId: clip.trackId,
        startTime: clip.startTime,
        duration: clip.duration,
        inPoint: clip.inPoint,
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
  }, [clips, tracks, isWasmReady]);

  // Sync playback state
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !isWasmReady) return;

    if (isPlaying) {
      const time = useVideoEditorStore.getState().currentTime;
      void engine.resume().then(() => {
        engine.seek(time);
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
      engine.seek(useVideoEditorStore.getState().currentTime);
    }
  }, [seekVersion, isWasmReady]);

  // Sync seek position when not playing (for undo/redo, programmatic time changes)
  useEffect(() => {
    if (isPlaying) return;
    const engine = engineRef.current;
    if (engine && isWasmReady) {
      engine.seek(currentTime);
    }
  }, [currentTime, isPlaying, isWasmReady]);

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
  };
}
