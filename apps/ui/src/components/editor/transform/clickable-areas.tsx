import { useState, useEffect } from "react";
import type { DisplayBounds } from "./types";

interface ClickableItem {
  clipId: string;
  bounds: DisplayBounds;
  rotation: number;
}

interface ClickableAreasProps {
  items: ClickableItem[];
  selectedClipIds: string[];
  onSelect: (clipId: string) => void;
}

export function ClickableAreas({ items, selectedClipIds, onSelect }: ClickableAreasProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedSet = new Set(selectedClipIds);

  useEffect(() => {
    setHoveredId(null);
  }, [selectedClipIds]);

  return (
    <>
      {items
        .filter((item) => !selectedSet.has(item.clipId))
        .map((item) => {
          const centerX = item.bounds.x + item.bounds.width / 2;
          const centerY = item.bounds.y + item.bounds.height / 2;
          const isHovered = hoveredId === item.clipId;

          return (
            <g key={item.clipId} transform={`rotate(${-item.rotation} ${centerX} ${centerY})`}>
              <rect
                x={item.bounds.x}
                y={item.bounds.y}
                width={item.bounds.width}
                height={item.bounds.height}
                fill="transparent"
                stroke={isHovered ? "#8b5cf6" : "transparent"}
                strokeWidth={1.5}
                strokeDasharray={isHovered ? "4 4" : undefined}
                cursor="pointer"
                onMouseEnter={() => setHoveredId(item.clipId)}
                onMouseLeave={() => setHoveredId(null)}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelect(item.clipId);
                }}
              />
            </g>
          );
        })}
    </>
  );
}
