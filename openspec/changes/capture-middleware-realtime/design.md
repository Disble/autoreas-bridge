# Design: Capture Middleware + Real-Time Activity

## Technical Approach

Move mobile-request capture from per-handler wiring to **transport-level middleware**,
one implementation per transport, and make capture **real-time**. An HTTP middleware
absorbs `RequestLoggingMiddleware`, wraps the mux once, times each request, mints its
`request_id`, and writes a **pending arrival row** before the handler runs; a `defer`
then **UPSERTs** the terminal row from transport facts merged with request-scoped
**enrichment** (semantic facts handlers contribute via `capture.Enrich(ctx, …)`). A WS
decorator wraps the message pump (arrival → inner handler returns a structured outcome →
terminal), and the `MemoryHub` captures connection lifecycle + outbound broadcasts at its
single fan-out point. Real-time push rides the established Wails `runtime.EventsEmit`
pattern (`download-runtime-source`): the capture **queue drain** — the one choke point —
emits each persisted `CaptureRow` to the frontend, where `transaction-store` upserts it in
place and a shared clock ticks the elapsed time of in-flight rows.

Additive over committed schema (`request_id` PK is the UPSERT key), the committed
`TransactionPanel`/`transaction-store` read path, and the MCP sidecar — all untouched.

## Architecture Decisions

| Area | Choice | Alternative | Rationale |
|---|---|---|---|
| Middleware placement | **Merge**: `CaptureMiddleware` absorbs `RequestLoggingMiddleware`; drop the `http.request` log line. New file `internal/api/capture_middleware.go` wraps `h.mux` in `NewHandler`. | Keep both middlewares side by side | Proposal mandates absorption + log removal; one writer wrap, one timing, one status read. Two wrappers would double-wrap the writer and re-derive the same facts. |
| Capture writer | One `capturingResponseWriter` in package `api` merging **status + bounded body + `Hijack`** delegation (folds today's `statusRecorder.Hijack` and handlers' body/status capture). | Reuse handlers' `capturingResponseWriter` (no `Hijack`) or `statusRecorder` (no body) | The middleware wraps at the `api` layer above `/ws`; the writer must expose `http.Hijacker` for the WS upgrade **and** record body/status. Handlers stop wrapping, so their `capture_response.go` writer/`buildTelemetry`/`responseStatus` are deleted. |
| Enrichment carrier | `CaptureEnrichment` struct + private context key in `mobilecapture`; `mobilecapture.NewEnrichmentContext(ctx) (ctx, *CaptureEnrichment)` installs it; handlers call `mobilecapture.Enrich(ctx).SetOutcome(…)`/`SetAnimeID`/`SetErrorCode`/`SetPayload`/`SetDevice`/`AddConflictID`… | Thread `request_id` + a builder through every handler signature | `mobilecapture` is already imported by both `api` and `handlers`; a ctx holder removes the fragile `request_id` threading entirely (success criterion). Handler mutates a pointer; middleware reads it in `defer`. |
| `request_id` ownership | Minted **once** in the middleware, stored on the enrichment holder in ctx; arrival + terminal share it. | Generate in `baseRecord`/handlers (as today) | Single owner ⇒ arrival and terminal collide on the PK ⇒ UPSERT. Handlers never see or thread the id. |
| Pending → terminal write | `Store.UpsertCapture` = `INSERT … ON CONFLICT(request_id) DO UPDATE` that **preserves the arrival `captured_at_ms`** (startedAt) and overwrites status/outcome/duration/response/correlations/device. Queue drains through `UpsertCapture`. | Two-table pending log; or DELETE+INSERT | PK UPSERT keeps one row per request, arrival timestamp is the clock origin, and a lone terminal (arrival dropped under load) still inserts cleanly — non-blocking preserved. |
| WS capture seam | `handleIncomingWebSocketMessage` returns a `wsMessageOutcome{Outcome, ErrorCode, Correlations, Request}` and **stops enqueuing**; a `captureWebSocketMessage` decorator mints the id, enqueues arrival, runs inner, upserts terminal (transport `websocket`, kind `ws_reconcile`). | Keep 4 in-handler capture blocks | Collapses 4 near-identical blocks to pure business logic; capture lives once at the pump. |
| Hub capture sink | Inject `MemoryHubConfig.Capture mobilecapture.CaptureFunc` (nil ⇒ no-op). Register→`ws_connect`/`opened`, Unregister→`ws_disconnect`/`closed`, Broadcast*→`ws_broadcast`/`pushed`. Best-effort `TryEnqueue`, non-blocking. | Capture inside the WS handler's register/`defer Unregister` | The hub is the **single** fan-out point for broadcasts; per-handler capture cannot see fan-out frames. One seam covers lifecycle + every broadcast type. |
| One-way broadcast shape | Broadcasts have no request/response: `outcome="pushed"`, `http_status=null`, `duration_ms=null`, `payload` = the frame (anime_id / season / preferences), `correlations.anime_ids` when present. | Force a request/response shape | Faithful to a push frame; the frontend renders it as a completed, statusless row. |
| Emit choke point | Emit from the **queue drain** after a successful `UpsertCapture`, via `QueueConfig.OnPersist(CaptureRecord)`. App wires it to `runtime.EventsEmit("capture.transaction", CaptureRow)`. | Emit at each capture site (middleware/WS/hub) | One serialized place ⇒ natural coalescing, bounded rate, and "emit only what actually persisted". Emitting at sites would double-fire and race the store write. |
| Full-traffic capture | Middleware captures **every** `/api/*` request it serves (transport facts), **skipping `/ws`** (owned by the WS/hub seams). Kind from a route table (`patch`, `reconcile`) with a transport-generic default. | Restrict to patch/reconcile only | The middleware *replaces* `RequestLoggingMiddleware`, which logged every request; the Network view now has full fidelity. `/ws` is excluded to avoid double-capturing the upgrade. |
| Real-time push | Wails `runtime.EventsEmit` (recommended in proposal) over polling. | SQLite poll loop | Sub-second arrival latency, reuses `bridge`/`download-runtime-source`, no poll against SQLite. Polling stays the documented fallback. |

