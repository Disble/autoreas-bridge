# Proposal: Observability Dashboard and Shared Logging

## Intent

Formalize bridge observability so important runtime events are visible both in the terminal and inside the Wails UI, using the existing `domain: message` style as the baseline.

## Scope

### In Scope
- Add `internal/logger/` with shared log contract, stdout output, and in-memory ring buffer.
- Inject the logger into anime, sync, realtime, and API startup/runtime paths.
- Expose `GetRecentLogs() []LogEntry` and a live frontend log feed.

### Out of Scope
- Persisting logs to SQLite or files.
- Log filtering, search, or external aggregation.

## Approach

Introduce a structured `LogEntry` model (`timestamp`, `domain`, `message`, optional level) and fan logs to terminal + memory. `App` will own the memory logger and expose recent entries through Wails while also pushing new entries to React via Wails runtime events.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/logger/` | New | Shared entries, ring buffer, stdout/fanout adapters |
| `app.go` | Modified | DI wiring, Wails binding, runtime event bridge |
| `internal/anime/*` | Modified | Replace warning-only logging with shared logger |
| `internal/sync/*` | Modified | Log reconcile/changelog events |
| `internal/realtime/*`, `internal/api/*` | Modified | Log websocket and server lifecycle/events |
| `frontend/src/*` | Modified | Add observability panel and live updates |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Event spam overwhelms UI | Medium | Use bounded ring buffer and append-only UI rendering |
| Early startup logs miss live push | Medium | Hydrate from `GetRecentLogs()` on mount |
| DI churn breaks tests | Medium | Add adapter helpers and update configs incrementally |

## Rollback Plan

Revert logger injection changes, remove the new Wails binding/panel, and fall back to current stdout-only behavior via existing `log.Printf`/`TraceSink` paths.

## Dependencies

- Existing Wails binding generation and runtime events support.
- Current synchronous event bus and DI wiring in `app.go`.

## Success Criteria

- [ ] Terminal logs use consistent `domain: message` formatting across target domains.
- [ ] `GetRecentLogs()` returns recent entries from an in-memory ring buffer.
- [ ] React shows a live log dashboard without restarting the app.
