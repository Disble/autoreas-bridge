# Tasks: Capture Middleware + Real-Time Activity

Ordered, TDD-first (tests written/RED before implementation/GREEN). Each task
lists the spec requirement(s) it satisfies and its parallel/sequential lane.

Legend: **[P]** = can run in parallel with sibling `[P]` tasks in the same
group once its own prerequisites are met. **[S]** = strictly sequential
(depends on the immediately preceding task).

---

## Group 0 — Baseline safety net [S]

- [x] **0.1** Run full test suite + `go run ./tools/checkgofilesize` to capture
      a green baseline before touching capture wiring. No spec req (safety
      net only).

## Group 1 — ctx enrichment carrier (Design §Enrichment carrier) [S after 0.1]

- [x] **1.1** [TDD-RED] Write `internal/observability/mobilecapture/enrichment_test.go`:
      ctx round-trip via `NewEnrichmentContext`, off-middleware `Enrich(ctx)`
      returns a safe no-op holder (never nil), setters (`SetOutcome`,
      `SetDevice`, `SetAnimeID`, `SetErrorCode`, `SetPayload`,
      `AddConflictID`, `AddChangelogIDs`, `SetOperationRefs`) accumulate and
      chain.
      Satisfies: observability spec "Transport-Level Capture Middleware" §Handler
      enriches the transport capture.
- [x] **1.2** [TDD-GREEN] Implement `internal/observability/mobilecapture/enrichment.go`:
      `CaptureEnrichment` struct, private ctx key, `NewEnrichmentContext`,
      `Enrich`, chainable setters. Doc comments on every exported AND
      unexported helper (dlinter requireDoc). Keep `gocognit<=15`.
      Depends on: 1.1.

## Group 2 — record merge helpers (Design §Store writer / payload projections) [S after 1.2]

- [x] **2.1** [TDD-RED] Write `internal/observability/mobilecapture/record_merge_test.go`:
      transport facts + enrichment merge into one `CaptureRecord`; missing
      enrichment ⇒ transport-only record; `PatchPayload`/`ReconcilePayload`
      output parity vs. the retired `Build*CaptureRecord` projections (golden
      comparison using existing fixtures if available).
      Satisfies: observability spec "Semantic Behavior Parity Through Enrichment".
- [x] **2.2** [TDD-GREEN] Implement `internal/observability/mobilecapture/record_merge.go`:
      `BuildTransportCaptureRecord(...)`, `MergeEnrichment(...)`, move
      `PatchPayload`/`ReconcilePayload` here from `sanitizer.go`.
      Depends on: 2.1.
- [x] **2.3** [S] Trim `internal/observability/mobilecapture/sanitizer.go`: drop
      `BuildPatchCaptureRecord`/`BuildReconcileCaptureRecord` (superseded),
      keep payload extractors used by 2.2. Depends on: 2.2.
      Closed out in the Group 6 run: `BuildReconcileCaptureRecord`/`baseRecord`
      removed from `sanitizer.go` now that `websocket_handler.go` migrated to
      `captureWebSocketMessage`/`applyReconcileMessage` (no remaining
      callers, confirmed by repo-wide grep); the obsolete
      `TestReconcileChangelogIDCorrelations` test and its now-unused imports
      were removed with it (`sanitizer_test.go` deleted).

## Group 3 — Store UpsertCapture (Design §Pending → terminal write) [P with Group 4/5 once 2.2 lands]

- [x] **3.1** [TDD-RED] Write/extend `internal/observability/mobilecapture/store_test.go`:
      `UpsertCapture` inserts an arrival(pending) row then updates it to
      terminal on the same `request_id`, **preserving `captured_at_ms`**; a
      lone terminal (no prior arrival) inserts cleanly; assert
      `rows.Err()` is checked after any `Next()` loop touched by this change.
      Satisfies: activity-network-transactions spec "Pending Capture Row On
      Request Arrival" (both scenarios).
