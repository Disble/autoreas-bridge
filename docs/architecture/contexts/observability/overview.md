# Observability — overview

The observability context records what Bridge and its devices did, keeps each kind of evidence for as
long as it is worth keeping, and answers the Activity screen and the debugging AI from that record. It
reads and writes its own tables only: it changes no anime, device or download state, and it publishes
nothing on the event bus.

For a mobile report from arrival to display as a decision tree, read `workflow.md`. For why the layers
exist, what they cost and how the feed looks, read `docs/observability/` (start at its `README.md`), which
stays the reference for the design. ADR-028 records the retention decision and ADR-026 the report store.

Everything on this page was read from the code on 2026-11-06.

## Responsibility

- Owns: captured requests, runtime events, incidents, the hourly rollup, response versions, stored mobile
  reports, their retention, and the read models over all of them.
- Decides: what opens an incident (`incident`), what a failed sync means (`syncreading`), and how long a row
  lives (`retention`).
- Does not own: domain history (`activity_log` belongs to `internal/activity`, and Activity only reads it),
  device state (`last_seen_at_ms` belongs to `internal/sync`), the shared logger port (`internal/logger`), or
  the feed's presentation (`frontend/src/features/activity`).

## Package map

| Package | Role |
|---|---|
| `internal/observability/requestcapture` | Non-blocking queue and sanitized persistence of captured requests; the ledger upserts (rollup, response versions); the read-only database handle and capture reader |
| `internal/observability/eventlog` | The sink behind the shared logger: bounded queue, redacted and size-bounded metadata, `runtime_events` |
| `internal/observability/telemetry` | The kind-discriminated store of mobile reports, its registry (`cycle_report`, `episode_action`, `screen_stall`, `hourly_summary`, `runtime_transition`), `ReadReportFacts`, `ReadHourlySummary` and the report reader |
| `internal/observability/syncdiag` | The `cycle_report` wire contract and its closed vocabularies; `telemetry` registers its validator |
| `internal/observability/syncreading` | The reading of a failed sync. Pure: no database, no state, no clock |
| `internal/observability/incident` | The pure classifier (`ClassifyRequest`, `ClassifyEvent`, `ClassifyMobileReport`, `ManualPin`) and the `incidents` store |
| `internal/observability/retention` | `Sweep` and `RunLoop`: the 2-hour recorder, the 90-day ledger, the incident trim and the response-body strip |
| `internal/observability/activityread` | The read models: `Feed`, `Overview`, `Now`, `Incidents`, `IncidentDetail`, `History`, `Recorder`, `Runs`, `RunStory`, `SyncStarts`, `PhoneReport` and others. It only reads |
| `internal/observability/obserr` | The structured error envelope shared by the read tools |
| `internal/observability/dbstall` | The stall evidence file: `Write`, `ReadPending`, `Rotate`, and `Suspects`/`Header.Metadata`, which read a goroutine dump into the Activity record. Pure file and text work, no database |

Adapters and wiring outside the context:

| File | Holds |
|---|---|
| `internal/api/capture_middleware.go`, `internal/realtime/hub_capture.go` | Capture of HTTP requests and of WebSocket lifecycle and broadcasts |
| `internal/api/handlers/sync_diagnostics_handler.go` | `POST /api/sync/diagnostics` and the closed refusal vocabulary |
| `internal/api/server.go` | The start record: the `api.listening` row and `listeningMetadata` |
| `internal/desktop/app.go` | `App.shutdown` writes the clean close, `app.closed` |
| `internal/desktop/app_incidents.go` | The persist hooks, `recordMobileIncident` and the `waitedForBridge` gate |
| `internal/desktop/app_sync_diagnostics.go` | `ingestSyncDiagnostics`: store, event, incident |
| `internal/desktop/app_runtime_services.go` | `captureLastContacts`, the orphan capture sweep and `startRetentionSweepLoop` |
| `internal/api/abandoned_request.go` | `reportAbandonedRequests`: tells `Config.OnRequestAbandoned` the route of a request whose client gave up |
| `internal/desktop/app_db_stall.go` | The stall evidence: the pool probe, the dump, and its import at the next start |
| `internal/desktop/app_activity_feed.go`, `app_activity_read.go`, `app_activity_live.go`, `app_activity_pin.go` | The Wails bindings of Activity, the `activity.recorder` event and "pin this moment" |
| `internal/mcp/requestcapture`, `cmd/autoreas-request-mcp` | The MCP sidecar: 11 read-only tools over `activityread` on a read-only handle |

