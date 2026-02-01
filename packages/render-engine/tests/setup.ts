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

// Configure snapshot storage
configureRenderTests({
  storage: new FileSnapshotStorage("./tests/__snapshots__", "/__snapshots__"),
  updateSnapshots: process.env.UPDATE_SNAPSHOTS === "true",
});
