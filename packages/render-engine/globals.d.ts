import type { SnapshotOptions } from "./src/testing/snapshot-tester";
import type { RenderFrame } from "./src/types";

declare module "vitest" {
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
}
