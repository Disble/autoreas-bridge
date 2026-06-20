# Tasks: Frontend Hexagonal Foundation (sdd-22)

> **Chained delivery**: This change delivers **Slice A only** — the hexagonal
> frontend foundation (infrastructure ports/adapters, shared contracts, Zustand
> read-model + correlationId fold) and the full 4-hook DI migration. The
> **Network feature + nav** (Slice B) and the optional **waterfall** (Slice C)
> are tracked as a separate chained change: `2026-06-20-sdd-23-network-tab-ui`.
> The SDD gate (`tools/checksdd`) treats a change as atomic, so the slices ship
> as two independent changes / PRs.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-600 (Slice A only) |
| 400-line budget risk | Moderate (foundation is mechanical + test-heavy) |
| Chained PRs | Yes — this is PR 1 of 2; Network feature is PR 2 (sdd-23) |
| Delivery strategy | chained (two separate SDD changes) |

---

## Phase 1: Foundation (infrastructure + contracts + store)

- [x] 1.1 `bun --cwd="frontend" add zustand`; confirm resolved `5.x`; run ADR-3 3-step check (add → `typecheck` → `test`), hard-stop on React 19 peer warning.
- [x] 1.2 Create `shared/contracts/observability.types.ts` (move `ObservabilityLogEntry` DTO, all fields readonly, zero imports).
- [x] 1.3 RED: write `infrastructure/__tests__/observability-log-source.test.ts` (subscribe/getRecentLogs, singleton pub-sub, no-op degrade).
- [x] 1.4 GREEN: implement `infrastructure/observability-log-source.ts` (port + `createObservabilityLogSource` + singleton), reusing `waitForBindings`.
- [x] 1.5 RED: write `infrastructure/__tests__/bridge-runtime-source.test.ts` (4 methods + `onPairingTokenConsumed`, singleton, degrade).
- [x] 1.6 GREEN: implement `infrastructure/bridge-runtime-source.ts` (port + singleton).
- [x] 1.7 RED: write `shared/store/__tests__/network-store.helpers.test.ts` — `keepRecent` cap=200; `foldByCorrelationId` dedup/LWW/order-stable per CORRECTED contract (per-entry default + fold only on shared non-empty correlationId; see drift resolution).
- [x] 1.8 GREEN: implement `network-store.helpers.ts`, `.types.ts`, `.constants.ts` (pure, JSDoc, no `.tsx`).
- [x] 1.9 RED: write `shared/store/__tests__/network-store.test.ts` — ingest/seed/select/filter actions, `connectNetworkStore` idempotency, `resetNetworkStore` teardown.
- [x] 1.10 GREEN: implement `network-store.ts` (Zustand `create<NetworkStoreState>()`, connect/reset seams).

## Phase 2: 4-hook migration (test-first DI)

- [x] 2.1 RED: rewrite `use-observability-panel.test.ts` to inject fake `ObservabilityLogSource` (delete `vi.mock('../../dashboard.bindings')`); assert parity.
- [x] 2.2 GREEN: refactor `use-observability-panel.ts` to accept optional `source` param, default singleton.
- [x] 2.3 RED: rewrite `use-pairing-panel.test.ts` to inject fake `BridgeRuntimeSource`; assert parity incl. `onPairingTokenConsumed` refresh.
- [x] 2.4 GREEN: refactor `use-pairing-panel.ts` to accept optional `source` param.
- [x] 2.5 RED: rewrite `use-bridge-status-card.test.ts` to inject fake `BridgeRuntimeSource`; assert parity.
- [x] 2.6 GREEN: refactor `use-bridge-status-card.ts` to accept optional `source` param.
- [x] 2.7 RED: rewrite `use-bridge-dashboard.test.ts` to inject fake `BridgeRuntimeSource`; assert parity incl. reconcile call.
- [x] 2.8 GREEN: refactor `use-bridge-dashboard.ts` to accept optional `source` param.
- [x] 2.9 Delete `frontend/src/features/dashboard/dashboard.bindings.ts` and its `__tests__` only after 2.1-2.8 are green.
- [x] 2.10 Gate: `bun --cwd="frontend" run test && bun --cwd="frontend" run validate` green; manually confirm panels render unchanged.

---

## Notes

- Each hook migration task (2.1-2.8) followed strict RED→GREEN ordering; no hook task merged without its paired test task green first.
- The corrected `foldByCorrelationId` contract (per-entry default; fold only on shared non-empty correlationId) is authoritative over the original design wording — see drift resolution `sdd/2026-06-19-sdd-22-network-tab-ui/drift-correlationid`. `http.request` events carry no correlationId (`internal/api/middleware.go`), so per-entry rows keep the table populated.
- Slice B (Network feature + nav, formerly Phases 3-6) is now `2026-06-20-sdd-23-network-tab-ui`. The backend payload verification (former task 3.1/3.2) and the replay/stream dedup follow-up belong to that change.
