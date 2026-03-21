/**
 * Searchable font family picker using Fontsource catalog.
 *
 * Lazy-loads the catalog on first open. Shows first 50 matching results
 * with category badges and a check icon for the current selection.
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useFontStore } from "../../state/font-store";
import type { FontsourceFontEntry } from "../../lib/font-service";

const MAX_RESULTS = 50;

interface FontPickerProps {
  value: string; // Current font family
  onChange: (family: string, fontId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  "sans-serif": "Sans",
  serif: "Serif",
  monospace: "Mono",
  display: "Display",
  handwriting: "Hand",
  icons: "Icons",
};

function CategoryBadge({ category }: { category: string }) {
  const label = CATEGORY_LABELS[category] ?? category;
  return (
    <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}

export function FontPicker({ value, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const catalog = useFontStore((s) => s.catalog);
  const catalogLoading = useFontStore((s) => s.catalogLoading);
  const catalogError = useFontStore((s) => s.catalogError);
  const fetchCatalog = useFontStore((s) => s.fetchCatalog);

  // Fetch catalog on first open
  useEffect(() => {
    if (open && catalog.length === 0 && !catalogLoading) {
      void fetchCatalog();
    }
  }, [open, catalog.length, catalogLoading, fetchCatalog]);

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      // Small delay to allow popover animation
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    setSearch("");
  }, [open]);

  // Filter catalog by search term
  const filtered = useMemo(() => {
    if (!search.trim()) return catalog.slice(0, MAX_RESULTS);

    const query = search.toLowerCase();
    const matches: FontsourceFontEntry[] = [];
    for (const font of catalog) {
      if (font.family.toLowerCase().includes(query)) {
        matches.push(font);
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [catalog, search]);

  const handleSelect = useCallback(
    (font: FontsourceFontEntry) => {
      onChange(font.family, font.id);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between font-normal">
          <span className="truncate">{value || "Select font..."}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="border-b border-border p-2">
          <Input
            ref={inputRef}
            placeholder="Search fonts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-64">
          {catalogLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading fonts...</span>
            </div>
          )}

          {catalogError && (
            <div className="p-4 text-center text-sm text-destructive">
              {catalogError}
              <Button
                variant="link"
                size="sm"
                className="mt-2 w-full text-xs text-muted-foreground"
                onClick={() => void fetchCatalog()}
              >
                Retry
              </Button>
            </div>
          )}

          {!catalogLoading && !catalogError && filtered.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">No fonts found</div>
          )}

          {!catalogLoading && filtered.length > 0 && (
            <div className="p-1">
              {filtered.map((font) => {
                const isSelected = font.family === value;
                return (
                  <Button
                    key={font.id}
                    variant="ghost"
                    size="sm"
                    className={`w-full justify-start gap-2 font-normal ${
                      isSelected ? "bg-accent text-accent-foreground" : ""
                    }`}
                    onClick={() => handleSelect(font)}
                  >
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="truncate">{font.family}</span>
                    <CategoryBadge category={font.category} />
                  </Button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
