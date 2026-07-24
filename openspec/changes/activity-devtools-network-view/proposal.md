# Proposal: Activity DevTools Network View

**Change**: `activity-devtools-network-view`
**Project**: autoreas-bridge
**Status**: proposed
**Depends on**: `mobile-request-mcp-debugging-improvements` (base capture schema v2: `response_body`, `request_headers`, `response_headers`, `duration_ms`)

---

## Intent

The "Activity" screen (`frontend/src/features/network` → `NetworkRoute` → `NetworkPanel`) copied the Chrome DevTools Network-tab look without its substance. It renders `ObservabilityLogEntry` rows (an event log: domains system/anime/bus/sync/websocket/api, levels info/warn/error/debug), so its Status and Duration columns are always `–`: log events like "publish anime.changed" are not HTTP transactions. Meanwhile the real request/response transactions are captured by bridge into the `mobile_request_captures` SQLite table — reachable today ONLY through the out-of-process MCP stdio sidecar, with ZERO frontend/Wails read path. This change makes Activity a true Network tab over the captured HTTP transactions: the human-facing lens paired with the agent-facing MCP tools, over ONE dataset.

## Scope

### In Scope
- New in-process read path from bridge app → frontend: a Wails-bound `App` method querying `mobilecapture.Reader` against the app's own DB handle (list with filters + get-by-id detail). NO second SQLite connection/process (that stays the MCP sidecar's pattern).
- New transaction-oriented Activity view (transaction mode in the network feature): DevTools columns — method/kind, route/name, status code (color by class), duration, size (if available), time.
- Detail inspector: request/response body pane + request/response header panes; correlation (changelog/anime) surfacing.
- Filters: status class, method/kind, route, outcome, time window.
- Reframe route so Activity shows real transactions; keep the event log under a clearly-named separate view ("Events").

### Out of Scope
- Mutation/replay, live packet capture.
- Changing the base capture schema (consumed as-is).
- Backend capture write-path changes (owned by the base change).

## Capabilities

### New Capabilities
- `activity-network-transactions`: in-process read API (Wails-bound) + frontend DevTools transaction view over captured HTTP requests (list, filters, detail with body/header/correlation panes).

### Modified Capabilities
- `observability`: Activity route reframed to show captured transactions; existing event-log view retained as a separate "Events" view (no requirement removed).

## Approach

Add a read-only `mobilecapture.Reader` call surface bound on `App` (list + get-by-id), reusing the existing in-process reader (`internal/observability/mobilecapture/reader.go`, `ReadOnlyDB`, search/summary/filters) against the app's DB — not a new file connection. On the frontend, add transaction view models mapping `CaptureRecord` → DevTools rows (method/kind chip, status chip, route, duration, timestamp), a detail pane with request/response body + headers tabs, and a filter bar reusing `NetworkFilterBar` patterns. New frontend work honors the architecture constraints: dumb `.tsx` UI, strict hook anatomy, colocation, `readonly` props, JSDoc helpers, TDD-first, 500-line limit, `shared/ui` reuse, HeroUI v3 + autoreas-theme.

**Decision — replace vs coexist**: RECOMMEND making Activity show real transactions (the honest fix — it already mislabels itself as a Network tab) and moving the `ObservabilityLogEntry` event log to a clearly-named separate "Events" view/route rather than deleting it. Rationale: the two data sources are structurally different (transactions vs log events); the event log is still useful for bus/system diagnostics, but it must stop masquerading as a Network tab. This preserves both lenses while ending the mislabel.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app.go` / `app_runtime_services.go` | Modified | New Wails-bound read method exposing captured transactions (list + detail) |
| `internal/observability/mobilecapture/reader.go` | Modified | In-process list/get-by-id/filter surface for the app binding |
| `frontend/src/features/network/**` | Modified | Transaction view mode: table, detail (body/header panes), filter bar, view models, hook, tests |
| `frontend/src/app/routes/NetworkRoute.tsx` | Modified | Route wiring for Activity (transactions) + separate "Events" view |
| `frontend/src/shared/contracts/**` | New | Frontend `CaptureRecord`/transaction contract types |
| `frontend/src/infrastructure/**` | New | Read-path adapter over the Wails binding |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Base schema columns not yet landed | Med | Sequence: base change merges first; treat its finalized `CaptureRecord` fields as the data contract |
| Response bodies contain PII | Med | Consume already-sanitized capture fields; never re-derive raw payloads on the frontend |
| Frontend review-size creep | Med | Slice the view (list first, then detail/filters); enforce 500-line limit and colocation |
| Losing the event-log diagnostics | Low | Retain event log as a separate "Events" view; do not delete |

## Rollback Plan

Frontend + one bound method are additive. Revert this change's commit to restore the `ObservabilityLogEntry`-only Activity screen. The capture store, base schema, and MCP sidecar are untouched.

## Dependencies

- `mobile-request-mcp-debugging-improvements` base capture schema (v2 columns) landed first.
- Existing in-process reader `internal/observability/mobilecapture/reader.go`.
- HeroUI v3 + autoreas-theme; frontend architecture constraints.

## Success Criteria

- [ ] Activity lists real HTTP transactions with populated status code and duration columns (no more hardcoded `–`).
- [ ] A transaction detail shows request/response bodies, request/response headers, and changelog/anime correlations.
- [ ] Filters by status class, method/kind, route, outcome, and time window work against the in-process read path.
- [ ] The frontend reads captures via a Wails-bound `App` method (no second SQLite connection/process).
- [ ] The event log remains available under a clearly-named "Events" view.
- [ ] New frontend code passes the architecture gate (dumb UI, hook anatomy, colocation, readonly props, JSDoc, 500-line limit).
