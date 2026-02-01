/**
 * Vitest setup for render engine tests.
 */

import {
  setupRenderEngineMatchers,
  configureRenderTests,
  FileSnapshotStorage,
} from "../src/testing/vitest-integration.js";

// Set up custom matchers
setupRenderEngineMatchers();

// Check for update snapshots flag (browser-compatible)
const updateSnapshots =
  typeof import.meta.env !== "undefined" && import.meta.env.UPDATE_SNAPSHOTS === "true";

// Configure snapshot storage
configureRenderTests({
  storage: new FileSnapshotStorage("./tests/__snapshots__", "/__snapshots__"),
  updateSnapshots,
});

/**
 * Global flag indicating whether pixel readback from WebGPU canvas works.
 * In headless Chrome with SwiftShader, canvas readback returns black pixels.
 *
 * Tests should use this to skip pixel-level assertions in CI environments
 * while still verifying that rendering completes without errors.
 */
export let canReadPixels = true;

/**
 * Set the pixel readback capability flag.
 * Called by tests after checking with SnapshotTester.canReadPixels().
 */
export function setCanReadPixels(value: boolean): void {
  canReadPixels = value;
  if (!value) {
    console.warn(
      "[render-engine tests] WebGPU canvas pixel readback not available. " +
        "Pixel-level assertions will be skipped. This is expected in headless CI environments.",
    );
  }
}
