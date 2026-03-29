import React from "react";
import { Rect } from "react-konva";

import type { SplitTrackLayout } from "./track-layout";
import type { TimelineTrack } from "./types";

import { COLORS, TRACK_HEADER_WIDTH } from "./constants";

export const TrackBackgrounds = React.memo(function TrackBackgrounds({
  tracks,
  trackIndexToY,
  splitLayout,
  width,
  videoSectionTop,
  audioSectionTop,
  sectionHeight,
}: {
  tracks: TimelineTrack[];
  trackIndexToY: (index: number) => number;
  splitLayout: SplitTrackLayout;
  width: number;
  videoSectionTop: number;
  audioSectionTop: number;
  sectionHeight: number;
}) {
  const numVideo = splitLayout.videoTrackCount;

  return (
    <>
      {tracks.map((track, index) => {
        const isVideo = index < numVideo;
        const sectionIdx = isVideo ? index : index - numVideo;
        const section = isVideo ? splitLayout.video : splitLayout.audio;
        const trackHeight = section.trackHeights[sectionIdx];
        const y = trackIndexToY(index);
        const clipTop = isVideo ? videoSectionTop : audioSectionTop;
        const clipBottom = clipTop + sectionHeight;

        // Viewport culling within the track's section
        if (y + trackHeight < clipTop || y > clipBottom) return null;

        const visibleY = Math.max(y, clipTop);
        const visibleHeight = Math.min(y + trackHeight, clipBottom) - visibleY;
        if (visibleHeight <= 0) return null;

        return (
          <Rect
            key={track.fullId}
            x={TRACK_HEADER_WIDTH}
            y={visibleY}
            width={width - TRACK_HEADER_WIDTH}
            height={visibleHeight}
            fill={sectionIdx % 2 === 0 ? COLORS.trackBackground : COLORS.trackBackgroundAlt}
          />
        );
      })}
    </>
  );
});
