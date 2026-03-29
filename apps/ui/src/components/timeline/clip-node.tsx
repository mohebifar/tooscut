/**
 * Memoized Konva clip node for the timeline.
 *
 * Positions are in content-space (not screen-space) so that scrolling
 * only changes the parent Group's offset — individual clip props stay
 * stable and React.memo skips re-renders.
 */

import { framesToSeconds } from "@tooscut/render-engine";
import React from "react";
import { Group, Label, Rect, Shape, Tag, Text } from "react-konva";

import type { ThumbnailSlot } from "./use-clip-thumbnails";

import { COLORS } from "./constants";
import { WaveformDisplay } from "./waveform-display";

const TRIM_HANDLE_WIDTH = 8;

export interface ClipNodeProps {
  clipId: string;
  clipType: string;
  startTime: number;
  duration: number;
  inPoint: number;
  speed: number;
  name?: string;
  assetId?: string;
  text?: string;
  shape?: string;
  transitionIn?: { type: string; duration: number };
  transitionOut?: { type: string; duration: number };

  // Content-space position (stable during scroll)
  x: number;
  y: number;
  clipWidth: number;
  clipHeight: number;

  /** Visible window in content-space X (for viewport culling of thumbnails/waveform) */
  viewportLeft: number;
  viewportRight: number;

  // Visual state
  isSelected: boolean;
  isGhost: boolean;
  isLocked: boolean;
  hasLinkedClip: boolean;
  clipColor: string;

  // Trim state (resolved per-clip by parent)
  trimHoverEdge: "left" | "right" | null;
  isTrimming: boolean;
  trimEdge: "left" | "right" | null;

  // Transition overlays
  transitionInDuration?: number;
  transitionOutDuration?: number;
  isTransitionInHovered: boolean;
  isTransitionOutHovered: boolean;
  isTransitionInSelected: boolean;
  isTransitionOutSelected: boolean;
  isTransitionResizing: boolean;

  // Data
  thumbnails: ThumbnailSlot[];
  waveformData?: number[];
  waveformDuration?: number;

  /** When true, skip expensive drawing (thumbnails/waveforms) for responsive zoom */
  isZooming: boolean;

  // Rendering params
  zoom: number;
  fps: { numerator: number; denominator: number };
}

