/// <reference types="vite/client" />

/**
 * Transition video test suite.
 *
 * For each TransitionType, renders a 2-second video (30fps, 60 frames).
 * Scenes A and B are pre-rendered as flat textures (background + text baked
 * together) so the transition applies to the whole image uniformly.
 *
 * - Cross transitions (Fade, Dissolve, Wipe*): scene A → scene B
 * - Per-clip transitions (Slide*, Zoom*, Rotate*, Flip*): scene A only
 *
 * Outputs a WebM file per transition and snapshot-tests the midpoint frame.
 *
 * Requires a browser environment with WebGPU support.
 */

import { commands } from "@vitest/browser/context";
import { describe, it, beforeAll, afterAll } from "vitest";

import type { TransitionType, RenderFrame } from "../src/types.js";

import { SnapshotTester, frame, layer, textLayer } from "../src/testing/snapshot-tester.js";

const WIDTH = 640;
const HEIGHT = 480;
const FPS = 30;
const TOTAL_FRAMES = 60; // 2 seconds
const TRANSITION_START = 15; // 0.5s in
const TRANSITION_END = 45; // 1.5s in
const TRANSITION_DURATION = TRANSITION_END - TRANSITION_START; // 30 frames = 1s

// Blue background for scene A
const BLUE: [number, number, number, number] = [30, 80, 220, 255];
// Purple background for scene B
const PURPLE: [number, number, number, number] = [140, 40, 200, 255];

/** Cross transitions blend between two scenes (A → B). */
const CROSS_TRANSITIONS: TransitionType[] = [
  "Fade",
  "Dissolve",
  "WipeLeft",
  "WipeRight",
  "WipeUp",
  "WipeDown",
];

/** Per-clip transitions apply to a single scene (scene A only). */
const CLIP_TRANSITIONS: TransitionType[] = [
  "SlideLeft",
  "SlideRight",
  "SlideUp",
  "SlideDown",
  "ZoomIn",
  "ZoomOut",
  "RotateCw",
  "RotateCcw",
  "FlipH",
  "FlipV",
];

function isCrossTransition(type: TransitionType): boolean {
  return CROSS_TRANSITIONS.includes(type);
}

const ALL_TRANSITIONS: TransitionType[] = [...CROSS_TRANSITIONS, ...CLIP_TRANSITIONS];

/**
 * Pre-render a scene (background + text) into a flat texture.
 * This bakes text into the image so transitions apply uniformly.
 */
async function renderSceneTexture(
  tester: SnapshotTester,
  bgTextureId: string,
  letter: string,
): Promise<ImageData> {
  const renderFrame = frame(WIDTH, HEIGHT, {
    mediaLayers: [layer(bgTextureId).zIndex(0).build()],
    textLayers: [
      textLayer("scene-text", letter)
        .box(0, 0, 100, 100)
        .fontSize(200)
        .fontWeight(700)
        .color(1, 1, 1, 1)
        .align("Center", "Middle")
        .zIndex(1)
        .build(),
    ],
  });
  return tester.render(renderFrame);
}

/**
 * Build a render frame for a cross transition (A → B).
 * Both scenes are single pre-baked textures.
 */
function buildCrossTransitionFrame(
  frameIndex: number,
  transitionType: TransitionType,
): RenderFrame {
  const easing = { preset: "Linear" as const };
  const transitionDuration = 1;

  if (frameIndex < TRANSITION_START) {
    return frame(WIDTH, HEIGHT, [layer("scene-a").build()]);
  }

  if (frameIndex >= TRANSITION_END) {
    return frame(WIDTH, HEIGHT, [layer("scene-b").build()]);
  }

  const progress = (frameIndex - TRANSITION_START) / TRANSITION_DURATION;

  return frame(WIDTH, HEIGHT, [
    layer("scene-a")
      .zIndex(0)
      .transitionOut(transitionType, transitionDuration, easing, progress)
      .build(),
    layer("scene-b")
      .zIndex(1)
      .transitionIn(transitionType, transitionDuration, easing, progress)
      .build(),
  ]);
}

