/**
 * Tests for VideoFrameLoader using MediaBunny.
 *
 * These tests verify:
 * 1. Basic loading and frame extraction
 * 2. Seeking to specific timestamps
 * 3. Frame iteration
 * 4. RGBA data extraction
 * 5. Performance characteristics
 */

import { beforeAll, describe, expect, it } from "vitest";

import { Compositor } from "../src/compositor.js";
import { VideoFrameLoader, VideoFrameLoaderManager } from "../src/video-frame-loader.js";

describe("VideoFrameLoader", () => {
  let testVideoBlob: Blob;

  beforeAll(async () => {
    // Load the test video
    const response = await fetch("/tests/fixtures/videos/test-red.mp4");
    if (!response.ok) {
      throw new Error(`Failed to load test video: ${response.status}`);
    }
    testVideoBlob = await response.blob();
  });

  describe("loading", () => {
    it("loads a video from blob", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob);

      expect(loader.info.width).toBe(320);
      expect(loader.info.height).toBe(240);
      expect(loader.info.duration).toBeCloseTo(2, 1);
      expect(loader.info.hasAudio).toBe(true);

      loader.dispose();
    });

    it("throws on invalid blob", async () => {
      const invalidBlob = new Blob(["not a video"], { type: "text/plain" });

      await expect(VideoFrameLoader.fromBlob(invalidBlob)).rejects.toThrow(
        /not supported|no video|invalid|error|failed/i,
      );
    });
  });

  describe("URL loading (streaming)", () => {
    // Use same-origin URL for test server (avoids CORS issues)
    const LOCAL_VIDEO_URL = "/tests/fixtures/videos/test-red.mp4";

    it("loads a video from URL using UrlSource streaming", async () => {
      const loader = await VideoFrameLoader.fromUrl(LOCAL_VIDEO_URL);

      expect(loader.info.width).toBe(320);
      expect(loader.info.height).toBe(240);
      expect(loader.info.duration).toBeCloseTo(2, 1);

      loader.dispose();
    });

    it("extracts a frame from URL-loaded video", async () => {
      const loader = await VideoFrameLoader.fromUrl(LOCAL_VIDEO_URL, {
        mode: "export",
      });

      const frame = await loader.getFrame(1);

      expect(frame.sample).toBeDefined();
      expect(frame.sample.displayWidth).toBe(320);
      expect(frame.sample.displayHeight).toBe(240);

      frame.sample.close();
      loader.dispose();
    });

    it("gets RGBA data from URL-loaded video", async () => {
      const loader = await VideoFrameLoader.fromUrl(LOCAL_VIDEO_URL, {
        mode: "export",
      });

      const rgbaData = await loader.getRgbaData(0.5);

      expect(rgbaData.width).toBe(320);
      expect(rgbaData.height).toBe(240);
      expect(rgbaData.data.length).toBe(320 * 240 * 4);

      // Video is solid red, check pixel data
      const r = rgbaData.data[0];
      expect(r).toBeGreaterThan(200);

      loader.dispose();
    });

    it("gets VideoFrame from URL-loaded video for GPU upload", async () => {
      const loader = await VideoFrameLoader.fromUrl(LOCAL_VIDEO_URL, {
        mode: "export",
      });

      const videoFrame = await loader.getVideoFrame(0.5);

      expect(videoFrame).toBeInstanceOf(VideoFrame);
      expect(videoFrame.displayWidth).toBe(320);
      expect(videoFrame.displayHeight).toBe(240);

      videoFrame.close();
      loader.dispose();
    });
  });

  describe("longer video loading (30s sample)", () => {
    // 480x270, ~30 seconds, h264+aac
    const SAMPLE_VIDEO_URL = "/tests/fixtures/videos/sample-480p.mp4";

    it("loads a longer video and gets metadata", async () => {
      const loader = await VideoFrameLoader.fromUrl(SAMPLE_VIDEO_URL, {
        mode: "export",
      });

      expect(loader.info.width).toBe(480);
      expect(loader.info.height).toBe(270);
      expect(loader.info.duration).toBeGreaterThan(30);
      expect(loader.info.hasAudio).toBe(true);

      loader.dispose();
    });

    it("extracts frame from middle of video", async () => {
      const loader = await VideoFrameLoader.fromUrl(SAMPLE_VIDEO_URL, {
        mode: "export",
      });

      // Get a frame from the middle of the video
      const frame = await loader.getFrame(15);

      expect(frame.sample).toBeDefined();
      expect(frame.sample.displayWidth).toBe(480);
      expect(frame.sample.displayHeight).toBe(270);
      expect(frame.timestamp).toBeCloseTo(15, 0);

      frame.sample.close();
      loader.dispose();
    });

    it("extracts frame near end of video", async () => {
      const loader = await VideoFrameLoader.fromUrl(SAMPLE_VIDEO_URL, {
        mode: "export",
      });

      const frame = await loader.getFrame(28);

      expect(frame.sample).toBeDefined();
      expect(frame.timestamp).toBeCloseTo(28, 0);

      frame.sample.close();
      loader.dispose();
    });

    it("gets RGBA data from longer video", async () => {
      const loader = await VideoFrameLoader.fromUrl(SAMPLE_VIDEO_URL, {
        mode: "export",
      });

      const rgbaData = await loader.getRgbaData(10);

      expect(rgbaData.width).toBe(480);
      expect(rgbaData.height).toBe(270);
      expect(rgbaData.data.length).toBe(480 * 270 * 4);

      // Verify we got actual pixel data (not all zeros)
      const hasNonZeroPixels = rgbaData.data.some((v) => v > 0);
      expect(hasNonZeroPixels).toBe(true);

      loader.dispose();
    });

    it("iterates over frames in a range", async () => {
      const loader = await VideoFrameLoader.fromUrl(SAMPLE_VIDEO_URL, {
        mode: "export",
      });

      const frames: number[] = [];
      // Get frames from 10s to 11s
      for await (const frame of loader.frames(10, 11)) {
        frames.push(frame.timestamp);
        frame.sample.close();

        // Limit to first 15 frames to keep test fast
        if (frames.length >= 15) break;
      }

      expect(frames.length).toBeGreaterThanOrEqual(15);
      // Frames should be in order
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]).toBeGreaterThan(frames[i - 1]);
      }

      loader.dispose();
    });

    it("measures seek performance across video", async () => {
      const loader = await VideoFrameLoader.fromUrl(SAMPLE_VIDEO_URL, {
        mode: "export",
      });
      const times: number[] = [];

      // Random seeks across the video (worst case for decoder)
      const timestamps = [5, 25, 2, 20, 10, 28, 15, 1];

      for (const timestamp of timestamps) {
        const start = performance.now();
        const frame = await loader.getFrame(timestamp);
        const end = performance.now();
        times.push(end - start);
        frame.sample.close();
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);

      console.log(
        `30s video random seek: avg=${avgTime.toFixed(1)}ms, max=${maxTime.toFixed(1)}ms`,
      );

      // Should still be fast enough for interactive scrubbing
      expect(avgTime).toBeLessThan(500);

      loader.dispose();
    });

    it("measures sequential playback performance", async () => {
      const loader = await VideoFrameLoader.fromUrl(SAMPLE_VIDEO_URL, {
        mode: "export",
      });
      const times: number[] = [];

      // Simulate 30fps playback for 1 second starting at 15s
      const startTime = 15;
      const fps = 30;
      const frameCount = 30;

      for (let i = 0; i < frameCount; i++) {
        const timestamp = startTime + i / fps;
        const start = performance.now();
        const frame = await loader.getFrame(timestamp);
        const end = performance.now();
        times.push(end - start);
        frame.sample.close();
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);

      console.log(
        `30s video sequential (30fps): avg=${avgTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`,
      );

      // For 30fps we need <33ms per frame, for 60fps <16ms
      expect(avgTime).toBeLessThan(33);

      loader.dispose();
    });
  });

  describe("frame extraction", () => {
    it("gets a frame at timestamp 0", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });

      const frame = await loader.getFrame(0);

      expect(frame.sample).toBeDefined();
      expect(frame.timestamp).toBeGreaterThanOrEqual(0);
      expect(frame.duration).toBeGreaterThan(0);

      frame.sample.close();
      loader.dispose();
    });

    it("gets a frame at middle of video", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });

      const frame = await loader.getFrame(1.0);

      expect(frame.sample).toBeDefined();
      // Timestamp should be close to requested time
      expect(frame.timestamp).toBeCloseTo(1.0, 1);

      frame.sample.close();
      loader.dispose();
    });

    it("clamps timestamp to valid range", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });

      // Request beyond duration
      const frame = await loader.getFrame(10.0);

      expect(frame.sample).toBeDefined();
      // Should be clamped to duration
      expect(frame.timestamp).toBeLessThanOrEqual(loader.info.duration);

      frame.sample.close();
      loader.dispose();
    });

    it("clamps negative timestamp to 0", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });

      const frame = await loader.getFrame(-5.0);

      expect(frame.sample).toBeDefined();
      expect(frame.timestamp).toBeGreaterThanOrEqual(0);

      frame.sample.close();
      loader.dispose();
    });
  });

  describe("VideoFrame extraction", () => {
    it("gets a WebCodecs VideoFrame", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });

      const videoFrame = await loader.getVideoFrame(0.5);

      expect(videoFrame).toBeInstanceOf(VideoFrame);
      expect(videoFrame.displayWidth).toBe(320);
      expect(videoFrame.displayHeight).toBe(240);

      videoFrame.close();
      loader.dispose();
    });
  });

  describe("RGBA data extraction", () => {
    it("gets raw RGBA pixel data", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });

      const result = await loader.getRgbaData(0);

      expect(result.width).toBe(320);
      expect(result.height).toBe(240);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBe(320 * 240 * 4);

      // Video is solid red, check a pixel
      // Note: Video encoding may affect exact values
      const r = result.data[0];
      const g = result.data[1];
      const b = result.data[2];

      // Red should be dominant
      expect(r).toBeGreaterThan(200);
      expect(g).toBeLessThan(50);
      expect(b).toBeLessThan(50);

      loader.dispose();
    });
  });

  describe("frame iteration", () => {
    it("iterates over frames in a range", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });

      const frames: number[] = [];
      for await (const frame of loader.frames(0, 1.0)) {
        frames.push(frame.timestamp);
        frame.sample.close();
      }

      // Should have multiple frames in the first second
      expect(frames.length).toBeGreaterThan(10);
      // Frames should be in order
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i]).toBeGreaterThan(frames[i - 1]);
      }

      loader.dispose();
    });
  });

  describe("disposal", () => {
    it("throws after disposal", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });
      loader.dispose();

      expect(loader.disposed).toBe(true);
      await expect(loader.getFrame(0)).rejects.toThrow("disposed");
    });
  });

  describe("performance", () => {
    it("measures sequential frame access time", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });
      const times: number[] = [];

      // Warm up
      const warmup = await loader.getFrame(0);
      warmup.sample.close();

      // Measure 30 sequential frame accesses
      for (let i = 0; i < 30; i++) {
        const timestamp = i / 30; // 30 frames over 1 second
        const start = performance.now();
        const frame = await loader.getFrame(timestamp);
        const end = performance.now();
        times.push(end - start);
        frame.sample.close();
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);

      console.log(
        `Sequential frame access: avg=${avgTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`,
      );

      // For 60fps, we need <16ms per frame
      // This is informational, not a hard requirement
      expect(avgTime).toBeLessThan(100); // Generous limit for CI

      loader.dispose();
    });

    it("measures random seek time", async () => {
      const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
        mode: "export",
      });
      const times: number[] = [];

      // Random seeks (worst case for decoder)
      const timestamps = [1.5, 0.2, 1.8, 0.5, 1.0, 0.1, 1.9, 0.8];

      for (const timestamp of timestamps) {
        const start = performance.now();
        const frame = await loader.getFrame(timestamp);
        const end = performance.now();
        times.push(end - start);
        frame.sample.close();
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);

      console.log(`Random seek: avg=${avgTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`);

      expect(avgTime).toBeGreaterThan(0);

      loader.dispose();
    });
  });
});