function ClipNodeInner({
  clipType,
  duration,
  inPoint,
  speed,
  name,
  assetId,
  text,
  shape,
  x,
  y,
  clipWidth,
  clipHeight,
  viewportLeft,
  viewportRight,
  isSelected,
  isGhost,
  isLocked,
  hasLinkedClip,
  clipColor,
  trimHoverEdge,
  isTrimming,
  trimEdge,
  transitionInDuration,
  transitionOutDuration,
  isTransitionInHovered,
  isTransitionOutHovered,
  isTransitionInSelected,
  isTransitionOutSelected,
  isTransitionResizing,
  thumbnails,
  waveformData,
  waveformDuration,
  isZooming,
  zoom,
  fps,
}: ClipNodeProps) {
  const baseOpacity = isGhost ? 0.5 : isLocked ? 0.5 : 1;

  // Rounded rect clip path helper
  const roundedRectClip = (ctx: any, padding: number, radius: number) => {
    ctx.beginPath();
    const cx = x + padding;
    const cy = y + padding;
    const cw = clipWidth - padding * 2;
    const ch = clipHeight - padding * 2;
    ctx.moveTo(cx + radius, cy);
    ctx.lineTo(cx + cw - radius, cy);
    ctx.arcTo(cx + cw, cy, cx + cw, cy + radius, radius);
    ctx.lineTo(cx + cw, cy + ch - radius);
    ctx.arcTo(cx + cw, cy + ch, cx + cw - radius, cy + ch, radius);
    ctx.lineTo(cx + radius, cy + ch);
    ctx.arcTo(cx, cy + ch, cx, cy + ch - radius, radius);
    ctx.lineTo(cx, cy + radius);
    ctx.arcTo(cx, cy, cx + radius, cy, radius);
    ctx.closePath();
  };

  return (
    <Group transformsEnabled="position">
      {/* Background */}
      <Rect
        x={x}
        y={y}
        width={clipWidth}
        height={clipHeight}
        fill={clipColor}
        cornerRadius={4}
        stroke={isSelected && !isGhost ? COLORS.clipSelected : COLORS.clipBorder}
        strokeWidth={isSelected && !isGhost ? 2 : 1}
        opacity={baseOpacity}
        listening={false}
      />

      {/* Thumbnails (video/image) — skipped during zoom for performance */}
      {thumbnails.length > 0 && !isGhost && !isZooming && (
        <Group clipFunc={(ctx) => roundedRectClip(ctx, 2, 4)}>
          <Shape
            listening={false}
            sceneFunc={(context) => {
              const ctx = context._context;
              const sorted: Array<{ timestamp: number; image: ImageBitmap }> = [];
              for (const t of thumbnails) {
                if (t.image) sorted.push({ timestamp: t.timestamp, image: t.image });
              }
              if (sorted.length === 0) return;
              sorted.sort((a, b) => a.timestamp - b.timestamp);

              const SLOT_PX = 80;
              const slotHeight = clipHeight - 4;
              const slotY = y + 2;
              const slotCount = Math.max(1, Math.ceil(clipWidth / SLOT_PX));
              const slotW = clipWidth / slotCount;
              const inPtSec = framesToSeconds(inPoint, fps);
              const durSec = framesToSeconds(duration, fps);

              // Only draw slots visible in the viewport
              const firstVisible = Math.max(0, Math.floor((viewportLeft - x) / slotW));
              const lastVisible = Math.min(slotCount - 1, Math.ceil((viewportRight - x) / slotW));

              ctx.save();
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              ctx.globalAlpha = baseOpacity;

              for (let i = firstVisible; i <= lastVisible; i++) {
                const srcTime = inPtSec + ((i + 0.5) / slotCount) * durSec * speed;
                let lo = 0;
                let hi = sorted.length - 1;
                while (lo < hi) {
                  const mid = (lo + hi) >>> 1;
                  if (sorted[mid].timestamp < srcTime) lo = mid + 1;
                  else hi = mid;
                }
                let best = lo;
                if (
                  lo > 0 &&
                  Math.abs(sorted[lo - 1].timestamp - srcTime) <
                    Math.abs(sorted[lo].timestamp - srcTime)
                ) {
                  best = lo - 1;
                }
                const img = sorted[best].image;
                const slotX = x + i * slotW;
                const imgAspect = img.width / img.height;
                const slotAspect = slotW / slotHeight;
                let dw: number, dh: number, dx: number, dy: number;
                if (imgAspect > slotAspect) {
                  dh = slotHeight;
                  dw = slotHeight * imgAspect;
                  dx = slotX + (slotW - dw) / 2;
                  dy = slotY;
                } else {
                  dw = slotW;
                  dh = slotW / imgAspect;
                  dx = slotX;
                  dy = slotY + (slotHeight - dh) / 2;
                }
                ctx.save();
                ctx.beginPath();
                ctx.rect(slotX, slotY, slotW, slotHeight);
                ctx.clip();
                ctx.drawImage(img, dx, dy, dw, dh);
                ctx.restore();
              }
              ctx.restore();
            }}
          />
        </Group>
      )}

      {/* Audio waveform — skipped during zoom for performance */}
      {clipType === "audio" &&
        assetId &&
        !isGhost &&
        !isZooming &&
        waveformData &&
        waveformDuration && (
          <Group clipFunc={(ctx) => roundedRectClip(ctx, 2, 4)}>
            <WaveformDisplay
              x={x}
              y={y}
              width={clipWidth}
              height={clipHeight}
              waveformData={waveformData}
              inPoint={framesToSeconds(inPoint, fps)}
              outPoint={framesToSeconds(inPoint, fps) + framesToSeconds(duration, fps) * speed}
              duration={waveformDuration}
            />
          </Group>
        )}

      {/* Lock indicator */}
      {isLocked && !isGhost && (
        <Text
          x={x + clipWidth - 20}
          y={y + 6}
          text="\u{1F512}"
          fontSize={10}
          opacity={0.8}
          listening={false}
        />
      )}

      {/* Linked clip indicator */}
      {hasLinkedClip && !isGhost && (
        <Rect
          x={x + 2}
          y={y + clipHeight - 6}
          width={6}
          height={4}
          fill="#ffffff"
          cornerRadius={1}
          opacity={0.7}
          listening={false}
        />
      )}

      {/* Transition In overlay */}
      {!isGhost && transitionInDuration != null && transitionInDuration > 0 && (
        <>
          <Rect
            x={x}
            y={y}
            width={Math.min(transitionInDuration * zoom, clipWidth)}
            height={clipHeight}
            fill={COLORS.transitionOverlay}
            cornerRadius={[4, 0, 0, 4]}
            stroke={isTransitionInSelected ? "#ffffff" : undefined}
            strokeWidth={isTransitionInSelected ? 2 : 0}
            listening={false}
          />
          {(isTransitionInHovered || isTransitionResizing) && (
            <Rect
              x={x + transitionInDuration * zoom - 1}
              y={y + 4}
              width={2}
              height={clipHeight - 8}
              fill={COLORS.transitionHandle}
              opacity={0.8}
              listening={false}
            />
          )}
        </>
      )}

      {/* Transition Out overlay */}
      {!isGhost &&
        transitionOutDuration != null &&
        transitionOutDuration > 0 &&
        (() => {
          const ow = Math.min(transitionOutDuration * zoom, clipWidth);
          return (
            <>
              <Rect
                x={x + clipWidth - ow}
                y={y}
                width={ow}
                height={clipHeight}
                fill={COLORS.transitionOverlay}
                cornerRadius={[0, 4, 4, 0]}
                stroke={isTransitionOutSelected ? "#ffffff" : undefined}
                strokeWidth={isTransitionOutSelected ? 2 : 0}
                listening={false}
              />
              {(isTransitionOutHovered || isTransitionResizing) && (
                <Rect
                  x={x + clipWidth - ow - 1}
                  y={y + 4}
                  width={2}
                  height={clipHeight - 8}
                  fill={COLORS.transitionHandle}
                  opacity={0.8}
                  listening={false}
                />
              )}
            </>
          );
        })()}

      {/* Left trim handle */}
      {!isGhost && (
        <>
          <Rect
            x={x}
            y={y}
            width={TRIM_HANDLE_WIDTH}
            height={clipHeight}
            fill="transparent"
            listening={false}
          />
          {(trimHoverEdge === "left" || (isTrimming && trimEdge === "left")) && (
            <Rect
              x={x}
              y={y + 8}
              width={4}
              height={clipHeight - 16}
              fill="#ffffff"
              cornerRadius={2}
              opacity={0.9}
              listening={false}
            />
          )}
        </>
      )}

      {/* Right trim handle */}
      {!isGhost && (
        <>
          <Rect
            x={x + clipWidth - TRIM_HANDLE_WIDTH}
            y={y}
            width={TRIM_HANDLE_WIDTH}
            height={clipHeight}
            fill="transparent"
            listening={false}
          />
          {(trimHoverEdge === "right" || (isTrimming && trimEdge === "right")) && (
            <Rect
              x={x + clipWidth - 4}
              y={y + 8}
              width={4}
              height={clipHeight - 16}
              fill="#ffffff"
              cornerRadius={2}
              opacity={0.9}
              listening={false}
            />
          )}
        </>
      )}

      {/* Label */}
      <Label x={x + 8} y={y + 8} listening={false}>
        <Tag fill="rgba(0,0,0,0.6)" cornerRadius={2} />
        <Text
          padding={4}
          text={
            clipType === "text" && text
              ? text
              : clipType === "shape" && shape
                ? shape
                : name || clipType
          }
          fontSize={11}
          fill="#ffffff"
          ellipsis
          listening={false}
          height={20}
          fontFamily="Consolas, 'Courier New', monospace"
        />
      </Label>
    </Group>
  );
}

