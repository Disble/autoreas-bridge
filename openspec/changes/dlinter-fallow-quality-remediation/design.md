# Design: Dlinter Fallow Quality Remediation

## Technical Approach

Deliver three independently reviewable frontend slices: deterministic lint repair, trace-backed dead-code triage, then ownership-safe duplication reduction. Each slice follows strict RED -> GREEN -> REFACTOR, keeps generated `frontend/wailsjs/**` and unrelated working-tree changes untouched, and records the exact command behind every metric. The 400-line review budget applies per slice; split a slice further by feature or adapter family when its forecast exceeds the budget.

## Review Slices

| Slice | Scope and boundary | Exit evidence |
|---|---|---|
| 1. Lint behavior | Fix promise ownership, assertions, comparisons, regex, sorting, conditionals, and test hygiene. Async/data behavior remains in hooks; `.tsx` files receive synchronous JSX event adapters only. Wails normalization remains in `src/infrastructure/*-source/*.helpers.ts`. | Focused tests, full frontend tests, typecheck, zero lint errors |
| 2. Dead-code decisions | Trace each reported symbol, file, or dependency. Delete only confirmed unreachable code; retain intentional barrels, schemas, and setup entries through existing reachability or the narrowest documented config entry. | Per-item trace ledger plus dead-code and changed-code audit JSON |
| 3. Duplication ownership | Consolidate identical wire/domain shapes only in `src/shared/contracts/**`; keep feature view models colocated. Extract repeated presentational controls only into dumb shared UI primitives. Keep route composition in `src/app/**` and hook orchestration in each feature. | Focused tests, semantic duplication delta, audit, architecture gates |

## Architecture Decisions

| Decision | Options and tradeoff | Choice and rationale |
|---|---|---|
| Order remediation | Structural refactors first create noisy diffs; lint-first stabilizes the hard gate. | Clear deterministic lint clusters before Fallow refactors so later measurements isolate structural changes. |
| Promise boundary | Async JSX handlers violate lint; moving operations into `.tsx` violates dumb UI. | Hooks expose callbacks with explicit promise handling; JSX uses minimal synchronous wrappers that invoke those callbacks without data transformation. |
| Type extraction | Global consolidation lowers clone counts but can merge unrelated bounded-context vocabulary. | Share only semantically identical contracts already owned by `shared/contracts`; preserve feature-specific view models and adapter DTOs at their current boundary. |
| Dead-code handling | Bulk fix is fast and unsafe around barrels, schemas, dynamic Wails use, and unfinished work. | Require `--trace`, `--trace-file`, or `--trace-dependency` evidence and a focused test before deletion. Use precise retention only for a proven analyzer limitation. |
| Quality configuration | Broad ignores make the gate green while hiding debt. | Preserve current error rules, entry points, and `wailsjs/**` generated-code exclusion; permit only item-specific, explained retention changes. |

## Change Flow

```text
Measured finding -> focused failing characterization test -> minimal code change
       -> focused GREEN -> lint/typecheck/test -> Fallow trace or metric
       -> review evidence -> next slice
```

For helper or hook changes, update its colocated `__tests__/` first. Capture RED from the behavioral assertion, then implement while preserving the ten-step hook anatomy. Pure transformations move to tested `*.helpers.ts` functions with JSDoc. Component-only rendering remains in named-function `.tsx` modules with HeroUI and Tailwind.

## File Changes

| Path | Action | Design intent |
|---|---|---|
| `frontend/src/features/**` | Modify/delete exports | Test-first lint fixes, confirmed dead exports, and feature-owned duplication cleanup |
| `frontend/src/infrastructure/*-source/**` | Modify | Normalize Wails adapter return types and remove redundant assertions behind existing adapter tests |
| `frontend/src/shared/contracts/**` | Modify | Own only stable cross-feature contract shapes |
| `frontend/src/shared/ui/**` | Create/modify if evidenced | Host reusable dumb presentation primitives with component tests |
| `frontend/.fallowrc.json` | Conditional modify | Add only narrow, trace-justified retention; preserve generated exclusion and setup entry |
| `frontend/wailsjs/**` | Preserve | Generated output is excluded from edits and refactors |

## Trace-Backed Deletion Contract

For every candidate, record finding, trace command, callers/reachability, test changed, and disposition. Use `fallow dead-code --trace <file>:<export>` for symbols, `--trace-file <file>` for files, and `--trace-dependency <name>` for packages. A deletion requires no reachable caller, no framework/generator contract, and passing focused tests. Ambiguous findings remain in place. Never delete barrels, schemas, tests, fixtures, or unfinished unrelated files solely from aggregate counts.

## Verification

Run focused Vitest files after each RED/GREEN cycle, then at every slice boundary:

```powershell
bun --cwd="frontend" run test
bun --cwd="frontend" run typecheck
bun --cwd="frontend" run lint
bun --cwd="frontend" run fallow dead-code --format json --quiet
bun --cwd="frontend" run fallow audit --format json --quiet
bun --cwd="frontend" run fallow dupes --format json --quiet --mode semantic
bun --cwd="frontend" run filesize:warning
bun --cwd="frontend" run doctor:react
```

Before final delivery, run the repository pre-commit gate. Compare audit results to the changed-code baseline of 10 unused exports, 2 dev-dependencies-in-production, and 6 clone groups. Compare semantic duplication to the full baseline of 26 groups and 19.98%. Report command-scoped deltas; do not claim equivalence between scopes.

## Rollout And Risks

No runtime or data migration is required. Commit each slice as an autonomous rollback unit with tests and evidence. Snapshot `git status --short` before edits and stage only slice-owned paths, preserving `frontend/package.json`, `frontend/bun.lock`, generated output, and unrelated untracked work unless a later task explicitly owns them.

Residual risks are semantic drift from regex/sort changes, accidental shared-layer coupling, and Fallow false positives. Focused characterization tests, extraction boundaries, trace evidence, and per-slice audits contain them. No blocking design questions remain.
