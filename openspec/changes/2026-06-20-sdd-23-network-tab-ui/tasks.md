# Tasks: Network-Tab UI feature (sdd-23)

> Chained PR 2. Built on `2026-06-19-sdd-22-frontend-hexagonal-foundation`
> (ports + Zustand store + corrected fold already implemented and tested).
> Strict TDD: every helper/hook test is written RED before its implementation.

## Phase 1: Confirm backend payload + fold fit (do FIRST)

- [x] 1.1 Re-read `internal/api/middleware.go:33-41` + `internal/logger/logger.go` `Fields`/`LogEntry`; confirm metadata keys are exactly `method`/`path`/`status` and `durationMs` is top-level. Record any drift (code wins). **No drift**: confirmed `method`/`path`/`status` are metadata keys and `DurationMs` (`elapsed.Milliseconds()`) is a top-level `Fields`/`LogEntry` field — matches `network-store.helpers.ts` exactly.
- [x] 1.2 Confirm the existing `foldByCorrelationId` already yields one row per `http.request` entry (per-entry identity, correlationId empty) — add a store/helpers test asserting a realistic `http.request` entry set renders N distinct rows. If replay+stream double-render is observed (sdd-22 S2), add a per-entry dedup key in the store ingest, test-first. **No double-render found**: `seed` REPLACES the buffer (not merge), so a live-ingested entry arriving before `getRecentLogs()` resolves is safely overwritten, never duplicated. Added 2 regression tests in `network-store.test.ts` (both pass with zero store changes).

## Phase 2: Network feature (presentation, test-first)

- [x] 2.1 Scaffold: `bun --cwd="frontend" run generate:feature network NetworkPanel`.
- [x] 2.2 RED: write `network-panel.helpers.test.ts` (row→view-model: name/status-tone/type/duration mapping, null status → pending, null duration → `—`).
- [x] 2.3 GREEN: implement `network-panel.helpers.ts` / `.types.ts` / `.constants.ts` (pure, JSDoc, readonly Props).
- [x] 2.4 RED: write `use-network-panel.test.ts` injecting a fake `ObservabilityLogSource`; assert filtered rows, selection→selectedRow, query/status filter, loading/empty/capture-unavailable states.
- [x] 2.5 GREEN: implement `use-network-panel.ts` (10-step anatomy; single `useEffect` → `connectNetworkStore(source)`; selectors for rows/selected). Added one additive export `isWailsRuntimeAvailable()` to `infrastructure/observability-log-source.ts` (sync, non-polling) so the hook can distinguish "genuinely empty" from "capture unavailable" — the port's two-member stream contract is unchanged.
- [x] 2.6 Implement dumb `NetworkTable.tsx`, `NetworkFilterBar.tsx`, `NetworkDetail.tsx`, `NetworkPanel.tsx` (HeroUI + Tailwind only; no Wails/useEffect/logic).
- [x] 2.7 Implement empty/loading/capture-unavailable Null Object states in helpers/constants, rendered by the dumb components.

## Phase 3: Nav + routing (delivery, composition-only)

- [x] 3.1 Create `app/routes/NetworkRoute.tsx` (thin wrapper mirroring `ObservabilityRoute.tsx`).
- [x] 3.2 Edit `App.tsx`: index `Navigate` target `/dashboard` → `/network`; add `<Route path="/network" element={<NetworkRoute />} />`.
- [x] 3.3 Edit `AppLayout.tsx`: add `NetworkIcon` factory; prepend `{ to: '/network', label: 'Network', Icon: NetworkIcon }` to `NAV_ITEMS` (Network first).
- [x] 3.4 Update `app/__tests__/App.test.tsx`: index lands on `/network`; Network is first nav item. Also kept an explicit `/dashboard` direct-route test since the index target moved off it.
- [x] 3.5 Gate: `bun --cwd="frontend" run test && bun --cwd="frontend" run validate` green; manual check Network is the index landing and master/detail works with a fake-backed test.

## Phase 4 (deferred, out of critical path)

- Slice C — multi-phase waterfall visualization. Not in this change; revisit only if the backend later emits multi-domain start/end timing.