function arePropsEqual(prev: ClipNodeProps, next: ClipNodeProps): boolean {
  return (
    prev.clipId === next.clipId &&
    prev.x === next.x &&
    prev.y === next.y &&
    prev.clipWidth === next.clipWidth &&
    prev.clipHeight === next.clipHeight &&
    prev.isSelected === next.isSelected &&
    prev.isGhost === next.isGhost &&
    prev.isLocked === next.isLocked &&
    prev.hasLinkedClip === next.hasLinkedClip &&
    prev.trimHoverEdge === next.trimHoverEdge &&
    prev.isTrimming === next.isTrimming &&
    prev.trimEdge === next.trimEdge &&
    prev.transitionInDuration === next.transitionInDuration &&
    prev.transitionOutDuration === next.transitionOutDuration &&
    prev.isTransitionInHovered === next.isTransitionInHovered &&
    prev.isTransitionOutHovered === next.isTransitionOutHovered &&
    prev.isTransitionInSelected === next.isTransitionInSelected &&
    prev.isTransitionOutSelected === next.isTransitionOutSelected &&
    prev.isTransitionResizing === next.isTransitionResizing &&
    prev.thumbnails === next.thumbnails &&
    prev.waveformData === next.waveformData &&
    prev.waveformDuration === next.waveformDuration &&
    prev.zoom === next.zoom &&
    prev.startTime === next.startTime &&
    prev.duration === next.duration &&
    prev.inPoint === next.inPoint &&
    prev.speed === next.speed &&
    prev.clipColor === next.clipColor &&
    prev.name === next.name &&
    // Quantize viewport to 200px steps — re-render when viewport shifts significantly
    // (needed so sceneFunc closure has updated bounds for thumbnail culling)
    Math.floor(prev.viewportLeft / 200) === Math.floor(next.viewportLeft / 200) &&
    Math.floor(prev.viewportRight / 200) === Math.floor(next.viewportRight / 200)
  );
}

export const ClipNode = React.memo(ClipNodeInner, arePropsEqual);
