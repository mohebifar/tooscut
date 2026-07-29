// @vitest-environment node
//
// jsdom's Blob polyfill doesn't implement arrayBuffer(), so this file runs
// under Node's environment (whose Blob is spec-complete) instead of the
// project default. downloadBlob's DOM-touching test lives in a separate
// file that keeps the default jsdom environment.
import { describe, it, expect } from "vitest";

import { createBufferedExportSink } from "./buffered-export-sink";

async function write(
  writable: WritableStream<{ type: "write"; data: Uint8Array; position: number }>,
  chunks: Array<{ data: Uint8Array; position: number }>,
) {
  const writer = writable.getWriter();
  for (const chunk of chunks) {
    await writer.write({ type: "write", data: chunk.data, position: chunk.position });
  }
  await writer.close();
}

describe("createBufferedExportSink", () => {
  it("accumulates sequential writes into a single blob", async () => {
    const sink = createBufferedExportSink();
    await write(sink.writable, [
      { data: new Uint8Array([1, 2, 3]), position: 0 },
      { data: new Uint8Array([4, 5]), position: 3 },
    ]);

    const blob = sink.getBlob("application/octet-stream");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
    expect(blob.type).toBe("application/octet-stream");
  });

  it("handles out-of-order writes by position", async () => {
    const sink = createBufferedExportSink();
    await write(sink.writable, [
      { data: new Uint8Array([4, 5]), position: 3 },
      { data: new Uint8Array([1, 2, 3]), position: 0 },
    ]);

    const bytes = new Uint8Array(await sink.getBlob("video/mp4").arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles a write that overwrites part of an earlier one", async () => {
    const sink = createBufferedExportSink();
    await write(sink.writable, [
      { data: new Uint8Array([0, 0, 0, 0, 0]), position: 0 },
      { data: new Uint8Array([9, 9]), position: 1 },
    ]);

    const bytes = new Uint8Array(await sink.getBlob("video/mp4").arrayBuffer());
    expect(Array.from(bytes)).toEqual([0, 9, 9, 0, 0]);
  });

  it("grows its internal buffer to fit writes larger than the initial capacity", async () => {
    const sink = createBufferedExportSink();
    const large = new Uint8Array(2 * 1024 * 1024).fill(7); // 2 MiB, bigger than the 1 MiB initial grow step
    await write(sink.writable, [{ data: large, position: 0 }]);

    const blob = sink.getBlob("video/mp4");
    expect(blob.size).toBe(large.byteLength);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(7);
    expect(bytes[bytes.length - 1]).toBe(7);
  });

  it("size reflects the highest byte written, not just total bytes written", async () => {
    const sink = createBufferedExportSink();
    await write(sink.writable, [{ data: new Uint8Array([1, 2, 3]), position: 100 }]);

    expect(sink.getBlob("video/mp4").size).toBe(103);
  });
});
