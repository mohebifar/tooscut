/**
 * Preview panel component that renders the current frame.
 *
 * Uses the GPU compositor from @tooscut/render-engine running in a
 * dedicated web worker with OffscreenCanvas for zero-copy rendering.
 *
 * Architecture:
 * - Compositor runs in web worker (off main thread)
 * - Canvas transferred via transferControlToOffscreen()
 * - VideoFrameLoader in 'preview' mode uses HTMLVideoElement
 * - During playback: videos play naturally, frames extracted periodically
 * - During scrubbing: seek and extract frames
 * - ImageBitmaps transferred (not copied) to worker
 */
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { EvaluatorManager, VideoFrameLoaderManager } from "@tooscut/render-engine";
import { useVideoEditorStore, type VideoClip } from "../../state/video-editor-store";
import { useAssetStore, type MediaAsset } from "../timeline/use-asset-store";
import { useFontStore } from "../../state/font-store";
import {
  createCompositorApi,
  setSharedCompositor,
  type CompositorApi,
} from "../../workers/compositor-api";
import { buildLayersForTime, calculateSourceTime } from "../../lib/layer-builder";
import { TransformOverlay } from "./transform/transform-overlay";

// Image element entry for the pool
interface ImageEntry {
  element: HTMLImageElement;
  assetId: string;
  objectUrl: string;
  isReady: boolean;
}

