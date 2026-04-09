# Design: Observability Dashboard and Shared Logging

## Technical Approach

Add `internal/logger` as the shared observability package, then inject it through existing constructor/config seams in `app.go`. The backend will fan each `LogEntry` to stdout and a bounded in-memory logger. `App` will expose `GetRecentLogs()` for initial hydration and emit Wails runtime events for live updates.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Logging core | New `internal/logger` package | Reuse `anime.WarningLogger`; expand `tracerbullet.TraceSink` | Current abstractions are too narrow: one is warnings-only, the other is string-only. |
| UI transport | `GetRecentLogs()` + Wails `EventsEmit` push | Poll every 2s | Push is more immediate and cheaper inside a local desktop shell; bootstrap call covers pre-mount logs. |
| Tracer bullet compatibility | Adapt tracer bullet to the new logger | Keep separate sink forever | Preserves the proven prefix style while converging on one observability pipeline. |

## Data Flow

```text
Domain code ──log entry──> internal/logger fanout ──> StdoutLogger
       │                          │
       │                          ├──> MemLogger (ring buffer)
       │                          │         │
       │                          │         └── GetRecentLogs()
       │                          └──> App Wails bridge ──EventsEmit("observability.log", entry)
       │
React panel ──GetRecentLogs() bootstrap + EventsOn("observability.log")──> live feed
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/logger/logger.go` | Create | `LogEntry`, shared interface, fanout helpers |
| `internal/logger/stdout.go` | Create | Terminal formatter with `domain: message` output |
| `internal/logger/mem.go` | Create | Ring buffer storage for recent entries |
| `app.go` | Modify | Create shared logger, expose `GetRecentLogs`, emit Wails events |
| `internal/anime/logger.go` | Modify | Replace warning-only adapter with shared logger bridge |
| `internal/anime/writer.go` | Modify | Log append success/failure and publish actions |
| `internal/anime/watcher.go` | Modify | Log retries, warnings, and emitted deltas |
| `internal/anime/startup_catchup.go` | Modify | Log waiting/catch-up lifecycle |
| `internal/sync/service.go`, `internal/sync/changelog_recorder.go` | Modify | Log reconcile and recording events |
| `internal/api/server.go`, `internal/api/handlers/websocket_handler.go`, `internal/realtime/hub.go` | Modify | Log server start, ws register/unregister, forwards |
| `frontend/src/App.tsx`, `frontend/src/components/ObservabilityPanel.tsx` | Modify/Create | Dashboard panel and live subscription — **MUST use HeroUI v3 components** (`Card`, `CardBody`, `CardHeader`, `Chip`, `ScrollShadow`, `Divider`) from `@heroui/react` |

## Interfaces / Contracts

```go
type LogEntry struct {
    Timestamp string `json:"timestamp"`
    Domain    string `json:"domain"`
    Level     string `json:"level,omitempty"`
    Message    string `json:"message"`
}

type Logger interface {
    Infof(domain, format string, args ...any)
    Warnf(domain, format string, args ...any)
    Errorf(domain, format string, args ...any)
}
```

`MemLogger` also exposes `Recent() []LogEntry`. `App.GetRecentLogs()` returns that slice. `App` registers a callback/subscriber so each new entry can call `wruntime.EventsEmit(ctx, "observability.log", entry)` after startup.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `MemLogger` ring behavior and stdout formatting | New `internal/logger/*_test.go` |
| Unit | Domain logging adapters/configs | Extend anime/sync/realtime tests with recording logger fakes |
| Integration | `App` returns recent logs and emits Wails events | Expand `app_test.go` with stub emit function/logger |
| Frontend | Panel bootstrap + live append | React component tests around `GetRecentLogs` and `EventsOn` |

## Migration / Rollout

No migration required. This is runtime-only observability with bounded in-memory retention.

## Open Questions

- [ ] None blocking; retention size can be finalized during apply (for example 200–500 entries) without changing the spec.