/**
 * Build a render frame for a per-clip transition (scene A only).
 * Scene A is a single pre-baked texture.
 */
function buildClipTransitionFrame(frameIndex: number, transitionType: TransitionType): RenderFrame {
  const easing = { preset: "Linear" as const };
  const transitionDuration = 1;

  if (frameIndex < TRANSITION_START) {
    return frame(WIDTH, HEIGHT, [layer("scene-a").build()]);
  }

  const progress = Math.min(1, (frameIndex - TRANSITION_START) / TRANSITION_DURATION);

  return frame(WIDTH, HEIGHT, [
    layer("scene-a")
      .zIndex(0)
      .transitionOut(transitionType, transitionDuration, easing, progress)
      .build(),
  ]);
}

function buildTransitionFrame(frameIndex: number, transitionType: TransitionType): RenderFrame {
  if (isCrossTransition(transitionType)) {
    return buildCrossTransitionFrame(frameIndex, transitionType);
  }
  return buildClipTransitionFrame(frameIndex, transitionType);
}

/**
 * Encode rendered frames into a WebM video using WebCodecs VideoEncoder.
 */
async function encodeWebM(
  frames: ImageData[],
  width: number,
  height: number,
  fps: number,
): Promise<Uint8Array> {
  const frameDurationMicros = 1_000_000 / fps;
  const chunks: { data: Uint8Array; timestamp: number; type: string }[] = [];

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({
        data,
        timestamp: chunk.timestamp,
        type: chunk.type,
      });
    },
    error: (e) => {
      throw e;
    },
  });

  encoder.configure({
    codec: "vp8",
    width,
    height,
    bitrate: 2_000_000,
    framerate: fps,
  });

  // Use an OffscreenCanvas to convert ImageData to VideoFrame-compatible source
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < frames.length; i++) {
    ctx.putImageData(frames[i], 0, 0);
    const videoFrame = new VideoFrame(canvas, {
      timestamp: i * frameDurationMicros,
      duration: frameDurationMicros,
    });
    encoder.encode(videoFrame, { keyFrame: i % 15 === 0 });
    videoFrame.close();
  }

  await encoder.flush();
  encoder.close();

  // Build a minimal WebM container
  return buildWebMContainer(chunks, width, height, fps);
}

/**
 * Build a minimal WebM (EBML/Matroska) container from encoded VP8 chunks.
 */
