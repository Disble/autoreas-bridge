## Exploration: sdd-17-observability

### Current State
`app.go` wires domains with constructor injection and exposes Wails bindings by adding public `App` methods to `Bind` in `main.go`. Logging is fragmented: `internal/anime/logger.go` only provides `WarningLogger` with `Warnf`, while `internal/tracerbullet.TraceSink` is a write-only `Record(message string)` sink used to print prefixed trace lines. The React frontend consumes generated Wails methods from `frontend/wailsjs/go/main/App` and currently does one-shot reads on mount; Wails runtime events exist (`frontend/wailsjs/runtime/runtime.d.ts`) but are not used. The event bus is synchronous and already fans `anime.changed` into sync and websocket flows, so observability can attach at domain edges without changing transport semantics.

### Affected Areas
- `app.go` — inject shared logger, memory buffer, and new Wails binding/event emission wiring.
- `main.go` — existing `Bind: []interface{}{app}` pattern remains the entry for new bindings.
- `internal/anime/logger.go` — current warning-only abstraction will be replaced or adapted.
- `internal/anime/writer.go` — log append failures and successful publish/self-echo actions.
- `internal/anime/watcher.go` — log debounce processing, parse warnings, retries, and emitted deltas.
- `internal/anime/startup_catchup.go` — log waiting/catch-up lifecycle and startup warnings.
- `internal/tracerbullet/*` — `TraceSink` can be adapted, but it lacks timestamps/history/query support.
- `internal/sync/service.go`, `internal/sync/changelog_recorder.go` — log reconcile triggers and changelog recording.
- `internal/realtime/hub.go`, `internal/api/handlers/websocket_handler.go` — log websocket registrations and forwarded change events.
- `internal/api/server.go`, `internal/api/router.go` — log HTTP startup and request-side failures worth surfacing.
- `frontend/src/App.tsx`, `frontend/src/components/*` — add dashboard log panel and live subscription/bootstrap logic.

### Approaches
1. **Extend tracerbullet sink** — turn `TraceSink.Record(string)` into the shared observability abstraction.
   - Pros: Reuses existing prefixed-output concept.
   - Cons: String-only API cannot represent timestamp/domain/level cleanly or back `GetRecentLogs()` without extra parallel types.
   - Effort: Medium

2. **New shared logger package with fanout** — add `internal/logger` with structured `LogEntry`, stdout sink, memory ring buffer, and optional Wails event bridge.
   - Pros: Matches DI style in `app.go`, keeps terminal prefix format, supports frontend bootstrap plus live updates, and can adapt tracer bullet instead of contorting it.
   - Cons: Touches several constructors/config structs.
   - Effort: Medium

### Recommendation
Use **Approach 2**. Keep `TraceSink` as a tiny compatibility adapter over the new logger rather than making it the core contract. Add a shared logger package that produces normalized `domain: message` terminal lines, stores recent entries in a bounded ring buffer, and emits Wails runtime events for live UI updates while `GetRecentLogs()` hydrates initial state.

### Risks
- Wails runtime events require `context.Context`; logs emitted before `App.startup()` cannot be pushed live and need buffer bootstrap coverage.
- Synchronous event-bus handlers mean logging must stay lightweight; memory writes must be lock-bounded and non-blocking.
- Replacing `WarningLogger` across anime code can create churn unless adapters preserve current test seams.

### Ready for Proposal
Yes — the codebase already shows the needed extension points: DI in `app.go`, public Wails bindings on `App`, available Wails events runtime helpers, and clear log-worthy boundaries in anime, sync, api, and websocket flows.
