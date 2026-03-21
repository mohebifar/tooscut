#!/bin/bash
# Install wasm-pack for Vercel builds (Rust is pre-installed)
set -e

# Install wasm-pack (pre-built binary)
WASM_PACK_VERSION="v0.13.1"
curl -sSL "https://github.com/rustwasm/wasm-pack/releases/download/${WASM_PACK_VERSION}/wasm-pack-${WASM_PACK_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
  | tar xzf - -C /tmp
mv "/tmp/wasm-pack-${WASM_PACK_VERSION}-x86_64-unknown-linux-musl/wasm-pack" /rust/bin/

# Install Node dependencies
pnpm install
