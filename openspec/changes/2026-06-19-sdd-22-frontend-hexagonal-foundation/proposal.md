# Proposal: Network-Tab UI (sdd-22)

**Change**: `2026-06-19-sdd-22-frontend-hexagonal-foundation`
**Project**: autoreas-bridge
**Status**: proposed
**Reference repo (patterns)**: `D:\dev\disble\ollama-telemetry\frontend\src`
**Reference feature (structure)**: `frontend/src/features/dashboard`

> **Chained delivery note**: The SDD gate treats a change as atomic, so this
> work ships as two chained changes. **This change delivers Slice A only** —
> the hexagonal frontend foundation + full 4-hook DI migration. The **Network
> feature + nav (Slice B)** and the optional **waterfall (Slice C)** are tracked
> as `2026-06-20-sdd-23-network-tab-ui` (PR 2). Sections below describe the full
> vision; only the Slice A scope is implemented here.

---

## 1. Why / Intent

### Problem
The bridge surfaces request/operation activity today only as a flat log list (`ObservabilityPanel`). There is no first-class, request-centric view: no per-request rows with Name/Status/Duration, no filtering, no master-detail drill-down. The intended primary lens on the bridge — "what HTTP/operation traffic is flowing right now and how is it behaving" — does not exist as a feature.

