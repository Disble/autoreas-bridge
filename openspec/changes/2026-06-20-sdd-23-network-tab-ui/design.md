# Design: Network-Tab UI feature (sdd-23)

**Depends on** `2026-06-19-sdd-22-frontend-hexagonal-foundation`. The ports, the
Zustand `network-store` (state shape, `connectNetworkStore`/`resetNetworkStore`,
`foldByCorrelationId`, `selectFilteredRows`, `selectRowById`), and the
`ObservabilityLogEntry` / `NetworkRequestRow` contracts already exist and are
tested there — this design does NOT redefine them. See sdd-22 `design.md` §ports
and §store. This change adds only the presentation + delivery layers.

## 1. Feature layout (`frontend/src/features/network/`)

Strict colocation, mirroring `features/dashboard` and the reference repo's
`inference-explorer` / `inference-detail`:

```
features/network/
  index.ts
  ui/NetworkPanel/
    NetworkPanel.tsx              # dumb container composition (table + filter + detail)
    use-network-panel.ts          # hook: injects ObservabilityLogSource, connects store
    network-panel.types.ts        # readonly Props + view-model types
    network-panel.helpers.ts      # row -> view-model, status tone/label, duration fmt (JSDoc)
    network-panel.constants.ts    # status-filter options, empty/capture-unavailable copy
    __tests__/
  ui/NetworkTable/ NetworkFilterBar/ NetworkDetail/   # dumb presentational (.tsx only)
```

- `.tsx` = HeroUI + Tailwind only; NO Wails, NO `useEffect`, NO logic.
- `use-network-panel.ts` follows the 10-step anatomy; its only effect runs
  `connectNetworkStore(source)` (single session bridge, not torn down on unmount —
  same rationale as the reference `use-inference-explorer`).
- All logic (filtering, selection, mapping) is pure store selectors + helpers.

## 2. Row → view-model mapping (`network-panel.helpers.ts`)

Input `NetworkRequestRow` (from the store fold) → presentation view-model:
- **Name**: `path` (fallback to `domain`/`eventType` when path is empty for non-HTTP rows).
- **Status**: numeric `status` → tone (`success` 2xx/3xx, `warning`/`danger` 4xx/5xx, `pending` when null).
- **Type**: `domain`.
- **Duration**: `durationMs` formatted (`—` when null).
- All helpers JSDoc'd; tested table-driven.

## 3. Master/detail data flow

```
use-network-panel(source)
  → connectNetworkStore(source)            # seeds via getRecentLogs, then live stream
  → useNetworkStore selectors:
        rows      = selectFilteredRows(buffer, query, statusFilter)
        selected  = selectRowById(buffer, selectedId)
  → returns { rows, selectedRow, query, statusFilter, onQueryChange, onStatusFilterChange, onSelect, isLoading, captureUnavailable }
NetworkPanel.tsx renders <NetworkFilterBar/> <NetworkTable rows onSelect/> <NetworkDetail row=selected/>
```

Selection lives in the store (`selectedId` + `select`), so table and detail stay
in sync without prop-drilling state up.

## 4. Null Object states

`network-panel.constants.ts` provides empty-state, loading, and
capture-unavailable copy; the dumb table/detail render them when `rows` is empty
or the source degraded (no runtime). Never render `undefined`.

## 5. App shell (delivery, composition-only)

- `app/routes/NetworkRoute.tsx`: thin wrapper rendering `<NetworkPanel/>`, mirroring `ObservabilityRoute.tsx`.
- `App.tsx`: index `Navigate` target `/dashboard` → `/network`; add `<Route path="/network" element={<NetworkRoute/>} />`. No state/effects/logic.
- `AppLayout.tsx`: add a `NetworkIcon` factory; prepend `{ to: '/network', label: 'Network', Icon: NetworkIcon }` to `NAV_ITEMS` so Network is first.
- `App.test.tsx`: assert index lands on `/network` and Network is the first nav item.

## 6. Decisions / notes

- **No backend change** — sdd-22's fold already gives each `http.request` entry its own row (per-entry identity when correlationId is empty), so the table is populated. Verify the metadata field names (`method`/`path`/`status`) against `internal/api/middleware.go:33-41` before finalizing the mapping (code wins, project rule 2).
- **Replay/stream dedup (sdd-22 S2)**: when wiring `connectNetworkStore`, confirm the seed (`getRecentLogs`) + live stream don't double-render the same entry; if they do, add a per-entry dedup key in the store ingest (covered by a store test here).
- Waterfall (Slice C) deferred — not designed here.
