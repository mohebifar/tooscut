/**
 * Export Dialog Component
 *
 * Provides UI for video export settings and progress display.
 * Supports resolution presets, frame rate, quality settings.
 * Streams output directly to disk via File System Access API.
 */

import { DownloadIcon, XIcon } from "lucide-react";
import { useState, useCallback, useEffect } from "react";

import { useMp4Export, type ExportOptions, type ExportResult } from "../../hooks/use-mp4-export";
import { useVideoEditorStore } from "../../state/video-editor-store";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../ui/dialog";
import { Progress } from "../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

// ===================== TYPES =====================

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ===================== PRESETS =====================

interface QualityPreset {
  label: string;
  bitrate: number;
}

const QUALITY_PRESETS: QualityPreset[] = [
  { label: "High", bitrate: 20_000_000 },
  { label: "Medium", bitrate: 10_000_000 },
  { label: "Low", bitrate: 5_000_000 },
];

// ===================== UTILITIES =====================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getStageLabel(stage: string): string {
  switch (stage) {
    case "preparing":
      return "Preparing...";
    case "rendering":
      return "Rendering frames...";
    case "encoding":
      return "Encoding audio...";
    case "finalizing":
      return "Finalizing...";
    case "complete":
      return "Complete!";
    case "error":
      return "Error";
    default:
      return stage;
  }
}

// ===================== COMPONENT =====================

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const settings = useVideoEditorStore((s) => s.settings);

  // Export settings — resolution and frame rate come from project settings
  const [quality, setQuality] = useState<string>("High");

  // Export state
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [exportFileName, setExportFileName] = useState<string | null>(null);
  const { startExport, cancelExport, progress, isExporting } = useMp4Export();

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      cancelExport();
      setExportResult(null);
    }
  }, [open, cancelExport]);

  const handleExport = useCallback(async () => {
    // Prompt user to pick save location first
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: `export-${Date.now()}.mp4`,
        types: [
          {
            description: "MP4 Video",
            accept: { "video/mp4": [".mp4"] },
          },
        ],
      });
    } catch {
      // User cancelled the file picker
      return;
    }

    const qualityPreset = QUALITY_PRESETS.find((q) => q.label === quality);

    const options: ExportOptions = {
      width: settings.width,
      height: settings.height,
      frameRate: settings.fps.numerator / settings.fps.denominator,
      videoBitrate: qualityPreset?.bitrate,
      fileHandle,
    };

    setExportFileName(fileHandle.name);

    try {
      const result = await startExport(options);
      setExportResult(result);
    } catch (error) {
      if (error instanceof Error && error.message === "Export cancelled") {
        // User cancelled, do nothing
        return;
      }
      console.error("[ExportDialog] Export failed:", error);
    }
  }, [settings.width, settings.height, settings.fps, quality, startExport]);

  const handleCancel = useCallback(() => {
    cancelExport();
    setExportResult(null);
  }, [cancelExport]);

  const handleClose = useCallback(() => {
    if (isExporting) {
      cancelExport();
    }
    setExportResult(null);
    onOpenChange(false);
  }, [isExporting, cancelExport, onOpenChange]);

  const isComplete = progress?.stage === "complete";
  const hasError = progress?.stage === "error";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
          <DialogDescription>Configure export settings and render your video.</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          {!isExporting && !isComplete ? (
            // Settings form
            <div className="grid gap-4 py-4">
              <div className="rounded-md bg-muted p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium">Resolution: </span>
                    {settings.width}×{settings.height}
                  </div>
                  <div>
                    <span className="font-medium">Frame rate: </span>
                    {Math.round((settings.fps.numerator / settings.fps.denominator) * 100) /
                      100}{" "}
                    fps
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Quality</label>
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select quality" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITY_PRESETS.map((preset) => (
                      <SelectItem key={preset.label} value={preset.label}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            // Progress display
            <div className="py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{getStageLabel(progress?.stage || "")}</span>
                  <span className="text-muted-foreground">{progress?.progress ?? 0}%</span>
                </div>

                <Progress value={progress?.progress ?? 0} />

                {progress && progress.stage === "rendering" && (
                  <div className="grid grid-cols-2 gap-4 font-mono text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">Frame: </span>
                      {progress.currentFrame} / {progress.totalFrames}
                    </div>
                    <div>
                      <span className="font-medium">Speed: </span>
                      {progress.fps !== null ? `${progress.fps} fps` : "—"}
                    </div>
                    <div>
                      <span className="font-medium">Elapsed: </span>
                      {formatTime(progress.elapsedTime)}
                    </div>
                    {progress.estimatedTimeRemaining !== null && (
                      <div className="col-span-2">
                        <span className="font-medium">Remaining: </span>
                        {formatTime(progress.estimatedTimeRemaining)}
                      </div>
                    )}
                  </div>
                )}

                {hasError && progress?.error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {progress.error}
                  </div>
                )}

                {isComplete && exportResult && (
                  <div className="rounded-md bg-muted p-3 text-sm">
                    {exportFileName && (
                      <p className="mb-2 font-medium">Saved as {exportFileName}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                      <div>
                        <span className="font-medium">Duration: </span>
                        {formatTime(exportResult.duration)}
                      </div>
                      <div>
                        <span className="font-medium">Render time: </span>
                        {formatTime(exportResult.renderTime)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogPanel>

        <DialogFooter>
          {!isExporting && !isComplete && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => void handleExport()}>
                <DownloadIcon className="mr-2 size-4" />
                Export
              </Button>
            </>
          )}

          {isExporting && !isComplete && (
            <Button variant="destructive" onClick={handleCancel}>
              <XIcon className="mr-2 size-4" />
              Cancel Export
            </Button>
          )}

          {isComplete && (
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
          )}

          {hasError && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={() => void handleExport()}>Retry</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