## Component Map & Data Flow

### HTTP (arrival + terminal)

    NewHandler → CaptureMiddleware(h.mux, deps)
        │  mint request_id; wrap writer (status+body+Hijack)
        │  ctx, enr := mobilecapture.NewEnrichmentContext(r.Context())
        │  enqueue ARRIVAL  (outcome=pending, status/duration/response = null)
        ▼
    next.ServeHTTP(captureWriter, r.WithContext(ctx))
        │  handler authenticates, does work, calls mobilecapture.Enrich(ctx).Set*()
        ▼
    defer: build TERMINAL from transport facts (method, route, status,
           duration, headers, body) MERGED with *enr (device, outcome,
           error_code, anime_id, payload, correlations) → TryEnqueue
        ▼
    Queue.run → Store.UpsertCapture(request_id)  → OnPersist(record)
        ▼
    runtime.EventsEmit("capture.transaction", CaptureRow)

Panic-safety: the `defer` runs even if the handler panics; with no enrichment set it still
enqueues a valid **transport-only** terminal row (status from the writer, or 500). The
middleware re-panics after enqueue so the server's own recovery is unchanged.

### WebSocket

    serveWebSocketMessages → captureWebSocketMessage(inner, connHeaders):
        mint request_id → enqueue arrival(ws_reconcile,pending)
        outcome := handleIncomingWebSocketMessage(...)  // pure logic, returns wsMessageOutcome
        upsert terminal(outcome, error_code, correlations, connHeaders)
    MemoryHub.Register/Unregister/Broadcast* → Capture(ws_connect|ws_disconnect|ws_broadcast)

Both feed the same Queue → `OnPersist` → emit.

### Frontend

    EventsOn("capture.transaction") → capture-runtime-source (createRuntimeSubscription)
        ▼
    transaction-store.upsertRows([row])  // transition-in-place by requestId, keep selection
        ▼
    use-transaction-panel (subscribe)  +  use-elapsed-clock (ticks only while a pending row exists)

## Interfaces / Contracts

