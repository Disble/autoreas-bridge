# Proposal: Structured Logging & Rich Backend Instrumentation

## Intent

The SDD-17 observability baseline delivers flat `LogEntry{Timestamp, Domain, Level, Message}` — 4 string fields with zero structured metadata. Developers cannot correlate events across domains, measure operation timing, filter by entity, or distinguish event types. Terminal output lacks timestamps and levels. This change makes backend log data **rich and actionable** before any frontend improvements.

## Scope

### In Scope
- Extend `LogEntry` with `CorrelationID`, `EntityID`, `EventType`, `DurationMs`, `Metadata` fields
- Add `debug` log level
- Enrich `StdoutSink` format: `[timestamp] [LEVEL] [domain] message (key=val...)`
- Instrument all domains with structured data (timing, entity IDs, correlation IDs)
- Add HTTP request logging middleware (method, path, status, duration)
- Add event bus publish/subscribe metrics logging
- Increase ring buffer capacity to 500 (configurable)
- Ensure backward compatibility — existing frontend still works

### Out of Scope
- Frontend UI changes (SDD-21)
- Event flow visualization (SDD-22)
- Log persistence/export to disk
- System health metrics (memory, goroutines, uptime)

## Approach

Additive extension of `LogEntry` struct and logger API. New optional fields default to zero values. Domain instrumentation adds `time.Now()` bracketing around key operations. HTTP middleware wraps `chi` router. Event bus wraps `Publish`/`Subscribe` with timing + counting. `StdoutSink` reformats output with all available metadata.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/logger/logger.go` | Modified | Extended `LogEntry`, new `Debugf`, structured log methods |
| `internal/logger/stdout.go` | Modified | Rich formatted output |
| `internal/logger/mem.go` | Modified | Configurable capacity |
| `internal/anime/startup_catchup.go` | Modified | Add timing, correlation IDs, entity counts |
| `internal/anime/watcher.go` | Modified | Add timing, entity IDs per delta |
| `internal/anime/writer.go` | Modified | Add timing, entity IDs |
| `internal/sync/service.go` | Modified | Rich reconcile instrumentation |
| `internal/sync/changelog_recorder.go` | Modified | Counters, timing |
| `internal/realtime/hub.go` | Modified | Connection lifecycle, client counts |
| `internal/api/server.go` | Modified | Request logging middleware |
| `internal/events/bus.go` | Modified | Publish/subscribe metrics |
| `app.go` | Modified | Updated `GetRecentLogs` returns richer entries |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Memory bloat from Metadata maps | Low | Nil by default, only allocate when used |
| Frontend breaks with new LogEntry fields | Low | Fields are additive; Go JSON omits zero values |
| Timing instrumentation overhead | Very Low | `time.Now()` < 100ns; only on key operations |

## Rollback Plan

All changes are additive. Rollback = revert commit. No schema migrations, no data format changes. Frontend continues working with or without the new fields.

## Dependencies

- SDD-17 (observability baseline) — **ARCHIVED, already delivered**

## Success Criteria

- [ ] `LogEntry` has `CorrelationID`, `EntityID`, `EventType`, `DurationMs`, `Metadata` fields
- [ ] Terminal output shows `[timestamp] [LEVEL] [domain] message` format
- [ ] All domain log points include relevant entity IDs and timing where applicable
- [ ] HTTP requests are logged with method, path, status code, and duration
- [ ] Event bus publishes and subscriptions are logged with timing
- [ ] Ring buffer capacity is configurable (default 500)
- [ ] Existing frontend `ObservabilityPanel` still works without modification
- [ ] All existing tests pass, new structured logging is covered by tests
