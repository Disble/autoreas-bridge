# Proposal: MCP Runtime-Event Read Surface

## Intent

Give the read-only MCP sidecar a **separate runtime-event filter** so an agent can query the
Activity screen's **Runtime Events** tab the same way it already queries the Transactions tab,
and can join both by `correlation_id` to reconstruct one request end to end.

Today the sidecar (`internal/mcp/requestcapture`) reads only `request_captures`: HTTP/WS
transactions with route, status, outcome, and bodies. The runtime event log — every
`system` / `anime` / `bus` / `sync` / `websocket` / `api` entry that the UI's Runtime Events tab
shows — is invisible to it.

**The blocker is persistence, not tooling.** Runtime events are never written to disk. They live
exclusively in a bounded in-memory ring buffer, `logger.MemLogger`
(`internal/logger/mem.go`, default capacity 500, oldest-shifted-out on overflow), and reach the
frontend through the `App.GetRecentLogs()` Wails binding (`app_runtime.go:109`) plus a live Wails
runtime event. **The MCP sidecar is a separate OS process** (`cmd/autoreas-request-mcp`) that opens
the bridge SQLite file `mode=ro` with `PRAGMA query_only=ON`. It cannot address another process's
heap. So this change MUST first introduce a persisted runtime-event log in bridge SQLite; the MCP
read tools are the second half, not the whole of it.

A second consequence of the ring buffer is that today's events are lost on app restart and after
500 entries — exactly the window in which a user reports a bug. Persistence fixes the diagnostic
value of the events themselves, independent of MCP.

### Why now

Runtime events carry what the transaction rows do not: which domain handled the work, what the bus
published, why a sync decided what it decided, and the human-readable message at the moment of
failure. `correlation_id` is already present on both sides (`logger.LogEntry.CorrelationID` and
`request_captures.correlation_json`), so the join key exists — nothing consumes it across the two
logs yet. After this change, "show me everything that happened for this request" becomes one
correlation query instead of a screen-share.

### Success looks like

- One MCP call filters runtime events by domain, level, event type, correlation, entity, free text,
  and time window — without touching the request filters.
- Events survive an app restart and remain queryable within a bounded retention window.
- Given a `correlation_id` from a captured request, the agent can list the runtime events for it.
- The logger hot path measurably does not block on persistence, and the events table cannot grow
  without bound.

## Scope

### In Scope

- **Persisted runtime-event log** in bridge SQLite: a new table owned by the logging/observability
  domain, holding the `logger.LogEntry` shape (timestamp, domain, level, message, correlation id,
  entity id, event type, duration, metadata JSON).
- **Non-blocking write path** from the logger to that table: a bounded queue with drop-on-overflow
  and a single serialized drain, so no log call ever waits on SQLite.
- **Bounded retention**: a row cap plus periodic prune, sized for event volume rather than request
  volume.
- **A distinct event filter type** (not an overload of the request filters), exposing:
  `domain`, `level`, `event_type`, `correlation_id`, `entity_id`, free-text over
  message/domain/event type, and `start_ms` / `end_ms`.
- **New read-only MCP tools** over that filter: an event search and an event aggregation
  (counts by domain/level/event type plus bounded newest samples).
- **Correlation join**: resolving one `correlation_id` to both its captured requests and its runtime
  events, so the two logs are readable as one timeline.
- **Sidecar reader extension**: same read-only guarantees as today (`mode=ro`, `query_only`,
  `VerifyQueryOnly`), tolerant of a bridge that has not yet created the events table.
- **Docs**: MCP tool documentation updated with the new tools and the event filter; one
  `docs/learning-log.md` line appended at the end of the change.

### Out of Scope

- **`activity_log` (`internal/activity/schema.go`) is explicitly NOT this log.** It is a per-anime
  domain audit trail (`source`, `action_type`, `anime_id`, `before_json`, `after_json`). It is
  already persisted, it answers "what changed about this anime", and it is neither renamed,
  extended, read, nor conflated here. Anyone reading this later: the runtime event log is a
  different, new table.
- Any mutation, replay, log-injection, or level-reconfiguration capability from MCP.
- Replacing the in-memory `MemLogger` or the `GetRecentLogs()` binding. The ring buffer stays as the
  live UI feed; persistence is added alongside it.
- Changing the Runtime Events UI, its filters, or the frontend event store.
- Structured-logging redesign, log rotation to files, remote/OTel export, or a new log level scheme.
- Redesigning `request_captures` retention or its capture pipeline.
- Remote MCP transport.

## Capabilities

| Type | Capability | Summary |
|------|------------|---------|
| New | Persisted runtime-event log | Runtime events written to bridge SQLite, surviving restart within a retention window |
| New | Non-blocking event sink | Bounded queue + serialized drain; a log call never blocks on SQLite, and overflow drops rather than stalls |
| New | Event retention prune | Row cap with periodic prune, sized for event frequency |
| New | Event filter type | `domain`, `level`, `event_type`, `correlation_id`, `entity_id`, free text, `start_ms`/`end_ms` — distinct from request filters |
| New | Event search tool | Paginated newest-first runtime-event search over the event filter |
| New | Event summary tool | Counts grouped by domain/level/event type plus bounded newest samples |
| New | Correlation timeline | One `correlation_id` resolved across both captured requests and runtime events |
| Modified | Sidecar reader | Reads the events table read-only; degrades safely when it does not exist yet |

