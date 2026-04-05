/**
 * LUT (Look-Up Table) node properties editor.
 *
 * Allows loading .cube files as persistent assets, selecting interpolation
 * method, adjusting mix amount, and removing loaded LUTs.
 */

import type { LutReference, LutInterpolation } from "@tooscut/render-engine";

import { Upload, X } from "lucide-react";
import { useCallback, useMemo } from "react";

import { importLutWithPicker } from "../../../lib/lut-manager";
import { useVideoEditorStore } from "../../../state/video-editor-store";
import { Button } from "../../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Slider } from "../../ui/slider";

interface LutPropertiesProps {
  lut: LutReference;
  onChange: (updates: Partial<LutReference>) => void;
}

const INTERPOLATION_OPTIONS: { value: LutInterpolation; label: string }[] = [
  { value: "Trilinear", label: "Trilinear (faster)" },
  { value: "Tetrahedral", label: "Tetrahedral (higher quality)" },
];

export function LutProperties({ lut, onChange }: LutPropertiesProps) {
  const assets = useVideoEditorStore((s) => s.assets);
  const lutAssets = useMemo(() => assets.filter((a) => a.type === "lut"), [assets]);

  const currentLutAsset = useMemo(
    () => lutAssets.find((a) => a.id === lut.lut_id),
    [lutAssets, lut.lut_id],
  );

  const handleLoadFile = useCallback(() => {
    async function loadLut() {
      const result = await importLutWithPicker();
      if (result) {
        onChange({ lut_id: result.id });
      }
    }

    void loadLut();
  }, [onChange]);

  const handleSelectExisting = useCallback(
    (value: string | null) => {
      if (value) onChange({ lut_id: value });
    },
    [onChange],
  );

  const handleRemoveLut = useCallback(() => {
    onChange({ lut_id: "" });
  }, [onChange]);

  const handleInterpolationChange = useCallback(
    (value: string | null) => {
      if (value) onChange({ interpolation: value as LutInterpolation });
    },
    [onChange],
  );

  const handleMixChange = useCallback(
    ([value]: number[]) => {
      onChange({ mix: value });
    },
    [onChange],
  );

  const hasLut = lut.lut_id !== "";

  return (
    <div className="space-y-3">
      {/* LUT selection */}
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">LUT File</label>
        {hasLut ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded-md border border-input bg-background px-3 py-1.5 text-sm">
              {currentLutAsset?.name ?? lut.lut_id}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleRemoveLut}
              title="Remove LUT"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full" onClick={handleLoadFile}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Load .cube File
            </Button>
            {lutAssets.length > 0 && (
              <Select
                value={lut.lut_id || undefined}
                onValueChange={handleSelectExisting}
                items={lutAssets.map((a) => ({ value: a.id, label: a.name }))}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Or select existing LUT..." />
                </SelectTrigger>
                <SelectContent>
                  {lutAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Interpolation method */}
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Interpolation</label>
        <Select
          value={lut.interpolation}
          onValueChange={handleInterpolationChange}
          items={INTERPOLATION_OPTIONS}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERPOLATION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mix slider */}
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Mix</label>
        <div className="flex items-center gap-2">
          <Slider
            value={[lut.mix]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={handleMixChange}
            onValueCommit={() => useVideoEditorStore.temporal.getState().resume()}
            onPointerDown={() => useVideoEditorStore.temporal.getState().pause()}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs text-muted-foreground">
            {Math.round(lut.mix * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
