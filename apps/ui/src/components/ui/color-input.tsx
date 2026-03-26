"use client";

import ColorLib from "color";
import { Slider } from "radix-ui";
import { useState, useRef, useCallback, useEffect, memo } from "react";

import { cn } from "@/lib/utils";

import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/** RGBA color: [r, g, b, a] where each component is 0–1. */
type RGBA = [number, number, number, number];

export interface ColorInputProps {
  /** Color value as [r, g, b, a] with components in 0–1 range. */
  value: RGBA;
  /** Called when the color changes. */
  onChange: (color: RGBA) => void;
  /** Show the alpha channel slider. Default false. */
  showAlpha?: boolean;
  /** Additional classes for the trigger button. */
  className?: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function rgbaToHex(c: RGBA): string {
  const r = Math.round(c[0] * 255);
  const g = Math.round(c[1] * 255);
  const b = Math.round(c[2] * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToRgba(hex: string, alpha: number): RGBA | null {
  const clean = hex.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [
    parseInt(clean.substring(0, 2), 16) / 255,
    parseInt(clean.substring(2, 4), 16) / 255,
    parseInt(clean.substring(4, 6), 16) / 255,
    alpha,
  ];
}

function rgbaToHsl(c: RGBA): { h: number; s: number; l: number } {
  const color = ColorLib.rgb(c[0] * 255, c[1] * 255, c[2] * 255);
  const [h, s, l] = color.hsl().array();
  return { h: isNaN(h) ? 0 : h, s: isNaN(s) ? 0 : s, l: isNaN(l) ? 0 : l };
}

function hslToRgba(h: number, s: number, l: number, a: number): RGBA {
  const c = ColorLib.hsl(h, s, l);
  const [r, g, b] = c.rgb().array();
  return [r / 255, g / 255, b / 255, a];
}

/**
 * Selection-area position [0–1]² ↔ saturation/lightness.
 *
 * The area renders a white-to-transparent gradient (left→right)
 * over a black-to-transparent gradient (bottom→top) on top of
 * the pure hue. The math maps (x,y) to (saturation, lightness):
 *   s = x * 100
 *   topL = 100 − 50·x   (lightness at top edge for given x)
 *   l = topL · (1 − y)
 */
function posToSL(x: number, y: number) {
  const s = x * 100;
  const topL = x < 0.01 ? 100 : 50 + 50 * (1 - x);
  return { s, l: topL * (1 - y) };
}

function slToPos(s: number, l: number) {
  const x = s / 100;
  const topL = x < 0.01 ? 100 : 50 + 50 * (1 - x);
  const y = topL > 0 ? 1 - l / topL : 0;
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

const CHECKERBOARD =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' width='4' height='4' fill='%23fff'/%3E%3Crect y='4' width='4' height='4' fill='%23fff'/%3E%3C/svg%3E\")";

const THUMB =
  "block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// ── Selection area ──────────────────────────────────────────────

const SelectionArea = memo(function SelectionArea({
  hue,
  saturation,
  lightness,
  onChangeSL,
}: {
  hue: number;
  saturation: number;
  lightness: number;
  onChangeSL: (s: number, l: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const onChangeSLRef = useRef(onChangeSL);
  onChangeSLRef.current = onChangeSL;

  const update = useCallback((clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const { s, l } = posToSL(x, y);
    onChangeSLRef.current(s, l);
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && update(e.clientX, e.clientY);
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [update]);

  const pos = slToPos(saturation, lightness);

  return (
    <div
      ref={ref}
      className="relative h-36 w-full cursor-crosshair rounded"
      style={{
        background: `linear-gradient(0deg,#000,transparent),linear-gradient(90deg,#fff,transparent),hsl(${hue},100%,50%)`,
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        update(e.clientX, e.clientY);
      }}
    >
      <div
        className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{
          left: `${pos.x * 100}%`,
          top: `${pos.y * 100}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────

export function ColorInput({ value, onChange, showAlpha = false, className }: ColorInputProps) {
  const [open, setOpen] = useState(false);

  // Internal HSL + alpha state (drives picker while popover is open)
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(100);
  const [lit, setLit] = useState(50);
  const [alpha, setAlpha] = useState(1);
  const [hexText, setHexText] = useState("");

  const wasOpen = useRef(false);

  // Sync internal state from value when popover opens
  useEffect(() => {
    if (open && !wasOpen.current) {
      const hsl = rgbaToHsl(value);
      setHue(hsl.h);
      setSat(hsl.s);
      setLit(hsl.l);
      setAlpha(value[3]);
      setHexText(rgbaToHex(value));
    }
    wasOpen.current = open;
  }, [open, value]);

  // Ref keeps latest internal values so callbacks avoid stale closures
  const stateRef = useRef({ hue, sat, lit, alpha });
  stateRef.current = { hue, sat, lit, alpha };

  const emit = useCallback(
    (h: number, s: number, l: number, a: number) => {
      const rgba = hslToRgba(h, s, l, a);
      onChange(rgba);
      setHexText(rgbaToHex(rgba));
    },
    [onChange],
  );

  const handleSL = useCallback(
    (s: number, l: number) => {
      setSat(s);
      setLit(l);
      emit(stateRef.current.hue, s, l, stateRef.current.alpha);
    },
    [emit],
  );

  const handleHue = useCallback(
    (h: number) => {
      setHue(h);
      emit(h, stateRef.current.sat, stateRef.current.lit, stateRef.current.alpha);
    },
    [emit],
  );

  const handleAlpha = useCallback(
    (a: number) => {
      setAlpha(a);
      emit(stateRef.current.hue, stateRef.current.sat, stateRef.current.lit, a);
    },
    [emit],
  );

  const commitHex = useCallback(() => {
    const rgba = hexToRgba(hexText, stateRef.current.alpha);
    if (rgba) {
      onChange(rgba);
      const hsl = rgbaToHsl(rgba);
      setHue(hsl.h);
      setSat(hsl.s);
      setLit(hsl.l);
    } else {
      // Invalid hex — revert to current color
      setHexText(rgbaToHex(value));
    }
  }, [hexText, value, onChange]);

  // Display values derived from the value prop (source of truth for trigger)
  const cssColor = `rgba(${Math.round(value[0] * 255)},${Math.round(value[1] * 255)},${Math.round(value[2] * 255)},${value[3]})`;
  const hex = rgbaToHex(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-1.5 transition-colors hover:bg-accent/50",
            className,
          )}
        >
          {/* Swatch with checkerboard behind for alpha visibility */}
          <span
            className="h-5 w-5 shrink-0 rounded-sm border border-border"
            style={{ backgroundImage: CHECKERBOARD, backgroundSize: "8px 8px" }}
          >
            <span
              className="block h-full w-full rounded-sm"
              style={{ backgroundColor: cssColor }}
            />
          </span>
          <span className="font-mono text-xs text-muted-foreground">{hex}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 space-y-3 p-3" align="start">
        <SelectionArea hue={hue} saturation={sat} lightness={lit} onChangeSL={handleSL} />

        {/* Hue slider */}
        <Slider.Root
          className="relative flex h-4 w-full touch-none"
          max={360}
          step={1}
          value={[hue]}
          onValueChange={([h]) => handleHue(h)}
        >
          <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]">
            <Slider.Range className="absolute h-full" />
          </Slider.Track>
          <Slider.Thumb className={THUMB} />
        </Slider.Root>

        {/* Alpha slider */}
        {showAlpha && (
          <Slider.Root
            className="relative flex h-4 w-full touch-none"
            max={100}
            step={1}
            value={[Math.round(alpha * 100)]}
            onValueChange={([a]) => handleAlpha(a / 100)}
          >
            <Slider.Track
              className="relative my-0.5 h-3 w-full grow rounded-full"
              style={{
                backgroundImage: `linear-gradient(90deg,transparent,hsl(${hue},${sat}%,${lit}%)),${CHECKERBOARD}`,
                backgroundSize: "100% 100%, 8px 8px",
              }}
            >
              <Slider.Range className="absolute h-full" />
            </Slider.Track>
            <Slider.Thumb className={THUMB} />
          </Slider.Root>
        )}

        {/* Hex input + alpha readout */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            className="h-7 flex-1 rounded border border-input bg-secondary px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
            value={hexText}
            onChange={(e) => setHexText(e.target.value)}
            onBlur={commitHex}
            onKeyDown={(e) => e.key === "Enter" && commitHex()}
          />
          {showAlpha && (
            <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
              {Math.round(alpha * 100)}%
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
