import { describe, it, expect, vi, afterEach } from "vitest";

import { downloadBlob } from "./buffered-export-sink";

describe("downloadBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, clicks a download anchor, and revokes the URL", () => {
    const createObjectURL = vi.fn<() => string>(() => "blob:mock-url");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi.fn<() => void>();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    downloadBlob(new Blob(["hello"]), "export.mp4");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});
