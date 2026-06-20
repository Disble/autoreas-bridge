# Design: Deterministic Linter-Enforced Architecture Constraints

> Retroactive design. The change is ALREADY IMPLEMENTED, VERIFIED, and green. This documents the architecture decisions and enforcement topology behind the shipped tooling.

## Technical Approach

Turn the prose architecture constraints (Dumb-UI, Hook Anatomy, strict colocation, domain purity, transport confinement) into **deterministic, gated properties of the toolchain**. Instead of trusting humans and agents to honor `AGENTS.md`/`ARCHITECTURE.md`, every boundary is encoded as a linter rule and wired into the `lefthook` pre-commit gate so a violating commit is *blocked*, not merely flagged in review.

Two independent enforcement surfaces converge on the same gate:

- **Frontend** — migrate ESLint v8 legacy (`.eslintrc.cjs`) to a v9 flat config (`eslint.config.js`) that composes a first-party, testable rules module (`eslint/architecture-rules.js`). `no-undef` is delegated to TypeScript, and `tsc` is promoted into the gate as a load-bearing job.
- **Backend** — enable `golangci-lint`'s `depguard` with three hexagonal boundary rules in `.golangci.yml`, each GREEN against current code and verified to fail via a negative probe.

No runtime behavior changes. These are build-time governance guards only.

## Architecture Decisions

| ID | Decision | Choice | Alternatives considered | Rationale |
|----|----------|--------|-------------------------|-----------|
| D1 | Enforcement strategy | Deterministic-first: encode constraints as gated linter rules | Keep prose in AGENTS.md/ARCHITECTURE.md + rely on human review and agents | Prose is silently violable — drift already happened. A gated linter makes the constraint a property the toolchain *protects*, not a suggestion. "Deterministic via linters first, transversal by default." |
| D2 | ESLint config model | Full migration to ESLint v9 flat config | Stay on v8 legacy `.eslintrc.cjs`, add rules incrementally | `import-x`, `sonarjs`, `check-file`, `react-doctor` are first-class in flat config, giving max deterministic coverage. Incremental on v8 means partial coverage + permanent tech debt. Cost accepted: major version bump + fixing surfaced lint. |
| D3 | Rule organization | Externalized rules module `frontend/eslint/architecture-rules.js` | Inline all selectors directly in `eslint.config.js` | A module gives testable, reusable, named selector groups and mirrors the proven `ollama-telemetry` / `autoreas-mobile` family structure. Inlining makes selectors unreadable and untestable. |
| D4 | Undefined symbols | `no-undef` OFF; delegate to TypeScript; add `frontend-typecheck` to gate | Keep ESLint `no-undef` on | ESLint `no-undef` false-positives on TS DOM/type-namespace globals (`SVGSVGElement`, `URLSearchParams`, the React type namespace). `tsc` is the real source of truth. **Consequence: the `frontend-typecheck` gate job is LOAD-BEARING** — without it, undefined symbols would slip. |
| D5 | Unused vars | `@typescript-eslint/no-unused-vars` (TS-aware); base `no-unused-vars` OFF | Keep base `no-unused-vars` | The base rule flags documentary parameter names inside function-type annotations as "unused". The TS-aware rule ignores those while still catching genuine unused locals/imports (with `^_` ignore patterns). |
| D6 | React hooks safety | Keep `eslint-plugin-react-hooks` | Drop it like the source repo (`ollama-telemetry`) did | `rules-of-hooks` / `exhaustive-deps` are a genuine correctness safety net no other plugin replaces. Dropping it would be a regression in a React codebase. |
| D7 | Advisory linters | `react-doctor` + `sonarjs` as `warn` (not error); `doctor:react` kept OUT of the gate | Make them errors / put `doctor:react` in the gate | They are opinionated/advisory and `doctor:react` is network-dependent (`bunx react-doctor`). The deterministic gate must be **offline and stable** — non-determinism cannot block a commit. |
| D8 | Go boundaries | depguard rules: `domain-purity`, `contracts-are-ports`, `wails-confined-to-edge` | Stricter rules (e.g. `domain-not-import-api`) | These three mirror the hexagonal target in AGENTS.md AND are GREEN against current code (prevent regression, not force refactor). Verified to fail via a negative probe. A `domain-not-import-api` rule would break the build given existing drift (see D9). |
| D9 | Recorded drift | Do NOT enforce against `internal/anime/domain → internal/api/contracts`; document and defer | Add a rule that forbids it now | Code wins as runtime truth. The domain→api import is backwards for pure hexagonal, but enforcing it today would fail the build and force an in-scope refactor. Tradeoff: accept one documented gap to keep the change build-time-only and shippable; leave the refactor to a dedicated future change. |