## Ports and adapters

The capture and event writers sit behind bounded queues, so a slow database never blocks a request. Each
queue has one drain goroutine and an `OnPersist` hook; the composition root uses it to stream the Live row
and to record incidents. The classifier and the reading are pure, so the composition root hands them
everything they need.

```mermaid
flowchart LR
    subgraph sources [Sources]
        mw[CaptureMiddleware and realtime hub]
        log[logger.Logger]
        diag[POST /api/sync/diagnostics]
    end
    subgraph write [Write side]
        cq[requestcapture.Queue]
        eq[eventlog.Sink and Queue]
        ts[telemetry.Store]
        is[incident.Store]
    end
    subgraph decide [Pure decisions]
        cls[incident classifier]
        rd[syncreading.Read]
    end
    subgraph root [internal/desktop composition root]
        hook[OnPersist hooks and recordMobileIncident]
    end
    db[(bridge.db)]
    subgraph read [Read side]
        ar[activityread.Reader]
    end
    mw --> cq --> db
    log --> eq --> db
    diag -- IngestTelemetryEventFunc --> ts --> db
    cq -- OnPersist --> hook
    eq -- OnPersist --> hook
    ts -- Stored --> hook
    hook --> cls
    hook --> rd
    hook --> is --> db
    sw[retention.Sweep] --> db
    db --> ar
    ar --> rd
    ar --> ui[Wails bindings, Activity feed]
    ar --> mcp[MCP sidecar, read-only handle]
```

| Port | Declared in | Adapter |
|---|---|---|
| `requestcapture.Upserter` | `requestcapture/queue.go` | `requestcapture.SQLiteStore` |
| `eventlog.Inserter` | `eventlog/queue.go` | `eventlog.SQLiteStore` |
| `telemetry.Kind` | `telemetry/kind.go` | `CycleReportKind`, `EpisodeActionKind`, `ScreenStallKind`, `HourlySummaryKind`, `RuntimeTransitionKind` |
| `handlers.IngestTelemetryEventFunc` | `internal/api/handlers/common.go` | `App.ingestSyncDiagnostics` |
| `logger.Logger` | `internal/logger` | The fanout logger, which feeds `eventlog.Sink` |

`internal/desktop/app_incidents.go` calls `activityread.Reader.SyncStarts` on the report's write path. It is
the one place a read model serves a write decision, so the read and the incident gate share one definition
of a start.

## Events

The context publishes nothing on the bus. A bus `Publish` does not reach Activity either: only a logger row
lands in `runtime_events` (`.claude/skills/activity-events/SKILL.md`). The rows this context relies on or
writes itself:

