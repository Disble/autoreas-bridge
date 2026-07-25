# Proposal: Capture Middleware + Real-Time Activity

**Change**: `capture-middleware-realtime`
**Project**: autoreas-bridge
**Status**: proposed
**Depends on**: committed `mobile_request_captures` schema (`request_id` PK + telemetry columns), committed Activity `TransactionPanel` + capture-transaction-source + `transaction-store`. Supersedes the abandoned per-handler pending-capture attempt.

---

## Intent

Mobile-request capture is hand-wired into EVERY endpoint. `anime_handler.go`, `sync_handler.go`, and `websocket_handler.go` each repeat `Build*CaptureRecord + buildTelemetry + enqueue` at every exit point (`handleIncomingWebSocketMessage` has 4 near-identical capture blocks around ~3 lines of real logic). Each new endpoint must re-implement capture, and `request_id` threading is duplicated and fragile. Move capture to a MIDDLEWARE architecture: implemented ONCE per transport, not per endpoint. Second, make capture real-time: write an arrival/pending row the moment a request begins and stream new+updated rows live into the Activity view.

## Scope

### In Scope
- **HTTP capture middleware**: single middleware wrapping the mux (absorbs `RequestLoggingMiddleware`). Times the request, wraps the writer (reuse `capturingResponseWriter` + `statusRecorder`), enqueues from TRANSPORT facts (method, route, status, duration, headers, bodies). Handlers supply SEMANTIC facts (outcome, error_code, anime_id, correlation/changelog/conflict IDs) via a request-scoped `capture.Enrich(ctx, ...)` read after `next.ServeHTTP`. Remove `Build*CaptureRecord`+enqueue blocks from `anime_handler.go` and `sync_handler.go`.
- **WebSocket capture adapter**: decorator at the message-pump seam (`serveWebSocketMessages`/`handleIncomingWebSocketMessage`) that mints request_id, enqueues arrival, runs the inner handler (which RETURNS its outcome), enqueues terminal. `handleIncomingWebSocketMessage` drops to pure business logic.
- **Hub-level capture**: connection register/unregister + outbound broadcasts captured ONCE at `internal/realtime/hub.go` (Register/Unregister/BroadcastAnimeChanged/BroadcastPreferencesChanged/BroadcastSeasonChanged).
- **Pending-row via UPSERT**: arrival = pending row, terminal = upsert to final, keyed on `request_id` PK. request_id threading problem disappears.
- **Real-time show**: arrival row streamed to the frontend; Activity refreshes live (new+updated rows transition in place, selection preserved) with a live elapsed clock ticking only while a pending row is in flight.
- Remove the redundant `http.request` observability log line (middleware is its full-fidelity replacement).

### Out of Scope (deferred)
- Pretty/Raw + Copy CodeBlock; status/outcome color pills.
- KPI/metrics bar, waterfall, LLM/token surfacing.
- Capture schema changes (consumed as-is).

## Capabilities

### New Capabilities
- `capture-middleware`: transport-level capture (HTTP middleware + WS pump adapter + hub adapter) with ctx enrichment, replacing per-handler wiring.
- `capture-realtime-activity`: pending-on-arrival capture + live push/refresh of transactions into the Activity view with in-flight elapsed clock.

### Modified Capabilities
- `activity-network-transactions`: transaction view gains live arrival/completion updates and in-flight rows.
- `observability`: `http.request` log line removed; capture middleware is the full-fidelity replacement.

## Approach

One HTTP middleware wraps the mux, owning timing, writer-wrapping, and enqueue from transport facts; handlers contribute at most a one-line `capture.Enrich(ctx, semanticFacts)` read post-`ServeHTTP`. A WS decorator wraps the message pump (arrival → inner handler returns outcome → terminal); the hub captures lifecycle + broadcasts at its single fan-out point. Arrival writes a pending row; terminal UPSERTs to final on `request_id`. Real-time push reuses the established Wails `runtime.EventsEmit` pattern (see `bridge-runtime-source`, `download-runtime-source`): the queue emits arrival/terminal deltas; the frontend `transaction-store` merges them in place and runs an elapsed clock only while a pending row exists.