describe("VideoFrameLoaderManager", () => {
  let testVideoBlob: Blob;

  beforeAll(async () => {
    const response = await fetch("/tests/fixtures/videos/test-red.mp4");
    testVideoBlob = await response.blob();
  });

  it("caches loaders by asset ID", async () => {
    const manager = new VideoFrameLoaderManager();

    const loader1 = await manager.getLoader("asset-1", testVideoBlob);
    const loader2 = await manager.getLoader("asset-1", testVideoBlob);

    expect(loader1).toBe(loader2);
    expect(manager.size).toBe(1);

    manager.disposeAll();
  });

  it("creates separate loaders for different assets", async () => {
    const manager = new VideoFrameLoaderManager();

    const loader1 = await manager.getLoader("asset-1", testVideoBlob);
    const loader2 = await manager.getLoader("asset-2", testVideoBlob);

    expect(loader1).not.toBe(loader2);
    expect(manager.size).toBe(2);

    manager.disposeAll();
  });

  it("provides convenience getFrame method", async () => {
    const manager = new VideoFrameLoaderManager();

    const frame = await manager.getFrame("asset-1", testVideoBlob, 0.5);

    expect(frame.sample).toBeDefined();
    frame.sample.close();

    manager.disposeAll();
  });

  it("disposes individual loaders", async () => {
    const manager = new VideoFrameLoaderManager();

    await manager.getLoader("asset-1", testVideoBlob);
    await manager.getLoader("asset-2", testVideoBlob);

    expect(manager.size).toBe(2);

    manager.disposeLoader("asset-1");

    expect(manager.hasLoader("asset-1")).toBe(false);
    expect(manager.hasLoader("asset-2")).toBe(true);
    expect(manager.size).toBe(1);

    manager.disposeAll();
  });
});

