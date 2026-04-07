/**
 * Parser for .cube LUT files (industry standard 3D LUT format).
 *
 * Supports:
 * - TITLE line (optional)
 * - LUT_3D_SIZE N (commonly 17, 33, or 65)
 * - DOMAIN_MIN / DOMAIN_MAX (defaults to 0.0 0.0 0.0 / 1.0 1.0 1.0)
 * - RGB triplet data lines (N^3 lines)
 * - Comment lines starting with #
 *
 * Output data is in RGBA format (A=1.0) for GPU texture upload.
 */

export interface CubeLut {
  title: string;
  size: number;
  /** RGBA float data, length = size^3 * 4 */
  data: Float32Array;
}

export function parseCubeFile(content: string): CubeLut {
  const lines = content.split(/\r?\n/);

  let title = "";
  let size = 0;
  let domainMin = [0.0, 0.0, 0.0];
  let domainMax = [1.0, 1.0, 1.0];
  const rgbData: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line === "" || line.startsWith("#")) {
      continue;
    }

    // Parse header lines
    if (line.startsWith("TITLE")) {
      // TITLE "Some Title" or TITLE Some Title
      const match = line.match(/^TITLE\s+"?([^"]*)"?\s*$/);
      if (match) {
        title = match[1].trim();
      }
      continue;
    }

    if (line.startsWith("LUT_3D_SIZE")) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        throw new Error("Invalid LUT_3D_SIZE line: missing size value");
      }
      size = parseInt(parts[1], 10);
      if (isNaN(size) || size < 2 || size > 256) {
        throw new Error(`Invalid LUT_3D_SIZE: ${parts[1]} (must be 2-256)`);
      }
      continue;
    }

    if (line.startsWith("DOMAIN_MIN")) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) {
        throw new Error("Invalid DOMAIN_MIN line: expected 3 values");
      }
      domainMin = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      continue;
    }

    if (line.startsWith("DOMAIN_MAX")) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) {
        throw new Error("Invalid DOMAIN_MAX line: expected 3 values");
      }
      domainMax = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      continue;
    }

    // Skip any other keyword lines (LUT_1D_SIZE, etc.)
    if (/^[A-Z_]/.test(line)) {
      continue;
    }

    // Parse RGB data line
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }

    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);

    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      continue;
    }

    // Normalize from domain range to 0-1
    const rangeR = domainMax[0] - domainMin[0];
    const rangeG = domainMax[1] - domainMin[1];
    const rangeB = domainMax[2] - domainMin[2];

    rgbData.push(
      rangeR !== 0 ? (r - domainMin[0]) / rangeR : r,
      rangeG !== 0 ? (g - domainMin[1]) / rangeG : g,
      rangeB !== 0 ? (b - domainMin[2]) / rangeB : b,
    );
  }

  if (size === 0) {
    throw new Error("Missing LUT_3D_SIZE in .cube file");
  }

  const expectedCount = size * size * size;
  const actualCount = rgbData.length / 3;

  if (actualCount !== expectedCount) {
    throw new Error(
      `LUT data mismatch: expected ${expectedCount} entries (${size}^3) but found ${actualCount}`,
    );
  }

  // Convert to RGBA format for GPU texture upload
  const data = new Float32Array(expectedCount * 4);
  for (let i = 0; i < expectedCount; i++) {
    data[i * 4] = rgbData[i * 3];
    data[i * 4 + 1] = rgbData[i * 3 + 1];
    data[i * 4 + 2] = rgbData[i * 3 + 2];
    data[i * 4 + 3] = 1.0;
  }

  return { title, size, data };
}
