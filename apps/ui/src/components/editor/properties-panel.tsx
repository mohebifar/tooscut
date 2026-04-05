import type { Effects, AudioEffectsParams, ColorGrading } from "@tooscut/render-engine";

import {
  ClapperboardIcon,
  ImageIcon,
  PaletteIcon,
  ShapesIcon,
  SparklesIcon,
  TextIcon,
  Volume2,
} from "lucide-react";
import { useMemo, useState, useCallback } from "react";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { AudioEffectsProperties } from "./audio-effects-properties";
import { AudioProperties } from "./audio-properties";
import { ColorGradingPanel } from "./color-grading/color-grading-panel";
import { EffectProperties } from "./effect-properties";
import { LineProperties } from "./line-properties";
import { PictureProperties } from "./picture-properties";
import { ShapeProperties } from "./shape-properties";
import { TextProperties } from "./text-properties";
import { TransitionProperties } from "./transition-properties";

type TabValue = "picture" | "audio" | "text" | "shape" | "line" | "effect" | "color" | "transition";

export function PropertiesPanel() {
  const selectedClipIds = useVideoEditorStore((s) => s.selectedClipIds);
  const clips = useVideoEditorStore((s) => s.clips);
  const settings = useVideoEditorStore((s) => s.settings);
  const updateClipTransform = useVideoEditorStore((s) => s.updateClipTransform);
  const updateClipEffects = useVideoEditorStore((s) => s.updateClipEffects);
  const updateClipVolume = useVideoEditorStore((s) => s.updateClipVolume);
  const updateClipText = useVideoEditorStore((s) => s.updateClipText);
  const updateClipTextStyle = useVideoEditorStore((s) => s.updateClipTextStyle);
  const updateClipTextBox = useVideoEditorStore((s) => s.updateClipTextBox);
  const updateClipShapeStyle = useVideoEditorStore((s) => s.updateClipShapeStyle);
  const updateClipShapeBox = useVideoEditorStore((s) => s.updateClipShapeBox);
  const updateClipLineStyle = useVideoEditorStore((s) => s.updateClipLineStyle);
  const updateClipLineBox = useVideoEditorStore((s) => s.updateClipLineBox);
  const updateClipSpeed = useVideoEditorStore((s) => s.updateClipSpeed);
  const updateClipAudioEffects = useVideoEditorStore((s) => s.updateClipAudioEffects);
  const toggleClipAudioEffect = useVideoEditorStore((s) => s.toggleClipAudioEffect);
  const updateClipColorGrading = useVideoEditorStore((s) => s.updateClipColorGrading);

  // Get selected clip (only support single selection for now)
  const selectedClip = useMemo(() => {
    if (selectedClipIds.length !== 1) return null;
    return clips.find((c) => c.id === selectedClipIds[0]) ?? null;
  }, [selectedClipIds, clips]);

  // Determine which tabs should be visible based on clip type
  const clipType = selectedClip?.type;
  const showPicture = clipType === "video" || clipType === "image";
  const showAudio = clipType === "audio";
  const showText = clipType === "text";
  const showShape = clipType === "shape";
  const showLine = clipType === "line";
  const showEffect = !showAudio;
  const showColor = clipType === "video" || clipType === "image";
  const showTransition = !showAudio && clipType !== "video";

  // Track active tab, defaulting to first available
  const [activeTab, setActiveTab] = useState<TabValue>("picture");

  // Auto-switch to valid tab when selection changes
  const effectiveTab = useMemo(() => {
    if (!selectedClip) return activeTab;

    // Build set of valid tabs for the current clip
    const validTabs: TabValue[] = [];
    if (showPicture) validTabs.push("picture");
    if (showAudio) validTabs.push("audio");
    if (showText) validTabs.push("text");
    if (showShape) validTabs.push("shape");
    if (showLine) validTabs.push("line");
    if (showEffect) validTabs.push("effect");
    if (showColor) validTabs.push("color");
    if (showTransition) validTabs.push("transition");

    // If current tab is valid, keep it
    if (validTabs.includes(activeTab)) return activeTab;

    // Otherwise pick the first valid tab
    return validTabs[0] ?? "picture";
  }, [
    activeTab,
    selectedClip,
    showPicture,
    showAudio,
    showText,
    showShape,
    showLine,
    showEffect,
    showColor,
    showTransition,
  ]);

  // Get transform values with defaults (only visual clips have transform)
  const transform = useMemo(() => {
    if (!selectedClip || selectedClip.type === "audio") {
      return {
        x: settings.width / 2,
        y: settings.height / 2,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      };
    }
    return {
      x: selectedClip.transform?.x ?? settings.width / 2,
      y: selectedClip.transform?.y ?? settings.height / 2,
      scaleX: selectedClip.transform?.scale_x ?? 1,
      scaleY: selectedClip.transform?.scale_y ?? 1,
      rotation: selectedClip.transform?.rotation ?? 0,
    };
  }, [selectedClip, settings]);

  // Get effects values with defaults (only visual clips have effects)
  const effects = useMemo(() => {
    if (!selectedClip || selectedClip.type === "audio") {
      return { opacity: 1, brightness: 1, contrast: 1, saturation: 1, hueRotate: 0, blur: 0 };
    }
    return {
      opacity: selectedClip.effects?.opacity ?? 1,
      brightness: selectedClip.effects?.brightness ?? 1,
      contrast: selectedClip.effects?.contrast ?? 1,
      saturation: selectedClip.effects?.saturation ?? 1,
      hueRotate: selectedClip.effects?.hue_rotate ?? 0,
      blur: selectedClip.effects?.blur ?? 0,
    };
  }, [selectedClip]);

  // Get volume value with default (only audio/video clips have volume)
  const volume =
    selectedClip && (selectedClip.type === "audio" || selectedClip.type === "video")
      ? (selectedClip.volume ?? 1)
      : 1;

  // Transform update handlers
  const handleTransformChange = useCallback(
    (key: string, value: number) => {
      if (!selectedClip) return;

      const transformKey = key === "scaleX" ? "scale_x" : key === "scaleY" ? "scale_y" : key;

      updateClipTransform(selectedClip.id, { [transformKey]: value });
    },
    [selectedClip, updateClipTransform],
  );

  // Effects update handler
  const handleEffectsChange = useCallback(
    (key: keyof Effects, value: number) => {
      if (!selectedClip) return;
      updateClipEffects(selectedClip.id, { [key]: value });
    },
    [selectedClip, updateClipEffects],
  );

  // Volume update handler
  const handleVolumeChange = useCallback(
    (value: number) => {
      if (!selectedClip) return;
      updateClipVolume(selectedClip.id, value);
    },
    [selectedClip, updateClipVolume],
  );

  // Speed update handler
  const handleSpeedChange = useCallback(
    (value: number) => {
      if (!selectedClip) return;
      updateClipSpeed(selectedClip.id, value);
    },
    [selectedClip, updateClipSpeed],
  );

  // Audio effects handlers
  const handleToggleAudioEffect = useCallback(
    (effectType: keyof AudioEffectsParams, enabled: boolean) => {
      if (!selectedClip) return;
      toggleClipAudioEffect(selectedClip.id, effectType, enabled);
    },
    [selectedClip, toggleClipAudioEffect],
  );

  const handleUpdateAudioEffect = useCallback(
    (effectType: keyof AudioEffectsParams, params: Record<string, number>) => {
      if (!selectedClip) return;
      updateClipAudioEffects(selectedClip.id, effectType, params);
    },
    [selectedClip, updateClipAudioEffects],
  );

  // Get audio effects
  const audioEffects = selectedClip?.type === "audio" ? selectedClip.audioEffects : undefined;

  // Color grading handler
  const handleColorGradingChange = useCallback(
    (colorGrading: ColorGrading) => {
      if (!selectedClip) return;
      updateClipColorGrading(selectedClip.id, colorGrading);
    },
    [selectedClip, updateClipColorGrading],
  );

  // Get color grading
  const colorGrading =
    selectedClip?.type === "video" || selectedClip?.type === "image"
      ? selectedClip.colorGrading
      : undefined;

  // Get speed value
  const speed = selectedClip?.speed ?? 1;

  // Determine how many tabs to show
  const tabCount = [
    showPicture,
    showAudio,
    showText,
    showShape,
    showLine,
    showEffect,
    showColor,
    showTransition,
  ].filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2">
        <h2 className="text-sm font-semibold text-foreground">Properties</h2>
        {selectedClip && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {selectedClip.name || selectedClip.type}
          </p>
        )}
      </div>

      {!selectedClip ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-muted-foreground">
            Select a clip to view properties
          </p>
        </div>
      ) : (
        <Tabs
          value={effectiveTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
          className="flex flex-1 flex-col"
        >
          <TabsList
            className="mx-2 mt-2 grid w-auto"
            style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
          >
            {showPicture && (
              <TabsTrigger value="picture" className="text-xs">
                <ImageIcon className="size-3" />
                Picture
              </TabsTrigger>
            )}
            {showAudio && (
              <TabsTrigger value="audio" className="text-xs">
                <Volume2 className="size-3" />
                Audio
              </TabsTrigger>
            )}
            {showText && (
              <TabsTrigger value="text" className="text-xs">
                <TextIcon className="size-3" />
                Text
              </TabsTrigger>
            )}
            {showShape && (
              <TabsTrigger value="shape" className="text-xs">
                <ShapesIcon className="size-3" />
                Shape
              </TabsTrigger>
            )}
            {showLine && (
              <TabsTrigger value="line" className="text-xs">
                <ShapesIcon className="size-3" />
                Line
              </TabsTrigger>
            )}
            {showEffect && (
              <TabsTrigger value="effect" className="text-xs">
                <SparklesIcon className="size-3" />
                Effect
              </TabsTrigger>
            )}
            {showColor && (
              <TabsTrigger value="color" className="text-xs">
                <PaletteIcon className="size-3" />
                Color
              </TabsTrigger>
            )}
            {showTransition && (
              <TabsTrigger value="transition" className="text-xs">
                <ClapperboardIcon className="size-3" />
                Transition
              </TabsTrigger>
            )}
          </TabsList>

          {/* Picture tab - for video/image clips */}
          <TabsContent value="picture" className="m-0 flex-1 overflow-auto p-3">
            <PictureProperties
              clipId={selectedClip.id}
              clipStartTime={selectedClip.startTime}
              clipType={selectedClip.type as "video" | "image"}
              transform={transform}
              opacity={effects.opacity}
              speed={speed}
              onTransformChange={handleTransformChange}
              onEffectsChange={handleEffectsChange}
              onSpeedChange={handleSpeedChange}
            />
          </TabsContent>

          {/* Audio tab */}
          <TabsContent value="audio" className="m-0 flex-1 overflow-auto p-3">
            <AudioProperties
              clipId={selectedClip.id}
              clipStartTime={selectedClip.startTime}
              volume={volume}
              speed={speed}
              onVolumeChange={handleVolumeChange}
              onSpeedChange={handleSpeedChange}
            />
            <div className="mt-4">
              <AudioEffectsProperties
                clipId={selectedClip.id}
                clipStartTime={selectedClip.startTime}
                audioEffects={audioEffects}
                onToggleEffect={handleToggleAudioEffect}
                onUpdateEffect={handleUpdateAudioEffect}
              />
            </div>
          </TabsContent>

          {/* Text tab */}
          <TabsContent value="text" className="m-0 flex-1 overflow-auto p-3">
            {selectedClip?.type === "text" && (
              <TextProperties
                clip={selectedClip}
                onUpdateText={updateClipText}
                onUpdateStyle={updateClipTextStyle}
                onUpdateBox={updateClipTextBox}
                onUpdateEffects={updateClipEffects}
              />
            )}
          </TabsContent>

          {/* Shape tab */}
          <TabsContent value="shape" className="m-0 flex-1 overflow-auto p-3">
            {selectedClip?.type === "shape" && (
              <ShapeProperties
                clip={selectedClip}
                onUpdateStyle={updateClipShapeStyle}
                onUpdateBox={updateClipShapeBox}
                onUpdateEffects={updateClipEffects}
              />
            )}
          </TabsContent>

          {/* Line tab */}
          <TabsContent value="line" className="m-0 flex-1 overflow-auto p-3">
            {selectedClip?.type === "line" && (
              <LineProperties
                clip={selectedClip}
                onUpdateStyle={updateClipLineStyle}
                onUpdateBox={updateClipLineBox}
                onUpdateEffects={updateClipEffects}
              />
            )}
          </TabsContent>

          <TabsContent value="effect" className="m-0 flex-1 overflow-auto p-3">
            {selectedClip && (
              <EffectProperties
                clipId={selectedClip.id}
                clipStartTime={selectedClip.startTime}
                effects={effects}
                onEffectsChange={handleEffectsChange}
              />
            )}
          </TabsContent>

          {/* Color Grading tab - for video/image clips */}
          <TabsContent value="color" className="m-0 flex-1 overflow-auto p-3">
            {selectedClip && (selectedClip.type === "video" || selectedClip.type === "image") && (
              <ColorGradingPanel
                clipId={selectedClip.id}
                clipStartTime={selectedClip.startTime}
                colorGrading={colorGrading}
                onColorGradingChange={handleColorGradingChange}
              />
            )}
          </TabsContent>

          <TabsContent value="transition" className="m-0 flex-1 overflow-auto p-3">
            {selectedClip && selectedClip.type !== "audio" && selectedClip.type !== "video" && (
              <TransitionProperties
                clipId={selectedClip.id}
                transitionIn={selectedClip.transitionIn}
                transitionOut={selectedClip.transitionOut}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
