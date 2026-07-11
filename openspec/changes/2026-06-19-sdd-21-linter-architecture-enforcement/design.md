# Design: Frontend Global Governance Enforcement

## Technical Approach

Unify the frontend policy into four layers: shared selector catalogs in `frontend/eslint/architecture-rules.js`, composition in `frontend/eslint.config.js`, a repo-owned structural checker for cross-file rules, and the fixture harness in `frontend/eslint/__tests__/architecture-policy.test.mjs`. Maintained `frontend/src/**` stays governed by default. One global declaration-placement policy owns inline type/helper/const restrictions. One global Wails-runtime policy owns generated binding imports plus `window.go.*`, with delivery files reusing the same selectors through message remapping. Pure `index.ts` barrels, sibling-role ownership, and folder shape move to a repo-local checker because stock ESLint selectors cannot verify filesystem topology safely.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Declaration governance | Per-file-role duplicated selectors; one global selector catalog | One global declaration-placement catalog | Current TSX, hook, and adapter rules clone the same intent. One source reduces drift and keeps ownership language consistent. |
| Wails runtime governance | Separate `tsx` and delivery rules; one shared runtime rule | One shared `window.go`/binding policy with delivery message remap | Runtime access is one concept. Delivery files need different guidance, not different detection logic. |
| Barrel and folder checks | Implicit selector gaps; custom repo check | Repo-local checker plus ESLint | Pure-barrel and folder-ownership validation depend on sibling files and directory contents. ESLint selectors alone do not own that truth. |
| Adapter migration | Force immediate folder rewrite; phased shim migration | Folder-owned entrypoints with no remaining facades | The final topology keeps each migrated adapter behind `src/infrastructure/<adapter>/index.ts` and removes production compatibility shims plus allowlist debt. |

## Data Flow

```text
fixtures/docs → architecture-rules.js → eslint.config.js → vitest harness
                                      ↘ repo structural checker ↗
                                                  ↓
                                      bun run lint / pre-commit gate
```

### Sequence Diagram

```text
Fixture or real file -> ESLint rule blocks: syntax/JSDoc checks
Fixture or real file -> repo checker: barrel purity + folder ownership scan
ESLint + repo checker -> Vitest/lefthook: merged pass/fail result
Vitest/lefthook -> developer: scoped error with role-specific message
```

## File Changes

| File | Action | Description |
|---|---|---|
| `frontend/eslint/architecture-rules.js` | Modify | Export one declaration-placement catalog, one Wails-runtime catalog, documentation contexts, and delivery-message remap helpers. |
| `frontend/eslint.config.js` | Modify | Recompose policy blocks around the shared catalogs and invoke the repo-local structural checker during frontend lint. |
| `frontend/scripts/check-frontend-architecture.mjs` | Create | Scan real files for pure `index.ts` barrels, folder-owned split modules, and an empty production facade allowlist. |
| `frontend/eslint/__tests__/architecture-policy.test.mjs` | Modify | Run ESLint fixtures plus structural-check fixtures in one harness with explicit RED, GREEN, EXEMPT, and HARNESS-ONLY buckets. |
| `frontend/eslint/__fixtures__/architecture-policy/**` | Modify | Add fixture folders for mixed barrels, missing siblings, historical facade regression coverage, delivery `window.go` usage, and documented pass paths. |
| `frontend/eslint/README.md`, `docs/architecture.md` | Modify | Document one global declaration policy, one global Wails policy, checker ownership, exceptions, and migration status. |

## Interfaces / Contracts

- Governed production surface: `frontend/src/**/*.{ts,tsx}` except generated `wailsjs/**` and production tests.
- Documentation contexts: exported functions, exported variable declarations, exported interfaces, exported type aliases, inline exported default functions, and documented role files behind pure barrels.
- Pure barrel contract: only `export ... from` / `export type ... from` statements, no local declarations, no side effects, filename `index.ts` only.
- Folder ownership contract: when a module uses `*.helpers.ts`, `*.types.ts`, `*.constants.ts`, or `*.schema.ts`, those files MUST live in the same folder as the main named function and the public entrypoint MUST be `index.ts`.
- Delivery remap: the shared runtime selectors emit delivery-specific guidance for `src/App.tsx` and `src/app/**`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| ESLint fixtures | Global declaration policy, global Wails policy, documentation contexts | RED/GREEN fixtures asserted in `architecture-policy.test.mjs` |
| Structural checker | Pure barrels, sibling ownership, folder shape, and empty production allowlist proof | Checker fixtures under the same harness with direct script invocation |
| Documentation regression | Docs and artifacts match live policy names and exceptions | Assert referenced rule names/paths in README and `docs/architecture.md` during review |

## Migration / Rollout

All six migrated infrastructure adapters now live at `frontend/src/infrastructure/<adapter>/index.ts` with colocated role files. No compatibility shims or production allowlist entries remain. Historical shim fixtures stay harness-only so the checker keeps proof for the retired exception shape. No runtime migration is required.

## Open Questions

- [ ] None blocking.
