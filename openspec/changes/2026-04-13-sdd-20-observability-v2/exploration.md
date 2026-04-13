# Exploration: Observability V2 — Rich Diagnostics & Developer Experience

## Current State

SDD-17 delivered the **baseline observability** layer: a shared `FanoutLogger` with a ring-buffer `MemLogger` (200 entries), a stdout sink, a Wails event bridge, and a frontend `ObservabilityPanel` that displays a flat chronological log feed.

### What Exists Today

| Layer | Component | Capabilities |
|-------|-----------|-------------|
| Backend | `internal/logger/logger.go` | `LogEntry{Timestamp, Domain, Level, Message}` — 4 string fields |
| Backend | `internal/logger/mem.go` | Ring buffer (200 cap), `OnWriteFn` callback, `Recent()` |
| Backend | `internal/logger/stdout.go` | Prints `domain: message` — no timestamp, no level |
| Backend | `internal/logger/fanout.go` | `FanoutLogger` fans to multiple `entrySink` targets |
| Bridge | `app.go` | `GetRecentLogs()`, `observability.log` Wails event push |
| Bridge | `app.go` | `GetBridgeStatus()`, `GetSQLiteStatus()`, `GetEffectiveAddress()` |
| Frontend | `ObservabilityPanel.tsx` | Scrollable log feed with timestamp/domain/level/message chips |
| Frontend | `BridgeStatusCard.tsx` | One-shot SQLite status read (ok/error) |
| Event Bus | `internal/events/` | 4 events: `anime.changed`, `anime.update_requested`, `anime.write.failed`, `sync.requested` |
| TracerBullet | `internal/tracerbullet/runner.go` | Simulated event flow → stdout + shared logger |

### Log Points Across Domains (147 grep matches)

- **anime domain**: startup catch-up lifecycle, parse warnings, file watcher errors, delta publish counts, append failures, write confirmations.
- **sync domain**: single reconcile trigger log, changelog insert failures/successes.
- **realtime domain**: client register/unregister, broadcast events.
- **api domain**: server listening address, WS registration errors/successes, incoming message failures.
- **tracerbullet**: simulated event flow trace.

## Key Gaps Identified

### 1. No Filtering or Search (Frontend)
The UI shows a flat chronological list. No domain filter, no level filter, no text search. With 200 entries, finding a specific event requires scrolling manually.

### 2. No Structured Metadata (Backend)
`LogEntry` is 4 string fields. There's no:
- Correlation ID to trace an event through the pipeline
- Entity IDs (anime ID, device ID, request ID)
- Durations / timing data
- Event type classification
- Structured key-value metadata

### 3. No Domain Health Dashboards (Frontend)
No aggregate counters: events processed, errors per domain, parse warning count, write success/failure ratio. The user has no way to quickly assess system health.

### 4. No Event Flow Visualization
Can't trace an anime change through `watcher → bus → sync → websocket`. The tracer bullet only runs at startup as a simulation; there's no runtime tracing.

### 5. No Persist/Export
Logs are memory-only (200 cap ring buffer), lost on restart. No way to export for post-mortem analysis.

### 6. No HTTP Request Logging
The API server only logs its startup address. No request/response logging, no timing, no status codes.

### 7. No Performance Data
No timings for parse, catch-up, reconcile, write operations. No visibility into how long operations take.

### 8. No Device/Connection Status
No visibility into paired devices, active WebSocket connections, reconnection events, or pairing history.

### 9. No Event Bus Instrumentation
The bus publishes and subscribes silently. No metrics on event throughput, handler latency, or error rates.

### 10. Terminal Output Missing Metadata
Stdout only prints `domain: message`. No timestamp, no level. Makes terminal debugging difficult.

### 11. Static Bridge Status
`BridgeStatusCard` does a one-shot read on mount. No live updates, only shows SQLite ok/error. No HTTP server status, no file watcher status.

### 12. No System Health Panel
No memory usage, goroutine count, uptime, file watcher active/detached status.

## Affected Areas

### Backend
- `internal/logger/logger.go` — `LogEntry` struct needs metadata fields
- `internal/logger/stdout.go` — Needs timestamp + level in output
- `internal/logger/mem.go` — Ring buffer capacity and optional filtering
- `internal/anime/startup_catchup.go` — Add timing, correlation IDs
- `internal/anime/watcher.go` — Add timing, entity IDs
- `internal/anime/writer.go` — Add timing, entity IDs
- `internal/sync/service.go` — Rich instrumentation
- `internal/sync/changelog_recorder.go` — Counters, timing
- `internal/realtime/hub.go` — Connection tracking, metrics
- `internal/api/server.go` — HTTP middleware for request logging
- `internal/api/handlers/` — Request ID propagation
- `internal/events/bus.go` — Event bus metrics
- `app.go` — New Wails bindings for metrics, health, filtering

### Frontend
- `frontend/src/features/dashboard/` — New health dashboard panels
- `ObservabilityPanel.tsx` — Filtering, search, level/domain chips
- `BridgeStatusCard.tsx` — Live updates, richer status
- New components: MetricsPanel, EventFlowPanel, ConnectionsPanel

## Approaches

### Approach A: "All-in-One Monolith Change" — Single SDD with all 12 gaps
- Pros: One complete delivery, no intermediate states
- Cons: MASSIVE scope, high risk, hard to verify, 2000+ lines of changes
- Effort: **Very High**
- **Verdict: REJECTED** — Too large for a single SDD change

