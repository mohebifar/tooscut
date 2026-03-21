/**
 * Debug test to check WebGPU capabilities in the browser environment.
 */

import { describe, it, expect } from "vitest";
import { Compositor } from "../src/compositor.js";

describe("WebGPU Debug", () => {
  it("reports WebGPU adapter info", async () => {
    const adapter = await navigator.gpu?.requestAdapter();

    if (!adapter) {
      console.log("WebGPU adapter not available");
      expect(adapter).toBeTruthy();
      return;
    }

    // requestAdapterInfo might not be available in all browsers
    if (typeof adapter.requestAdapterInfo === "function") {
      const info = await adapter.requestAdapterInfo();
      console.log("=== WebGPU Adapter Info ===");
      console.log("Vendor:", info.vendor);
      console.log("Architecture:", info.architecture);
      console.log("Device:", info.device);
      console.log("Description:", info.description);
    } else {
      console.log("requestAdapterInfo not available, using info property");
      const info = adapter.info;
      if (info) {
        console.log("Adapter info:", info);
      }
    }

    console.log("\n=== Adapter Features ===");
    const features = Array.from(adapter.features);
    console.log("Features:", features.join(", ") || "(none)");

    console.log("\n=== Adapter Limits ===");
    const limits = adapter.limits;
    console.log("Max texture dimension 2D:", limits.maxTextureDimension2D);
    console.log("Max buffer size:", limits.maxBufferSize);

    expect(adapter).toBeTruthy();
  });

  it("tests compositor rendering with readback", async () => {
    console.log("\n=== Testing Compositor with Surface Rendering ===");

    // Create compositor with a fresh canvas (no pre-existing context)
    const canvas = new OffscreenCanvas(256, 256);
    const compositor = await Compositor.fromOffscreenCanvas(canvas);
    console.log("Compositor created");

    // Test 1: Try rendering a media layer with uploaded texture
    const redData = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < 256 * 256; i++) {
      redData[i * 4] = 255; // R
      redData[i * 4 + 1] = 0; // G
      redData[i * 4 + 2] = 0; // B
      redData[i * 4 + 3] = 255; // A
    }
    compositor.uploadRgba("red", 256, 256, redData);
    console.log("Texture uploaded, count:", compositor.textureCount);

    // Try rendering with both a media layer AND a shape layer
    const renderFrame = {
      media_layers: [
        {
          texture_id: "red",
          transform: {
            x: 0,
            y: 0,
            scale_x: 1,
            scale_y: 1,
            rotation: 0,
            anchor_x: 0,
            anchor_y: 0,
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
      shape_layers: [
        {
          id: "green-rect",
          shape: "Rectangle",
          box: {
            x: 10,
            y: 10,
            width: 80,
            height: 80,
          },
          style: {
            fill: [0, 1, 0, 1], // Green
            stroke_width: 0,
            corner_radius: 0,
          },
          opacity: 1,
          z_index: 1,
        },
      ],
      line_layers: [],
      timeline_time: 0,
      width: 256,
      height: 256,
    };
    console.log("Rendering frame...");

    // Use Surface rendering (renderFrame) + transferToImageBitmap for readback
    // This is the correct approach that matches how raw WebGPU works
    compositor.renderFrame(renderFrame);
    compositor.flush();

    // Give GPU time to complete
    await new Promise((r) => setTimeout(r, 50));

    // Read back via transferToImageBitmap (this works in raw WebGPU)
    const bitmap = canvas.transferToImageBitmap();
    const canvas2d = new OffscreenCanvas(256, 256);
    const ctx2d = canvas2d.getContext("2d")!;
    ctx2d.drawImage(bitmap, 0, 0);
    const imageData = ctx2d.getImageData(0, 0, 256, 256);
    bitmap.close();

    console.log("Frame rendered via Surface, got imageData");

    const centerIdx = (128 * 256 + 128) * 4;
    console.log(
      "Center pixel RGBA:",
      imageData.data[centerIdx],
      imageData.data[centerIdx + 1],
      imageData.data[centerIdx + 2],
      imageData.data[centerIdx + 3],
    );

    // Count non-zero pixels
    let nonZeroCount = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0 || imageData.data[i + 1] > 0 || imageData.data[i + 2] > 0) {
        nonZeroCount++;
      }
    }
    console.log("Non-zero pixels:", nonZeroCount, "of", 256 * 256);

    compositor.dispose();

    // Verify we got non-zero output via Surface rendering
    expect(nonZeroCount).toBeGreaterThan(0);
  });

  it("checks canvas readback methods", async () => {
    // Create an OffscreenCanvas
    const canvas = new OffscreenCanvas(256, 256);

    // Try to get WebGPU context
    const ctx = canvas.getContext("webgpu");
    console.log("WebGPU context available:", !!ctx);

    if (!ctx) {
      console.log("Cannot get WebGPU context from OffscreenCanvas");
      return;
    }

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return;

    const device = await adapter.requestDevice();

    // Configure the context
    const format = navigator.gpu.getPreferredCanvasFormat();
    console.log("Preferred canvas format:", format);

    ctx.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });

    // Create a simple render - just clear to red
    const encoder = device.createCommandEncoder();
    const texture = ctx.getCurrentTexture();
    const view = texture.createView();

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 1, g: 0, b: 0, a: 1 }, // Red
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    renderPass.end();

    device.queue.submit([encoder.finish()]);

    // Wait for GPU
    await device.queue.onSubmittedWorkDone();

    // Try different readback methods
    console.log("\n=== Testing Readback Methods ===");

    // Method 1: transferToImageBitmap
    try {
      const bitmap = canvas.transferToImageBitmap();
      console.log("transferToImageBitmap: SUCCESS, size:", bitmap.width, "x", bitmap.height);

      // Draw to 2D canvas and read
      const canvas2d = new OffscreenCanvas(256, 256);
      const ctx2d = canvas2d.getContext("2d")!;
      ctx2d.drawImage(bitmap, 0, 0);
      const imageData = ctx2d.getImageData(0, 0, 256, 256);

      // Check center pixel
      const centerIdx = (128 * 256 + 128) * 4;
      console.log(
        "Center pixel RGBA:",
        imageData.data[centerIdx],
        imageData.data[centerIdx + 1],
        imageData.data[centerIdx + 2],
        imageData.data[centerIdx + 3],
      );

      // Check if any non-zero pixels
      let nonZeroCount = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i] > 0 || imageData.data[i + 1] > 0 || imageData.data[i + 2] > 0) {
          nonZeroCount++;
        }
      }
      console.log("Non-zero pixels:", nonZeroCount, "of", 256 * 256);

      bitmap.close();
    } catch (e) {
      console.log("transferToImageBitmap: FAILED -", e);
    }

    // Method 2: GPU buffer readback
    try {
      // Need to render again since we transferred the bitmap
      ctx.configure({
        device,
        format,
        alphaMode: "premultiplied",
      });

      const encoder2 = device.createCommandEncoder();
      const texture2 = ctx.getCurrentTexture();
      const view2 = texture2.createView();

      const renderPass2 = encoder2.beginRenderPass({
        colorAttachments: [
          {
            view: view2,
            clearValue: { r: 0, g: 1, b: 0, a: 1 }, // Green this time
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      renderPass2.end();

      // Create a buffer to copy to
      const bytesPerRow = Math.ceil((256 * 4) / 256) * 256; // Align to 256
      const buffer = device.createBuffer({
        size: bytesPerRow * 256,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      encoder2.copyTextureToBuffer(
        { texture: texture2 },
        { buffer, bytesPerRow },
        { width: 256, height: 256 },
      );

      device.queue.submit([encoder2.finish()]);

      // Map and read
      await buffer.mapAsync(GPUMapMode.READ);
      const data = new Uint8Array(buffer.getMappedRange());

      console.log("GPU buffer readback: SUCCESS");
      console.log("First 16 bytes:", Array.from(data.slice(0, 16)));

      // Check if green
      const hasGreen = data[1] > 200; // G channel
      console.log("Has green color:", hasGreen);

      buffer.unmap();
      buffer.destroy();
    } catch (e) {
      console.log("GPU buffer readback: FAILED -", e);
    }

    device.destroy();
  });

  it("tests minimal clear", async () => {
    console.log("\n=== Testing Minimal Clear (using renderToPixels) ===");

    const canvas = new OffscreenCanvas(256, 256);
    const compositor = await Compositor.fromOffscreenCanvas(canvas);
    console.log("Compositor created");

    // Render empty frame (just clear) using renderToPixels for reliable readback
    const emptyFrame = {
      media_layers: [],
      text_layers: [],
      shape_layers: [],
      line_layers: [],
      timeline_time: 0,
      width: 256,
      height: 256,
    };

    const pixels = await compositor.renderToPixels(emptyFrame);
    console.log("Got", pixels.length, "bytes of pixel data");

    // Clear color is transparent black (0, 0, 0, 0) in the render_to_pixels implementation
    const centerIdx = (128 * 256 + 128) * 4;
    console.log(
      "Minimal clear - Center pixel RGBA:",
      pixels[centerIdx],
      pixels[centerIdx + 1],
      pixels[centerIdx + 2],
      pixels[centerIdx + 3],
    );

    compositor.dispose();

    // Empty frame should render transparent pixels
    // This verifies the render_to_pixels function works correctly
    expect(pixels[centerIdx + 3]).toBe(0); // Alpha channel should be 0 (transparent)
  });

  it("tests shape only rendering", async () => {
    console.log("\n=== Testing Shape Only (using renderToPixels) ===");

    const canvas = new OffscreenCanvas(256, 256);
    const compositor = await Compositor.fromOffscreenCanvas(canvas);

    // Render just a shape (no media layer)
    const shapeFrame = {
      media_layers: [],
      text_layers: [],
      shape_layers: [
        {
          id: "blue-rect",
          shape: "Rectangle",
          box: {
            x: 25,
            y: 25,
            width: 50,
            height: 50,
          },
          style: {
            fill: [0, 0, 1, 1], // Blue
            stroke_width: 0,
            corner_radius: 0,
          },
          opacity: 1,
          z_index: 0,
        },
      ],
      line_layers: [],
      timeline_time: 0,
      width: 256,
      height: 256,
    };

    const pixels = await compositor.renderToPixels(shapeFrame);
    console.log("Got", pixels.length, "bytes of pixel data");

    // Shape is at 25-75% of canvas, check center of shape (50% position)
    const shapeX = Math.floor(((25 + 50 / 2) * 256) / 100);
    const shapeY = Math.floor(((25 + 50 / 2) * 256) / 100);
    const shapeIdx = (shapeY * 256 + shapeX) * 4;

    console.log("Shape position:", shapeX, shapeY);
    console.log(
      "Shape center pixel RGBA:",
      pixels[shapeIdx],
      pixels[shapeIdx + 1],
      pixels[shapeIdx + 2],
      pixels[shapeIdx + 3],
    );

    // Outside shape should be cyan (clear color)
    const outsideIdx = (10 * 256 + 10) * 4;
    console.log(
      "Outside shape RGBA:",
      pixels[outsideIdx],
      pixels[outsideIdx + 1],
      pixels[outsideIdx + 2],
      pixels[outsideIdx + 3],
    );

    compositor.dispose();

    // We should see blue in the shape area
    expect(pixels[shapeIdx + 2]).toBeGreaterThan(0); // Blue channel
  });

  it("checks browser/environment info", () => {
    console.log("\n=== Environment Info ===");
    console.log("User Agent:", navigator.userAgent);
    console.log("Platform:", navigator.platform);
    console.log("Hardware Concurrency:", navigator.hardwareConcurrency);

    // Check for headless indicators
    const isHeadless = /HeadlessChrome/.test(navigator.userAgent);
    console.log("Headless Chrome detected:", isHeadless);

    // Check WebGL info for comparison
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext("webgl2");
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        console.log("WebGL Vendor:", gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
        console.log("WebGL Renderer:", gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
      }
    }

    expect(true).toBe(true);
  });
});
