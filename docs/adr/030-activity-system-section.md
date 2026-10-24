# ADR-030: Every feed event has a section, with System as the fallback, grouped on read

- **Status**: Accepted.
- **Date**: 2026-10-24.
- **Related**: `internal/observability/activityread/feed_system.go` (ownership predicates, System lines),
  `internal/observability/activityread/feed_counts.go` (type counts and chart slots),
  `odd/tasks/activity-system-section.md` (specification and measurements).

## Context

The Activity feed showed runtime events through two predicates. Schedule and season events were Tasks. Every
other event that was a bridge start or a warning or error became a **bridge** line, except download events,
which were excluded by domain. Bridge lines ignored the type toggles: they were always shown so the feed marked
when the bridge ran. Each event was its own line, while traffic was already one line per hour
(`request_rollup_hourly`) and downloads one line per run.

That had three problems:

1. The exclusion list was by domain. A download warning outside any run was hidden; any other domain was shown
   even when it restated a run the run line already showed.
2. Lines the owner could not switch off. A burst of one frontend error filled the feed whatever the filters said.
3. One line per event. On the live database (2026-10-02 to 2026-10-24, read-only copy) the bridge predicate gave
   116 lines; most were the same message repeated within an hour.

## Decision

**Total classification.** Every runtime event belongs to exactly one section, decided in this order:

1. its domain is `schedule` or `season`: **Task**;
2. its `correlation_id` is a `download_runs.run_id`: the **download run**, not a line of its own;
3. otherwise: **System**, the default section.

The existing noise rules (`noiseFilter`, `restatingEventFilter`) still apply, and System shows only the bridge
start (`api.listening`) and warnings and errors. A false positive, an event that lands in System because no
other section claims it, is accepted: it is better than an event no section shows.

**System is a toggle.** No line bypasses the type filters. The wire type `bridge` became `system`; *Bridge*
stays the origin filter value.

**Grouped on read.** One System line per (hour, domain, event type, level, message), showing its count and its
first and last time. The level is in the key, so a group is failed (error) or slow (warning) as a whole; the
message is in the key because without it different frontend bugs of one event type would merge (48 lines
instead of 59 on the live copy). A group's incident is the newest `error_event|domain|event_type` incident of
its hour. Lines are never built from incidents, which keep only the first and latest occurrences of a
fingerprint.

**Counts use the same key.** The type counts and the chart slots count System groups with the predicate and
grouping key the lines read, so chips, chart and list agree. A test pages the feed and compares it with the
counts.

## Consequences

- Storage, write paths and retention are unchanged: no table, column or index was added.
- On the live copy, 116 per-event lines became 59 System lines.
- A System line is an event line standing for its group: its id is the group's newest event, so the drawer
  reads that event's recorded fields.
- A System line sits at its group's last time and pages by that time and the newest event id, which is unique
  across groups.
- Grouping uses UTC hours, as the traffic rollup does; in a time zone with a non-whole-hour offset a group can
  straddle local midnight in the chart's daily slots, as a traffic hour can.
- Download warnings and errors correlated to a run stay in that run's story; a download event outside any run is
  now a System line.
