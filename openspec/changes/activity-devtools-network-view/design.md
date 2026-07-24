# Design: Activity DevTools Network View

## Technical Approach

Turn Activity into a real Network tab over `mobile_request_captures` by adding an
**in-process** Wails read path (`App` bound methods over the app's own `a.bridgeDB`
via `mobilecapture.NewReader`) and a transaction-oriented frontend subtree, while
relocating the existing `ObservabilityLogEntry` log to a new "Events" view. Purely
additive: one Go file + DTOs, a new frontend infrastructure source, a new feature
subtree, and IA wiring. No capture write-path, schema, or MCP sidecar change.

## Architecture Decisions

| Area | Choice | Alternative | Rationale |
|---|---|---|---|
| Read handle | Reuse `mobilecapture.NewReader(a.bridgeDB)` in-process; Reader only issues `SELECT`s | `OpenReadOnlyDB(path)` (a 2nd file handle) | Bridge already owns the open DB; the sidecar's `mode=ro` file DSN exists only because it is a separate process. In-process = zero extra connection (success criterion). |
| Reader lifetime | Build `a.captureReader` once in `configureRuntimeServices` guarded like `configureCaptureQueue` (nil-safe when `bridgeDB == nil`) | Construct per call | `NewReader` runs one `pragma_table_info` probe; build once, reuse. First-call lazy fallback keeps bound methods nil-safe. |
| Bound surface | Two methods: `ListCaptureTransactions(query) → CapturePage`, `GetCaptureTransaction(id) → CaptureDetailResult` | Single fat method / expose `SearchPage` raw | Mirrors existing `App` DTO pattern (`GetAnimes`, `GetConnectedDevices`): English `contracts` DTOs, empty-on-error, never panics. |
| Schema tolerance | Delegate to Reader's optional-column detection; wrap `Search`/`Get` errors → empty page + `degraded` flag | Assume v2 columns | Base change may lag; Reader already tolerates v1. Frontend shows a "capture unavailable/degraded" hint instead of crashing. |
| PII | Frontend renders capture fields verbatim (already sanitized at capture) | Re-parse/redact on frontend | Sanitization is a backend invariant (`telemetry.go` allowlists); frontend must NOT assume raw data nor re-derive. |
| View split | Activity → transactions; add `/events` route rendering the untouched `NetworkPanel` log | Delete the log / tab-toggle in one panel | Two structurally different datasets; keep both lenses, end the mislabel (proposal decision). |

## Data Flow

    mobile_request_captures (a.bridgeDB)
        │  NewReader.Search/Get (SELECT-only)
        ▼
    App.ListCaptureTransactions / GetCaptureTransaction  ── map CaptureRecord → contracts DTO
        │  Wails generated bindings (frontend/wailsjs/go/main/App)
        ▼
    infrastructure/capture-transaction-source  ── listTransactions()/getTransaction()
        │
        ▼
    use-transaction-panel.ts → helpers (DTO → row/detail view models) → dumb .tsx

## File Changes

| File | Action | Description |
|---|---|---|
| `app_captures.go` | Create | Bound `ListCaptureTransactions`/`GetCaptureTransaction`, reader-to-DTO mappers; nil/degraded-safe |
| `app_runtime_services.go` | Modify | `configureCaptureReader()` builds `a.captureReader` (guarded like `configureCaptureQueue`) |
| `app.go` | Modify | Add `captureReader *mobilecapture.Reader` field |
| `internal/api/contracts/capture.go` | Create | `CaptureQuery`, `CaptureRow`, `CapturePage`, `CaptureDetail`, `CaptureDetailResult` (English) |
| `frontend/src/shared/contracts/capture.types.ts` | Create | Readonly frontend mirror of the DTOs |
| `frontend/src/infrastructure/capture-transaction-source/**` | Create | Wails read adapter (+ `waitForBindings` degrade), parallel to `observability-log-source` |
| `frontend/src/shared/store/transaction-store/**` | Create | Zustand store: page buffer, filters, selection, cursor |
| `frontend/src/features/network/ui/TransactionPanel/**` | Create | Dumb `TransactionPanel/Table/FilterBar/Detail` + `use-transaction-panel.ts` + `*.helpers.ts`/`*.types.ts`/`*.constants.ts` + `__tests__/` |
| `frontend/src/app/routes/ActivityRoute.tsx` | Modify | Render `TransactionPanel` (keep `BridgeStatusCard`) |
| `frontend/src/app/routes/EventsRoute.tsx` | Create | Render existing `NetworkPanel` (the log) |
| `frontend/src/App.tsx` | Modify | Add `/events` route |
| `frontend/src/shared/navigation/app-layout.constants.ts` | Modify | Add "Events" nav item in SYSTEM group |

