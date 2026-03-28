import React from "react";
import { Rect } from "react-konva";

import { COLORS, RULER_HEIGHT, TRACK_HEADER_WIDTH, TRACK_HEIGHT } from "./constants";
import { TimelineTrack } from "./types";

export const TrackBackgrounds = React.memo(function TrackBackgrounds({
  tracks,
  trackIndexToY,
  height,
  width,
}: {
  tracks: TimelineTrack[];
  trackIndexToY: (index: number) => number;
  height: number;
  width: number;
}) {
  return (
    <>
      {tracks.map((track, index) => {
        const y = trackIndexToY(index);
        if (y + TRACK_HEIGHT < RULER_HEIGHT || y > height) return null;

        return (
          <Rect
            key={track.fullId}
            x={TRACK_HEADER_WIDTH}
            y={Math.max(y, RULER_HEIGHT)}
            width={width - TRACK_HEADER_WIDTH}
            height={Math.min(
              TRACK_HEIGHT,
              y < RULER_HEIGHT ? TRACK_HEIGHT - (RULER_HEIGHT - y) : TRACK_HEIGHT,
            )}
            fill={index % 2 === 0 ? COLORS.trackBackground : COLORS.trackBackgroundAlt}
          />
        );
      })}
    </>
  );
});