Worse, the frontend cannot *cleanly* host such a feature. Exploration (`sdd/.../explore`, obs #4164) proved a concrete architectural gap, verified again against live code:

- **No `infrastructure/` layer and no `shared/` layer exist.** `frontend/src/` has only `app/` and `features/`.
- **Wails bindings live inside a feature**: `features/dashboard/dashboard.bindings.ts` imports `wailsjs/go/main/App` and `wailsjs/runtime/runtime` directly and exports 7 concrete functions, not a port interface.
- **Inverted dependency**: that "infrastructure-ish" file imports `ObservabilityLogEntry` BACKWARDS from a feature-local types file (`dashboard.bindings.ts:9`).
- **All four dashboard hooks hard-couple to the concrete module** and their four tests `vi.mock('../../dashboard.bindings')` a relative path instead of injecting a fake — the textbook signal of a missing port/adapter seam.

Building a complex Network feature on top of this would compound the debt with no real seam to test against.

### Why now
The Network view is the intended PRIMARY top feature. Introducing it is the right forcing function to install the missing hexagonal layers *once*, correctly, before more features pile onto the broken seam. Data is already available with ZERO backend work: `GetRecentLogs()` / the `observability` event stream already emit complete `http.request` rows (method/path/status/duration) at `internal/api/middleware.go:23-43`.

### Success looks like
1. A `Network` feature is the first/primary nav entry and the index landing route.
2. Network shows a request table (Name, Status, Method, Duration, Domain), a filter, and a master-detail panel — fed entirely through an injectable port, testable with a fake (no `vi.mock` of a relative path).
3. `infrastructure/` (Wails adapters behind port interfaces) and `shared/contracts/` (pure DTOs) exist; `dashboard.bindings.ts` is fully retired.
4. All four existing dashboard hooks consume ports via DI; their four tests inject fakes. No half-migrated state.
5. A dedicated Zustand read-model store in `shared/store/` owns the event stream; a pure correlationId reducer folds events into request rows.
6. `frontend` test suite and `bun run validate` (lint + typecheck) stay green; runtime behavior of existing panels is unchanged.

---

## 2. Scope

### In scope
- **Hexagonal foundation**: create `frontend/src/infrastructure/` and `frontend/src/shared/contracts/`.
- **Full bindings extraction**: retire `features/dashboard/dashboard.bindings.ts` entirely; move all 7 exported functions behind port interfaces in `infrastructure/*-source.ts` adapters (singleton + pub/sub + browser no-op degrade, mirroring the reference).
- **Promote DTOs**: move `ObservabilityLogEntry` (and any wire-shape types) out of `ObservabilityPanel`'s feature-local types into `shared/contracts/observability.types.ts`, mirroring `internal/logger/logger.go` 1:1 with doc comments citing the Go source. Fixes the inverted dependency.
- **Port-inject all 4 existing hooks** (`use-observability-panel.ts`, `use-pairing-panel.ts`, `use-bridge-status-card.ts`, `use-bridge-dashboard.ts`) with an optional `source = defaultSingleton` parameter; rewrite the 4 `vi.mock(...)` tests to inject fakes (real DI). Test-first.
- **Dedicated Zustand store** in `shared/store/`: read-model owning the appended/capped event stream + selection/filter UI state; depends on the port type (injectable), never on `window.go`/`window.runtime`. Add `zustand` via bun.
- **CorrelationId reducer in pure helpers**: `*.helpers.ts` selectors fold the event STREAM by `correlationId` into request rows (append+cap ingest, analogous to the animes.dat effective-state-per-`_id` parser, SDD-03).
- **Network feature** `features/network/**`: request table + filter + master-detail, built on the port from day one (testable via fake).
- **App-shell nav change**: make Network the FIRST `NAV_ITEMS` entry in `app/AppLayout.tsx` (currently lines 109-114) and the index redirect target in `App.tsx` (currently `/dashboard`); add the `/network` route.

### Out of scope / deferred-optional
- **Backend changes** — none. `GetRecentLogs()` already yields complete `http.request` rows.
- **Multi-phase waterfall visualization** — optional later add-on. Non-HTTP domains (bus/anime/sync) correlate via `correlationId` but lack start/end pairing, so true time-axis waterfalls would need an additive backend `Fields` extension later. V1 ships a numeric/simple duration column or proportional bar only.
- **Speculative `shared/ui/atoms/` + `shared/ui/layout/`** — create only when a genuine second consumer appears (e.g. extracting `AppLayout`'s rail into `shared/ui/layout/nav-rail.tsx`). Do NOT scaffold empty.

---

## 3. Approach

### 3.1 Architecture decision: formalize the reference repo's pattern set
Adopt, as the frontend's hexagonal contract, the pattern set verified in `ollama-telemetry`:

| Pattern | Where it lives | Role |
|---|---|---|
| **Ports & Adapters / Anti-Corruption Layer** | `infrastructure/*-source.ts` | Only files allowed to touch `wailsjs/*` / `window.go` / `window.runtime`. Each exports a port `interface` + a `createXSource()` adapter; no-op degrade when runtime absent. |
| **Dependency Inversion** | hooks + store | Depend on the port TYPE; production uses the default singleton, tests inject a fake. Kills the `vi.mock` relative-path pattern. |
| **Singleton + Observer / Pub-Sub** | `createXSource()` | Module-level shared source, listener `Set`, refcounted subscribe so multiple consumers share one Wails subscription. |
| **Read-Model / CQRS store** | `shared/store/` (Zustand) | Owns the read model (event stream + UI state). No commands flow back through it. |
| **Selector pattern** | `shared/store/*.helpers.ts` | Pure derived selectors, including the correlationId reducer. |
| **Container / Presentational + custom-hook orchestration** | `features/network/**` | Dumb `.tsx` (HeroUI + Tailwind, no Wails, no `useEffect`, no logic) orchestrated by `use-*.ts`. |
| **Null Object** | contracts/store | `EMPTY_*` defaults instead of null branches. |

**KEY ADAPTATION (vs reference)**: the reference ingests SNAPSHOTS (full replace). Ours ingests an event STREAM (`subscribeToEvent` + `getRecentLogs`). Therefore store ingest = **append + cap**, and a pure **REDUCER folds events by `correlationId`** into request rows. This is the same shape as the animes.dat effective-state-per-`_id` parser (SDD-03): many point-in-time records collapse into one effective row keyed by an id.

### 3.2 Target layering
```
frontend/src/
├── infrastructure/                       # NEW — only files allowed to import wailsjs/*
│   ├── observability-log-source.ts       # port ObservabilityLogSource + adapter (EventsOn + GetRecentLogs)
│   ├── bridge-runtime-source.ts          # port + adapter for SQLite/address/pairing/reconcile bindings
│   └── __tests__/
├── shared/                               # NEW
│   ├── contracts/observability.types.ts  # DTOs mirroring internal/logger/logger.go (doc comments cite Go source)
│   └── store/                            # NEW — Zustand read-model + pure correlationId reducer selectors
│       └── __tests__/
├── features/
│   ├── dashboard/**                      # EXISTING — hooks now depend on ports (location unchanged)
│   └── network/**                        # NEW — table + filter + detail, built on the port
└── app/                                  # EXISTING — AppLayout NAV_ITEMS + App.tsx routes updated
```
Note: the four dashboard sub-feature folders (`BridgeDashboard`, `BridgeStatusCard`, `ObservabilityPanel`, `PairingPanel`) STAY where they are — only their import source changes (port instead of concrete bindings). "Introduce infrastructure" is NOT "reorganize the dashboard feature."

### 3.3 Slicing & sequencing
Three logically sliced pieces; A is the prerequisite for B's data path, C is optional.

- **Slice A — Hexagonal foundation + 4-hook migration (prerequisite).**
  Create `infrastructure/` + `shared/contracts/`; extract all of `dashboard.bindings.ts` behind ports; promote DTOs; port-inject the 4 hooks; rewrite the 4 tests to inject fakes (test-first). Touches 4 existing hooks + 4 test files. **Mechanical, non-breaking at runtime** — pure architecture cleanup, no new user-visible behavior. Add `zustand` and stand up `shared/store/` with the correlationId reducer + tests here (the store is foundation the Network feature consumes).
  *Depends on*: nothing.

- **Slice B — Network feature + nav (depends on A).**
  Build `features/network/**` (`use-network-panel.ts` taking `source?: ObservabilityLogSource`, dumb table/filter/detail `.tsx`, helper selectors) on the Slice A port and store. Make Network the first `NAV_ITEMS` entry, add `/network` route, repoint the index redirect from `/dashboard` to `/network`.
  *Depends on*: A (port + store + contracts). Nav wiring alone is independent of A, but the feature it points to needs A.

- **Slice C — Waterfall visualization (optional, deferred).**
  Multi-phase time-axis bar (clone reference `waterfall-bar.tsx`/`.helpers.ts`) once B's list/detail/filter loop is proven, and only if/when backend emits start/end timing. Not in this change's critical path.

Use `bun --cwd="frontend" run generate:feature network NetworkPanel` to scaffold Slice B's feature folder per project rule 10.

---

## 4. Affected modules

### Created
- `frontend/src/infrastructure/observability-log-source.ts` (+ `__tests__/`)
- `frontend/src/infrastructure/bridge-runtime-source.ts` (+ `__tests__/`)
- `frontend/src/shared/contracts/observability.types.ts`
- `frontend/src/shared/store/**` (Zustand store + `*.helpers.ts` correlationId reducer + `__tests__/`)
- `frontend/src/features/network/**` (table, filter, detail, `use-network-panel.ts`, helpers, types, constants, `__tests__/`)

### Modified
- `frontend/src/features/dashboard/dashboard.bindings.ts` — **deleted** after extraction.
- `frontend/src/features/dashboard/ui/ObservabilityPanel/use-observability-panel.ts` + its test
- `frontend/src/features/dashboard/ui/PairingPanel/use-pairing-panel.ts` + its test
- `frontend/src/features/dashboard/ui/BridgeStatusCard/use-bridge-status-card.ts` + its test
- `frontend/src/features/dashboard/ui/BridgeDashboard/use-bridge-dashboard.ts` + its test
- `frontend/src/features/dashboard/ui/ObservabilityPanel/observability-panel.types.ts` — `ObservabilityLogEntry` moved to `shared/contracts/`; this file re-exports or drops it.
- `frontend/src/app/AppLayout.tsx` — `NAV_ITEMS` (lines 109-114): add Network as first entry + a `NetworkIcon`.
- `frontend/src/App.tsx` — add `/network` route; repoint index `Navigate` from `/dashboard` to `/network`.
- `frontend/package.json` — add `zustand` (via `bun add`).

### Unchanged
- All Go backend packages (`internal/**`, `wailsjs/**` generated bindings).

---

## 5. Rollback plan
Per `config.yaml` proposal rule ("include rollback plan for risky changes").

- **Slice granularity = rollback granularity.** A and B land as separate work units; either can be reverted independently via git revert without touching the other (B's nav change is the only cross-cutting edit and reverts cleanly to `/dashboard` first/index).
- **Slice A is behavior-preserving.** The migration changes import sources, not runtime behavior. The 4 rewritten tests are the safety net: they must pass with injected fakes before `dashboard.bindings.ts` is deleted. If a panel regresses, revert Slice A — the deleted `dashboard.bindings.ts` and the four `vi.mock`-based tests return as one unit.
- **Nav rollback.** If Network is not ready, revert only the `App.tsx` index redirect + `NAV_ITEMS` ordering edit; the `/network` route can remain dormant or be removed.
- **Dependency rollback.** `zustand` removal is `bun remove zustand` plus deleting `shared/store/**`; nothing else imports it until Slice B.
- **Hard gate before merge**: `bun --cwd="frontend" run test` and `bun --cwd="frontend" run validate` green; existing panels visually unchanged.

---

## 6. Risks
1. **Test-first migration discipline (Slice A).** Rewriting 4 existing `vi.mock` tests to fake-injection is "modify existing tests," which under strict TDD must be done test-first: write the fake-injection test, watch it fail against the still-concrete hook, then refactor the hook to accept the port. Risk = accidentally loosening coverage during rewrite. Mitigation: assert behavior parity, not implementation.
2. **Two ports vs one (open decision for design).** `bridge-runtime-source.ts` groups SQLite/address/pairing/reconcile; the reference splits per concern (snapshot vs detail). Whether to split further is a `sdd-design` call. Default: one observability port + one runtime port.
3. **Store ingest correctness.** Append+cap + correlationId fold differs from the reference's snapshot-replace. The reducer must be deduplicating and order-stable (last-write-wins per correlationId for status/duration). Pure-helper + dedicated tests mitigate; the animes.dat parser is the proven analog.
4. **Index-redirect change is user-visible.** Repointing `/` from Dashboard to Network changes landing behavior. Intentional (Network is primary) but must be called out and verified.
5. **`zustand` + React 19.** Confirm `zustand` version compatibility with React 19.2.5 at `bun add` time (design/apply concern).
6. **Frontend file-size & anatomy lint gates** (project rules: 500-line cap, strict hook anatomy, readonly Props, JSDoc on helpers, dumb `.tsx`). The Network feature and store must respect them or the commit hook blocks. Mitigation: scaffold via `generate:feature`, keep selectors in helpers.

---

## 7. Success criteria
- [ ] `frontend/src/infrastructure/` and `frontend/src/shared/contracts/` exist; `dashboard.bindings.ts` deleted.
- [ ] No file outside `infrastructure/` imports `wailsjs/*`, `window.go`, or `window.runtime`.
- [ ] All 4 dashboard hooks accept an injectable port; their 4 tests inject fakes (no `vi.mock` of a relative bindings path).
- [ ] `ObservabilityLogEntry` lives in `shared/contracts/observability.types.ts`; no backward feature import.
- [ ] `shared/store/` Zustand read-model + pure correlationId reducer with tests; `zustand` in `package.json`.
- [ ] `features/network/**` renders table + filter + master-detail fed via the port; `use-network-panel.ts` testable with a fake.
- [ ] Network is the first `NAV_ITEMS` entry and the index landing route; `/network` route present.
- [ ] `bun --cwd="frontend" run test` and `bun --cwd="frontend" run validate` green; existing panels behaviorally unchanged.
