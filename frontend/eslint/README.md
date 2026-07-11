# Frontend architecture enforcement

Architecture governance for this frontend is provided by the
[`dlinter-ts-react`](https://www.npmjs.com/package/dlinter-ts-react) package —
the published successor of the rules that used to live in this directory
(`architecture-rules.js`, the documentation plugin, and the structural
checker script). The same Feature-Sliced constraints documented in
`ARCHITECTURE.md`, `AGENTS.md`, and `CLAUDE.md` stay **deterministic**: they
are mechanically enforced and gated by lefthook before any commit lands.

## Quick path

1. Keep `src/App.tsx` and `src/app/` limited to composition.
2. Treat production source under `src/` as globally governed by the architecture policy, with explicit exemptions only for generated Wails bindings and production tests.
3. Keep split modules folder-owned. Their public surface flows through a pure re-export `index.ts`, and migrated infrastructure adapters keep zero flat facade or compatibility shim allowances.
4. Run `bun run validate` (lint + typecheck) after frontend changes.

## Configuration

`eslint.config.js` composes `createRecommendedConfig` from the package. The
Wails specifics are **consumer options**, not package presets:

- `infrastructure.importPatterns: ['(^|/)wailsjs(/|$)']` — generated bindings are the infrastructure edge.
- `infrastructure.runtimeGlobals: ['window.go']` — the desktop runtime is reachable only through colocated hooks/adapters.
- `wailsjs/**` is excluded from lint as generated code.

## What the linter enforces

| Area | Deterministic rule |
|------|--------------------|
| Delivery (`App.tsx`, `app/`) | `dlinter/composition-only-delivery` + `dlinter/no-infrastructure-in-view` |
| Dumb UI (`src/**/*.tsx`) | `dlinter/no-view-effects`, `dlinter/readonly-props`, `dlinter/no-infrastructure-in-view` |
| Hook anatomy (`src/**/use-*.ts`) | `dlinter/hook-anatomy` |
| Strict colocation | `dlinter/strict-colocation` — role files own declarations; feature folders are kebab-case; tests live in `__tests__/` |
| Barrels and folder ownership | `dlinter/pure-index-barrel` + `dlinter/folder-ownership` |
| Type contracts (`src/**/*.types.ts`) | `dlinter/readonly-props` — every `*Props` field is `readonly` |
| Public JSDoc | `jsdoc/require-jsdoc` + `dlinter/require-exported-variable-jsdoc` |
| Transversal | `import-x/no-cycle`, duplicate imports, `sonarjs` and `react-doctor` (advisory), 500-line max per file |

## Contract notes

- Folder-owned modules expose their public surface only through a pure re-export `index.ts`.
- No flat facade or compatibility shim allowance remains for migrated infrastructure adapters.
- Generated `wailsjs/**` stays excluded.
- Production tests under `src/**/__tests__/**`, `src/**/*.test.*`, and `src/test/**` stay exempt from architecture rules — tests describe behavior, not production shape.

## Why this exists

Architecture that is only described in docs is a promise, not a guarantee. Any
agent or developer can silently violate prose. By encoding every boundary as a
linter rule wired into the pre-commit gate, the architecture becomes a property
the toolchain protects automatically — and by consuming the shared package, the
same property now scales to every project that installs it.
