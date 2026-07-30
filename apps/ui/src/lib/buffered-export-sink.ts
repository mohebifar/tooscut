/**
 * In-memory fallback export sink for browsers without the File System Access
 * API (Firefox, Safari, mobile). Mirrors the {@link StreamTargetChunk}
 * contract mediabunny writes to, accumulating bytes at their target offset
 * so the resulting Blob can be downloaded once encoding finishes.
 */

import type { StreamTargetChunk } from "mediabunny";

export interface BufferedExportSink {
  writable: WritableStream<StreamTargetChunk>;
  getBlob: (mimeType: string) => Blob;
}

export function createBufferedExportSink(): BufferedExportSink {
  let buffer = new Uint8Array(0);
  let size = 0;

  function ensureCapacity(minCapacity: number) {
    if (buffer.byteLength >= minCapacity) return;
    const nextCapacity = Math.max(minCapacity, buffer.byteLength * 2, 1024 * 1024);
    const next = new Uint8Array(nextCapacity);
    next.set(buffer);
    buffer = next;
  }

  const writable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      const end = chunk.position + chunk.data.byteLength;
      ensureCapacity(end);
      buffer.set(chunk.data, chunk.position);
      size = Math.max(size, end);
    },
  });

  return {
    writable,
    getBlob: (mimeType) => new Blob([buffer.slice(0, size)], { type: mimeType }),
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
