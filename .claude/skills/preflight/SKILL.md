---
name: preflight
description: Run all CI checks locally (lint, format, typecheck, knip) and fix failures before committing or opening a PR. Use before every commit/push/PR, or when the user asks to verify the branch is CI-clean.
---

# Preflight — local CI checks

Before running the checks below, also apply the **User-Facing Documentation** rule in the root `CLAUDE.md`: if this change adds/removes/changes a keyboard shortcut, adds a feature or workflow, or changes documented behavior, update the relevant page(s) under `apps/docs/content/docs/` (and `keyboard-shortcuts-modal.tsx` for shortcuts) in the same commit/PR — don't treat CI-green as "done" if docs are stale.

Run the same checks as `.github/workflows/ci.yml` (Lint & Type Check job), in the same order, from the repo root. All four must pass before committing or opening a PR — CI runs every one of them and fails the build on the first offender.

```bash
pnpm lint        # oxlint (type-aware)
pnpm format      # oxfmt --check
pnpm typecheck   # tsc across all packages (turbo)
pnpm knip        # unused files/exports/dependencies
```

## Fixing failures

**lint** — `pnpm lint:fix` auto-fixes what it can; fix the rest by hand.
If the repo-wide run dies with "Linter process terminated abnormally (possibly out of memory)", fall back to linting the files you changed directly:
`npx oxlint <changed files...>`

**format** — `pnpm format:fix` (runs `oxfmt --write`).
Known trap: `apps/docs/source.generated.ts` is rewritten by `fumadocs-mdx` (runs during the docs typecheck) with unformatted output. If it shows up, run `npx oxfmt --write apps/docs/source.generated.ts` and commit the result. Because typecheck regenerates it, run typecheck BEFORE the final format check when touching docs.

**typecheck** — fix reported type errors. Note `pnpm typecheck` builds render-engine first via turbo; a stale build can mask/cause errors — rerun after fixing.

**knip** — reports unused exports, files, and dependencies:
- "Unused exports": if the symbol is only used within its own module, remove the `export` keyword (don't delete the declaration). If it's truly dead, delete it.
- "Unused files/dependencies": confirm nothing imports them (grep), then remove.
- Only add knip ignore entries for intentional public API, never to silence a real finding.

## Order of operations

1. Make your changes.
2. Update `apps/docs/content/docs/` (and the shortcuts modal, if applicable) per the User-Facing Documentation rule above.
3. `pnpm typecheck` (regenerates docs source if applicable).
4. `pnpm lint` and `pnpm format` — apply fixes.
5. `pnpm knip`.
6. Re-run anything whose inputs changed while fixing (e.g. removing an export can affect typecheck).
7. Also run the tests when the change touches render-engine or store logic: `pnpm --filter @tooscut/render-engine test`.

Only commit/push once all checks exit 0.