**Decision — push mechanism**: RECOMMEND Wails runtime event emit over polling. Bridge already emits Go→frontend runtime events for cover/download updates; reusing it gives sub-second arrival latency, avoids a polling loop against SQLite, and matches "pending row visible before the handler finishes". Polling is the fallback only if event volume proves noisy (mitigated by coalescing).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/api/middleware.go` | Modified | Capture middleware absorbs `RequestLoggingMiddleware`; transport-fact enqueue; drop `http.request` log |
| `internal/api/handlers/anime_handler.go` | Modified | Remove `BuildPatchCaptureRecord`+enqueue; contribute via `capture.Enrich` |
| `internal/api/handlers/sync_handler.go` | Modified | Remove `BuildReconcileCaptureRecord`+enqueue; contribute via `capture.Enrich` |
| `internal/api/handlers/websocket_handler.go` | Modified | Pump decorator; inner handler returns outcome; drop 4 capture blocks |
| `internal/realtime/hub.go` | Modified | Capture register/unregister + broadcast frames once |
| `internal/observability/mobilecapture/**` | Modified | ctx enrichment carrier; pending-row UPSERT on `request_id`; event-emit hook |
| `app.go` / `app_runtime_services.go` | Modified | Wire `runtime.EventsEmit` for capture deltas |
| `frontend/src/shared/store/transaction-store/**` | Modified | Merge live arrival/terminal deltas in place; in-flight elapsed clock |
| `frontend/src/infrastructure/**` | New/Modified | Runtime source subscribing to capture-delta events |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Middleware breaks WS Hijack path | Med | `statusRecorder` already implements `Hijack`; keep it and cover with the existing upgrade test |
| Enrichment lost on handler panic | Med | Non-blocking guarantee preserved: middleware enqueues transport facts in `defer`; missing enrichment yields a valid transport-only row |
| Real-time push mechanism choice | Med | Recommend Wails event emit (established pattern); polling fallback with coalescing |
| Capture volume / event spam | Med | Coalesce arrival+terminal, bound emit rate, keep queue drop-oldest non-blocking |
| Behaviour drift vs committed per-handler capture | Med | Preserve outcome/error_code semantics via enrichment; assert parity in handler tests |
| Pending rows never finalized (dropped conn) | Low | Terminal on WS close via hub adapter; pending rows are valid standalone state |

## Rollback Plan

Revert this change's commit to restore the committed per-handler capture wiring and the `http.request` log line. Schema, MCP sidecar, and `TransactionPanel` read path are untouched (additive UPSERT + event emit). Frontend live-merge is additive over the existing polling/read path.

## Dependencies

- Committed `mobile_request_captures` schema (`request_id` PK + telemetry columns).
- Committed Activity `TransactionPanel` + capture-transaction-source + `transaction-store`.
- Wails `runtime.EventsEmit` (already used by `bridge-runtime-source` / `download-runtime-source`).

## Success Criteria

- [ ] HTTP capture is implemented ONCE in middleware; `anime_handler.go` and `sync_handler.go` no longer build/enqueue capture records (contribute only via `capture.Enrich`).
- [ ] `handleIncomingWebSocketMessage` contains pure business logic; capture lives in the pump decorator + hub adapter.
- [ ] Connection open/close and outbound broadcast frames are captured without per-endpoint code.
- [ ] An arrival/pending row is written before the handler finishes; terminal UPSERTs on `request_id`.
- [ ] Activity shows requests arriving and completing live, transitioning in place with selection preserved, with an elapsed clock that ticks only while a pending row is in flight.
- [ ] Non-blocking guarantee preserved; WS Hijack/upgrade path still works; the `http.request` log line is removed.
