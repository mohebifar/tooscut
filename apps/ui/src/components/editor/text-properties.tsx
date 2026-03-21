import { useMemo, useCallback, useEffect } from "react";
import { Loader2, Italic, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { NumericInput } from "../ui/numeric-input";
import { ColorInput } from "../ui/color-input";
import { Textarea } from "../ui/textarea";
import { Toggle } from "../ui/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useFontStore } from "../../state/font-store";
import { getWeightName, findNearestWeight } from "../../lib/font-service";
import { FontPicker } from "./font-picker";
import { PropertySection, PropertyRow } from "./property-shared";
import type { TextClip } from "../../state/video-editor-store";
import type { Effects, TextStyle, TextBox } from "@tooscut/render-engine";

interface TextPropertiesProps {
  clip: TextClip;
  onUpdateText: (clipId: string, text: string) => void;
  onUpdateStyle: (clipId: string, style: Partial<TextStyle>) => void;
  onUpdateBox: (clipId: string, box: Partial<TextBox>) => void;
  onUpdateEffects: (clipId: string, effects: Partial<Effects>) => void;
}

export function TextProperties({
  clip,
  onUpdateText,
  onUpdateStyle,
  onUpdateBox,
  onUpdateEffects,
}: TextPropertiesProps) {
  const { textStyle: style, textBox: box } = clip;
  const opacity = clip.effects?.opacity ?? 1;

  // Extract specific style properties we care about for font loading
  const fontFamily = style.font_family;
  const fontWeight = style.font_weight;
  const isItalic = style.italic;

  // Font store state - use selectors that don't cause unnecessary re-renders
  const catalog = useFontStore((s) => s.catalog);
  const fetchCatalog = useFontStore((s) => s.fetchCatalog);

  // Get current font entry from catalog
  const fontEntry = useMemo(() => {
    return catalog.find((f) => f.family === fontFamily);
  }, [catalog, fontFamily]);

  // Available weights for current font (default to [400, 700] if not in catalog)
  const availableWeights = fontEntry?.weights ?? [400, 700];
  const supportsItalic = fontEntry?.styles.includes("italic") ?? false;

  // Compute the variant key for loading status
  const currentWeight = fontEntry ? findNearestWeight(fontEntry.weights, fontWeight) : fontWeight;
  const currentItalic = isItalic && supportsItalic;
  const variantKey = fontEntry
    ? `${fontEntry.id}|${currentWeight}|${currentItalic ? "italic" : "normal"}`
    : null;

  // Subscribe only to the specific variant's status (not the whole variantStatus object)
  const isCurrentVariantLoading = useFontStore(
    useCallback(
      (s) => (variantKey ? s.variantStatus[variantKey] === "loading" : false),
      [variantKey],
    ),
  );

  // Fetch catalog on mount
  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  // Download font variant when font/weight/italic changes
  useEffect(() => {
    if (!fontEntry) return;
    void useFontStore
      .getState()
      .ensureFontVariant(
        fontEntry.id,
        fontEntry.family,
        currentWeight,
        currentItalic,
        fontEntry.subsets,
      );
  }, [fontEntry, currentWeight, currentItalic]);

  // Handle font family change — auto-adjust weight and italic
  const handleFontChange = useCallback(
    (family: string, _fontId: string) => {
      const newFont = useFontStore.getState().getFontByFamily(family);
      const updates: Partial<TextStyle> = { font_family: family };

      if (newFont) {
        // Snap weight to nearest available
        const nearestWeight = findNearestWeight(newFont.weights, style.font_weight);
        if (nearestWeight !== style.font_weight) {
          updates.font_weight = nearestWeight;
        }
        // Reset italic if not supported
        if (style.italic && !newFont.styles.includes("italic")) {
          updates.italic = false;
        }
      }

      onUpdateStyle(clip.id, updates);
    },
    [clip.id, style, onUpdateStyle],
  );

  return (
    <div className="space-y-4">
      <PropertySection title="Content">
        <Textarea
          className="min-h-20 resize-none"
          value={clip.text}
          onChange={(e) => onUpdateText(clip.id, e.target.value)}
        />
      </PropertySection>

      <PropertySection title="Font">
        <PropertyRow label="Family">
          <div className="w-36">
            <FontPicker value={style.font_family} onChange={handleFontChange} />
          </div>
        </PropertyRow>
        <PropertyRow label="Size">
          <NumericInput
            value={style.font_size}
            onChange={(v) => onUpdateStyle(clip.id, { font_size: v })}
            suffix="px"
            precision={0}
            step={1}
            min={1}
            max={500}
          />
        </PropertyRow>
        <PropertyRow label="Weight">
          <div className="flex items-center gap-1">
            {isCurrentVariantLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Select
              value={String(style.font_weight)}
              onValueChange={(v) => onUpdateStyle(clip.id, { font_weight: Number(v) })}
            >
              <SelectTrigger size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableWeights.map((w) => (
                  <SelectItem key={w} value={String(w)}>
                    {getWeightName(w)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PropertyRow>
        <PropertyRow label="Italic">
          <Toggle
            variant="outline"
            size="sm"
            pressed={style.italic}
            onPressedChange={(pressed) => onUpdateStyle(clip.id, { italic: pressed })}
            disabled={!supportsItalic}
          >
            <Italic className="h-3.5 w-3.5" />
          </Toggle>
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Color">
        <PropertyRow label="Text">
          <ColorInput
            value={style.color}
            onChange={(color) => onUpdateStyle(clip.id, { color })}
            showAlpha
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Alignment">
        <PropertyRow label="Horizontal">
          <div className="flex gap-1">
            <Toggle
              variant="outline"
              size="sm"
              pressed={style.text_align === "Left"}
              onPressedChange={() => onUpdateStyle(clip.id, { text_align: "Left" })}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              variant="outline"
              size="sm"
              pressed={style.text_align === "Center"}
              onPressedChange={() => onUpdateStyle(clip.id, { text_align: "Center" })}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle
              variant="outline"
              size="sm"
              pressed={style.text_align === "Right"}
              onPressedChange={() => onUpdateStyle(clip.id, { text_align: "Right" })}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </Toggle>
          </div>
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Position & Size">
        <PropertyRow label="X">
          <NumericInput
            value={box.x}
            onChange={(v) => onUpdateBox(clip.id, { x: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={0}
            max={100}
          />
        </PropertyRow>
        <PropertyRow label="Y">
          <NumericInput
            value={box.y}
            onChange={(v) => onUpdateBox(clip.id, { y: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={0}
            max={100}
          />
        </PropertyRow>
        <PropertyRow label="Width">
          <NumericInput
            value={box.width}
            onChange={(v) => onUpdateBox(clip.id, { width: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={1}
            max={100}
          />
        </PropertyRow>
        <PropertyRow label="Height">
          <NumericInput
            value={box.height}
            onChange={(v) => onUpdateBox(clip.id, { height: v })}
            suffix="%"
            precision={1}
            step={0.5}
            min={1}
            max={100}
          />
        </PropertyRow>
      </PropertySection>

      <PropertySection title="Opacity">
        <PropertyRow label="Opacity">
          <NumericInput
            value={opacity * 100}
            onChange={(v) => onUpdateEffects(clip.id, { opacity: v / 100 })}
            suffix="%"
            precision={0}
            step={1}
            min={0}
            max={100}
          />
        </PropertyRow>
      </PropertySection>
    </div>
  );
}
