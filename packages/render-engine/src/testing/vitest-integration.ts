/**
 * Vitest integration for snapshot testing.
 *
 * Provides custom matchers and utilities for testing render engine output.
 *
 * @example
 * ```typescript
 * // vitest.setup.ts
 * import { setupRenderEngineMatchers } from "@tooscut/render-engine/testing";
 * setupRenderEngineMatchers();
 *
 * // test.spec.ts
 * import { SnapshotTester, layer, frame } from "@tooscut/render-engine/testing";
 *
 * describe("compositor", () => {
 *   let tester: SnapshotTester;
 *
 *   beforeAll(async () => {
 *     tester = await SnapshotTester.create(256, 256);
 *   });
 *
 *   afterAll(() => {
 *     tester.dispose();
 *   });
 *
 *   it("renders a red square", async () => {
 *     tester.addSolidTexture("red", 100, 100, [255, 0, 0, 255]);
 *
 *     const testFrame = frame(256, 256, [
 *       layer("red").position(78, 78).build(),
 *     ]);
 *
 *     await expect(tester).toMatchRenderSnapshot(testFrame, "red-square");
 *   });
 * });
 * ```
 */

import type { RenderFrame } from "../types.js";
import type { SnapshotTester, SnapshotOptions } from "./snapshot-tester.js";

// ============================================================================
// Vitest Matcher Types
// ============================================================================

interface RenderSnapshotMatcherResult {
  pass: boolean;
  message: () => string;
  actual?: string;
  expected?: string;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toMatchRenderSnapshot(
      frame: RenderFrame,
      snapshotName: string,
      options?: SnapshotOptions,
    ): Promise<void>;
    toMatchImageData(
      frame: RenderFrame,
      expected: ImageData,
      options?: SnapshotOptions,
    ): Promise<void>;
  }

  interface AsymmetricMatchersContaining {
    toMatchRenderSnapshot(
      frame: RenderFrame,
      snapshotName: string,
      options?: SnapshotOptions,
    ): Promise<void>;
    toMatchImageData(
      frame: RenderFrame,
      expected: ImageData,
      options?: SnapshotOptions,
    ): Promise<void>;
  }
}

// ============================================================================
// Snapshot Storage
// ============================================================================

/**
 * Interface for snapshot storage backends.
 */
export interface SnapshotStorage {
  /** Load a snapshot by name */
  load(name: string): Promise<ImageData | null>;
  /** Save a snapshot */
  save(name: string, imageData: ImageData): Promise<void>;
  /** Check if a snapshot exists */
  exists(name: string): Promise<boolean>;
  /** Get the path/URL to a snapshot */
  getPath(name: string): string;
}

/**
 * In-memory snapshot storage for testing.
 */
export class InMemorySnapshotStorage implements SnapshotStorage {
  private snapshots = new Map<string, ImageData>();

  async load(name: string): Promise<ImageData | null> {
    return this.snapshots.get(name) ?? null;
  }

  async save(name: string, imageData: ImageData): Promise<void> {
    this.snapshots.set(name, imageData);
  }

  async exists(name: string): Promise<boolean> {
    return this.snapshots.has(name);
  }

  getPath(name: string): string {
    return `memory://${name}`;
  }

  clear(): void {
    this.snapshots.clear();
  }
}

/**
 * File-based snapshot storage using fetch API.
 * Snapshots are stored in a directory relative to the test file.
 */
export class FileSnapshotStorage implements SnapshotStorage {
  private baseUrl: string;
  private basePath: string;

  constructor(basePath: string, baseUrl: string = "/snapshots") {
    this.basePath = basePath;
    this.baseUrl = baseUrl;
  }

  async load(name: string): Promise<ImageData | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${name}.png`);
      if (!response.ok) return null;

      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return null;
    }
  }

  async save(name: string, imageData: ImageData): Promise<void> {
    // In browser environment, we can't directly write to filesystem
    // Instead, we log instructions for the user or use a test server endpoint
    const dataUrl = this.imageDataToDataUrl(imageData);
    console.log(`[Snapshot] Save "${name}.png" to ${this.basePath}/`);
    console.log(`[Snapshot] Data URL: ${dataUrl.substring(0, 100)}...`);

    // If running in a test environment with a save endpoint:
    try {
      await fetch(`${this.baseUrl}/__save__`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dataUrl }),
      });
    } catch {
      // Save endpoint not available, that's okay
    }
  }

  async exists(name: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/${name}.png`, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }

  getPath(name: string): string {
    return `${this.basePath}/${name}.png`;
  }

  private imageDataToDataUrl(imageData: ImageData): string {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create 2D context");
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }
}

// ============================================================================
// Test Context
// ============================================================================

