import { useCallback } from "react";
import { MousePointer2, Scissors, Minus, Plus } from "lucide-react";
import { Toggle } from "../ui/toggle";
import { Slider } from "../ui/slider";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { MIN_ZOOM, MAX_ZOOM } from "./constants";

/**
 * Toolbar rendered above the timeline canvas.
 * Contains tool selection (select/razor) and a zoom slider.
 */
export function TimelineToolbar() {
  const zoom = useVideoEditorStore((s) => s.zoom);
  const setZoom = useVideoEditorStore((s) => s.setZoom);
  const activeTool = useVideoEditorStore((s) => s.activeTool);
  const setActiveTool = useVideoEditorStore((s) => s.setActiveTool);

  // Zoom slider uses a log scale for more intuitive feel
  // slider value 0..100 maps to MIN_ZOOM..MAX_ZOOM exponentially
  const zoomToSlider = useCallback((z: number) => {
    const logMin = Math.log(MIN_ZOOM);
    const logMax = Math.log(MAX_ZOOM);
    return ((Math.log(z) - logMin) / (logMax - logMin)) * 100;
  }, []);

  const sliderToZoom = useCallback((v: number) => {
    const logMin = Math.log(MIN_ZOOM);
    const logMax = Math.log(MAX_ZOOM);
    return Math.exp(logMin + (v / 100) * (logMax - logMin));
  }, []);

  const handleSliderChange = useCallback(
    (value: number[]) => {
      setZoom(sliderToZoom(value[0]));
    },
    [setZoom, sliderToZoom],
  );

  const handleZoomIn = useCallback(() => {
    setZoom(Math.min(MAX_ZOOM, zoom * 1.2));
  }, [zoom, setZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(Math.max(MIN_ZOOM, zoom / 1.2));
  }, [zoom, setZoom]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-neutral-700 bg-neutral-800/80 px-2">
        {/* Tool selection */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              className="h-6 w-6 p-0"
              pressed={activeTool === "select"}
              onPressedChange={() => setActiveTool("select")}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Select Tool (V)</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              className="h-6 w-6 p-0"
              pressed={activeTool === "razor"}
              onPressedChange={() => setActiveTool("razor")}
            >
              <Scissors className="h-3.5 w-3.5" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Razor Tool (C)</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* Zoom controls */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleZoomOut}>
              <Minus className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Zoom Out</p>
          </TooltipContent>
        </Tooltip>

        <Slider
          className="w-32"
          min={0}
          max={100}
          step={0.5}
          value={[zoomToSlider(zoom)]}
          onValueChange={handleSliderChange}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleZoomIn}>
              <Plus className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Zoom In</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