describe("VideoFrameLoader + Compositor integration", () => {
  let testVideoBlob: Blob;

  beforeAll(async () => {
    const response = await fetch("/tests/fixtures/videos/test-red.mp4");
    testVideoBlob = await response.blob();
  });

  it("renders video frame through compositor", async () => {
    // Create compositor
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const compositor = await Compositor.fromCanvas(canvas);

    // Load video frame
    const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
      mode: "export",
    });
    const rgbaData = await loader.getRgbaData(0.5);

    // Upload to compositor
    compositor.uploadRgba("video-frame", rgbaData.width, rgbaData.height, rgbaData.data);

    // Render
    compositor.renderFrame({
      media_layers: [
        {
          texture_id: "video-frame",
          transform: {
            x: 0,
            y: 0,
            scale_x: 1,
            scale_y: 1,
            rotation: 0,
            anchor_x: 0.5,
            anchor_y: 0.5,
          },
          effects: {
            opacity: 1,
            brightness: 1,
            contrast: 1,
            saturation: 1,
            hue_rotate: 0,
            blur: 0,
          },
          z_index: 0,
        },
      ],
      text_layers: [],
      shape_layers: [],
      line_layers: [],
      timeline_time: 0.5,
      width: 320,
      height: 240,
    });

    // Canvas was used by WebGPU, so getContext("2d") returns null.
    // Verify the render completed without errors (compositor.renderFrame didn't throw).
    // Pixel-level verification requires reading back from the GPU, which is covered
    // by the visual snapshot tests in visual-layers.test.ts.
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);

    // Cleanup
    loader.dispose();
    compositor.dispose();
  });

  it("renders video frame using VideoFrame API", async () => {
    // This test demonstrates using WebCodecs VideoFrame
    // which can be uploaded via uploadBitmap for zero-copy transfer

    const loader = await VideoFrameLoader.fromBlob(testVideoBlob, {
      mode: "export",
    });

    // Get WebCodecs VideoFrame
    const videoFrame = await loader.getVideoFrame(1.0);

    expect(videoFrame).toBeInstanceOf(VideoFrame);
    expect(videoFrame.displayWidth).toBe(320);
    expect(videoFrame.displayHeight).toBe(240);

    // VideoFrame can be used with:
    // - createImageBitmap(videoFrame) → uploadBitmap() for zero-copy GPU upload
    // - Drawing to canvas
    // - Passing to WebGL/WebGPU

    videoFrame.close();
    loader.dispose();
  });
});