## Interfaces / Contracts

```go
type CaptureQuery struct { Limit int; Cursor, Route, Outcome, Kind, AnimeID, ErrorCode string
    HTTPStatus *int; StartMS, EndMS *int64 }
type CaptureRow struct { RequestID string; CapturedAtMS int64; Kind, Route, Transport, Outcome, ErrorCode string
    HTTPStatus *int; DurationMS *int64; AnimeID *string }
type CapturePage struct { Items []CaptureRow; NextCursor string; AppliedLimit, MalformedRowsSkipped, WarningCount int; Degraded bool }
type CaptureDetail struct { CaptureRow; Payload map[string]any; ResponseBody *string
    RequestHeaders, ResponseHeaders map[string]string; Correlations mobilecapture.Correlations; DeviceID, DeviceName string }
```

View models (frontend helpers, JSDoc'd): `toTransactionRow(dto)` → `{ methodKind, route, statusLabel, statusColor(class 2xx/3xx/4xx/5xx→success/default/warning/danger), durationLabel, timeLabel }`; `toTransactionDetail(dto)` → tabs **General / Request (headers) / Response (body+headers)** + correlation list.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Go unit | `ListCaptureTransactions` filters/pagination/degrade, `GetCaptureTransaction` found/not-found, nil `bridgeDB`, missing optional columns | `app_captures_test.go` over a seeded in-memory SQLite; RED first |
| FE unit | source adapter (bindings present/absent), store reducers, `*.helpers` mappers (status color, duration, null tolerance) | Vitest colocated `__tests__/`, tests-first |
| FE hook | `use-transaction-panel` anatomy: load, filter, select, tab reset | inject fake source |
| FE render | dumb `.tsx` render rows/detail tabs (no `useEffect`/logic in `.tsx`) | RTL |

TDD order: (1) Go DTO mapper + bound method tests → impl; (2) FE contract types + source tests; (3) store tests; (4) helper/view-model tests; (5) hook tests; (6) dumb `.tsx`; (7) IA routes/nav.

## Migration / Rollout

No data migration. Additive; revert the commit to restore the log-only Activity. Requires **Wails binding regeneration** (`wails dev`/`generate module`) so `App.d.ts` exposes the two new methods before the frontend can call them.

## Drift (CLAUDE.md rule 2)

- `frontend/src/app/routes/NetworkRoute.tsx` exists and renders `NetworkPanel`, but nav wires only `/activity → ActivityRoute` (also `NetworkPanel`); `/network` is unrouted/dead. This design leaves `NetworkRoute.tsx` untouched (out of scope) and notes it as pre-existing drift; `/events` is the new, nav-wired home for the log.
- `NetworkPanel`'s `NetworkEntryViewModel` already carries dead `statusLabel`/`durationLabel` (always `–`) — the very mislabel this change fixes for transactions; the log view keeps them as-is under Events.

## Open Questions

- [ ] Size column: capture stores no byte size; derive from `Content-Length` response header when present, else omit (assume omit for v1).
- [ ] Confirm `contracts` package path is `internal/api/contracts` (matches existing `app_runtime.go` imports).
