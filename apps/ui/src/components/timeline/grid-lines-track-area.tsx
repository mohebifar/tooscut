import React from "react";
import { Line } from "react-konva";

import { COLORS, RULER_HEIGHT } from "./constants";

export const GridLinesTrackArea = React.memo(function GridLinesTrackArea({
  gridLines,
  height,
}: {
  gridLines: Array<{ x: number; isMajor: boolean; frame: number }>;
  height: number;
}) {
  return (
    <>
      {gridLines.map((line, i) => (
        <Line
          key={i}
          points={[line.x, RULER_HEIGHT, line.x, height]}
          stroke={line.isMajor ? COLORS.rulerMajorLine : COLORS.rulerMinorLine}
          strokeWidth={1}
        />
      ))}
    </>
  );
});
