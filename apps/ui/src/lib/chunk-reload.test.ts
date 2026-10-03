import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { isChunkLoadError, reloadAfterChunkError, takePendingChunkReload } from "./chunk-reload";

const CHUNK_URL = "https://tooscut.app/assets/_projectId-abc.js";

describe("isChunkLoadError", () => {
  it.each([
    `Failed to fetch dynamically imported module: ${CHUNK_URL}`,
    `error loading dynamically imported module: ${CHUNK_URL}`,
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/styles-abc.css",
  ])("matches %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("ignores other errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
  });
});

describe("reloadAfterChunkError", () => {
  const reload = vi.fn<() => void>();

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    vi.stubGlobal("location", { reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reloads and remembers the failed chunk URL once", () => {
    reloadAfterChunkError(
      new TypeError(`Failed to fetch dynamically imported module: ${CHUNK_URL}`),
    );

    expect(reload).toHaveBeenCalledOnce();
    expect(takePendingChunkReload()).toBe(CHUNK_URL);
    expect(takePendingChunkReload()).toBeNull();
  });

  it("reloads without a pending check when the error has no URL", () => {
    reloadAfterChunkError(new TypeError("Importing a module script failed."));

    expect(reload).toHaveBeenCalledOnce();
    expect(takePendingChunkReload()).toBeNull();
  });
});
