# Stage 1: Base with Node.js and pnpm
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

# Stage 2: Install Rust toolchain and wasm-pack for WASM build
FROM base AS rust
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --target wasm32-unknown-unknown \
    && . "/root/.cargo/env" \
    && cargo install wasm-pack
ENV PATH="/root/.cargo/bin:${PATH}"

# Stage 3: Install dependencies and build WASM + app
FROM rust AS build
WORKDIR /app

# Copy workspace config files first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/ui/package.json apps/ui/
COPY packages/render-engine/package.json packages/render-engine/
# Create a stub for docs so pnpm workspace resolution doesn't fail
COPY apps/docs/package.json apps/docs/

RUN pnpm install --frozen-lockfile

# Copy Rust crates and build WASM
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
RUN pnpm build:wasm

# Copy source for the UI app and render-engine package (not docs source)
COPY packages/render-engine/ packages/render-engine/
COPY apps/ui/ apps/ui/

# Build only the UI app and its dependencies (skip docs)
RUN pnpm --filter @tooscut/ui... build

# Stage 4: Production image — only Node.js + built output
FROM node:20-bookworm-slim AS production
WORKDIR /app

COPY --from=build /app/apps/ui/.output .output

ENV NODE_ENV=production
ENV HOST=::
ENV PORT=3000
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
