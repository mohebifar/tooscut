#!/bin/bash
# Build WASM modules and generate TypeScript types

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../packages/render-engine/wasm"

echo "Building WASM modules..."

# Create output directory
mkdir -p "$OUT_DIR"

# Build compositor crate
echo "Building tooscut-compositor..."
wasm-pack build compositor \
    --target web \
    --out-dir "$OUT_DIR/compositor" \
    --out-name compositor

# Build audio-engine crate
echo "Building tooscut-audio-engine..."
wasm-pack build audio-engine \
    --target web \
    --out-dir "$OUT_DIR/audio-engine" \
    --out-name audio_engine

echo "Done! WASM modules built to $OUT_DIR"
echo ""
echo "Modules can be imported from:"
echo "  - @tooscut/render-engine/wasm/compositor"
echo "  - @tooscut/render-engine/wasm/audio-engine"