## Approach

**1. Persist first, read second.** The events table is prerequisite work; the MCP tools are
mechanical once rows exist. Sequence the slice so the write path lands and is proven before the read
surface is registered.

**2. Reuse the capture pipeline's proven shapes rather than inventing a second style.**

- Write path: mirror `internal/observability/requestcapture/queue.go` — `TryEnqueue` drops on
  overflow, one drain goroutine serializes inserts, stop transition synchronized with non-blocking
  sends. Rationale: the logger hot path fires on *every log line* (including a debug-level
  `bus.publish` per bus event), so a blocking or lock-contending sink would slow every domain in the
  app. Drop-on-overflow is the correct failure mode for observability: losing an event is strictly
  better than delaying the work that produced it.
- Retention: mirror `pruneOldestBeyondRetention` in
  `internal/observability/requestcapture/store.go` — prune every N successful writes rather than on
  a timer, so cost scales with traffic.
- Schema ownership: the owning domain declares its own DDL as `persistence.TableSchema`, exactly
  like `internal/activity/schema.go`'s `SchemaTables()`, and the bootstrap composition root only
  assembles descriptors. `tools/checkarchitecture` enforces this. **New DDL does not go into
  `internal/sync/schema.go`.**
- Reader: extend the existing `obs.ReadOnlyDB` / `obs.Reader` pair in
  `internal/observability/requestcapture` (or a sibling package for events), keeping
  `VerifyQueryOnly` as the read-only guard. The sidecar must tolerate a bridge DB without the events
  table — a sidecar newer than the bridge it points at must return an empty/unavailable result, not
  crash. (Learning log, 2026-07-25: sidecar/schema drift already broke MCP connections once; local
  MCP config now runs `go run ./cmd/autoreas-request-mcp` from source for this reason.)

**3. Sink attach point is a design-phase decision, deliberately left open here.** Two candidates,
both already in the codebase:

- `logger.FanoutLogger` (`internal/logger/fanout.go`) — add the persisting store as another
  `entrySink` target. Clean composition, but requires the store to satisfy `WriteEntry` and to be
  wired at logger construction.
- `MemLoggerConfig.OnWriteFn` (`internal/logger/mem.go:10`) — the hook already fires once per
  buffered entry. Minimal wiring, but couples persistence to the in-memory logger's lifetime and to
  whatever already owns that hook.

The design phase picks one and records the rationale. This proposal does not decide it.

**4. A distinct filter type, per the user's request.** Runtime events and captured requests share
almost no predicates: events have no route, status, outcome, kind, device, or HTTP verb; requests
have no domain or level. Folding events into `obs.SearchFilters` would produce a filter where most
fields are meaningless for half the rows. The event filter is its own type with its own WHERE
builder, and only `correlation_id`, `entity_id`, and the time window overlap.

**5. Tool-surface boundary must be amended explicitly.** `obs.ValidateToolName`
(`internal/observability/requestcapture/types.go:198`) allows exactly four names —
`search_requests`, `summary_requests`, `get_request_context`, `resolve_request_context` — and
`types_test.go`'s `TestValidateToolNameAcceptsExactlyFourBareNames` asserts that count as a
contract. The `observability` spec requires "exactly four named tools". Adding event tools raises
that bound, so the spec requirement and the validator change together, in the open, with the new
names named. No silent aliasing, matching the no-alias precedent set by
`capture-nomenclature-rename`.

## Affected Areas

| Area | Impact |
|------|--------|
| `internal/logger/{mem.go,fanout.go,logger.go}` | Sink attach point for the persisting store (one of the two candidates); `LogEntry` remains the record shape |
| `internal/logger/` or new sibling package | Event store, bounded queue, retention prune, `persistence.TableSchema` descriptor for the events table |
| Bootstrap composition root (`internal/sync/sqlite_bootstrap.go` and callers) | Assemble the new schema descriptor; wire the sink and its queue lifecycle (start/stop) |
| `internal/observability/requestcapture` (or new `internal/observability/eventlog`) | Read-only event reader, event filter type + WHERE builder, table-presence probe |
| `internal/mcp/requestcapture/{types,tools,reader,server}.go` | Event filter input types, new tool handlers, tool registration |
| `internal/observability/requestcapture/types.go` | `ValidateToolName` allowlist grows past four |
| `openspec/specs/observability/spec.md` | Tool-count requirement amended; event-log requirements added |
| `cmd/autoreas-request-mcp` | No new flags expected; verify startup schema tolerance |
| `docs/` | MCP tool documentation; `docs/learning-log.md` one-line append |
| Wails/frontend | **None.** `GetRecentLogs()` and the Runtime Events tab are untouched |

## Risks