function buildWebMContainer(
  chunks: { data: Uint8Array; timestamp: number; type: string }[],
  width: number,
  height: number,
  fps: number,
): Uint8Array {
  const parts: Uint8Array[] = [];

  function writeVarInt(value: number): Uint8Array {
    if (value < 0x7f) return new Uint8Array([value | 0x80]);
    if (value < 0x3fff) return new Uint8Array([0x40 | (value >> 8), value & 0xff]);
    if (value < 0x1fffff)
      return new Uint8Array([0x20 | (value >> 16), (value >> 8) & 0xff, value & 0xff]);
    return new Uint8Array([
      0x10 | (value >> 24),
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }

  function writeUint(value: number, bytes: number): Uint8Array {
    const arr = new Uint8Array(bytes);
    for (let i = bytes - 1; i >= 0; i--) {
      arr[i] = value & 0xff;
      value >>= 8;
    }
    return arr;
  }

  function writeFloat64(value: number): Uint8Array {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value);
    return new Uint8Array(buf);
  }

  function element(id: Uint8Array, data: Uint8Array): Uint8Array {
    const size = writeVarInt(data.length);
    const result = new Uint8Array(id.length + size.length + data.length);
    result.set(id, 0);
    result.set(size, id.length);
    result.set(data, id.length + size.length);
    return result;
  }

  function concat(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  // EBML Header
  const ebmlVersion = element(new Uint8Array([0x42, 0x86]), writeUint(1, 1));
  const ebmlReadVersion = element(new Uint8Array([0x42, 0xf7]), writeUint(1, 1));
  const ebmlMaxIdLength = element(new Uint8Array([0x42, 0xf2]), writeUint(4, 1));
  const ebmlMaxSizeLength = element(new Uint8Array([0x42, 0xf3]), writeUint(8, 1));
  const docType = element(new Uint8Array([0x42, 0x82]), new TextEncoder().encode("webm"));
  const docTypeVersion = element(new Uint8Array([0x42, 0x87]), writeUint(2, 1));
  const docTypeReadVersion = element(new Uint8Array([0x42, 0x85]), writeUint(2, 1));

  const ebmlHeader = element(
    new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
    concat(
      ebmlVersion,
      ebmlReadVersion,
      ebmlMaxIdLength,
      ebmlMaxSizeLength,
      docType,
      docTypeVersion,
      docTypeReadVersion,
    ),
  );

  // Segment > Info
  const timestampScale = element(new Uint8Array([0x2a, 0xd7, 0xb1]), writeUint(1_000_000, 4)); // 1ms
  const durationEl = element(
    new Uint8Array([0x44, 0x89]),
    writeFloat64((chunks.length / fps) * 1000),
  );
  const muxingApp = element(new Uint8Array([0x4d, 0x80]), new TextEncoder().encode("tooscut-test"));
  const writingApp = element(
    new Uint8Array([0x57, 0x41]),
    new TextEncoder().encode("tooscut-test"),
  );
  const info = element(
    new Uint8Array([0x15, 0x49, 0xa9, 0x66]),
    concat(timestampScale, durationEl, muxingApp, writingApp),
  );

  // Segment > Tracks > TrackEntry (Video)
  const trackNumber = element(new Uint8Array([0xd7]), writeUint(1, 1));
  const trackUID = element(new Uint8Array([0x73, 0xc5]), writeUint(1, 4));
  const trackType = element(new Uint8Array([0x83]), writeUint(1, 1)); // video
  const codecID = element(new Uint8Array([0x86]), new TextEncoder().encode("V_VP8"));
  const pixelWidth = element(new Uint8Array([0xb0]), writeUint(width, 2));
  const pixelHeight = element(new Uint8Array([0xba]), writeUint(height, 2));
  const videoSettings = element(new Uint8Array([0xe0]), concat(pixelWidth, pixelHeight));
  const trackEntry = element(
    new Uint8Array([0xae]),
    concat(trackNumber, trackUID, trackType, codecID, videoSettings),
  );
  const tracks = element(new Uint8Array([0x16, 0x54, 0xae, 0x6b]), trackEntry);

  // Segment > Cluster
  const clusterTimestamp = element(new Uint8Array([0xe7]), writeUint(0, 2));
  const simpleBlocks: Uint8Array[] = [clusterTimestamp];

  for (const chunk of chunks) {
    const timestampMs = Math.round(chunk.timestamp / 1000);
    const flags = chunk.type === "key" ? 0x80 : 0x00;

    // SimpleBlock: track number (1 byte EBML vint) + int16 timestamp + flags + data
    const blockData = new Uint8Array(4 + chunk.data.length);
    blockData[0] = 0x81; // track 1 as EBML vint
    blockData[1] = (timestampMs >> 8) & 0xff;
    blockData[2] = timestampMs & 0xff;
    blockData[3] = flags;
    blockData.set(chunk.data, 4);

    simpleBlocks.push(element(new Uint8Array([0xa3]), blockData));
  }

  const cluster = element(new Uint8Array([0x1f, 0x43, 0xb6, 0x75]), concat(...simpleBlocks));

  // Segment (unknown size)
  const segmentId = new Uint8Array([0x18, 0x53, 0x80, 0x67]);
  const segmentContent = concat(info, tracks, cluster);
  const segment = element(segmentId, segmentContent);

  parts.push(ebmlHeader, segment);
  return concat(...parts);
}

describe("transition videos", () => {
  let tester: SnapshotTester;

  beforeAll(async () => {
    tester = await SnapshotTester.create(WIDTH, HEIGHT);

    // Create temporary solid-color background textures for scene rendering
    tester.addSolidTexture("blue-bg", WIDTH, HEIGHT, BLUE);
    tester.addSolidTexture("purple-bg", WIDTH, HEIGHT, PURPLE);

    // Pre-render scenes (background + text baked into one image)
    const sceneAData = await renderSceneTexture(tester, "blue-bg", "A");
    const sceneBData = await renderSceneTexture(tester, "purple-bg", "B");

    // Upload the baked scenes as textures for transition rendering
    tester.addRawTexture("scene-a", WIDTH, HEIGHT, new Uint8Array(sceneAData.data.buffer));
    tester.addRawTexture("scene-b", WIDTH, HEIGHT, new Uint8Array(sceneBData.data.buffer));

    // Clean up temporary textures
    tester.clearTexture("blue-bg");
    tester.clearTexture("purple-bg");
  });

  afterAll(() => {
    tester.dispose();
  });

  // oxlint-disable-next-line jest/expect-expect
  it.each(ALL_TRANSITIONS)(
    `generates video and snapshots for %s transition`,
    async (transitionType) => {
      // Render all frames
      const frames: ImageData[] = [];
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const renderFrame = buildTransitionFrame(i, transitionType);
        const imageData = await tester.render(renderFrame);
        frames.push(imageData);
      }

      // Snapshot the midpoint frame (frame 30 = exactly 50% transition progress)
      const midpointFrame = buildTransitionFrame(30, transitionType);
      await tester.render(midpointFrame);
      await tester.captureScreenshot(`__screenshots__/transitions/${transitionType}-midpoint.png`);

      // Also snapshot at 25% and 75% for more coverage
      const quarterFrame = buildTransitionFrame(
        TRANSITION_START + Math.floor(TRANSITION_DURATION * 0.25),
        transitionType,
      );
      await tester.render(quarterFrame);
      await tester.captureScreenshot(`__screenshots__/transitions/${transitionType}-25pct.png`);

      const threeQuarterFrame = buildTransitionFrame(
        TRANSITION_START + Math.floor(TRANSITION_DURATION * 0.75),
        transitionType,
      );
      await tester.render(threeQuarterFrame);
      await tester.captureScreenshot(`__screenshots__/transitions/${transitionType}-75pct.png`);

      // Write to app public directory
      if (import.meta.env.VITEST_BROWSER) {
        // Encode to WebM
        const webmData = await encodeWebM(frames, WIDTH, HEIGHT, FPS);

        // Write WebM file using vitest's file writing
        const blob = new Blob([new Uint8Array(webmData)], { type: "video/webm" });
        const url = URL.createObjectURL(blob);

        // Verify the WebM is valid by checking it can be loaded as a video
        const video = document.createElement("video");
        video.muted = true;
        video.src = url;

        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error(`Failed to load WebM for ${transitionType}`));
          // Timeout after 5 seconds
          setTimeout(() => reject(new Error(`Timeout loading WebM for ${transitionType}`)), 5000);
        });

        URL.revokeObjectURL(url);

        // Save WebM to disk via vitest commands
        // Convert in chunks to avoid call stack overflow with large arrays
        const chunkSize = 8192;
        let binaryStr = "";
        for (let i = 0; i < webmData.length; i += chunkSize) {
          binaryStr += String.fromCharCode(
            ...webmData.subarray(i, Math.min(i + chunkSize, webmData.length)),
          );
        }

        await commands.writeFile(
          `../../apps/ui/public/transitions/${transitionType}.webm`,
          binaryStr,
          "binary",
        );
      }
    },
    30_000,
  );
});