export function PreviewPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<CompositorApi | null>(null);
  const evaluatorManagerRef = useRef(new EvaluatorManager());
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Video frame loader manager - uses HTMLVideoElement in preview mode
  const loaderManagerRef = useRef(new VideoFrameLoaderManager({ mode: "preview" }));

  // Image element pool - keyed by asset ID
  const imageElementsRef = useRef<Map<string, ImageEntry>>(new Map());

  // Track which textures have been uploaded to avoid re-uploading static images
  const uploadedTexturesRef = useRef<Set<string>>(new Set());

  // Track which video elements we've started playing during this playback session.
  // Keyed by assetId. Prevents re-entering the "paused" seek path on every frame
  // while play() is still resolving.
  const playingVideoAssetsRef = useRef<Set<string>>(new Set());

  // Animation frame ID for cleanup
  const rafIdRef = useRef<number | null>(null);
  // Serialise render calls so texture uploads + renderFrame are atomic.
  // When a render is in-flight, skip new frames to avoid interleaved messages.
  const renderingRef = useRef(false);
  // When a render is skipped because one is in-flight, schedule a re-render
  // after the current one completes. This prevents lost frames during init races.
  const pendingRenderRef = useRef(false);
  // Track if playback engine is running
  const isPlaybackEngineRunningRef = useRef(false);
  // Playback timing
  const playbackStartTimeRef = useRef(0);
  const playbackStartPositionRef = useRef(0);
  const lastStoreUpdateRef = useRef(0);
  // Last time value written by the tick loop (to detect external seeks)
  const lastTickTimeRef = useRef(0);

  // Store state - only subscribe to things that need re-renders
  const settings = useVideoEditorStore((s) => s.settings);
  const previewMode = useVideoEditorStore((s) => s.previewMode);
  const isPlaying = useVideoEditorStore((s) => s.isPlaying);
  const setCurrentTime = useVideoEditorStore((s) => s.setCurrentTime);
  const duration = useVideoEditorStore((s) => s.duration);

  // Keep refs in sync with store state
  const isPlayingRef = useRef(isPlaying);
  const durationRef = useRef(duration);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Assets are managed in a separate store for file handling
  const assets = useAssetStore((s) => s.assets);

  // Create asset map for quick lookup — kept in a ref so renderFrame always
  // reads the latest assets without needing to be recreated on every change.
  const assetMapRef = useRef(new Map<string, MediaAsset>());
  useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const asset of assets) {
      map.set(asset.id, asset);
    }
    assetMapRef.current = map;
    return map;
  }, [assets]);

  // Guard against double-initialization from React strict mode.
  // transferControlToOffscreen() is a one-shot operation per canvas element,
  // so we must ensure initialization only happens once.
  const initStartedRef = useRef(false);

  // Initialize compositor (worker-based)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || initStartedRef.current) return;
    initStartedRef.current = true;

    const initCompositor = async () => {
      try {
        // Read current settings at init time (may still be defaults if loadProject
        // hasn't completed yet — the resize effect below handles the correction).
        const { width, height } = useVideoEditorStore.getState().settings;
        const compositor = createCompositorApi({
          canvas,
          width,
          height,
        });

        await compositor.initialize();

        compositorRef.current = compositor;
        setSharedCompositor(compositor);

        // If project settings were loaded while the compositor was initializing,
        // the resize effect would have been skipped (isReady was false). Catch up now.
        const current = useVideoEditorStore.getState().settings;
        if (current.width !== width || current.height !== height) {
          compositor.resize(current.width, current.height);
        }

        setIsInitialized(true);
        setError(null);

        // Register compositor's loadFont with font store
        useFontStore.getState().setCompositorFunctions(compositor.loadFont.bind(compositor));

        // Render initial frame after React settles. The scrubbing effect should
        // handle this, but we add redundant attempts on successive animation frames
        // to cover timing races between compositor init and project loading.
        const renderInitialFrame = () => {
          if (compositorRef.current?.isReady && !isPlayingRef.current) {
            void renderFrameRef.current?.(useVideoEditorStore.getState().currentTime);
          }
        };
        // First attempt: next animation frame (after React commit + effects)
        requestAnimationFrame(() => {
          renderInitialFrame();
          // Second attempt: one more frame for the browser to composite
          requestAnimationFrame(renderInitialFrame);
        });
      } catch (err) {
        console.error("[PreviewPanel] Failed to initialize compositor:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize GPU");
      }
    };

    void initCompositor();
  }, []);

  // Separate cleanup effect — runs only on actual component unmount.
  // Kept separate from init so React strict mode double-mount doesn't
  // dispose the compositor between mount cycles.
  useEffect(() => {
    return () => {
      useFontStore.getState().clearCompositorFunctions();
      setSharedCompositor(null);
      if (compositorRef.current) {
        compositorRef.current.dispose();
        compositorRef.current = null;
      }
    };
  }, []);

  // Resize compositor when settings change, then re-render the current frame.
  // resize() and renderFrame() go through the same Comlink channel, so the
  // worker processes the resize before the subsequent render.
  useEffect(() => {
    if (compositorRef.current?.isReady) {
      compositorRef.current.resize(settings.width, settings.height);
      void renderFrameRef.current?.(useVideoEditorStore.getState().currentTime);
    }
  }, [settings.width, settings.height]);

  // Create or get image element for an asset
  const getOrCreateImageElement = useCallback((asset: MediaAsset): ImageEntry | null => {
    const existing = imageElementsRef.current.get(asset.id);
    if (existing) return existing;

    const img = document.createElement("img");
    const objectUrl = URL.createObjectURL(asset.file);
    img.src = objectUrl;

    const entry: ImageEntry = {
      element: img,
      assetId: asset.id,
      objectUrl,
      isReady: false,
    };

    img.onload = () => {
      entry.isReady = true;
    };

    imageElementsRef.current.set(asset.id, entry);
    return entry;
  }, []);

  // Initialize image elements for assets
  useEffect(() => {
    if (!isInitialized) return;

    const imageAssets = assets.filter((a) => a.type === "image");
    for (const asset of imageAssets) {
      getOrCreateImageElement(asset);
    }

    return () => {
      const currentAssetIds = new Set(assets.map((a) => a.id));
      for (const [assetId, entry] of imageElementsRef.current) {
        if (!currentAssetIds.has(assetId)) {
          URL.revokeObjectURL(entry.objectUrl);
          imageElementsRef.current.delete(assetId);
          uploadedTexturesRef.current.delete(assetId);
        }
      }
    };
  }, [assets, isInitialized, getOrCreateImageElement]);

  /**
   * Render a frame at the given timeline time.
   * During playback: extracts frames from playing video elements.
   * During scrubbing: seeks and extracts frames.
   */
  const renderFrame = useCallback(
    async (time: number) => {
      const compositor = compositorRef.current;
      if (!compositor?.isReady) return;

      // Serialise render calls: if a previous render is still in-flight,
      // skip this frame.  This prevents interleaved texture-upload +
      // renderFrame messages that cause stale-texture flashes.
      if (renderingRef.current) {
        // Mark that a render was requested so it's retried after the
        // current one completes (only matters when paused/scrubbing —
        // during playback the tick loop naturally retries).
        pendingRenderRef.current = true;
        return;
      }
      renderingRef.current = true;

      try {
        const state = useVideoEditorStore.getState();
        const currentClips = state.clips;
        const currentTracks = state.tracks;
        const currentSettings = state.settings;
        const currentCrossTransitions = state.crossTransitions;

        // Use layer-builder to get visible clips and render frame
        const { frame, visibleMediaClips, crossTransitionTextureMap } = buildLayersForTime({
          clips: currentClips,
          tracks: currentTracks,
          crossTransitions: currentCrossTransitions,
          settings: currentSettings,
          timelineTime: time,
          evaluatorManager: evaluatorManagerRef.current,
        });

        const loaderManager = loaderManagerRef.current;

        // Process video clips - upload textures
        for (const clip of visibleMediaClips) {
          if (clip.type !== "video") continue;

          const assetId = clip.assetId || clip.id;
          const textureId = crossTransitionTextureMap.get(clip.id) ?? assetId;
          const asset = assetMapRef.current.get(assetId);
          if (!asset?.file) continue;

          // Use a per-clip loader key for cross-transition clips so each clip
          // gets its own HTMLVideoElement — two clips of the same asset can't
          // share one video element during a cross-fade.
          const isInCrossTransition = crossTransitionTextureMap.has(clip.id);
          const loaderKey = isInCrossTransition ? `${assetId}:${clip.id}` : assetId;

          const sourceTime = calculateSourceTime(time, clip);

          try {
            const loader = await loaderManager.getLoader(loaderKey, asset.file);
            const videoElement = loader.getVideoElement();

            if (videoElement) {
              if (isPlayingRef.current) {
                const alreadyStarted = playingVideoAssetsRef.current.has(loaderKey);

                if (videoElement.paused && !alreadyStarted) {
                  // Video element is paused but playback is active — this clip
                  // just became visible (e.g. incoming clip of a cross-fade).
                  // Start it playing so frames advance naturally.
                  playingVideoAssetsRef.current.add(loaderKey);
                  videoElement.currentTime = sourceTime;
                  videoElement.play().catch(() => {});
                  // Use seek-based extraction for the first frame to ensure
                  // the compositor has a valid texture while play() resolves.
                  const bitmap = await loader.getImageBitmap(sourceTime);
                  compositor.uploadBitmap(bitmap, textureId);
                } else {
                  let drifted = false;
                  if (!videoElement.paused) {
                    // Video is playing — check drift to handle clip boundaries
                    // where a different clip of the same asset starts at a
                    // different inPoint (e.g. after a cross-transition ends and
                    // the incoming clip switches from per-clip to shared loader).
                    const drift = Math.abs(videoElement.currentTime - sourceTime);
                    if (drift > 0.15) {
                      drifted = true;
                    }
                  }

                  if (drifted) {
                    // Video drifted — use seek-based extraction to avoid
                    // uploading a stale frame from the old position.
                    const bitmap = await loader.getImageBitmap(sourceTime);
                    compositor.uploadBitmap(bitmap, textureId);
                    // Resume playing from the corrected position
                    videoElement.currentTime = sourceTime;
                    videoElement.play().catch(() => {});
                  } else if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                    // Extract frame from current position (video is playing or
                    // play() is resolving — avoid slow seek path)
                    const bitmap = await createImageBitmap(videoElement);
                    compositor.uploadBitmap(bitmap, textureId);
                  }
                }
              } else {
                // Scrubbing or paused - seek to exact time
                const bitmap = await loader.getImageBitmap(sourceTime);
                compositor.uploadBitmap(bitmap, textureId);
              }
            }
          } catch {
            // Ignore frame extraction errors
          }
        }

        // Process image clips - upload textures
        for (const clip of visibleMediaClips) {
          if (clip.type !== "image") continue;

          const assetId = clip.assetId || clip.id;
          const textureId = crossTransitionTextureMap.get(clip.id) ?? assetId;

          if (!uploadedTexturesRef.current.has(textureId)) {
            const entry = imageElementsRef.current.get(assetId);
            if (entry?.isReady) {
              try {
                const bitmap = await createImageBitmap(entry.element);
                compositor.uploadBitmap(bitmap, textureId);
                uploadedTexturesRef.current.add(textureId);
              } catch {
                // Ignore
              }
            }
          }
        }

        compositor.renderFrame(frame);
      } finally {
        renderingRef.current = false;

        // If a render was requested while we were busy, process it now.
        // Only when paused/scrubbing — during playback the tick loop retries naturally.
        if (pendingRenderRef.current && !isPlayingRef.current) {
          pendingRenderRef.current = false;
          requestAnimationFrame(() => {
            if (!isPlayingRef.current) {
              void renderFrameRef.current?.(useVideoEditorStore.getState().currentTime);
            }
          });
        }
      }
    },
    [isInitialized],
  );

  const renderFrameRef = useRef(renderFrame);
  useEffect(() => {
    renderFrameRef.current = renderFrame;
  }, [renderFrame]);

  /**
   * Animation loop for playback
   */
  const tick = useCallback(
    (timestamp: number) => {
      if (!isPlayingRef.current) return;

      // Detect external seek (e.g., playhead drag) by comparing store time
      // with what we last wrote. If they differ, re-anchor playback from there.
      const storeTime = useVideoEditorStore.getState().currentTime;
      if (Math.abs(storeTime - lastTickTimeRef.current) > 0.01) {
        playbackStartPositionRef.current = storeTime;
        playbackStartTimeRef.current = timestamp;
      }

      const elapsed = (timestamp - playbackStartTimeRef.current) / 1000;
      const newTime = playbackStartPositionRef.current + elapsed;

      if (newTime >= durationRef.current) {
        isPlaybackEngineRunningRef.current = false;
        playingVideoAssetsRef.current.clear();
        setCurrentTime(durationRef.current);
        lastTickTimeRef.current = durationRef.current;
        useVideoEditorStore.getState().setIsPlaying(false);
        // Pause all videos and dispose per-clip loaders
        const loaderManager = loaderManagerRef.current;
        for (const clip of useVideoEditorStore.getState().clips) {
          if (clip.type === "video") {
            const assetId = clip.assetId || clip.id;
            loaderManager.getExistingLoader(assetId)?.pause();
            const perClipKey = `${assetId}:${clip.id}`;
            if (loaderManager.hasLoader(perClipKey)) {
              loaderManager.disposeLoader(perClipKey);
            }
          }
        }
        return;
      }

      // Update store time periodically (~30fps for smooth playhead movement)
      const timeSinceStoreUpdate = timestamp - lastStoreUpdateRef.current;
      if (timeSinceStoreUpdate >= 33) {
        setCurrentTime(newTime);
        lastTickTimeRef.current = newTime;
        lastStoreUpdateRef.current = timestamp;
      }

      void renderFrameRef.current?.(newTime);
      rafIdRef.current = requestAnimationFrame(tick);
    },
    [setCurrentTime],
  );

  /**
   * Start playback engine - starts video elements playing
   */
  const startPlaybackEngine = useCallback(async () => {
    if (isPlaybackEngineRunningRef.current) return;
    isPlaybackEngineRunningRef.current = true;

    const state = useVideoEditorStore.getState();
    const time = state.currentTime;
    const dur = state.duration;

    const startTime = time >= dur ? 0 : time;
    if (time >= dur) {
      setCurrentTime(0);
    }

    const loaderManager = loaderManagerRef.current;
    const clips = state.clips;

    // Reset the set of video elements we've started playing
    playingVideoAssetsRef.current.clear();

    // Start playing video elements for visible clips
    const visibleVideoClips = clips.filter(
      (c): c is VideoClip =>
        c.type === "video" && startTime >= c.startTime && startTime < c.startTime + c.duration,
    );

    // Build cross-transition clip set for per-clip loader keys
    const crossTransitionClipIds = new Set<string>();
    for (const ct of state.crossTransitions) {
      crossTransitionClipIds.add(ct.outgoingClipId);
      crossTransitionClipIds.add(ct.incomingClipId);
    }

    for (const clip of visibleVideoClips) {
      const assetId = clip.assetId || clip.id;
      const asset = assetMapRef.current.get(assetId);
      if (!asset?.file) continue;

      const loaderKey = crossTransitionClipIds.has(clip.id) ? `${assetId}:${clip.id}` : assetId;

      try {
        const loader = await loaderManager.getLoader(loaderKey, asset.file);
        const sourceTime = calculateSourceTime(startTime, clip);
        loader.play(sourceTime);
        playingVideoAssetsRef.current.add(loaderKey);
      } catch {
        // Ignore errors
      }
    }

    playbackStartTimeRef.current = performance.now();
    playbackStartPositionRef.current = startTime;
    lastTickTimeRef.current = startTime;
    lastStoreUpdateRef.current = performance.now();
    rafIdRef.current = requestAnimationFrame(tick);
  }, [setCurrentTime, tick, calculateSourceTime]);

  /**
   * Stop playback engine - pauses video elements
   */
  const stopPlaybackEngine = useCallback(() => {
    isPlaybackEngineRunningRef.current = false;
    playingVideoAssetsRef.current.clear();

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Pause all video elements (including per-clip loaders from cross-transitions)
    const loaderManager = loaderManagerRef.current;
    const state = useVideoEditorStore.getState();
    for (const clip of state.clips) {
      if (clip.type === "video") {
        const assetId = clip.assetId || clip.id;
        // Pause the shared loader
        loaderManager.getExistingLoader(assetId)?.pause();
        // Pause per-clip loader (used during cross-transitions)
        const perClipLoader = loaderManager.getExistingLoader(`${assetId}:${clip.id}`);
        if (perClipLoader) {
          perClipLoader.pause();
          // Dispose per-clip loaders to avoid accumulating video elements
          loaderManager.disposeLoader(`${assetId}:${clip.id}`);
        }
      }
    }
  }, []);

  // React to isPlaying changes
  useEffect(() => {
    if (isPlaying) {
      void startPlaybackEngine();
    } else {
      stopPlaybackEngine();
    }
  }, [isPlaying, startPlaybackEngine, stopPlaybackEngine]);

  // Render when scrubbing (paused) or when clips change while paused
  useEffect(() => {
    if (!isInitialized || isPlaying) return;

    const rerenderFrame = () => {
      void renderFrame(useVideoEditorStore.getState().currentTime);
    };

    // Re-render when currentTime changes (scrubbing)
    const unsubscribeTime = useVideoEditorStore.subscribe(
      (state) => state.currentTime,
      () => {
        rerenderFrame();
      },
    );

    // Re-render when clips change while paused (e.g., moving clips)
    const unsubscribeClips = useVideoEditorStore.subscribe(
      (state) => state.clips,
      () => {
        rerenderFrame();
      },
    );

    // Re-render when tracks change while paused (e.g., reordering affects z-order)
    const unsubscribeTracks = useVideoEditorStore.subscribe(
      (state) => state.tracks,
      () => {
        rerenderFrame();
      },
    );

    // Re-render when assets become available (covers asset hydration
    // completing after compositor init). Deferred via rAF so that React
    // has re-rendered and updated assetMapRef before we read from it.
    const unsubscribeAssets = useAssetStore.subscribe(() => {
      requestAnimationFrame(() => {
        if (!isPlayingRef.current && compositorRef.current?.isReady) {
          void renderFrameRef.current?.(useVideoEditorStore.getState().currentTime);
        }
      });
    });

    const unsubscribeFont = useFontStore.subscribe(
      (state) => state.fontLoadVersion,
      () => {
        // Font loaded - re-render current frame to show updated text
        rerenderFrame();
      },
    );

    rerenderFrame();
    return () => {
      unsubscribeTime();
      unsubscribeClips();
      unsubscribeTracks();
      unsubscribeAssets();
      unsubscribeFont();
    };
  }, [isInitialized, isPlaying, renderFrame]);

  // Calculate canvas size to fit container while maintaining aspect ratio
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const containerRect = container.getBoundingClientRect();
      const aspectRatio = settings.width / settings.height;
      const containerAspectRatio = containerRect.width / containerRect.height;

      let width: number;
      let height: number;

      if (containerAspectRatio > aspectRatio) {
        height = containerRect.height;
        width = height * aspectRatio;
      } else {
        width = containerRect.width;
        height = width / aspectRatio;
      }

      setCanvasSize({ width, height });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [settings.width, settings.height]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, entry] of imageElementsRef.current) {
        URL.revokeObjectURL(entry.objectUrl);
      }
      imageElementsRef.current.clear();
      loaderManagerRef.current.disposeAll();
    };
  }, []);

  // Preload fonts for text clips
  useEffect(() => {
    if (!isInitialized) return;

    const fontStore = useFontStore.getState();

    // Ensure catalog is loaded
    void fontStore.fetchCatalog();

    // Subscribe to clip changes and preload fonts
    const unsubscribe = useVideoEditorStore.subscribe(
      (state) => state.clips,
      (clips) => {
        const textClips = clips.filter((c) => c.type === "text" && c.textStyle);
        if (textClips.length > 0) {
          void useFontStore.getState().ensureClipFonts(textClips);
        }
      },
    );

    // Preload fonts for existing text clips on init
    const currentClips = useVideoEditorStore.getState().clips;
    const textClips = currentClips.filter((c) => c.type === "text" && c.textStyle);
    if (textClips.length > 0) {
      void fontStore.ensureClipFonts(textClips);
    }

    return unsubscribe;
  }, [isInitialized]);

  // ===================== ASSET DROP HANDLING =====================

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const isAssetDrag = useCallback((e: React.DragEvent) => {
    return e.dataTransfer.types.some((t) => t.startsWith("application/x-asset-type-"));
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isAssetDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current++;
      setIsDragOver(true);
    },
    [isAssetDrag],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isAssetDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [isAssetDrag],
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const assetId = e.dataTransfer.getData("application/x-asset-id");
    if (!assetId) return;

    const asset = useAssetStore.getState().assets.find((a) => a.id === assetId);
    if (!asset) return;

    const store = useVideoEditorStore.getState();
    const { tracks, clips, currentTime, addClipToTrack, addTrack, linkClipPair } = store;

    // Audio assets go to audio tracks, video/image go to video tracks
    const isAudio = asset.type === "audio";
    const requiredType = isAudio ? "audio" : "video";

    // Find the frontmost (highest index) track of the required type
    const candidateTracks = tracks
      .filter((t) => t.type === requiredType)
      .sort((a, b) => b.index - a.index);

    let targetTrack: (typeof candidateTracks)[number] | null = candidateTracks[0] ?? null;

    // Check if the frontmost track is occupied at the playhead position
    if (targetTrack) {
      const occupied = clips.some(
        (c) =>
          c.trackId === targetTrack!.id &&
          c.startTime < currentTime + asset.duration &&
          c.startTime + c.duration > currentTime,
      );
      if (occupied) {
        targetTrack = null; // Will create a new track
      }
    }

    // Create a new track pair if needed
    let videoTrackId: string | undefined;
    let audioTrackId: string | undefined;
    if (!targetTrack) {
      const pair = addTrack();
      videoTrackId = pair.videoTrackId;
      audioTrackId = pair.audioTrackId;
    }

    const trackId = targetTrack?.id ?? (isAudio ? audioTrackId! : videoTrackId!);

    // Compute clip type
    const clipType = asset.type === "audio" ? "audio" : asset.type === "image" ? "image" : "video";

    // Fit-to-screen transform for video/image
    let transform: { scale_x: number; scale_y: number } | undefined;
    if ((asset.type === "video" || asset.type === "image") && asset.width && asset.height) {
      const scaleX = store.settings.width / asset.width;
      const scaleY = store.settings.height / asset.height;
      const scale = Math.min(scaleX, scaleY);
      transform = { scale_x: scale, scale_y: scale };
    }

    // Create the clip at the current playhead position
    const clipId = addClipToTrack({
      type: clipType,
      trackId,
      startTime: currentTime,
      duration: asset.duration,
      name: asset.name,
      assetId: asset.id,
      speed: 1,
      assetDuration: clipType === "image" ? undefined : asset.duration,
      transform,
    });

    // Create linked audio clip for video assets
    if (asset.type === "video") {
      const pairedAudioTrackId = targetTrack?.pairedTrackId ?? audioTrackId;
      if (pairedAudioTrackId) {
        const audioClipId = addClipToTrack({
          type: "audio",
          trackId: pairedAudioTrackId,
          startTime: currentTime,
          duration: asset.duration,
          name: `${asset.name} (Audio)`,
          assetId: asset.id,
          speed: 1,
          assetDuration: asset.duration,
        });
        linkClipPair(clipId, audioClipId);
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex h-full items-center justify-center bg-muted"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className="relative"
        style={{
          width: canvasSize.width || "auto",
          height: canvasSize.height || "auto",
        }}
      >
        <div className="relative p-3">
          {/* width/height intentionally omitted — after transferControlToOffscreen()
              the compositor worker owns the OffscreenCanvas dimensions via resize().
              Setting attributes on the placeholder canvas would resize + clear the
              OffscreenCanvas bitmap, causing frame flashes. */}
          <canvas
            ref={canvasRef}
            className="size-full bg-background"
            style={{ imageRendering: "auto" }}
          />

          {previewMode === "transform" && isInitialized && canvasSize.width > 0 && (
            <div className="absolute inset-3">
              <TransformOverlay
                displayWidth={canvasSize.width - 24}
                displayHeight={((canvasSize.width - 24) * settings.height) / settings.width}
              />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="text-center text-foreground">
                <div className="text-lg font-medium text-destructive">GPU Error</div>
                <div className="mt-2 text-sm text-muted-foreground">{error}</div>
                <div className="mt-4 text-xs text-muted-foreground">
                  WebGPU may not be supported in your browser
                </div>
              </div>
            </div>
          )}

          {!isInitialized && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center text-muted-foreground">
                <div className="text-sm">Initializing GPU...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 pointer-events-none">
          <div className="text-sm font-medium text-primary border-2 border-dashed border-primary rounded-lg px-4 py-2">
            Drop to add at playhead
          </div>
        </div>
      )}
    </div>
  );
}
