import type { AnimatableProperty } from "@tooscut/render-engine";

import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { CanvasTimeline } from "../timeline/canvas-timeline";
import { KeyframeCurveEditor } from "../timeline/keyframe-curve-editor";
import { TimelineToolbar } from "../timeline/timeline-toolbar";
import { Button } from "../ui/button";

const CURVE_EDITOR_MIN_HEIGHT = 80;
const CURVE_EDITOR_DEFAULT_HEIGHT = 200;
const CURVE_EDITOR_MAX_HEIGHT = 600;

export function TimelinePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [curveEditorVisible, setCurveEditorVisible] = useState(false);
  const [curveEditorHeight, setCurveEditorHeight] = useState(CURVE_EDITOR_DEFAULT_HEIGHT);
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Get selected clip
  const selectedClipIds = useVideoEditorStore((s) => s.selectedClipIds);
  const clips = useVideoEditorStore((s) => s.clips);

  const selectedClipId = selectedClipIds.length === 1 ? selectedClipIds[0] : null;
  const selectedClip = selectedClipId ? clips.find((c) => c.id === selectedClipId) : null;

  // Determine which properties to show curves for (those that have keyframes)
  const keyframedProperties: AnimatableProperty[] = [];
  if (selectedClip?.keyframes) {
    for (const track of selectedClip.keyframes.tracks) {
      if (track.keyframes.length > 0) {
        keyframedProperties.push(track.property as AnimatableProperty);
      }
    }
  }

  // Update container width on resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width) {
          setContainerWidth(Math.floor(entry.contentRect.width));
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    // Initial sizing
    const rect = containerRef.current.getBoundingClientRect();
    setContainerWidth(Math.floor(rect.width));

    return () => resizeObserver.disconnect();
  }, []);

  // Resize handle drag
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeDragRef.current = { startY: e.clientY, startHeight: curveEditorHeight };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeDragRef.current) return;
        // Dragging up = increase height (startY - currentY)
        const delta = resizeDragRef.current.startY - ev.clientY;
        const newHeight = Math.max(
          CURVE_EDITOR_MIN_HEIGHT,
          Math.min(CURVE_EDITOR_MAX_HEIGHT, resizeDragRef.current.startHeight + delta),
        );
        setCurveEditorHeight(newHeight);
      };

      const handleMouseUp = () => {
        resizeDragRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [curveEditorHeight],
  );

  // Show curve editor if there are keyframed properties
  const hasKeyframes = keyframedProperties.length > 0;

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col overflow-hidden">
      {/* Timeline toolbar */}
      <TimelineToolbar />

      {/* Main timeline area */}
      <div className="relative min-h-0 flex-1">
        <CanvasTimeline />
      </div>

      {/* Curve editor toggle bar */}
      {hasKeyframes && (
        <div className="flex h-7 shrink-0 items-center border-t border-neutral-700 bg-neutral-800 px-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-2 text-xs"
            onClick={() => setCurveEditorVisible(!curveEditorVisible)}
          >
            {curveEditorVisible ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
            Curves
          </Button>
          {/* Property indicators */}
          <div className="ml-2 flex gap-1">
            {keyframedProperties.map((prop) => (
              <span
                key={prop}
                className="rounded bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300"
              >
                {prop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Curve editor panel */}
      {hasKeyframes && curveEditorVisible && selectedClipId && (
        <div
          className="shrink-0 overflow-hidden border-t border-neutral-700"
          style={{ height: curveEditorHeight }}
        >
          {/* Resize handle */}
          <div
            className="flex h-2 cursor-row-resize items-center justify-center bg-neutral-800 transition-colors hover:bg-neutral-700"
            onMouseDown={handleResizeMouseDown}
          >
            <GripHorizontal className="h-3 w-3 text-neutral-500" />
          </div>
          <KeyframeCurveEditor
            width={containerWidth}
            clipId={selectedClipId}
            properties={keyframedProperties}
          />
        </div>
      )}
    </div>
  );
}
