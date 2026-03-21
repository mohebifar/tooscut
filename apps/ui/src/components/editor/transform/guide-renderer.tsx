import type { SnapGuide } from "./types";

interface GuideRendererProps {
  guides: SnapGuide[];
  displayWidth: number;
  displayHeight: number;
}

export function GuideRenderer({ guides, displayWidth, displayHeight }: GuideRendererProps) {
  return (
    <>
      {guides.map((guide, i) =>
        guide.type === "vertical" ? (
          <line
            key={`v-${i}`}
            x1={guide.position}
            y1={0}
            x2={guide.position}
            y2={displayHeight}
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        ) : (
          <line
            key={`h-${i}`}
            x1={0}
            y1={guide.position}
            x2={displayWidth}
            y2={guide.position}
            stroke="#f59e0b"
            strokeWidth={1}
            strokeDasharray="4 4"
            pointerEvents="none"
          />
        ),
      )}
    </>
  );
}
