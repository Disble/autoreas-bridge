---
name: activity-events
description: "Trigger: show an event in Activity, log a backend fact, runtime_events, Where filter, request MCP can't see it. Make a backend fact visible to Activity and the MCP."
license: Apache-2.0
metadata:
  author: autoreas-bridge
  version: "1.1.0"
  scope: project
---

# Activity Events

## Activation Contract

Load before making a backend fact visible in Activity or to `autoreas-request-mcp`, or when an event "happens but nobody sees it".

## Hard Rules

- A bus `Publish` reaches NEITHER Activity NOR the MCP. Only a `logger.Logf` row lands in `runtime_events`; the instrumented bus writes a `bus.publish` row at debug, dropped by default.
- Inject the shared `logger.Logger` port as a required dependency (like `download.ServiceDeps.Logger`). No nil-check fallback; the composition root passes `a.sharedLogger`. An `App` method in `internal/desktop` IS the composition root: it logs through `a.sharedLogger` directly, nil-guarded like every lazily wired collaborator (`recordDesktopAnimeAction`).
- A Wails binding that turns a Go error into a result outcome (error as value) swallows the failure: nothing reaches `runtime_events` unless that conversion logs it. Log at the single conversion point, one helper per binding family (`editorWriteFailure` in `app_runtime_editor.go`), at error level so it opens an incident.
- `EventType` reuses the bus event name when one exists (`download` passes `events.EventName*`); otherwise a string literal `domain.verb` (`internal/logger/event_type_test.go`). Never two names for one fact.
- Level is behaviour: debug is dropped, warn makes a recovered run only with a `CorrelationID`, error opens an incident (`error_event|domain|type`).
- Failures carry their cause (P1); never secrets or cookie values in message or metadata.
- One fact per metadata key, camelCase (`siteHost`, `hoster`), so it can be filtered; never a combined string like `"jkanime.org/Mediafire"`. Omit an unknown value instead of writing `""`.
- Tighten the feature's existing tests; add a test only when none can carry the rule.

## Decision Gates

| Need | Touch |
|------|-------|
| Domain already filterable? | Read `activityread.scopeOf` and `areaOf` FIRST: `anime` already maps to Where `editor` and the incident area "the editor". Reuse an existing domain and skip the Where/MCP/doc row below |
| Filterable by Where (UI or MCP) | `activityread.scopeOf` + `Where` const, MCP `jsonschema` text in `internal/mcp/requestcapture/types.go` (WhereInput, HistoryInput), `docs/observability/activity-ui.md`, `docs/openapi.yaml` MCP note |
| A line in the Activity feed | ownership by domain (`feed_system.go`): `schedule`/`season` is a Task line at any level; correlated to a `download_runs.run_id` is that run's story; anything else is System, which drops info. The screen filters by feed type (`activity-feed.constants.ts`) |
| Readable incident title | `areaOf` in `activityread/incidents.go` |
| Grouped into a run | set `CorrelationID`; only API requests carry one in context (`internal/correlation`) |
| Hidden unexpectedly | `noiseFilter` (activityread.go), `restatingEventFilter` (history.go) |
| Producer is shared by several features (the `schedule` scheduler also runs Season) | the producer reports facts through a hook; the composition root names and logs them (`internal/desktop/app_download_scheduler.go`) |
| Constructor gains the logger | update `tools/checkarchitecture` literals that spell that constructor; end them at the argument they guard (`jkanime.New(nil,`) |

## Execution Steps

1. Map the producer, its bus event (if any) and its existing tests. To prove a fact is NOT logged today, query `runtime_events` read-only (`?mode=ro`) by `entity_id`/`level` over the incident window: an empty MCP answer only means nothing inside its coverage range.
2. RED: tighten the producer test with `logger.NewMemLogger` and pin `level domain eventType duration metadata`, not prose. In `internal/desktop` tests, attach it as `app.sharedLogger = sharedlogger.NewFanoutLogger(memLogger)` and read `memLogger.Recent()`; assert the success path writes no row too.
3. Add the logger port, write the row, wire `a.sharedLogger`.
4. Add the Where scope row to `TestWhereFilterNarrowsHistory` (and Incidents only if the fact can be an error).
5. Prove each guard by removing it once; run `go test ./... -count=1 -cover -p 4 -parallel 4`, `go run ./tools/checkarchitecture`, `scripts/lint.ps1 -Profile all`.

## Output Contract

Report the domain, EventType, level, metadata keys, Where value, and the tests tightened.

## References

- `docs/observability/architecture.md` — sources, layers, P1–P7.
- `docs/adr/030-provider-egress-clearance.md` — decision 6, a worked example.
