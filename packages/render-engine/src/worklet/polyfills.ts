/**
 * Polyfills for AudioWorklet scope
 *
 * TextDecoder and TextEncoder are not available in AudioWorklet.
 * These must be defined before any wasm-bindgen code runs.
 */

// Only define if not already present (e.g., in Node.js tests)
if (typeof globalThis.TextDecoder === "undefined") {
  (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = class TextDecoder {
    decode(input?: Uint8Array): string {
      if (!input || input.length === 0) return "";
      let result = "";
      for (let i = 0; i < input.length; i++) {
        result += String.fromCharCode(input[i]!);
      }
      // Handle UTF-8 multibyte sequences
      try {
        return decodeURIComponent(escape(result));
      } catch {
        return result;
      }
    }
  } as unknown as typeof TextDecoder;
}

if (typeof globalThis.TextEncoder === "undefined") {
  (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = class TextEncoder {
    encode(input: string): Uint8Array {
      const utf8 = unescape(encodeURIComponent(input));
      const result = new Uint8Array(utf8.length);
      for (let i = 0; i < utf8.length; i++) {
        result[i] = utf8.charCodeAt(i);
      }
      return result;
    }

    encodeInto(source: string, destination: Uint8Array): { read: number; written: number } {
      const encoded = this.encode(source);
      const written = Math.min(encoded.length, destination.length);
      destination.set(encoded.subarray(0, written));
      return { read: source.length, written };
    }
  } as unknown as typeof TextEncoder;
}
