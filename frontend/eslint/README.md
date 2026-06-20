# Frontend architecture enforcement

These ESLint rules make the Feature-Sliced Design constraints documented in
`ARCHITECTURE.md`, `AGENTS.md`, and `CLAUDE.md` **deterministic**. The same
intent that was previously prose-only is now mechanically enforced and gated by
lefthook before any commit lands.

Adapted from the proven `autoreas-mobile` / `ollama-telemetry` standards, mapped
to this Wails + React + Vite + Bun frontend. The infrastructure edge here is the
generated Wails bindings under `wailsjs/`.

## Quick path

1. Keep `src/App.tsx` and `src/app/` limited to composition.
2. Keep user-facing behavior in `src/features/` (dumb `.tsx` views + colocated `use-*.ts` hooks).
3. Run `bun run validate` (lint + typecheck) and `bun run doctor:react` after frontend changes.

## What the linter enforces

| Area | Deterministic rule |
|------|--------------------|
| Delivery (`App.tsx`, `app/`) | No Wails bindings, no React hooks, no direct feature hooks. |
| Dumb UI (`features/**/*.tsx`) | No Wails bindings, no `useEffect`/`useLayoutEffect`, readonly props at the boundary. |
| Hook anatomy (`use-*.ts`) | `useMemo` before `useCallback` before `useEffect`; hook ends with `return`. |
| Strict colocation | No inline interfaces/types/consts/helpers/Zod in views & hooks; tests live in `__tests__/`; feature folders are `kebab-case`. |
| Type contracts (`*.types.ts`) | Every `*Props` field is `readonly`. |
| Public JSDoc | Exported hooks, helpers, constants, types, and schemas require JSDoc. |
| Transversal | No circular imports (`import-x/no-cycle`), no duplicate imports, cognitive complexity & duplication (`sonarjs`), React anti-patterns (`react-doctor`, advisory). |
| Size | 500-line max per `.ts`/`.tsx` file. |

## Why this exists

Architecture that is only described in docs is a promise, not a guarantee. Any
agent or developer can silently violate prose. By encoding every boundary as a
linter rule wired into the pre-commit gate, the architecture becomes a property
the toolchain protects automatically — deterministic first, transversal by
default.
