#!/usr/bin/env npx tsx

/**
 * Generate preview images for visual test cases.
 *
 * This script generates PNG previews of the test textures and expected
 * layer compositions (without the actual WebGPU compositor).
 *
 * Usage: npx tsx scripts/generate-test-previews.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  visualTestCases,
  generateSolidTexture,
  generateSceneTexture,
} from "../src/testing/test-renderer.js";

// Output directory
const OUTPUT_DIR = join(import.meta.dirname, "../tests/__previews__");

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Convert RGBA data to a simple PPM image (Portable Pixmap).
 * PPM is a simple uncompressed format that doesn't require external libraries.
 */
function rgbaToPPM(data: Uint8Array, width: number, height: number): Buffer {
  const header = `P6\n${width} ${height}\n255\n`;
  const headerBuf = Buffer.from(header);
  const pixelBuf = Buffer.alloc(width * height * 3);

  for (let i = 0; i < width * height; i++) {
    // Blend RGBA against white background
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3] / 255;

    pixelBuf[i * 3] = Math.round(r * a + 255 * (1 - a));
    pixelBuf[i * 3 + 1] = Math.round(g * a + 255 * (1 - a));
    pixelBuf[i * 3 + 2] = Math.round(b * a + 255 * (1 - a));
  }

  return Buffer.concat([headerBuf, pixelBuf]);
}

console.log("Generating test previews...\n");

// Generate previews for each test case's textures
for (const testCase of visualTestCases) {
  console.log(`${testCase.name}: ${testCase.description}`);

  for (const texture of testCase.textures) {
    const filename = `${testCase.name}-texture-${texture.id}.ppm`;
    const filepath = join(OUTPUT_DIR, filename);

    const ppm = rgbaToPPM(texture.data, texture.width, texture.height);
    writeFileSync(filepath, ppm);
    console.log(`  - Saved ${filename} (${texture.width}x${texture.height})`);
  }
}

// Generate some standalone texture examples
console.log("\nGenerating standalone examples...");

const examples = [
  { name: "solid-red", data: generateSolidTexture(256, 256, 255, 0, 0), width: 256, height: 256 },
  { name: "solid-green", data: generateSolidTexture(256, 256, 0, 255, 0), width: 256, height: 256 },
  { name: "solid-blue", data: generateSolidTexture(256, 256, 0, 0, 255), width: 256, height: 256 },
  { name: "scene", data: generateSceneTexture(256, 256), width: 256, height: 256 },
];

for (const example of examples) {
  const filename = `example-${example.name}.ppm`;
  const filepath = join(OUTPUT_DIR, filename);
  const ppm = rgbaToPPM(example.data, example.width, example.height);
  writeFileSync(filepath, ppm);
  console.log(`  - Saved ${filename}`);
}

console.log(`\nDone! Previews saved to ${OUTPUT_DIR}`);
console.log("Note: PPM files can be viewed with most image viewers or converted to PNG.");