```go
// internal/observability/mobilecapture/enrichment.go
type CaptureEnrichment struct {
    RequestID   string
    Device      DeviceIdentity
    Outcome     string
    ErrorCode   string
    AnimeID     *string
    Payload     map[string]any
    Correlations Correlations
    set         bool // whether a handler contributed semantics
}
func NewEnrichmentContext(ctx context.Context) (context.Context, *CaptureEnrichment)
func Enrich(ctx context.Context) *CaptureEnrichment // never nil; no-op holder off-middleware
func (e *CaptureEnrichment) SetOutcome(string) *CaptureEnrichment
func (e *CaptureEnrichment) SetDevice(device.PairedDevice) *CaptureEnrichment
func (e *CaptureEnrichment) SetAnimeID(string) *CaptureEnrichment
func (e *CaptureEnrichment) SetErrorCode(string) *CaptureEnrichment
func (e *CaptureEnrichment) SetPayload(map[string]any) *CaptureEnrichment
func (e *CaptureEnrichment) AddConflictID(string) *CaptureEnrichment
func (e *CaptureEnrichment) AddChangelogIDs(...int64) *CaptureEnrichment
func (e *CaptureEnrichment) SetOperationRefs([]OperationRef) *CaptureEnrichment

// internal/observability/mobilecapture/store.go (new method)
func (s *SQLiteStore) UpsertCapture(ctx context.Context, r CaptureRecord) error
// INSERT … ON CONFLICT(request_id) DO UPDATE SET kind=excluded.kind, outcome=…,
//   http_status=…, duration_ms=…, payload_json=…, correlation_json=…, error_code=…,
//   response_body=…, request_headers=…, response_headers=…, device_id=…, device_name=…
//   -- captured_at_ms is NOT overwritten (arrival = startedAt origin)

// queue.go
type QueueConfig struct { Capacity int; OnPersist func(CaptureRecord) }
type Store interface { UpsertCapture(ctx context.Context, r CaptureRecord) error }
```

```go
// internal/api/capture_middleware.go (package api)
type CaptureMiddlewareDeps struct { Capture apiHandlers.CaptureFunc; Clock func() time.Time }
func CaptureMiddleware(next http.Handler, deps CaptureMiddlewareDeps) http.Handler
// - skips /ws (WS/hub own it)
// - captureKind(method, route) → "patch" | "reconcile" | generic
type capturingResponseWriter struct { http.ResponseWriter; status int; body []byte } // + Hijack

// internal/realtime/hub.go
type MemoryHubConfig struct { … ; Capture mobilecapture.CaptureFunc }
```

### BEFORE / AFTER — `anime_handler.go` PATCH

**BEFORE** (`handlePatchAnime`, ~40 lines): opens with `start := time.Now()`, wraps `w` in
`capturingResponseWriter`, snapshots `requestHeader`, and repeats at each of the **4** exit
points `mobilecapture.BuildPatchCaptureRecord(...) + record.WithTelemetry(buildTelemetry(...))
+ enqueuePatchCapture(...)`.

**AFTER** — transport-free; one `Enrich` line per outcome:

```go
func handlePatchAnime(w http.ResponseWriter, r *http.Request, config PatchAnimeConfig) {
    enr := mobilecapture.Enrich(r.Context())
    device, ok := authenticatePatchRequest(w, r, config.Authenticate)
    if !ok { return } // 401 body → transport-only terminal; middleware still records it
    enr.SetDevice(device)
    animeID, ok := patchAnimeID(w, r)
    if !ok { return }
    enr.SetAnimeID(animeID)
    patch, ok := requestAnimePatch(w, r)
    if !ok { enr.SetOutcome("malformed").SetErrorCode("invalid_request_body"); return }
    effectiveAnime, ok := queryPatchAnime(w, r, animeID, config)
    if !ok { enr.SetOutcome("rejected").SetErrorCode("anime_not_found"); return }
    patch = domain.ApplyCompletionStateMachine(patch, effectiveAnime.TotalCap)
    result, ok := applyAnimeRequestPatch(w, r, animeID, patch, config)
    if !ok {
        enr.SetOutcome("rejected").SetErrorCode(patchCaptureErrorCode(result, config.IsNotFound)).
            SetPayload(mobilecapture.PatchPayload(patch))
        if result.ConflictID != "" { enr.AddConflictID(result.ConflictID) }
        return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    enr.SetOutcome("accepted").SetPayload(mobilecapture.PatchPayload(patch))
}
```

`start`, the writer wrap, `requestHeader`, `buildTelemetry`, `enqueuePatchCapture`,
`BuildPatchCaptureRecord`, `WithTelemetry`, `responseStatus` all disappear from the handler.
`BuildPatchCaptureRecord`'s payload projection is retained as `mobilecapture.PatchPayload(patch)`
(pure map builder, reused by the middleware merge). `http_status` is no longer passed by the
handler — the middleware reads it from the writer.

