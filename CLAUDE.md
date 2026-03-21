# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tooscut is an NLE (Non-Linear Editor) video editor with a GPU-accelerated rendering pipeline. It's a rewrite of the Subformer editor using TanStack Start instead of Next.js.

## Commands

```bash
# Development
pnpm dev                    # Start all apps (UI on port 3000)
pnpm build                  # Build all packages and apps
pnpm typecheck              # Type check all packages
pnpm lint                   # Run oxlint with type-aware rules
pnpm lint:fix               # Auto-fix linting issues
pnpm format                 # Format code with oxfmt
pnpm test                   # Run tests

# WASM (requires Rust toolchain + wasm-pack)
pnpm build:wasm             # Build WASM compositor to packages/render-engine/wasm/

# Package-specific (from monorepo root)
pnpm --filter @tooscut/ui dev                    # Run just the UI
pnpm --filter @tooscut/render-engine test        # Test render engine
pnpm --filter @tooscut/render-engine test:browser  # Browser tests (WebGPU)

# Shadcn components (run from apps/ui)
pnpm dlx shadcn@latest add button
```

## Architecture

```
tooscut/
├── apps/
│   └── ui/                      # TanStack Start app (@tooscut/ui)
│       └── src/
│           ├── routes/          # TanStack Router file-based routes
│           │   ├── __root.tsx
│           │   ├── index.tsx
│           │   └── editor/$projectId.tsx
│           └── components/
│               ├── editor/      # Video editor components
│               └── ui/          # Shadcn components
├── packages/
│   └── render-engine/           # @tooscut/render-engine
│       ├── src/
│       │   ├── types.ts         # Core types (mirrors Rust crates/types)
│       │   ├── keyframe-evaluator.ts  # Pure TS keyframe interpolation
│       │   ├── compositor.ts    # WASM compositor wrapper
│       │   ├── frame-builder.ts # Build RenderFrame from clips
│       │   └── clip-operations.ts  # Edit-time clip/track operations
│       ├── wasm/compositor/     # WASM binaries (built from crates/)
│       └── docs/DESIGN.md       # Design decisions
└── crates/                      # Rust WASM source
    ├── types/                   # Shared types (source of truth)
    ├── keyframe/                # Keyframe evaluation (WASM)
    └── compositor/              # GPU compositor (wgpu + glyphon)
```

## Code Rules

### No barrel files
The only `index.ts` files that re-export are package entry points. Do not create `index.ts` files within directories to aggregate exports.

### All rendering in Rust/WASM
No rendering on the JavaScript side. The compositor handles:
- Video frame compositing
- Text rendering (glyphon/cosmic-text)
- Shape rendering (SDF shaders)
- Effects and transitions

JavaScript only handles:
- UI (timeline, panels, controls)
- State management (Zustand)
- Preparing data structures for WASM
- Uploading textures/fonts to WASM

### Types
TypeScript types in `packages/render-engine/src/types.ts` must match Rust types in `crates/types/`. Rust is the source of truth. Types use snake_case to match serde serialization.

## Key Patterns

### Track Pairs
Tracks are always created/deleted in pairs (video + audio). Track index determines z-order for video tracks.

### Sorted Clips Invariant
Clips arrays are always sorted by `startTime`. This enables O(log n) binary search for visibility queries. Clip operations maintain this invariant.

### Linked Clips
Video and audio clips can be linked via `linkedClipId`. Operations on one affect both (move, split, delete, trim).

## Testing

```bash
# Unit tests (Node.js) - clip operations, keyframe evaluation
pnpm --filter @tooscut/render-engine test

# Browser tests (WebGPU required) - compositor, visual rendering
pnpm --filter @tooscut/render-engine test:browser
```

## Design Documentation

When making architectural decisions, update `packages/render-engine/docs/DESIGN.md`:
- Track system (pairs, z-order, operations)
- Clip system (structure, linking, overlap rules)
- Cross transitions
- Keyframe evaluation
- Text/shape rendering


# Agent Instructions for task management

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

NEVER PUSH THE CHANGES.

# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

