import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Snapshot directory
    snapshotDir: "./tests/__snapshots__",
    // Include test files
    include: ["tests/**/*.test.ts"],
    // Exclude browser tests when running in node (require WebGPU)
    exclude: ["tests/compositor.test.ts", "tests/visual-layers.test.ts"],
  },
});
