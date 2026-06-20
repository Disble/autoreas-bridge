# Proposal: Network-Tab UI feature (sdd-23)

**Change**: `2026-06-20-sdd-23-network-tab-ui`
**Project**: autoreas-bridge
**Status**: proposed
**Depends on**: `2026-06-19-sdd-22-frontend-hexagonal-foundation` (commit c2d4df5) — provides the `ObservabilityLogSource` port, the Zustand `network-store` (append+cap + `foldByCorrelationId`), and `shared/contracts/observability.types.ts`.
**Reference repo (patterns)**: `D:\dev\disble\ollama-telemetry\frontend\src` (`features/inference-explorer`, `features/inference-detail`)

---

## 1. Why / Intent

Chained PR 2 of the Network-tab migration. The hexagonal foundation (sdd-22) is in place; this change delivers the **user-visible Chrome DevTools "Network"-style feature** and makes it the PRIMARY top entry of the app: a request/operation table fed by the observability stream, a query + status filter bar, and a master/detail panel — built as dumb UI on top of the existing port + store.

## 2. Scope

**In scope**
- `features/network/**`: container + `use-network-panel` hook (injects `ObservabilityLogSource`, drives `connectNetworkStore`), dumb `network-table`, `network-filter-bar`, `network-detail`, with empty/loading/capture-unavailable Null Object states.
- Row → view-model mapping helpers (status tone/labels, duration formatting) with JSDoc + colocated tests.
- App shell: `app/routes/NetworkRoute.tsx`; `App.tsx` index redirect `/dashboard` → `/network` and new `/network` route; `AppLayout.tsx` `NAV_ITEMS` prepends Network as the first entry.

**Out of scope**
- Backend changes (none — the foundation's per-entry fold already keeps `http.request` rows populated despite the missing correlationId; see sdd-22 drift resolution).
- Slice C multi-phase waterfall visualization (deferred; revisit only if the backend later emits multi-domain start/end timing).

## 3. Approach

Reuse the foundation verbatim. The store + port + fold already exist and are tested; this change only adds the **presentation layer** (container/hook/dumb components) and the **delivery layer** wiring (route + nav), per the project's dumb-`.tsx` / 10-step-hook / strict-colocation rules. Mirror `inference-explorer` (table) and `inference-detail` (panel) from the reference repo.

## 4. Affected modules

- New: `frontend/src/features/network/**`, `frontend/src/app/routes/NetworkRoute.tsx`.
- Modified: `frontend/src/App.tsx`, `frontend/src/app/AppLayout.tsx`, `frontend/src/app/__tests__/App.test.tsx`.

## 5. Rollback plan

Frontend-only and additive except the index redirect. Rollback = revert this change's commit: the `/network` route, nav entry, and feature folder are removed and the index reverts to `/dashboard`. The foundation (sdd-22) is untouched and remains functional on its own.

## 6. Risks

- Index redirect is user-visible (intended). Covered by an `App.test.tsx` assertion.
- Replay/stream identity overlap for entries without correlationId (sdd-22 verify S2) — confirm/dedup here when wiring the live store.
