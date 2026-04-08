/**
 * Color Space Transform node properties editor.
 *
 * Allows separate selection of transfer function (gamma curve)
 * and gamut (color primaries) for source and target.
 */

import type { ColorSpace, Gamut, ToneMapping } from "@tooscut/render-engine";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

// Transfer function options (gamma curves)
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

// Gamut (color primaries) options
const STANDARD_GAMUT_OPTIONS: { value: Gamut; label: string }[] = [
  { value: "Rec709", label: "Rec.709 / sRGB" },
  { value: "DciP3", label: "DCI-P3 (D65)" },
  { value: "Rec2020", label: "Rec.2020" },
];

const CAMERA_GAMUT_OPTIONS: { value: Gamut; label: string }[] = [
  { value: "SGamut", label: "Sony S-Gamut" },
  { value: "SGamut3", label: "Sony S-Gamut3" },
  { value: "SGamut3Cine", label: "Sony S-Gamut3.Cine" },
  { value: "ArriWideGamut", label: "ARRI Wide Gamut" },
  { value: "VGamut", label: "Panasonic V-Gamut" },
  { value: "BmdWideGamut", label: "BMD Wide Gamut" },
  { value: "RedWideGamut", label: "RED Wide Gamut" },
];

const ACES_GAMUT_OPTIONS: { value: Gamut; label: string }[] = [
  { value: "AcesCgAp1", label: "ACES AP1 (ACEScg)" },
];

const TONE_MAPPING_OPTIONS: { value: ToneMapping; label: string }[] = [
  { value: "None", label: "None" },
  { value: "Simple", label: "Simple" },
];

interface CstPropertiesProps {
  fromSpace: ColorSpace;
  toSpace: ColorSpace;
  fromGamut: Gamut;
  toGamut: Gamut;
  toneMapping: ToneMapping;
  onChange: (updates: {
    from_space?: ColorSpace;
    to_space?: ColorSpace;
    from_gamut?: Gamut;
    to_gamut?: Gamut;
    tone_mapping?: ToneMapping;
  }) => void;
}

export function CstProperties({
  fromSpace,
  toSpace,
  fromGamut,
  toGamut,
  toneMapping,
  onChange,
}: CstPropertiesProps) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">Transfer Function</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">From</label>
          <ColorSpaceSelect value={fromSpace} onValueChange={(v) => onChange({ from_space: v })} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">To</label>
          <ColorSpaceSelect value={toSpace} onValueChange={(v) => onChange({ to_space: v })} />
        </div>
      </div>
      <div className="text-xs font-medium text-muted-foreground">Color Gamut</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">From</label>
          <GamutSelect value={fromGamut} onValueChange={(v) => onChange({ from_gamut: v })} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">To</label>
          <GamutSelect value={toGamut} onValueChange={(v) => onChange({ to_gamut: v })} />
        </div>
      </div>
      <div className="text-xs font-medium text-muted-foreground">Tone Mapping</div>
      <Select
        value={toneMapping}
        onValueChange={(v) => {
          if (v) onChange({ tone_mapping: v as ToneMapping });
        }}
        items={TONE_MAPPING_OPTIONS}
      >
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TONE_MAPPING_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

function GamutSelect({
  value,
  onValueChange,
}: {
  value: Gamut;
  onValueChange: (value: Gamut) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as Gamut);
      }}
      items={[...STANDARD_GAMUT_OPTIONS, ...CAMERA_GAMUT_OPTIONS, ...ACES_GAMUT_OPTIONS]}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Standard</SelectLabel>
          {STANDARD_GAMUT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Camera</SelectLabel>
          {CAMERA_GAMUT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>ACES</SelectLabel>
          {ACES_GAMUT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
