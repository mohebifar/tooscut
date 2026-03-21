import type { GPU } from "@webgpu/types";

declare global {
  interface Navigator {
    readonly gpu: GPU;
  }
}
