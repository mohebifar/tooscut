#!/bin/bash
# Build WASM modules and generate TypeScript types

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../packages/render-engine/wasm"

echo "Building WASM modules..."

# Create output directory
mkdir -p "$OUT_DIR"

# Build compositor crate (the only WASM module needed)
echo "Building tooscut-compositor..."
wasm-pack build compositor \
    --target web \
    --out-dir "$OUT_DIR/compositor" \
    --out-name compositor

echo "Done! WASM modules built to $OUT_DIR"
echo ""
echo "Compositor can be imported from:"
echo "  - @tooscut/render-engine/wasm/compositor"
echo ""
echo "Note: Keyframe evaluation is now pure TypeScript (no WASM)"
