#!/bin/bash
# Build WASM modules and generate TypeScript types

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../public/wasm"

echo "Building WASM modules..."

# Create output directory
mkdir -p "$OUT_DIR"

# Build types crate (for TypeScript definitions)
echo "Building tooscut-types..."
wasm-pack build types \
    --target web \
    --out-dir "$OUT_DIR/types" \
    --out-name types

# Build keyframe crate
echo "Building tooscut-keyframe..."
wasm-pack build keyframe \
    --target web \
    --out-dir "$OUT_DIR/keyframe" \
    --out-name keyframe

# Build compositor crate
echo "Building tooscut-compositor..."
wasm-pack build compositor \
    --target web \
    --out-dir "$OUT_DIR/compositor" \
    --out-name compositor

echo "Done! WASM modules built to $OUT_DIR"
echo ""
echo "Generated TypeScript types can be imported from:"
echo "  - $OUT_DIR/types/types.d.ts"
echo "  - $OUT_DIR/keyframe/keyframe.d.ts"
echo "  - $OUT_DIR/compositor/compositor.d.ts"
