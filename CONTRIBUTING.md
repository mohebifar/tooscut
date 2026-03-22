# Contributing to Tooscut

Thanks for your interest in contributing! This guide will help you get set up and productive.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v10+)
- [Rust](https://rustup.rs/) (stable toolchain)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

## Setup

```bash
git clone https://github.com/mohebifar/tooscut.git
cd tooscut
pnpm install
pnpm build:wasm   # Build Rust/WASM modules
pnpm dev           # Start dev server at http://localhost:4200
```

## Project Structure

```
tooscut/
├── apps/ui/                 # TanStack Start app (React 19)
├── packages/render-engine/  # Types, keyframes, compositor wrapper
└── crates/                  # Rust WASM (compositor, audio engine, shared types)
```

## Development Workflow

```bash
pnpm dev          # Start dev server
pnpm build        # Build all packages
pnpm typecheck    # Type check all packages
pnpm lint         # Run oxlint with type-aware rules
pnpm lint:fix     # Auto-fix lint issues
pnpm format       # Format with oxfmt
pnpm test         # Run tests
pnpm build:wasm   # Rebuild WASM (after Rust changes)
```

## Code Style

- **Linting**: We use [oxlint](https://oxc.rs/docs/guide/usage/linter) (not ESLint)
- **Formatting**: We use [oxfmt](https://oxc.rs/docs/guide/usage/formatter) (not Prettier)
- **No barrel files**: Don't create `index.ts` files to re-export. The only exception is package entry points.
- **No JS-side rendering**: All rendering happens in Rust/WASM. JavaScript handles UI, state, and data prep only.
- **Types**: TypeScript types in `packages/render-engine/src/types.ts` must match Rust types in `crates/types/`. Rust is the source of truth. Types use `snake_case` to match serde serialization.

## Architecture Rules

- **Track pairs**: Tracks are always created/deleted in pairs (video + audio).
- **Sorted clips invariant**: Clip arrays are always sorted by `startTime`. Maintain this in any clip operations.
- **Linked clips**: Video and audio clips can be linked via `linkedClipId`. Operations on one must affect both.

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass
4. Write a clear commit message explaining *why*, not just *what*
5. Open a pull request against `main`

## License

By contributing, you agree that your contributions will be licensed under the [Elastic License 2.0](./LICENSE).
