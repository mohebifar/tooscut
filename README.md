# Tooscut

A professional-grade NLE video editor that runs entirely in your browser, powered by WebGPU and Rust/WASM.

## Features

- **GPU-Accelerated Rendering** — WebGPU compositing via Rust/WASM for near-native performance
- **Multi-Track Timeline** — Canvas-rendered timeline with unlimited video and audio tracks
- **Keyframe Animation** — Animate any property with bezier easing curves
- **Real-Time Effects** — Brightness, contrast, saturation, blur, and hue rotation
- **Local-First** — All media stays on your machine via the File System Access API
- **Zero Install** — Just open your browser and start editing

## Getting Started

```bash
pnpm install
pnpm dev
```

The UI runs on [http://localhost:3000](http://localhost:3000).

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm typecheck    # Type check all packages
pnpm lint         # Run oxlint
pnpm format       # Format with oxfmt
pnpm test         # Run tests
pnpm build:wasm   # Build WASM compositor (requires Rust + wasm-pack)
```

## Architecture

```
tooscut/
├── apps/ui/             # TanStack Start app (React 19)
├── packages/
│   └── render-engine/   # @tooscut/render-engine (types, keyframes, compositor)
└── crates/              # Rust WASM (compositor, keyframe, shared types)
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)
