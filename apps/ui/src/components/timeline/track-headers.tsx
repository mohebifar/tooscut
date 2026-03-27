import React from "react";
import { Group, Rect, Text } from "react-konva";

import { useVideoEditorStore } from "../../state/video-editor-store";
import { COLORS, RULER_HEIGHT, TRACK_HEADER_WIDTH, TRACK_HEIGHT } from "./constants";
import {
  KonvaEyeIcon,
  KonvaEyeOffIcon,
  KonvaLockIcon,
  KonvaLockOpenIcon,
  KonvaVolume2Icon,
  KonvaVolumeIcon,
} from "./konva-icons";
import { TimelineTrack } from "./types";

interface TrackHeaderProps {
  track: TimelineTrack;
  y: number;
}

const TrackHeader = React.memo(function TrackHeader({ track, y }: TrackHeaderProps) {
  const toggleTrackMuted = useVideoEditorStore((s) => s.toggleTrackMuted);
  const toggleTrackLocked = useVideoEditorStore((s) => s.toggleTrackLocked);
  const buttonSize = 24;
  const buttonIconSize = 16;
  const buttonY = y + TRACK_HEIGHT / 2 - buttonSize / 2;
  const muteButtonX = TRACK_HEADER_WIDTH - buttonSize * 2 - 16;
  const lockButtonX = TRACK_HEADER_WIDTH - buttonSize - 8;

  const MuteIcon =
    track.type === "video"
      ? track.muted
        ? KonvaEyeOffIcon
        : KonvaEyeIcon
      : track.muted
        ? KonvaVolumeIcon
        : KonvaVolume2Icon;

  const LockIcon = track.locked ? KonvaLockIcon : KonvaLockOpenIcon;

  return (
    <Group key={track.fullId}>
      <Rect
        x={0}
        y={y}
        width={TRACK_HEADER_WIDTH}
        height={TRACK_HEIGHT}
        fill={COLORS.headerBackground}
        stroke={COLORS.headerBorder}
        strokeWidth={1}
      />
      <Text
        x={12}
        y={y + TRACK_HEIGHT / 2 - 6}
        text={track.name}
        fontSize={12}
        fill={COLORS.headerText}
      />

      {/* Mute button */}
      <Group
        x={muteButtonX}
        y={buttonY}
        onClick={() => toggleTrackMuted(track.id)}
        onTap={() => toggleTrackMuted(track.id)}
      >
        <Rect
          width={buttonSize}
          height={buttonSize}
          fill={track.muted ? "#ef4444" : "#374151"}
          cornerRadius={4}
        />
        <MuteIcon x={buttonSize / 2 - 8} y={buttonSize / 2 - 8} size={buttonIconSize} />
      </Group>

      {/* Lock button */}
      <Group
        x={lockButtonX}
        y={buttonY}
        onClick={() => toggleTrackLocked(track.id)}
        onTap={() => toggleTrackLocked(track.id)}
      >
        <Rect
          width={buttonSize}
          height={buttonSize}
          fill={track.locked ? "#f59e0b" : "#374151"}
          cornerRadius={4}
        />
        <LockIcon x={buttonSize / 2 - 8} y={buttonSize / 2 - 8} size={buttonIconSize} />
      </Group>
    </Group>
  );
});

export const TrackHeaders = React.memo(function TrackHeaders({
  tracks,
  trackIndexToY,
  height,
}: {
  tracks: TimelineTrack[];
  trackIndexToY: (index: number) => number;
  height: number;
}) {
  return (
    <>
      {tracks.map((track, index) => {
        const y = trackIndexToY(index);
        if (y + TRACK_HEIGHT < RULER_HEIGHT || y > height) return null;

        return <TrackHeader key={track.fullId} track={track} y={y} />;
      })}
    </>
  );
});