- [x] **3.2** [TDD-GREEN] Implement `UpsertCapture` in
      `internal/observability/mobilecapture/store.go`:
      `INSERT ... ON CONFLICT(request_id) DO UPDATE SET ...` excluding
      `captured_at_ms` from the update clause; route `InsertCapture` through
      the shared prune helper to keep the file under 500 effective lines.
      Depends on: 3.1.
- [x] **3.3** [TDD-RED→GREEN] Extend `internal/observability/mobilecapture/queue_test.go`
      then implement in `queue.go`: `QueueConfig.OnPersist func(CaptureRecord)`
      fires exactly once per persisted record, after the store write
      succeeds; `Store` interface changes to `UpsertCapture`; non-blocking
      `TryEnqueue` behavior unchanged (drop-oldest still holds).
      Satisfies: activity-network-transactions spec "Real-Time Push Of
      Capture Changes" (emit precondition); observability spec "Capture
      Survives Handler Panic Or Early Exit" (non-blocking clause).
      Depends on: 3.2.

## Group 4 — HTTP capture middleware (Design §Middleware placement / Capture writer) [S after Group 3, needs 2.2+3.2]

- [x] **4.1** [TDD-RED] Write `internal/api/capture_middleware_test.go`:
      - arrival(pending) + terminal(upsert) enqueued sharing one
        `request_id`.
      - handler panic ⇒ exactly one transport-only terminal row enqueued,
        then the panic re-propagates (server's own recovery unchanged).
      - `/ws` route is skipped by this middleware.
      - `Hijack` remains reachable through the wrapped writer (WS upgrade
        parity test stays green).
      - non-2xx responses capture the response body (bounded).
      Satisfies: observability spec "Transport-Level Capture Middleware" (all
      3 scenarios) + "Capture Survives Handler Panic Or Early Exit".
- [x] **4.2** [TDD-GREEN] Implement `internal/api/capture_middleware.go`:
      `CaptureMiddlewareDeps{Capture, Clock}`, `CaptureMiddleware(next, deps)`,
      `capturingResponseWriter` (status + bounded body + `Hijack`
      passthrough), `captureKind(method, route)` route table with a
      transport-generic default. Doc-comment every unexported func/type incl.
      test helpers. Keep file near the ~140-line design estimate.
      Depends on: 4.1.
- [x] **4.3** [S] Modify `internal/api/middleware.go`: remove
      `RequestLoggingMiddleware`, the `http.request` log line, `statusRecorder`,
      `levelForStatus` (folded into 4.2's writer). Update/extend
      `internal/api/middleware_test.go` (or nearest existing test) to assert
      the log line is gone.
      Satisfies: observability spec "Domain Runtime Events Are Observable"
      MODIFIED §HTTP request log line is no longer emitted.
      Depends on: 4.2.
      **Executed as delete, not modify**: `middleware.go`/`middleware_test.go`
      had nothing left once `RequestLoggingMiddleware`/`statusRecorder`/
      `levelForStatus` were removed (the writer/Hijack moved into
      `capture_middleware.go`), so both files were deleted outright;
      `server.go`'s `NewServer` no longer wraps the handler in any logging
      middleware (no log line can be emitted -- stronger than "asserting
      it's gone").
- [x] **4.4** [S] Modify `internal/api/router.go`: wrap `h.mux` in
      `CaptureMiddleware` inside `NewHandler`, threading `config.Capture`.
      Add/extend a router-level test asserting the middleware wraps `/api/*`
      but not `/ws`.
      Depends on: 4.3.

## Group 5 — Handler refactor to Enrich-only (Design §BEFORE/AFTER blocks) [S after Group 4]

- [x] **5.1** [TDD-RED→GREEN] `internal/api/handlers/anime_handler.go`: strip
      `start`/writer-wrap/`requestHeader`/`BuildPatchCaptureRecord`+enqueue at
      all 4 exit points of `handlePatchAnime`; replace with one
      `mobilecapture.Enrich(r.Context())` call per outcome branch (device,
      anime_id, outcome, error_code, payload, conflict id) per the design's
      AFTER snippet. Update `internal/api/handlers/anime_handler_test.go` +
      `anime_handler_helpers_test.go` first (RED) to assert enrichment calls
      replace the old capture-record assertions, keeping outcome/error_code
      parity with the pre-change behavior.
      Satisfies: observability spec "Handler enriches the transport capture";
      "Semantic Behavior Parity Through Enrichment".
- [x] **5.2** [TDD-RED→GREEN] `internal/api/handlers/sync_handler.go`: same
      shape — delete `start`/wrapper/`requestHeader`/`captureWithTelemetry`
      preamble and the 5 `BuildReconcileCaptureRecord` call sites; replace
      with `Enrich(...).SetOutcome(...).SetErrorCode(...).SetPayload(
      mobilecapture.ReconcilePayload(req)).SetOperationRefs(...)` and
      `.AddChangelogIDs(...)` on the success path. Update
      `sync_handler_test.go` + `sync_handler_helpers_test.go` first (RED).
      Satisfies: same as 5.1, scoped to reconcile.
- [x] **5.3** [S] Delete `internal/api/handlers/capture_response.go` (writer/
      `buildTelemetry`/`responseStatus` now folded into 4.2's middleware
      writer). Confirm no remaining references (grep) before deletion.
      Depends on: 5.1, 5.2.
- [x] **5.4** [S] Run `internal/api/handlers/common_outcome_test.go` and full
      handlers package tests to confirm parity assertions hold end-to-end.
      Depends on: 5.3.

## Group 6 — WebSocket capture adapter (Design §WS capture seam) [P with Group 4-5 once 2.2+3.2 land, but merges after 5.4 to avoid churn]

- [x] **6.1** [TDD-RED] Extend `internal/api/handlers/websocket_handler.go`'s
      test file (or `websocket_season_rating_test.go` sibling) first:
      `handleIncomingWebSocketMessage` returns a `wsMessageOutcome{Outcome,
      ErrorCode, Correlations, Request}` and performs **no enqueue**; a new
      `captureWebSocketMessage` decorator mints the request id, enqueues
      arrival, runs the inner handler, upserts terminal (transport
      `websocket`, kind `ws_reconcile`); assert outcome/error_code parity
      with the 4 previously-inline capture blocks; assert `season_rating`
      messages remain uncaptured per existing behavior.
      Satisfies: observability spec "Centralized WebSocket Message And Hub
      Capture" §Inbound message capture brackets the pump; "Semantic Behavior
      Parity Through Enrichment"; activity-network-transactions spec "Pending
      Capture Row On Request Arrival".
      **Executed shape**: `handleIncomingWebSocketMessage` keeps its existing
      signature/behavior as the dispatcher (decodes, routes season_rating and
      non-reconcile no-ops unchanged/uncaptured); the pure business logic
      moved into a new `applyReconcileMessage` returning `wsMessageOutcome{
      outcome, errorCode, correlations, err}`, wrapped by the
      `captureWebSocketMessage` decorator. `internal/api/websocket_test.go`'s
      4 accepted/rejected/response-body/no-capture WS tests were updated
      first (RED) to assert 2 captures (arrival `pending` + terminal) sharing
      one `request_id`, instead of the old single-capture assertion.
- [x] **6.2** [TDD-GREEN] Implement the `wsMessageOutcome` return type and
      `captureWebSocketMessage` decorator in `websocket_handler.go`; remove
      the 4 in-handler capture blocks so `handleIncomingWebSocketMessage`
      contains pure business logic only.
      Depends on: 6.1.

## Group 7 — Hub capture sink (Design §Hub capture sink) [P with Group 6, merges after]

- [x] **7.1** [TDD-RED] Write/extend `internal/realtime/hub_test.go`:
      `Register`/`Unregister`/`BroadcastAnimeChanged`/
      `BroadcastPreferencesChanged`/`BroadcastSeasonChanged` each emit a
      capture row (`ws_connect`/`ws_disconnect`/`ws_broadcast`,
      outcome=`opened`/`closed`/`pushed`) via `MemoryHubConfig.Capture`;
      `nil` sink is a no-op; capture never blocks fan-out (assert broadcast
      still completes if `Capture` is slow/dropping).
      Satisfies: observability spec "Centralized WebSocket Message And Hub
      Capture" §Hub captures connection lifecycle and outbound broadcasts;
      activity-network-transactions spec "Pending Capture Row On Request
      Arrival" (one-way broadcast shape).
- [x] **7.2** [TDD-GREEN] Implement in `internal/realtime/hub.go`: add
      `Capture mobilecapture.CaptureFunc` to `MemoryHubConfig`; capture calls
      at the 5 seams above using best-effort `TryEnqueue`. If `hub.go`
      crosses ~400/500 effective lines, split the capture mapping into a new
      `internal/realtime/hub_capture.go` (design's stated split lever).
      Depends on: 7.1.
      **Executed shape**: split into `internal/realtime/hub_capture.go`
      proactively (per the stated split lever) with `captureHubConnect`/
      `captureHubDisconnect`/`captureHubBroadcast`/`captureHubFrame`/
      `deviceIDFromClientID`; `captureHubFrame` dispatches the actual
      `capture(record)` call on its own goroutine (not a synchronous call)
      so even a pathologically slow/blocking `Capture` sink can never delay
      the hub's own register/unregister/broadcast fan-out goroutines --
      covered by `TestMemoryHubCaptureNeverBlocksBroadcastFanOut`. Anime
      broadcasts set the top-level `CaptureRecord.AnimeID` field (design.md's
      "correlations.anime_ids" has no matching `Correlations` field; the
      existing `AnimeID` field is the precise equivalent, documented here as
      a minor design-text/schema drift).

## Group 8 — App wiring: real-time emit (Design §Emit choke point) [S after Group 3 (3.3) + Group 6/7]

- [x] **8.1** [TDD-RED] Extend `app_startup_test.go` / add
      `app_runtime_services_test.go` coverage first: `QueueConfig.OnPersist`
      is wired to call `runtime.EventsEmit(ctx, "capture.transaction",
      CaptureRow)` exactly once per persisted record; `MemoryHubConfig.Capture`
      is wired to the same capture pipeline.
      Satisfies: activity-network-transactions spec "Real-Time Push Of
      Capture Changes" §In-flight request appears before completion; §Pending
      row transitions in place on completion.
      **Executed shape**: new `app_capture_realtime_test.go` (package
      `main`), not `app_runtime_services_test.go` (colocated with the
      wiring's implementation file, `app_startup_runtime.go`). Both new
      tests exercise the REAL default `newCaptureQueue`/`newRealtimeHub`
      closures end to end (real temp-file sqlite via `bridgeSync.OpenBridgeDB`,
      not a stubbed queue) so the `OnPersist`/`Capture` wiring itself is
      under test, not a hand-rolled substitute.
- [x] **8.2** [TDD-GREEN] Wire it in `app.go`/`app_runtime_services.go`/
      `app_startup_runtime.go`: `OnPersist` → `emitFn(ctx,
      "capture.transaction", row)`; pass `Capture` into `MemoryHubConfig`
      construction. English wire field names on the emitted payload.
      Depends on: 8.1, 6.2, 7.2, 3.3.
      **Executed shape**: `App.emitCaptureTransaction` (new method in
      `app_startup_runtime.go`, next to the existing `App.capture`) wired as
      `mobilecapture.QueueConfig.OnPersist` in `app_defaults.go`'s default
      `newCaptureQueue` closure; emits `a.emitFn(a.ctx, "capture.transaction",
      toCaptureRow(record))` reusing the already-committed `toCaptureRow`
      mapper (`app_captures.go`) for the wire-shaped `contracts.CaptureRow`
      (English camelCase JSON tags: `requestId`, `capturedAtMs`, `httpStatus`,
      ...). `realtime.MemoryHubConfig{Capture: a.capture}` wired in the
      default `newRealtimeHub` closure in the same file.

## Group 9 — Frontend real-time source [P internally once 8.2 lands; strict TDD-first, colocated]

- [x] **9.1** [TDD-RED] `frontend/src/infrastructure/capture-runtime-source/__tests__/*.test.ts`:
      subscription present/absent degrade behavior mirroring
      `download-runtime-source`; maps the `capture.transaction` event payload
      to a `CaptureRow`.
      Satisfies: activity-network-transactions spec "Real-Time Push Of
      Capture Changes"; non-functional constraint "Runtime event field names
      ... MUST use English wire naming".
- [x] **9.2** [TDD-GREEN] Implement `frontend/src/infrastructure/capture-runtime-source/`
      (`index.ts` + implementation + types, strict colocation) using
      `EventsOn("capture.transaction")` per the `createRuntimeSubscription`
      pattern. JSDoc on every exported helper.
      Depends on: 9.1.
- [x] **9.3** [P] [TDD-RED] `frontend/src/shared/store/transaction-store/__tests__/*.test.ts`:
      new `upsertRows(rows)` reducer transitions a pending row to terminal in
      place by `requestId`, preserves `selectedId`/`selectedDetail`, prepends
      unseen rows without disturbing existing order/selection.
      Satisfies: activity-network-transactions spec "Real-Time Push Of
      Capture Changes" §Pending row transitions in place on completion;
      "Transaction List View" MODIFIED §Live rows update without manual
      refresh.
- [x] **9.4** [TDD-GREEN] Implement `upsertRows` in
      `frontend/src/shared/store/transaction-store/`. Depends on: 9.3.
      **Executed shape**: also added `selectHasPendingTransactions(items)`
      as the store's "hasPending" selector (pure helper over `items`, not a
      new piece of stored state), consumed by `use-transaction-panel.ts`.
- [x] **9.5** [P] [TDD-RED] `frontend/src/shared/hooks/use-elapsed-clock/__tests__/*.test.ts`:
      500ms interval hook active only while ≥1 pending row exists;
      `elapsed = now - capturedAtMs`; stops ticking when no pending rows
      remain.
      Satisfies: activity-network-transactions spec "Live Elapsed Indicator
      For Pending Rows" (both scenarios).
- [x] **9.6** [TDD-GREEN] Implement `frontend/src/shared/hooks/use-elapsed-clock/`
      (strict hook anatomy: imports, signature, refs, state, effects,
      return). Depends on: 9.5.
      **Executed shape**: `useElapsedClock(hasPending: boolean): number`
      returns a ticking epoch-ms clock (500ms, `ELAPSED_CLOCK_TICK_MS`
      constant); callers derive `elapsed = now - row.capturedAtMs`.
      `hasPending` itself is computed by the caller via
      `selectHasPendingTransactions`, not owned by this hook.
- [x] **9.7** [S] Wire `use-transaction-panel.ts` (network feature) to
      subscribe to `capture-runtime-source` → `upsertRows`, and to
      `use-elapsed-clock` for the pending-row ticker. Update/extend its
      colocated hook test first (RED) if behavior changes are observable at
      that layer.
      Depends on: 9.2, 9.4, 9.6.
      **Executed shape**: `useTransactionPanel` gained a third
      `runtimeSource: CaptureRuntimeSource = captureRuntimeSource` param;
      one mount-time effect calls `runtimeSource.subscribeCaptureTransactions`
      and forwards each pushed row to the store's `upsertRows`. `rows` is
      now derived via `toTransactionRow(row, now)` where `now` comes from
      `useElapsedClock(hasPending)`, so a pending row's DURATION column
      ticks live instead of showing the empty-label dash; a terminal row's
      `durationMs` is unaffected. `TransactionPanel.tsx` and
      `TransactionPanelProps` gained the matching optional `runtimeSource`
      prop (defaulting to the shared singleton), mirroring the existing
      `source` prop shape. Scroll/selection preservation needs no extra
      code: `upsertRows` never touches `selectedId`/`selectedDetail`, and
      because updated rows keep their existing array index (only unseen
      rows are prepended) React reconciles by the table row's stable `id`
      key without remounting or reordering already-rendered rows, so the
      browser's native scroll position is undisturbed.

## Group 10 — Docs + learning log [S, last]

- [x] **10.1** Update `docs/openapi.yaml` (or the relevant observability docs)
      to announce: `http.request` log line removal, new
      `capture.transaction` runtime event (wire shape + English field
      names), WS-lifecycle capture now happening at the hub seam. Satisfies
      the project's "API consumers need doc announcements" convention.
- [x] **10.2** Append one line to `docs/learning-log.md` documenting the
      middleware-over-per-handler decision and the enrichment-ctx pattern
      (per project rule 15).
      Depends on: 10.1.

## Group 11 — Final verification (orchestrator-owned, not this executor)

- [x] **11.1** Full `go test ./...`, `go run ./tools/checkgofilesize`,
      `bun --cwd="frontend" run typecheck && lint && test`, Fallow audit for
      touched frontend paths, and a manual review-lens pass (per Agent Teams
      Lite trigger rules — this diff spans 2+ non-trivial files across
      transports, likely qualifies for full 4R given `internal/realtime`
      (broadcast fan-out) + `internal/api` (auth-adjacent request path) risk
      signals). MUST be run by the orchestrating agent per project rule 3,
      not delegated here.
      **CLOSED AT ARCHIVE (2026-08-30, SDD-65 Slice 0):** ticked on the evidence that this
      change's work is committed as `0c0957c` (2026-07-25), which means the repo-owned
      pre-commit gate ran and passed at that commit. Slice 0 did NOT re-run this gate and
      makes no claim about the Fallow audit or the manual review-lens pass; only the
      commit-time gate is evidenced. Ticked so the archived audit trail carries no stale
      unchecked box for work that shipped.

---

## Requirement Coverage Map

| Spec Requirement | Tasks |
|---|---|
| observability: Transport-Level Capture Middleware | 1.1-1.2, 2.1-2.2, 4.1-4.4, 5.1-5.2 |
| observability: Capture Survives Handler Panic Or Early Exit | 4.1-4.2, 3.3 |
| observability: Centralized WebSocket Message And Hub Capture | 6.1-6.2, 7.1-7.2 |
| observability: Semantic Behavior Parity Through Enrichment | 2.1, 5.1-5.2, 6.1 |
| observability: Domain Runtime Events Are Observable (MODIFIED, http.request removed) | 4.3 |
| activity-network-transactions: Pending Capture Row On Request Arrival | 3.1-3.2, 6.1, 7.1 |
| activity-network-transactions: Real-Time Push Of Capture Changes | 3.3, 8.1-8.2, 9.1-9.4 |
| activity-network-transactions: Live Elapsed Indicator For Pending Rows | 9.5-9.6 |
| activity-network-transactions: Transaction List View (MODIFIED) | 9.3-9.4, 9.7 |
| Non-Functional: read-only FE merge, non-blocking writes, English wire naming | 3.3, 7.1, 9.1, 8.2 |

## Parallelization Summary

- **Sequential backbone** (each depends on the prior landing): Group 0 → 1 →
  2 → 3 → 4 → 5 → (6 ∥ 7) → 8 → 9 → 10 → 11.
- **Parallel-safe pairs**: Group 6 (WS adapter) and Group 7 (hub sink) touch
  disjoint files (`websocket_handler.go` vs `hub.go`) and both only need
  Groups 2+3 done — they can run as two concurrent writer threads once Group
  5 merges (kept after 5 only to avoid churn on shared enrichment helpers
  mid-flight, not a hard dependency).
  Within Group 9, 9.1-9.2 (runtime source), 9.3-9.4 (store), and 9.5-9.6
  (elapsed clock) are three independent colocated modules and can run in
  parallel; 9.7 is the sequential integration point.
- **Strictly sequential**: Groups 0-5 (each layer's writer depends on the
  merge-helper/store/queue API the previous layer produced) and Group 8
  (app wiring needs both transports' capture calls in place) and Group 10-11.
