import type { GPU } from "@webgpu/types";
import type { RenderFrame } from "./src/types";
import type { SnapshotOptions } from "./src/testing/snapshot-tester";

declare global {
  interface Navigator {
    readonly gpu: GPU;
  }
}

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
