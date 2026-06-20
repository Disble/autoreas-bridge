# Tasks: Deterministic Linter-Enforced Architecture Constraints

> Retroactive task list. Implementation predates this SDD run; tasks below
> are checked `[x]` where verified-green reality already matches the spec.
> Only Phase 6 (verification & close) is genuinely outstanding.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 (config/tooling + small JSDoc/var fixes; already merged in working tree) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (retroactive docs only; code already implemented) |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

Rationale: implementation is done and verified; remaining work is
SDD-gate paperwork (verify-report + active-change pointer) plus one
commit. No new code to split across PRs. `size-exception` applies because
config+lint-rule+JSDoc diffs are mechanical, low-risk, and already
green — splitting further adds coordination cost without reducing risk.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Retroactive tooling + docs (already implemented) | PR 1 (single) | All Phases 1-5; size-exception, no further split needed |

## Phase 1: Frontend infrastructure (DONE)

- [x] 1.1 Install `eslint@9` + plugins (`@typescript-eslint`, `import-x`, `sonarjs`, `react-doctor`, `eslint-plugin-react-hooks`, `check-file`) via `bun add -D` in `frontend/`.
- [x] 1.2 Remove `frontend/.eslintrc.cjs` (legacy v8 config).
- [x] 1.3 Add `frontend/eslint.config.js` flat config wiring all plugins.
- [x] 1.4 Add `frontend/eslint/architecture-rules.js` with first-party selectors (dumb-UI, hook anatomy, colocation, Readonly Props, JSDoc).
- [x] 1.5 Add `frontend/eslint/README.md` documenting each custom rule's intent.
- [x] 1.6 Add `typecheck`, `validate`, `doctor:react` scripts to `frontend/package.json`.

## Phase 2: Frontend rule definitions (DONE)

- [x] 2.1 Dumb-UI purity rule: forbid `useEffect`/`useLayoutEffect` and Wails binding imports in `.tsx` under `frontend/src/features/**` — satisfies *Frontend Dumb-UI Purity*.
- [x] 2.2 Hook anatomy rule: enforce derived state/callbacks before `useEffect`, trailing `return` in `use-*.ts` — satisfies *Frontend Hook Anatomy*.
- [x] 2.3 Strict colocation rule + `check-file` plugin: forbid inline interfaces/types/helpers/Zod schemas, enforce `__tests__/` placement, kebab-case feature folders — satisfies *Frontend Strict Colocation*.
- [x] 2.4 `Readonly<Props>` rule: require `readonly` on every `*Props` field and `Readonly<...>` wrapping at component/hook boundaries — satisfies *Frontend Type Contracts*.
- [x] 2.5 JSDoc contexts rule: require JSDoc on exported hooks/types/constants/schemas/helpers — satisfies *Frontend Public Documentation*.
- [x] 2.6 Wire `import-x/no-cycle`, `sonarjs` + `react-doctor` (WARN, advisory only), `max-lines: 500` — satisfies *Frontend Transversal Hygiene* (cycle + size).
- [x] 2.7 Set base `no-undef: off`; enable `@typescript-eslint/no-unused-vars` (TS-aware) — defers undefined-symbol detection to `tsc`, completing *Frontend Transversal Hygiene* (typecheck clause).

## Phase 3: Make existing frontend code green (DONE)

- [x] 3.1 Add real JSDoc to exported members across `frontend/src/features/dashboard/**` to satisfy the new JSDoc rule.
- [x] 3.2 Fix 2 unused-variable violations in `frontend/src/features/dashboard/**` flagged by `@typescript-eslint/no-unused-vars`.

## Phase 4: Backend depguard rules (DONE)

- [x] 4.1 Add `domain-purity` depguard rule to `.golangci.yml`: deny `net/http`, `database/sql`, `github.com/wailsapp/wails/v2` under `internal/anime/domain/**` — satisfies *Backend Domain Purity*.
- [x] 4.2 Add `contracts-are-ports` depguard rule: deny `internal/api/handlers`, `net/http`, `database/sql`, `github.com/wailsapp/wails/v2` under `internal/api/contracts/**` — satisfies *Backend Ports Isolation*.
- [x] 4.3 Add `wails-confined-to-edge` depguard rule: deny `github.com/wailsapp/wails/v2` under `internal/**` — satisfies *Backend Transport Confinement*.
- [x] 4.4 Run negative probe (temporary forbidden import) to confirm each depguard rule actually fires non-zero — prevents a silently-disabled rule.

## Phase 5: Gate integration + documentation (DONE)

- [x] 5.1 Add `frontend-typecheck` job (`bun run typecheck`) to `lefthook.yml` pre-commit, alongside existing `frontend-lint` and `golangci-lint` — satisfies *Pre-Commit Gate Integration*.
- [x] 5.2 Rewrite `ARCHITECTURE.md` section 10 to describe the deterministic enforcement topology (frontend ESLint flat config + backend depguard + lefthook gate) replacing prose-only constraints.

## Phase 6: Verification & close (DONE)

- [x] 6.1 Ran final verification (orchestrating agent) against the spec: full gate battery green + two negative probes (Go `net/http` in domain → depguard bites; `useEffect` in feature `.tsx` → Dumb UI Rule bites). Verdict PASS.
- [x] 6.2 Set `.atl/active-sdd-change` to `2026-06-19-sdd-21-linter-architecture-enforcement` (disambiguates from the 2 other active changes).
- [x] 6.3 Wrote `verify-report.md` with PASS verdict (+ Engram `sdd/linter-architecture-enforcement/verify-report`, #4159).
- [x] 6.4 Orchestrating agent creates the commit; lefthook pre-commit gate (frontend-lint, frontend-typecheck, frontend-test, gofmt, golangci-lint, go-vet, go-test, go-cover, openapi, sdd-gate) runs and passes as part of commit creation.