| Risk | Mitigation |
|------|------------|
| **Event volume dwarfs request volume.** A debug-level `bus.publish` fires per bus event; request captures are per HTTP/WS message. Naive retention will bloat the DB and slow prune. | Size the row cap for event frequency, not request frequency; index the query paths the filter actually uses; prune every N writes, not per write. Measure real per-session event counts during apply and record the number. |
| **Open policy question: are debug-level events persisted at all?** Persisting every debug line is the largest single volume driver, and debug lines are also the most diagnostically valuable ones during a live bug hunt. Dropping them makes the log cheap but blunt. | Design phase decides and records: persist all levels with a tight cap, or persist `info`+ with a configurable opt-in for `debug`. Either way the choice is explicit, configurable, and stated in the spec — not an accident of implementation. |
| Logger hot path regression | Bounded non-blocking queue; a dedicated test proves a deliberately-blocking store never delays `WriteEntry`, mirroring the hub-sink precedent (learning log 2026-07-24). Never call SQLite on the logging goroutine. |
| Log messages may contain sensitive strings (paths, ids, payload fragments) | Persist the same content the in-memory buffer and Runtime Events tab already display — no new capture surface. If a metadata field is found to carry secrets, bound/redact it in the store, not in the reader. Explicitly: no auth tokens, no raw headers. |
| Sidecar reads a bridge DB predating the table | Table-presence probe at open; missing table yields an empty result with a clear reason, never a hard exit. Version tolerance follows the existing sidecar pattern. |
| Go file-size ceiling (warn 400 / hard fail above 500 effective lines) | Split store / queue / filters / reader / summary into separate files from the start, as `requestcapture` already does. `tools/checkgofilesize/baseline.yaml` stays empty (`files: []`). |
| Review-size creep (persistence + retention + reader + 2 tools + spec amendment in one slice) | Persistence and reader are genuinely coupled — the tools are unimplementable without rows. Keep the slice to *read* only: no UI change, no logger redesign, no export. If it still overruns, the correlation-timeline tool is the separable tail. |
| Correlation ids may be absent on many events | The correlation join is best-effort by design: events without a correlation id are still searchable by domain/level/time. The spec states that an empty correlation match is a valid empty result, not an error. |

## Rollback Plan

Every piece is additive and observability-only; canonical anime state is never touched.

1. **Read side**: unregister the new MCP tools and revert `ValidateToolName` to the four names. The
   sidecar returns to today's behavior immediately; the events table simply goes unread.
2. **Write side**: detach the sink (remove the fanout target / clear `OnWriteFn`). The logger returns
   to in-memory-only. The table remains, stops growing, and is pruned by nothing — harmless.
3. **Schema**: leave the table in place. It is `CREATE TABLE IF NOT EXISTS`, holds no canonical
   state, and no other read path depends on it. Dropping it is optional cleanup, not a rollback step.
4. **Frontend**: nothing to roll back — `GetRecentLogs()` and the Runtime Events tab were never
   changed, so the live UI feed is unaffected at every step.

Partial rollback is safe in either order: sink without tools is a silent recorder; tools without a
sink return empty results.

## Dependencies

- `capture-nomenclature-rename` (current `request_*` / `*_requests` nomenclature and the no-alias
  tool-name precedent).
- `mobile-request-mcp-debugging-improvements` (the sidecar's filter/summary/read-only patterns this
  change mirrors).
- `persistence.TableSchema` + `EnsureTableSchema` bootstrap, and the `tools/checkarchitecture`
  domain-owns-its-DDL rule.
- `internal/logger` `LogEntry` / `Logger` / `entrySink` contracts.
- Existing `request_captures` correlation columns for the join.

## Success Criteria

- [ ] Runtime events are persisted to bridge SQLite and remain queryable after an app restart.
- [ ] The logging hot path never blocks on persistence: a test with a deliberately-slow store proves
      `WriteEntry` returns without waiting, and overflow drops instead of stalling.
- [ ] The event table respects a bounded row cap; prune runs on write cadence, not per write.
- [ ] A single MCP call filters runtime events by domain, level, event type, correlation id, entity
      id, free text, and time window — through an event filter type distinct from the request filter.
- [ ] The event summary tool returns counts by domain/level/event type with bounded newest samples;
      an empty match returns a zeroed aggregation, never an error.
- [ ] Given a `correlation_id` taken from a captured request, the agent can list that request's
      runtime events and read both logs as one timeline.
- [ ] No MCP path mutates bridge state: `mode=ro` + `PRAGMA query_only=ON` + `VerifyQueryOnly` still
      hold for every new read.
- [ ] A sidecar pointed at a bridge DB without the events table returns an empty/unavailable result
      and does not exit.
- [ ] `activity_log` is unmodified and unread by this change.
- [ ] `GetRecentLogs()`, the Runtime Events tab, and its filters behave exactly as before.
- [ ] The debug-level persistence policy is decided, configurable, and stated in the spec.
- [ ] `ValidateToolName` and the `observability` spec's tool-count requirement are amended together,
      with the new tool names explicit and no aliases.
- [ ] MCP tool documentation updated; one `docs/learning-log.md` line appended.
- [ ] Every new Go file is at or under 500 effective lines and
      `tools/checkgofilesize/baseline.yaml` remains `files: []`.