## Enforcement Flow

```text
            developer / agent edits .ts .tsx .go
                          │
                          ▼
                git commit  ──▶  lefthook pre-commit  (parallel: false, fail-fast)
                          │
        ┌─────────────────┴───────────────────────────────────┐
        │ FRONTEND surface                  BACKEND surface     │
        │                                                       │
        │  frontend-lint                    gofmt               │
        │   eslint . (flat config)           checkgofmt         │
        │   ├─ Dumb-UI (no useEffect)       golangci-lint       │
        │   ├─ Hook Anatomy order            ├─ depguard:       │
        │   ├─ strict colocation             │   domain-purity  │
        │   ├─ Readonly<Props>               │   contracts-...  │
        │   ├─ JSDoc on exports              │   wails-confined │
        │   ├─ check-file (kebab/__tests__)  ├─ staticcheck     │
        │   ├─ import-x/no-cycle             └─ errcheck/vet... │
        │   └─ sonarjs/react-doctor (WARN)  go vet ./...        │
        │  frontend-typecheck  ◀── LOAD-BEARING (D4)  go test ./...
        │   tsc --noEmit  (owns no-undef)   go test -cover      │
        │  frontend-test                    sdd-gate / openapi  │
        │   vitest run                                          │
        └─────────────────┬───────────────────────────────────┘
                          │
              all jobs pass? ──No──▶ commit BLOCKED (exit non-zero)
                          │Yes
                          ▼
                    commit allowed
```

`doctor:react` is intentionally NOT a node in this flow (D7) — it stays a manual `bun run doctor:react` script, offline gate only.

## Component Map

| Component | Responsibility | Layer |
|-----------|----------------|-------|
| `frontend/eslint.config.js` | Flat-config composition root: layers globals, plugins, file-scoped rule blocks | Frontend governance |
| `frontend/eslint/architecture-rules.js` | First-party, testable selector groups (Dumb-UI, anatomy, colocation, readonly-props, JSDoc contexts) + `downgradeRuleSeverities` | Frontend governance (reusable module) |
| `frontend/eslint/README.md` | Setup/intent documentation for the rules module | Docs |
| `frontend/package.json` scripts | `lint`, `typecheck`, `validate`, `doctor:react`, `test` entrypoints invoked by the gate | Frontend tooling contract |
| `.golangci.yml` (`depguard`) | Backend hexagonal boundary rules | Backend governance |
| `lefthook.yml` | The gate: orchestrates frontend + backend jobs, fail-fast | Composition root of enforcement |
| `ARCHITECTURE.md` §10 | Human-readable description of the now-deterministic enforcement | Docs |

### Frontend rule blocks (file-scoped, in `eslint.config.js`)

| File glob | Enforced constraints |
|-----------|----------------------|
| `**/*.{ts,tsx,js,jsx,mjs,cjs}` | `import-x/no-cycle` (maxDepth 1), `no-duplicates`, `no-unresolved`, `sonarjs` (warn) |
| `**/*.{ts,tsx}` | `max-lines` 500, `no-undef` off (D4), TS-aware `no-unused-vars` (D5) |
| tests (`__tests__/`, `*.test.*`) | Exempt from architecture/colocation/anatomy/JSDoc; unused mock params allowed |
| `src/**/*.{ts,tsx}` | `react-hooks/rules-of-hooks` error, `exhaustive-deps` warn (D6); `react-doctor` warn (D7); `check-file` kebab folders + `__tests__/` placement |
| `**/*.tsx` | No direct `wailsjs/*` imports; `tsxLayeringSyntaxRules` |
| `src/App.tsx`, `src/app/**` | Delivery-only: no Wails, no React hooks, no feature/shared hook imports |
| `src/features/**/*.tsx`, `src/components/**/*.tsx` | Dumb-UI (no effects), colocation, `Readonly<Props>`, JSDoc, no inline Zod |
| `src/features/**/use-*.ts` | Hook anatomy (memo→callback→effect, ends with return) + colocation |
| `*.types.ts` | Every `Props` field `readonly` + JSDoc on exported contracts |
| `*.constants.ts` / `*.schema.ts` / `*.helpers.ts` | JSDoc on exports; helpers may not declare inline interfaces/types |

### Backend depguard boundaries (`.golangci.yml`)

| Rule | Scope (`files`) | Denies | Hexagonal intent |
|------|-----------------|--------|------------------|
| `domain-purity` | `**/internal/anime/domain/**` | `net/http`, `database/sql`, `wails/v2` | Domain stays transport- and persistence-free; constructible/testable in isolation |
| `contracts-are-ports` | `**/internal/api/contracts/**` | `internal/api/handlers`, `net/http`, `database/sql`, `wails/v2` | Ports must not import the adapters that implement them, nor transport/persistence drivers |
| `wails-confined-to-edge` | `**/internal/**` | `wails/v2` | Wails desktop runtime stays in the composition root (`app.go`/`main.go`); inject runtime access into internal packages |

