#!/bin/bash
# Install Rust toolchain and wasm-pack for Vercel builds
set -e

# Install Rust (minimal profile, no prompts)
curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable --profile minimal
. "$HOME/.cargo/env"

# Install wasm-pack (pre-built binary, much faster than cargo install)
WASM_PACK_VERSION="v0.13.1"
curl -sSL "https://github.com/rustwasm/wasm-pack/releases/download/${WASM_PACK_VERSION}/wasm-pack-${WASM_PACK_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
  | tar xzf - -C /tmp
mv "/tmp/wasm-pack-${WASM_PACK_VERSION}-x86_64-unknown-linux-musl/wasm-pack" "$HOME/.cargo/bin/"

# Install Node dependencies
pnpm install
