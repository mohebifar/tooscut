/**
 * Browser config for compositor tests (WebGPU required).
 *
 * Run with: pnpm test:browser
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [
        {
          browser: "chromium",
          launch: {
            args: [
              "--enable-unsafe-webgpu",
              "--enable-features=Vulkan,UseSkiaRenderer",
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--use-vulkan=swiftshader",
            ],
          },
          context: {
            // Set viewport large enough for 1920x1080 tests
            viewport: { width: 1920, height: 1080 },
          },
        },
      ],
      headless: true,
    },
    snapshotDir: "./tests/__snapshots__",
    include: [
      "tests/compositor.test.ts",
      "tests/visual-layers.test.ts",
      "tests/complex-compositions.test.ts",
      "tests/webgpu-debug.test.ts",
      "tests/video-frame-loader.test.ts",
      "tests/transition-videos.test.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
  },
});
