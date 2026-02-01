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
      name: "chromium",
      headless: true,
    },
    snapshotDir: "./tests/__snapshots__",
    include: ["tests/compositor.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
