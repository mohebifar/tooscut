/**
 * Color Space Transform node properties editor.
 */

import type { ColorSpace } from "@tooscut/render-engine";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

const STANDARD_OPTIONS: { value: ColorSpace; label: string }[] = [
  { value: "Srgb", label: "sRGB" },
  { value: "Linear", label: "Linear" },
];

const ACES_OPTIONS: { value: ColorSpace; label: string }[] = [
  { value: "AcesCg", label: "ACES CG (AP1)" },
];

const LOG_OPTIONS: { value: ColorSpace; label: string }[] = [
  { value: "LogC", label: "ARRI LogC3" },
  { value: "SLog2", label: "Sony S-Log2" },
  { value: "SLog3", label: "Sony S-Log3" },
  { value: "CLog3", label: "Canon Log 3" },
  { value: "VLog", label: "Panasonic V-Log" },
  { value: "BmFilm", label: "BMD Film Gen 5" },
  { value: "RedLog3G10", label: "RED Log3G10" },
];

interface CstPropertiesProps {
  fromSpace: ColorSpace;
  toSpace: ColorSpace;
  onChange: (updates: { from_space?: ColorSpace; to_space?: ColorSpace }) => void;
}

export function CstProperties({ fromSpace, toSpace, onChange }: CstPropertiesProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">From</label>
        <ColorSpaceSelect value={fromSpace} onValueChange={(v) => onChange({ from_space: v })} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">To</label>
        <ColorSpaceSelect value={toSpace} onValueChange={(v) => onChange({ to_space: v })} />
      </div>
    </div>
  );
}

function ColorSpaceSelect({
  value,
  onValueChange,
}: {
  value: ColorSpace;
  onValueChange: (value: ColorSpace) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as ColorSpace);
      }}
      items={[...LOG_OPTIONS, ...ACES_OPTIONS, ...STANDARD_OPTIONS]}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Standard</SelectLabel>
          {STANDARD_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>ACES</SelectLabel>
          {ACES_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Camera Log</SelectLabel>
          {LOG_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