| Event type | Level | Written by | Meaning |
|---|---|---|---|
| `api.listening` | info | `internal/api/server.go` | One Bridge start. Metadata `addr`, and `lastContacts` when a device is active |
| `tracer.step` "tracer bullet ready" | info | `internal/tracerbullet/runner.go` | The startup marker MCP reads (`retention.StartupMarker`); Activity reads it as the boot of a run |
| `app.closed` | info | `internal/desktop/app.go` (`App.shutdown`) | One clean close, logged before the event queue stops so it is flushed. No metadata. A crash writes none |
| `sync.diagnostics_stored` | info | `internal/desktop/app_sync_diagnostics.go` | One report stored; Activity hides it because it restates the row |
| `api.last_contacts_unread` | warn | `internal/desktop/app_runtime_services.go` | The last contacts could not be read at start; readings go by start times alone |
| `incident.sync_reading_failed` | warn | `internal/desktop/app_incidents.go` | The starts or the device's first report could not be read for a failed sync report; it opens its incident |
| `incident.record_failed` | error | `internal/desktop/app_incidents.go` | An incident could not be stored. The event hook skips this type, so it cannot loop |
| `api.capture_swept` | warn | `internal/desktop/app_runtime_services.go` | Pending captures left by a previous process were swept. Metadata `swept` (the count) and `captures`, the newest 10 swept rows as `requestId`, `route`, `kind`, `capturedAtMs` and `clientRequestId` (mobile's `<cycleId>:<n>`, omitted when absent); `capturesOmitted` counts the older ones left out. A request the previous process never finished is named here, because retention usually deletes the row itself after 2 hours |
| `api.db_stalled` | error | `internal/desktop/app_db_stall.go` | A previous process found the bridge.db connection held (see Stall evidence). Written at the next start with the stall's own `occurred_at_ms`; `correlation_id` is the stall id in the file's header. Metadata `route`, `poolMaxOpen`, `poolInUse`, `poolIdle`, `poolWaitCount`, `poolWaitDurationMs`, `suspectsFound` and `suspects` (`goroutine`, `state`, `frames`, and `waitMinutes` when the runtime printed one), cut to fit 4 KB with `suspectsTruncated`. Opens an incident in the sync area |
| `api.db_stall_import_failed` | warn | `internal/desktop/app_db_stall.go` | A pending stall file could not be read or stored at start. An unreadable file is rotated; a failed store keeps it for the next start |
| `api.db_stall_write_failed` | error | `internal/desktop/app_db_stall.go` | The evidence file could not be written. The database is stuck, so only the logger's file and stdout sinks see it |

`activity.recorder` is a Wails event, not a row: it streams each persisted capture and event to the screen.

## Storage

| Table | Declared in | Kept |
|---|---|---|
| `request_captures` | `internal/sync/schema.go` | 2 hours, unless pinned by an incident, journal class (a write verb, or a reconcile that touched an anime) or WebSocket. Everything leaves at 90 days |
| `request_capture_metadata` | `internal/sync/schema.go` | Key and value rows of the capture schema; outside the sweep |
| `request_rollup_hourly` | `internal/sync/schema.go` | 90 days |
| `response_versions` | `internal/sync/schema.go` | 90 days after last seen |
| `runtime_events` | `eventlog/schema.go` | Noise (`NoiseEvent`) 2 hours unless pinned; the rest 90 days |
| `incidents` | `incident/schema.go` | 90 days, then the first 3 and latest 3 per fingerprint |
| `device_telemetry_events` | `telemetry/schema.go` | Outside the sweep. Row caps per kind, shared by all devices: `cycle_report` 5,000, `screen_stall` 5,000, `episode_action` 20,000, `hourly_summary` 2,160, `runtime_transition` 2,340 |
| `device_sync_diagnostics` | Retired (ADR-026) | Never created on a fresh install; on an existing one its rows stay, unread |

A reading has no storage: it is computed on each read. The start record is metadata on an existing row.

### Stall evidence

The pool has one connection (`SetMaxOpenConns(1)`), so one goroutine that keeps it leaves every request
waiting with no log line. The stall evidence names that goroutine while it still holds the connection, and
costs nothing while Bridge is healthy: no timer, no poller.

1. **Trigger.** `reportAbandonedRequests` sees a request (never `/ws`) whose context ended before its handler
   returned: the client gave up. It calls `App.onRequestAbandoned` on that request's goroutine.
2. **Probe.** One probe at a time asks the pool for the connection with a 1-second budget. A connection that
   comes back means the client simply left. A closed database (shutdown) is not a stall either: only a
   `context.DeadlineExceeded` is.
3. **Evidence.** The first failed probe of a process writes `logs/db-stall.log` beside bridge.db:
   one JSON header line (`id`, `occurredAtMs`, `route`, `pool`) and a `debug=2` goroutine dump. Later
   abandoned requests of that process do nothing. Only the real bootstrap sets the directory
   (`resolveStallLogDir`), so an App built on an injected test database keeps no evidence.
4. **Import.** At the next start, before the HTTP server listens, a pending file becomes one `api.db_stalled`
   row and its incident, written directly rather than through the event queue. The file is rotated only after
   the row is stored, Ollama-style: `db-stall.log` becomes `db-stall-1.log`, and the chain keeps 5. The stall id
   stops a second row when a rotation failed after the store.

| File | Kept |
|---|---|
| `logs/db-stall.log` | Until the next start imports it |
| `logs/db-stall-1.log` … `db-stall-5.log` | The 5 newest imported stalls; the 6th is deleted on rotation |

## Invariants

- **A report is data, a reading is interpretation.** A reading is never stored and never changes a report.
  Reports are stored once, as `payload_json`, re-serialized from validated values.
- **The classifier and the reading are pure.** `incident/trigger.go` and `syncreading/reading.go` touch no
  database, take no clock and hold no state.
- **One start definition for readings.** `syncStartSQL` in `activityread/sync_readings.go` serves both the
  incident gate and the feed. `syncreading.Read` is the only rule, and `Reader.FirstReports` its only answer
  for F, the device's first report after the start.
- **The grace period is mobile's retry.** A failure has three periods: Bridge off (T to N), grace period (N to
  N + `syncreading.GracePeriod`, 20 minutes, mobile's longest normal retry) and overdue. Where F falls decides
  the reading. `GracePeriod` changes only with mobile's retry interval.
- **The last contact is read before anyone can contact.** `captureLastContacts` runs before `startHTTPServer`,
  because the first contact overwrites the value.
- **Losing an incident is the worse error.** Any failure to read the starts or F lets the report open its
  incident. A failed reading never hides a failure.
- **An incident write never fails the write that fired it.** `recordIncident` logs and returns, under a 250 ms
  budget, because it runs on a drain goroutine or on the report's POST path.
- **A retry is free.** `UNIQUE(kind, event_id)` makes a duplicate a 204 with no row, event or incident.
- **Lines and counts agree.** `readFailedSyncs` is the one read behind feed lines and bucket counts.
- **The read side stays bounded.** Every `activityread` query has a time predicate on an indexed column, a key
  or a limit. Sync readings cap at 2,000 starts and 5,000 failed actions, and ask F with one indexed seek on
  `(device_id, reported_at_ms)` per device and start. A traffic hour's `hourly_summary` rows are matched by
  their unindexed `observed_at_ms` within the kind index, bounded by the kind's 2,160-row cap.
- **Only `api.listening` or the older listening row is a reading's start.** Metadata that cannot be decoded
  leaves the start valid with no last contacts.
- **A run ends at its close or at its last row.** `bridgeRuns` (`bridge_runs.go`) pairs each start with the
  close stored after the previous start. Without one, the run before ends at the last row stored before the
  start's boot marker, never at the starting run's own boot rows. Starts, closes and markers are read once per
  read; the last rows take one query of one indexed seek per unclosed run.
- **A tablet silence counts only time Bridge was on.** `tabletSilences` (`tablet_silence.go`) cuts each gap of
  60 minutes or more between a device's heard times by the runs, so it never spans Bridge off or an unknown
  Bridge state. It is computed on every read that includes Traffic outside the phone origin, from one window
  query over `device_telemetry_events` (bounded by the per-kind caps) plus the runs; nothing is stored, and
  lines and counts share it. Before a device's oldest retained `cycle_report` it is heard only by the hour of
  an `hourly_summary` with a `closed` attempt.

## Entry points

| Caller | Method | Trigger |
|---|---|---|
| `internal/api/router.go` | `syncDiagnostics.ServeHTTP` | A mobile report |
| `CaptureMiddleware`, `internal/realtime/hub.go` | `requestcapture.Queue.TryEnqueue` | Every HTTP request, WebSocket connect, disconnect and broadcast |
| `logger.Logger.Logf` | `eventlog.Sink.WriteEntry` | Every logged fact above the debug filter |
| `App.startRetentionSweepLoop` | `retention.Sweep`, `RunLoop` | Once after bootstrap, then every 5 minutes |
| `reportAbandonedRequests` | `App.onRequestAbandoned` | A client gave up on a request |
| `App.configureRuntimeServices` | `App.importStallEvidence` | Each start, before the HTTP server listens |
| `SearchActivityFeed`, `GetActivityOverview` | `Reader.Feed`, `Reader.Overview` | The Activity screen |
| `GetActivityEvent`, `GetActivityIncident`, `GetActivityRequest`, `GetActivityRunStory`, `GetActivityChangeContext`, `GetActivityPhoneReport` | The matching `Reader` method | Opening a feed line |
| `PinActivityMoment` | `incident.Store.Record` | "Pin this moment" |
| `ListDeviceSyncDiagnostics` | `telemetry.Reader` | No screen yet (`docs/observability/mobile-reports.md`) |
| `cmd/autoreas-request-mcp` | `internal/mcp/requestcapture` tools | `get_status`, `list_incidents`, `get_incident`, `get_request`, `search_history`, `list_runs`, `get_run_story`, `list_recorder`, `list_response_versions`, `get_hourly_totals`, `count_events`. The coverage of `get_incident` and `search_history` gives each report kind's range (`coverage.go`) |

## Readiness

Every Activity binding and `ListDeviceSyncDiagnostics` runs through the `observability` module handle
(`appModules.observability`, `internal/desktop/app_readiness.go`). `bindObservabilityModule`
(`app_activity_read.go`) binds the activity reader, the incident store, the request capture reader and the
sync diagnostics reader once `configureRuntimeServices` wired them; the module settles ready when the
runtime event log queue and both readers are wired. While it starts, a binding rejects with
`{"code":"unavailable","message":"observability is starting"}`; once it failed, with `failed_precondition`;
a failing read is `internal`. No binding answers an empty stand-in any more: `ListDeviceSyncDiagnostics`
returns `(DeviceSyncDiagnosticsResult, error)` and its envelope lost the `Degraded` flag (each report keeps
its own `Degraded`).

The Activity screen reads through `useBridgeQuery` with module `observability` (key factory `activityKeys`):
the overview (`use-activity-overview.ts`), the feed's first page (`use-activity-feed-pages.ts`) and every
drawer read by id (`useActivityRead`, `useDrawerFeedRead`); "Pin this moment" is a `useBridgeMutation`
(`use-activity-screen.ts`). So the screen shows its skeletons while the module starts and the surface
`Alert` once it failed, never an empty feed. The Wails adapters live in
`frontend/src/infrastructure/bridge-runtime-source/activity-source.helpers.ts` and
`activity-feed-source.helpers.ts`, built once in `bridge-runtime.constants.ts`.

## Known drift

- **Two definitions of a start.** MCP `get_status` reads the tracer row (`bridgeStartedAt`,
  `internal/mcp/requestcapture/tools.go`). The feed's System line reads `api.listening`, and readings read
  `api.listening` or the older listening row. The rows are written at different moments of one startup.
  `bridgeRuns` reads both: the listening row is the start, the tracer row the boot that bounds the run before.
- **A reading can age.** It depends on the retained starts. A report row can outlive its start, because reports
  sit on row caps and starts on the 90-day ledger. Such a report then has no reading and shows as a plain
  failure, although it opened no incident.
- **An incident and a reading can disagree.** Incidents opened before this reading existed, opened because
  the starts or F could not be read, stay listed while the feed reads those reports as Bridge was off. Reports
  ingested under the earlier 30-minute window, measured from the latest start, kept the gate's answer of that
  time: a report that read Bridge was off then and reads late now has no incident. The neutral
  line links to none of them (`attachIncidents`).
- **Failed Traffic lines are off by default.** Traffic starts off and the failure switch only narrows the
  selected types (`toFeedQuery`, `frontend/src/features/activity/feed/activity-feed-filters.helpers.ts`). So
  "Sync failed" and "Tablet came back late" stay hidden until Traffic is on; the Traffic chip counts them.
- **ADR-026 and JSON filters.** ADR-026 says a payload field becomes a projection when a read surface filters on
  it. `feedFailedReportSQL` and `readFailedSyncs` filter on `json_extract(payload_json, ...)` with no projection.
  `readFailedSyncs` narrows by the indexed `kind` and `reported_at_ms` first, and the 2026-11-07 copy held 101 matching
  rows. No decision records this yet.
- **Schema away from its owner.** The request tables are declared in `internal/sync/schema.go`, not in
  `requestcapture`.
- **Repeated constants.** `activityread` repeats `RecorderSpan`, `LedgerSpan` and the startup marker literal that
  `retention` declares.
- **The battery does not see mobile incidents.** The POC simulator triggers only on `device_sync_diagnostics`,
  so it cannot measure what a missing incident costs (`docs/observability/mobile-reports.md`).
- **Activity's live refresh is not an invalidation.** `use-activity-live-refresh.ts` subscribes to
  `activity.recorder` through the recorder port (`ActivityRecorderSource`,
  `shared/contracts/activity-recorder.types.ts`; adapter `infrastructure/activity-recorder-source/`,
  built once as `BRIDGE_ACTIVITY_RECORDER_SOURCE`) and refetches the overview and the first page after a
  1 s debounce. `BRIDGE_INVALIDATIONS` has no debounce, so moving it there would refetch on every
  recorder row. Older feed pages are read by the hook through the cursor, outside the query cache;
  `shared/query` has no infinite query. The subscription, and the run story's in
  `use-run-history-story.ts`, are sanctioned exceptions in `frontend/async-state-exceptions.json`, not
  baseline debt.
- **Downloads still reach the Activity port through the feature.** `features/download` reads a run story
  through `createActivitySource()` (`features/activity/activity-source/activity-source.helpers.ts`), which
  now returns the bridge runtime's adapter; the Downloads slice moves that call.
