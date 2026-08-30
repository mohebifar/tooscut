import { afterEach, describe, expect, it, vi } from "vitest";

// The render-engine index eagerly pulls in the WASM compositor, which isn't
// built in a plain unit-test run. The picker path only uses secondsToFrames;
// the store's other imports are never called here, so a single stub is enough.
vi.mock("@tooscut/render-engine", () => ({ secondsToFrames: () => 0 }));

import { importFilesWithPicker } from "./use-asset-store";

type PickerFn = (options: Record<string, unknown>) => Promise<FileSystemFileHandle[]>;

function setPicker(fn: PickerFn | undefined) {
  (window as unknown as { showOpenFilePicker?: PickerFn }).showOpenFilePicker = fn;
}

afterEach(() => {
  setPicker(undefined);
});

describe("importFilesWithPicker", () => {
  it("returns [] for a re-entrant call while a picker is already open", async () => {
    let rejectFirst: (err: unknown) => void = () => {};
    const picker = vi.fn(
      () =>
        new Promise<FileSystemFileHandle[]>((_, reject) => {
          rejectFirst = reject;
        }),
    );
    setPicker(picker);

    const first = importFilesWithPicker();
    const second = await importFilesWithPicker();

    expect(second).toEqual([]);
    expect(picker).toHaveBeenCalledTimes(1);

    // Close the still-open first picker so the module flag resets.
    rejectFirst(new DOMException("cancelled", "AbortError"));
    await expect(first).resolves.toEqual([]);
  });

  it("swallows cancel, already-active, and spent-gesture picker errors", async () => {
    for (const name of ["AbortError", "NotAllowedError", "SecurityError"]) {
      setPicker(vi.fn(() => Promise.reject(new DOMException(name, name))));
      await expect(importFilesWithPicker()).resolves.toEqual([]);
    }
  });

  it("rethrows unexpected picker errors", async () => {
    setPicker(vi.fn(() => Promise.reject(new DOMException("boom", "NotFoundError"))));
    await expect(importFilesWithPicker()).rejects.toThrow("boom");
  });
});