### BEFORE / AFTER — `sync_handler.go`

Same shape: delete the `start`/`wrapper`/`requestHeader`/`captureWithTelemetry` preamble and
the 5 `BuildReconcileCaptureRecord(...)` call sites. Each exit becomes
`mobilecapture.Enrich(r.Context()).SetOutcome("rejected").SetErrorCode("apply_pending_failed").
SetPayload(mobilecapture.ReconcilePayload(req)).SetOperationRefs(operationRefsFromAppliedOperations(applied))`
and the success path adds `.AddChangelogIDs(changelogIDsFromChanges(changes)...)`.
`BuildReconcileCaptureRecord`'s payload/correlation projection is kept as
`mobilecapture.ReconcilePayload(req)` for reuse.

## File-Size Plan (Go + FE ≤ 500 effective lines)

| File | Action | Note |
|---|---|---|
| `internal/api/capture_middleware.go` | **Create** | Middleware + `capturingResponseWriter`(+Hijack) + `captureKind`; ~140 lines |
| `internal/api/middleware.go` | Modify | Remove `RequestLoggingMiddleware` + `http.request` log; `statusRecorder`/`levelForStatus` **deleted** (writer/Hijack move into `capture_middleware.go`) |
| `internal/api/router.go` | Modify | Wrap `h.mux` in `CaptureMiddleware` inside `NewHandler`; pass `config.Capture` |
| `internal/observability/mobilecapture/enrichment.go` | **Create** | `CaptureEnrichment`, ctx key, `Enrich`/`NewEnrichmentContext`, setters; ~120 lines |
| `internal/observability/mobilecapture/record_merge.go` | **Create** | `BuildTransportCaptureRecord(...)`, `MergeEnrichment(...)`, `PatchPayload`/`ReconcilePayload` (moved from `sanitizer.go`); ~110 lines |
| `internal/observability/mobilecapture/store.go` | Modify | Add `UpsertCapture`; route `InsertCapture` through the same prune helper (keep < 500) |
| `internal/observability/mobilecapture/queue.go` | Modify | `OnPersist` hook after successful upsert; `Store` interface → `UpsertCapture` |
| `internal/observability/mobilecapture/sanitizer.go` | Modify | Drop `BuildPatch/ReconcileCaptureRecord` (superseded); keep payload extractors |
| `internal/api/handlers/anime_handler.go` | Modify | Enrich-only; loses ~15 lines |
| `internal/api/handlers/sync_handler.go` | Modify | Enrich-only; loses ~20 lines |
| `internal/api/handlers/websocket_handler.go` | Modify | Inner returns `wsMessageOutcome`; add `captureWebSocketMessage` decorator |
| `internal/api/handlers/capture_response.go` | **Delete** | Writer/`buildTelemetry`/`responseStatus` folded into the middleware writer |
| `internal/realtime/hub.go` | Modify | `Capture` sink field; capture in Register/Unregister/Broadcast* (near 335 lines — if it crosses 500 effective, split the capture mapping into `hub_capture.go`) |
| `app.go` / `app_runtime_services.go` | Modify | Wire `QueueConfig.OnPersist` → `emitFn(ctx,"capture.transaction",row)`; pass `Capture` into `MemoryHubConfig` |
| `frontend/src/infrastructure/capture-runtime-source/**` | **Create** | `EventsOn("capture.transaction")` subscription mirroring `download-runtime-source` |
| `frontend/src/shared/store/transaction-store/**` | Modify | Add `upsertRows(rows)` reducer (transition-in-place by `requestId`, keep `selectedId`/`selectedDetail`) |
| `frontend/src/features/network/.../use-transaction-panel.ts` | Modify | Subscribe capture-runtime-source → `upsertRows`; wire `use-elapsed-clock` |
| `frontend/src/shared/hooks/use-elapsed-clock/**` | **Create** | Interval hook active only while ≥1 pending row; `elapsed = now - capturedAtMs` |

No file is projected over 500 effective lines; `hub.go` is the only watch item (split lever noted).

## TDD Ordering (tests-first, RED → GREEN)

