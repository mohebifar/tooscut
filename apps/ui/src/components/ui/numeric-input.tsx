import * as React from "react";
import { useCallback, useRef, useState, useEffect } from "react";
import { cn } from "../../lib/utils";

export interface NumericInputProps {
  /** Current value */
  value: number;
  /** Called when value changes */
  onChange: (value: number) => void;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
  /** Step size for drag adjustments (value change per pixel) */
  step?: number;
  /** Suffix to display after the value (e.g., '%', 'px', '°') */
  suffix?: string;
  /** Number of decimal places to display */
  precision?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * A numeric input that supports:
 * - Click and drag left/right to adjust value
 * - Direct text input when clicked
 * - Optional suffix for units
 */
export const NumericInput = React.forwardRef<HTMLDivElement, NumericInputProps>(
  (
    {
      value,
      onChange,
      min = -Infinity,
      max = Infinity,
      step = 1,
      suffix = "",
      precision = 0,
      disabled = false,
      className,
    },
    ref,
  ) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Drag state
    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartValueRef = useRef(0);
    const hasDraggedRef = useRef(false);

    // Store latest props in refs to avoid stale closures in event handlers
    const onChangeRef = useRef(onChange);
    const stepRef = useRef(step);
    const minRef = useRef(min);
    const maxRef = useRef(max);
    const disabledRef = useRef(disabled);
    const valueRef = useRef(value);
    const precisionRef = useRef(precision);

    // Keep refs in sync with props
    useEffect(() => {
      onChangeRef.current = onChange;
      stepRef.current = step;
      minRef.current = min;
      maxRef.current = max;
      disabledRef.current = disabled;
      valueRef.current = value;
      precisionRef.current = precision;
    });

    // Format value for display
    const formatValue = useCallback(
      (val: number) => {
        return val.toFixed(precision);
      },
      [precision],
    );

    // Clamp value to min/max
    const clampValue = useCallback(
      (val: number) => {
        return Math.min(max, Math.max(min, val));
      },
      [min, max],
    );

    // Stable event handlers that read from refs
    const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const deltaX = e.clientX - dragStartXRef.current;

      // Only start drag adjustment after moving a few pixels
      if (Math.abs(deltaX) > 3) {
        hasDraggedRef.current = true;
      }

      if (hasDraggedRef.current) {
        const deltaValue = deltaX * stepRef.current;
        const rawValue = dragStartValueRef.current + deltaValue;
        const newValue = Math.min(maxRef.current, Math.max(minRef.current, rawValue));
        onChangeRef.current(newValue);
      }
    }, []);

    const handleMouseUp = useCallback(() => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      if (!hasDraggedRef.current && !disabledRef.current) {
        // Clicked without dragging - enter edit mode
        setIsEditing(true);
        setEditValue(valueRef.current.toFixed(precisionRef.current));
      }

      isDraggingRef.current = false;
    }, [handleMouseMove]);

    // Handle mouse down - start potential drag
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (disabled || isEditing) return;

        e.preventDefault();
        isDraggingRef.current = true;
        hasDraggedRef.current = false;
        dragStartXRef.current = e.clientX;
        dragStartValueRef.current = value;

        // Add global listeners
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      },
      [disabled, isEditing, value, handleMouseMove, handleMouseUp],
    );

    // Focus input when entering edit mode
    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

    // Handle input change
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setEditValue(e.target.value);
    }, []);

    // Handle input blur - commit value
    const handleInputBlur = useCallback(() => {
      const parsed = parseFloat(editValue);
      if (!isNaN(parsed)) {
        onChange(clampValue(parsed));
      }
      setIsEditing(false);
    }, [editValue, onChange, clampValue]);

    // Handle input key down
    const handleInputKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          handleInputBlur();
        } else if (e.key === "Escape") {
          setIsEditing(false);
        }
      },
      [handleInputBlur],
    );

    // Clean up listeners on unmount
    useEffect(() => {
      const moveHandler = handleMouseMove;
      const upHandler = handleMouseUp;
      return () => {
        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);
      };
    }, [handleMouseMove, handleMouseUp]);

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={cn(
          "inline-flex h-8 min-w-16 items-center justify-center rounded-md border border-input bg-background px-2 text-sm",
          !disabled && !isEditing && "cursor-ew-resize",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        onMouseDown={handleMouseDown}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className="w-full bg-transparent text-center outline-none"
          />
        ) : (
          <span className="select-none tabular-nums">
            {formatValue(value)}
            {suffix && <span className="ml-0.5 text-muted-foreground">{suffix}</span>}
          </span>
        )}
      </div>
    );
  },
);

NumericInput.displayName = "NumericInput";