### Approach B: "Phased Delivery" — Split into 3-4 focused SDD changes
- Pros: Incremental value, easier verification, lower risk per change
- Cons: More SDD overhead, need to plan dependencies
- Effort: **Medium per phase, High total**
- **Verdict: RECOMMENDED**

### Approach C: "Backend-Only First" — Only improve backend logging, defer frontend
- Pros: Fastest to ship, no frontend complexity
- Cons: User still sees the same poor UI, delayed value
- Effort: **Low**
- **Verdict: PARTIAL** — Good as Phase 1 but insufficient alone

## Recommended Phased Plan

### Phase 1: SDD-20 — Structured Logging & Rich Backend Instrumentation
**Focus:** Make the data RICH before making the UI pretty.

1. **Extend `LogEntry`** with optional structured metadata:
   - `CorrelationID string` — trace events through the pipeline
   - `EntityID string` — anime ID, device ID, etc.
   - `EventType string` — classify log entries (parse, watch, sync, api, bus)
   - `DurationMs *int64` — operation timing
   - `Metadata map[string]string` — extensible key-value pairs

2. **Enrich terminal output** (`stdout.go`):
   - Format: `[2026-04-13T10:30:00] [INFO] [anime] message (entity=abc123, dur=42ms)`

3. **Add `debug` level** for verbose operational data.

4. **Instrument all domains with structured data:**
   - Anime: parse timing, entity counts, catch-up duration, per-anime IDs
   - Sync: reconcile timing, conflict counts, changelog insert timing
   - Realtime: connection lifecycle, broadcast timing, client counts
   - API: request/response middleware (method, path, status, duration)
   - Event Bus: publish/subscribe metrics, handler latency

5. **Increase ring buffer** to 500 entries (configurable).

6. **Backward-compatible:** Frontend still works with new `LogEntry` (extra fields are additive).

**Effort: Medium** | **Risk: Low** (additive, no breaking changes)

### Phase 2: SDD-21 — Observability Dashboard V2 (Frontend)
**Focus:** Unlock the rich data with proper UI.

1. **Log Viewer with Filters:**
   - Domain filter chips (anime, sync, realtime, api, bus)
   - Level filter (debug, info, warn, error)
   - Free text search
   - Correlation ID grouping (click to see related entries)

2. **System Health Panel:**
   - Live bridge status (SQLite, HTTP, file watcher)
   - Uptime counter
   - Active WebSocket connections count
   - Last parse timestamp, last sync timestamp

3. **Domain Metrics Cards:**
   - Events processed per domain (counters)
   - Error rate per domain
   - Parse warnings count
   - Write success/failure ratio

4. **New Wails bindings** for metrics and health queries.

**Effort: Medium-High** | **Risk: Medium** (frontend complexity, HeroUI components)

### Phase 3: SDD-22 — Event Flow Tracing & Export (Advanced)
**Focus:** Power-user diagnostics.

1. **Event flow timeline:** Trace an anime change through watcher → bus → sync → websocket using correlation IDs from Phase 1.
2. **Log export:** Download filtered logs as JSON/CSV for post-mortem analysis.
3. **Connection status panel:** Paired devices, reconnection history, last seen.
4. **Performance flame chart** (stretch goal): Visual timing breakdown of operations.

**Effort: High** | **Risk: Medium** (depends on Phase 1 & 2 foundations)

## Risks

1. **`LogEntry` expansion bloats memory** — Each entry gets heavier. Mitigation: keep Metadata map nil by default, only allocate when needed.
2. **Timing instrumentation adds latency** — `time.Now()` calls are cheap (<100ns) but should be opt-in for hot paths. Mitigation: only time operations that matter (parse, write, sync), not every log call.
3. **Frontend complexity explosion** — Dashboard v2 with filters + metrics + health = significant UI work. Mitigation: Phase 2 is a separate SDD, use HeroUI primitives to keep it simple.
4. **Backward compatibility** — Existing log consumers (frontend, tracer bullet) must still work. Mitigation: new fields are additive; `CorrelationID: ""` and `Metadata: nil` are zero-value safe.
5. **Correlation ID propagation complexity** — Need a way to thread IDs through the event bus. Mitigation: Add optional `CorrelationID` field to event payloads in Phase 1.

## Recommendation

**Start with Phase 1 (SDD-20)** — Structured Logging & Rich Backend Instrumentation.

This is the foundation everything else depends on. Without rich data, even the best frontend UI would still show poor information. The current `LogEntry{Timestamp, Domain, Level, Message}` structure is the bottleneck.

Phase 1 is:
- **Additive** — no breaking changes to existing consumers
- **Backend-focused** — lower risk than frontend changes
- **Immediately valuable** — even terminal output improves dramatically
- **Prerequisite** for Phase 2 and Phase 3

After Phase 1 lands, the user will already see richer terminal output and the existing ObservabilityPanel will display more useful entries (even without filters). Phase 2 then unlocks the full potential.

## Ready for Proposal

**Yes** — The exploration is complete. The recommended path is to create a proposal for SDD-20 (Structured Logging & Rich Backend Instrumentation) as the first phase. Phases 2 and 3 will be separate SDD changes that build on top.