/**
 * Global test context for render engine tests.
 */
export interface RenderTestContext {
  storage: SnapshotStorage;
  updateSnapshots: boolean;
}

let globalContext: RenderTestContext = {
  storage: new InMemorySnapshotStorage(),
  updateSnapshots: false,
};

/**
 * Configure the global test context.
 */
export function configureRenderTests(config: Partial<RenderTestContext>): void {
  globalContext = { ...globalContext, ...config };
}

/**
 * Get the current test context.
 */
export function getRenderTestContext(): RenderTestContext {
  return globalContext;
}

// ============================================================================
// Vitest Matchers
// ============================================================================

/**
 * Set up custom Vitest matchers for render engine testing.
 */
export function setupRenderEngineMatchers(): void {
  // Dynamic import to avoid bundling vitest in production
  void import("vitest").then(({ expect }) => {
    expect.extend({
      async toMatchRenderSnapshot(
        received: SnapshotTester,
        frame: RenderFrame,
        snapshotName: string,
        options: SnapshotOptions = {},
      ): Promise<RenderSnapshotMatcherResult> {
        const ctx = getRenderTestContext();
        const tester = received;

        // Render the frame
        const actual = await tester.render(frame);

        // Try to load the expected snapshot
        const expected = await ctx.storage.load(snapshotName);

        if (!expected) {
          if (ctx.updateSnapshots) {
            // Save the new snapshot
            await ctx.storage.save(snapshotName, actual);
            return {
              pass: true,
              message: () => `Snapshot "${snapshotName}" created`,
            };
          } else {
            return {
              pass: false,
              message: () =>
                `Snapshot "${snapshotName}" not found at ${ctx.storage.getPath(snapshotName)}. ` +
                `Run with --update-snapshots to create it.`,
            };
          }
        }

        // Compare
        const result = tester.compareImages(actual, expected, options);

        if (!result.passed) {
          if (ctx.updateSnapshots) {
            // Update the snapshot
            await ctx.storage.save(snapshotName, actual);
            return {
              pass: true,
              message: () => `Snapshot "${snapshotName}" updated`,
            };
          }

          return {
            pass: false,
            message: () =>
              `Snapshot "${snapshotName}" doesn't match.\n` +
              `  Diff: ${result.diffPercentage.toFixed(2)}% (${result.diffPixelCount}/${result.totalPixels} pixels)\n` +
              `  Threshold: ${options.diffThreshold ?? 0}%`,
            actual: result.actualDataUrl,
            expected: result.expectedDataUrl,
          };
        }

        return {
          pass: true,
          message: () => `Snapshot "${snapshotName}" matches`,
        };
      },

      async toMatchImageData(
        received: SnapshotTester,
        frame: RenderFrame,
        expected: ImageData,
        options: SnapshotOptions = {},
      ): Promise<RenderSnapshotMatcherResult> {
        const tester = received;
        const result = await tester.renderAndCompare(frame, expected, options);

        if (!result.passed) {
          return {
            pass: false,
            message: () =>
              `Rendered image doesn't match expected.\n` +
              `  Diff: ${result.diffPercentage.toFixed(2)}% (${result.diffPixelCount}/${result.totalPixels} pixels)\n` +
              `  Threshold: ${options.diffThreshold ?? 0}%`,
            actual: result.actualDataUrl,
            expected: result.expectedDataUrl,
          };
        }

        return {
          pass: true,
          message: () => `Rendered image matches expected`,
        };
      },
    });
  });
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a test suite for render engine tests.
 *
 * Handles setup/teardown of the SnapshotTester and provides utilities.
 */
export function createRenderTestSuite(config: {
  width?: number;
  height?: number;
  wasmUrl?: string | URL;
}) {
  const { width = 256, height = 256, wasmUrl } = config;
  let tester: SnapshotTester | null = null;

  return {
    async setup(): Promise<SnapshotTester> {
      const { SnapshotTester } = await import("./snapshot-tester.js");
      tester = await SnapshotTester.create(width, height, wasmUrl);
      return tester;
    },

    getTester(): SnapshotTester {
      if (!tester) {
        throw new Error("Test suite not initialized. Call setup() first.");
      }
      return tester;
    },

    teardown(): void {
      if (tester) {
        tester.dispose();
        tester = null;
      }
    },
  };
}

/**
 * Helper to run a render test with automatic setup/teardown.
 */
export async function withRenderTest<T>(
  config: { width?: number; height?: number; wasmUrl?: string | URL },
  fn: (tester: SnapshotTester) => Promise<T>,
): Promise<T> {
  const suite = createRenderTestSuite(config);
  const tester = await suite.setup();
  try {
    return await fn(tester);
  } finally {
    suite.teardown();
  }
}
