import { Circle, Group, Path, Rect } from "react-konva";

export function KonvaVolumeIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24;
  return (
    <Path
      x={x}
      y={y}
      scaleX={scale}
      scaleY={scale}
      data="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
      stroke="#ffffff"
      strokeWidth={2}
    />
  );
}

export function KonvaVolume2Icon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24;
  return (
    <Group x={x} y={y}>
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M16 9a5 5 0 0 1 0 6"
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M19.364 18.364a9 9 0 0 0 0-12.728"
        stroke="#ffffff"
        strokeWidth={2}
      />
    </Group>
  );
}

export function KonvaEyeIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24;
  return (
    <Group x={x} y={y}>
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Circle
        scaleX={scale}
        scaleY={scale}
        x={size / 2}
        y={size / 2}
        radius={3}
        stroke="#ffffff"
        strokeWidth={2}
      />
    </Group>
  );
}

export function KonvaEyeOffIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24;
  return (
    <Group x={x} y={y}>
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M14.084 14.158a3 3 0 0 1-4.242-4.242"
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Path scaleX={scale} scaleY={scale} data="m2 2 20 20" stroke="#ffffff" strokeWidth={2} />
    </Group>
  );
}

export function KonvaLockIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24;

  return (
    <Group x={x} y={y}>
      <Rect
        scaleX={scale}
        scaleY={scale}
        width={18}
        height={11}
        x={2}
        y={7}
        cornerRadius={2}
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M7 11V7a5 5 0 0 1 10 0v4"
        stroke="#ffffff"
        strokeWidth={2}
      />
    </Group>
  );
}

export function KonvaLockOpenIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24;

  return (
    <Group x={x} y={y}>
      <Rect
        scaleX={scale}
        scaleY={scale}
        width={18}
        height={11}
        x={2}
        y={7}
        cornerRadius={2}
        stroke="#ffffff"
        strokeWidth={2}
      />
      <Path
        scaleX={scale}
        scaleY={scale}
        data="M7 11V7a5 5 0 0 1 9.9-1"
        stroke="#ffffff"
        strokeWidth={2}
      />
    </Group>
  );
}

export function KonvaTrashIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24;
  return (
    <Group x={x} y={y} scaleX={scale} scaleY={scale}>
      <Path data="M3 6h18" stroke="#ffffff" strokeWidth={2} />
      <Path data="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" stroke="#ffffff" strokeWidth={2} />
      <Path data="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" stroke="#ffffff" strokeWidth={2} />
    </Group>
  );
}