1. `enrichment_test.go` — ctx round-trip, off-middleware `Enrich` returns a safe no-op holder, setters accumulate.
2. `record_merge_test.go` — transport facts + enrichment merge; missing enrichment ⇒ transport-only record; `PatchPayload`/`ReconcilePayload` parity with the retired builders.
3. `capture_middleware_test.go` — arrival(pending)+terminal(upsert) enqueued with one shared `request_id`; **panic** in handler ⇒ one transport-only terminal + re-panic; **`/ws` skipped**; `Hijack` still reachable (upgrade test green); non-2xx captures response body.
4. `store_test.go` — `UpsertCapture` inserts arrival then updates terminal on the same `request_id`, preserving `captured_at_ms`; lone terminal inserts.
5. `queue_test.go` — `OnPersist` fires once per persisted record, after the store write; non-blocking `TryEnqueue` unchanged.
6. `websocket_handler_test.go` — inner returns `wsMessageOutcome` (no enqueue); decorator emits arrival+terminal; parity of outcome/error_code with the committed 4-block behavior.
7. `hub_test.go` — Register/Unregister/Broadcast* emit `ws_connect`/`ws_disconnect`/`ws_broadcast` rows; nil sink ⇒ no-op; capture never blocks fan-out.
8. `app_*_test.go` — `OnPersist` wired to `emitFn("capture.transaction", CaptureRow)`; hub `Capture` wired.
9. FE `capture-runtime-source.test.ts` — subscription present/absent (degrade), maps event → `CaptureRow`.
10. FE `transaction-store.test.ts` — `upsertRows` transitions a pending row to terminal in place, preserves `selectedId`/`selectedDetail`, prepends unseen rows.
11. FE `use-elapsed-clock.test.ts` — ticks only while a pending row exists; stops when none; `elapsed = now - startedAt`.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Middleware writer hides `http.Hijacker` → WS upgrade 500 | Med | The `api` `capturingResponseWriter` implements `Hijack` (folds `statusRecorder`); `/ws` is skipped by capture but still passes through; existing upgrade test asserts it. |
| Enrichment lost on handler panic | Med | `defer` enqueues a transport-only terminal (status from writer or 500) then re-panics; non-blocking guarantee intact. |
| Event volume / arrival+terminal spam | Med | Single choke point at the drain; frontend `upsertRows` dedupes by `request_id`; FE batches applies per frame; emit rate bounded, queue stays drop-oldest non-blocking. |
| Behavior drift vs committed per-handler capture | Med | `PatchPayload`/`ReconcilePayload` reuse the old projections; parity asserted in handler/decorator tests; outcome/error_code semantics preserved via enrichment. |
| Full-traffic capture changes captured volume | Med | Intentional (replaces `http.request` log). Retention/prune already bounds rows; `/ws` excluded from HTTP capture; documented as expected expansion. |
| Pending rows never finalized (dropped conn) | Low | WS terminal on hub Unregister; a lone pending row is valid standalone state and the clock stops on next terminal/timeout. |
| Store UPSERT contention under load | Low | UPSERT is a single indexed PK write; queue serializes writes on one goroutine (no concurrent writers). |

## Drift (CLAUDE.md rule 2)

- `handlers/capture_response.go`'s `responseStatus` still carries an `httptest.ResponseRecorder`
  fallback "for any remaining unwrapped test path" — that path vanishes once the middleware owns
  the writer; the file is deleted, and any test relying on the recorder fallback must move to the
  middleware writer. Recorded here before deletion.
- `RequestLoggingMiddleware` currently emits the `http.request` observability line consumed by the
  Events view; removing it is an intended observability change (proposal Modified Capabilities), not
  silent drift — the capture middleware is its full-fidelity replacement. Announce in
  `docs/openapi.yaml`/observability docs per the API-consumer rule.
- Hub `Client` exposes only `ID()` (`deviceID-seq`), not a `DeviceIdentity`; hub capture rows carry
  `device_id` parsed from the client ID prefix and a blank `device_name`. Noted as a known fidelity
  gap; extending `Register` to accept a `DeviceIdentity` is deferred (out of scope).

## Rollback

Revert the commit to restore per-handler capture + the `http.request` log. Schema, MCP sidecar, and
the `TransactionPanel` read path are untouched (additive UPSERT + additive event + additive
`upsertRows`). Frontend live-merge is additive over the committed polling/read path.