## Data / Control Flow

```text
ARCHITECTURE.md §10 (human spec)
        │ codified-as ▼
architecture-rules.js  ──imported by──▶  eslint.config.js ──run by──▶ bun run lint ┐
tsconfig.json          ──read by──────────────────────────────────────▶ tsc       ┤ frontend gate jobs
vitest config          ───────────────────────────────────────────────▶ vitest    ┘
.golangci.yml          ──read by──▶ golangci-lint (depguard) ─────────────────────── backend gate job
        │
        └──────────── all referenced by ───────────▶ lefthook.yml (pre-commit) ──▶ allow/block commit
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/.eslintrc.cjs` | Remove | Legacy v8 config (D2) |
| `frontend/eslint.config.js` | Create | v9 flat-config composition root |
| `frontend/eslint/architecture-rules.js` | Create | Testable, reusable selector module (D3) |
| `frontend/eslint/README.md` | Create | Rules module setup/intent docs |
| `frontend/package.json` | Modify | New plugins + `typecheck`/`validate`/`doctor:react` scripts |
| `frontend/src/features/dashboard/**` | Modify | Real JSDoc + 2 unused-var fixes to go green |
| `.golangci.yml` | Modify | `depguard` enabled with 3 boundary rules (D8) |
| `lefthook.yml` | Modify | Added `frontend-typecheck` job (D4) |
| `ARCHITECTURE.md` | Modify | §10 rewritten for deterministic enforcement |

## Interfaces / Contracts

**Frontend rules module exports** (consumed by `eslint.config.js`): `appDeliverySyntaxRules`, `appLayerReactHooksPattern`, `colocationSyntaxRules`, `downgradeRuleSeverities`, `dumbUiEffectSyntaxRules`, `featureHookAnatomySyntaxRules`, `helperDocumentationContexts`, `importXExtensions`, `publicConstantDocumentationContexts`, `publicHookDocumentationContexts`, `publicTypeContractDocumentationContexts`, `readonlyUiPropsBoundarySyntaxRules`, `schemaPlacementSyntaxRules`, `tsxLayeringSyntaxRules`, `uiExportDocumentationContexts`.

**Gate command contract** (`lefthook.yml` pre-commit jobs, fail-fast, `parallel: false`):

```text
frontend-lint        → bun --cwd="frontend" run lint        (eslint .)
frontend-typecheck   → bun --cwd="frontend" run typecheck   (tsc --noEmit)   ← LOAD-BEARING
frontend-test        → bun --cwd="frontend" run test        (vitest run)
gofmt                → go run ./tools/checkgofmt
golangci-lint        → golangci-lint run                    (depguard)
go-vet               → go vet ./...
go-test / go-cover   → go test ./... [-cover]
sdd-gate / openapi   → go run ./tools/checksdd | checkopenapi
```

## Testing / Verification Strategy

| Layer | What was verified | Approach |
|-------|-------------------|----------|
| Frontend positive | Lint + typecheck green under v9 flat config | `bun run validate` against existing `src/**` incl. `features/dashboard/**` |
| Backend positive | `golangci-lint run` green with depguard enabled | Full repo run |
| Backend negative | depguard ACTUALLY fails on a violation | Negative probe: temporarily add a forbidden import → confirm non-zero exit, then revert |
| Gate integration | Pre-commit runs frontend-typecheck + golangci-lint | `lefthook` dry-run / real commit |

A negative probe is the critical verification for D8: a rule that never fires is indistinguishable from a disabled rule.

## Recorded Drift (code wins as runtime truth)

`internal/anime/domain/state_machine.go` imports `internal/api/contracts` — a domain→api dependency that is backwards for pure hexagonal layering. Confirmed present in code. Per project rule #2 (code wins), this is documented, NOT enforced against, and NOT fixed here. Adding a `domain-not-import-api` depguard rule (D8 rejected alternative) would fail the build today, dragging an out-of-scope refactor into a build-time-only change. Deferred to a dedicated future change.

## Migration / Rollout

No runtime migration. Build-time only. Rollback: revert the config/doc files, restore `.eslintrc.cjs` from git, remove the `frontend-typecheck` job from `lefthook.yml` and the `depguard` block from `.golangci.yml`. Dashboard JSDoc edits are harmless and may remain.

## Open Questions

- [ ] None blocking. Future change should decide whether to fix the recorded domain→api drift and then tighten depguard with a `domain-not-import-api` rule.
