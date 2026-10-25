# Debug capture architecture

Status: **in progress**. Time retention is built: the sweeper in `internal/observability/retention`
replaced the row caps, and the readers are still the old ones. `rollout.md` tracks how the code gets
to the rest of this page.

## Sources

| Source | Today | Target |
|---|---|---|
| HTTP requests from the phone | `request_captures`, full bodies | recorder, incidents, write journal, rollup, response versions |
| WebSocket lifecycle and broadcasts | `request_captures` (`ws_*` kinds) | recorder, ledger |
| Bridge runtime events | `runtime_events` | recorder, ledger (non-noise events only); the Activity feed gives each event one section (Tasks, its download run, or System) |
| Mobile telemetry and sync diagnostics | `device_telemetry_events`, `device_sync_diagnostics` | unchanged tables; a failure report triggers an incident |
| Frontend and WebView errors | `runtime_events`, domain `frontend`, type `frontend.error` (P7, `ReportFrontendError`) | unchanged: error events, so they trigger incidents and appear as System lines |
| Domain history | `anime_write_operations`, `activity_log`, outbox | unchanged: months deep in every design |

## Layers

### 1. Recorder: 2 hours, everything

A time-bounded buffer of every request, response, event and WebSocket message, in full. Rows older than
2 hours are deleted unless an incident pinned them. It answers "what exactly happened just now?".

### 2. Incidents: 90 days, the moments that matter

A trigger pins the recorder window from **2 minutes before to 30 seconds after**:

- an HTTP 5xx, a 4xx or a rejected request
- a request slower than 1,000 ms
- a mobile failure report (sync cycle failed, write failed)
- an internal bridge error event from any domain (downloads, editor, schedule, season, sync), with its
  metadata. The simulator modelled this trigger from the start. The measured week had 0 error-level
  events, though, so real data has never exercised it. The 48 internal issues in the battery (no phone
  involved) pass through the 90-day event ledger, not through incidents. Rerun 2026-10-17: 92/92,
  13.00 MB, unchanged
- a manual "pin this moment" from the UI

Windows are grouped by fingerprint. Per fingerprint the first and the latest occurrences are kept, so a
problem that repeats every minute does not fill the disk. Slow requests in the first 2 minutes after
startup never count as new.
Once a pinned row is older than the recorder span, the sweep drops its stored response body when the row succeeded (2xx/3xx, at most 1,000 ms, not a trigger, not journal or WebSocket) and its response version holds that body; reading the request restores the body from the version (stage 6 measured the layer at 1.24 MB against 0.48 MB).

### 3. Ledger: 90 days, one line per fact

| Part | Keeps | Answers |
|---|---|---|
| Write journal | every state-changing request, with its body | "my change was not saved" |
| Event and WebSocket ledger | non-noise bridge events with their full `metadata_json`, WS connects, disconnects and broadcasts | "what was the bridge doing?" |
| Hourly rollup | per hour, route template, device and status class: count and max duration | "when did sync stop?" |
| Response versions | each distinct response body once, per route | "what did the bridge answer the phone?" |

Response versions exploit how repetitive polling is. In the measured week, reconcile answered 2,158 calls
with only 60 distinct bodies and status answered 1,998 calls with 30. Each response row keeps a reference
to its version instead of a copy.

Noise is excluded from the event ledger: per-poll tracer events other than the startup marker, and
"triggered reconcile request".

The Activity feed reads the event ledger by **ownership**, not by a domain exclusion list
(ADR-031). An event whose domain is `schedule` or `season` is a Task line. An event whose
`correlation_id` is a `download_runs.run_id` belongs to that run's story and is not a line of its own.
Every other event is **System**, the default section. System shows only the bridge start
(`api.listening`) and warnings and errors. It is grouped **on read**: one line per hour, domain,
event type, level and message, with its count and first and last time. On the live copy
(2026-10-02..24) that turns 116 per-event lines into 59. Storage is unchanged: events are still one row
each, and the grouping exists only in the read and in the counts, which use the same key.

## Prerequisites: record quality first

Retention can only keep what was written. These ship before any retention change:

| ID | Change | Why |
|---|---|---|
| P1 | store the error cause on every failure, not only "failed" | 20 of 92 issues needed the cause |
| P2 | millisecond timestamps everywhere | ordering events inside one second |
| P3 | one correlation id joins a request with everything it caused; mobile sends its own id as an optional header | joining the phone's and the bridge's view |
| P7 | frontend and WebView errors become bridge events | 11 issues were WebView failures nothing captured |

Also in the first stage: 4xx responses become incident triggers, and SQLite incremental vacuum returns
freed pages to the disk.

## Flow of one request

```
phone ──▶ HTTP handler ──▶ recorder row (full, with correlation id and ms time)
                             │
                             ├─ state-changing?  ──▶ write journal
                             ├─ response body    ──▶ response version (hash; stored once)
                             ├─ every request    ──▶ hourly rollup counter
                             └─ failure or slow? ──▶ incident: pin −2 min … +30 s
```

After 2 hours, the recorder row is deleted unless a pinned window holds it. The journal, the rollup, the
version and the incident live for 90 days.

## Readers

- **Activity UI**: Incidents, Live (the recorder), History (the ledger), and the feed
  (`activityread.Feed` / `Overview`), whose sections are Changes, Traffic, Downloads, Tasks, Edits and
  System. Every section is a filter toggle; none bypasses the filters. See `activity-ui.md` and
  `activity-ui-design-v2.md`.
- **MCP** (`cmd/autoreas-request-mcp`): the debugging AI reads incidents, the ledger and mobile reports.
  Every answer states which sources it covered and for what time range, so "no data" is never read as
  "nothing happened".

## What this design does not keep

When the bridge returns a wrong but **successful** response and nobody looks within 2 hours, the
surrounding requests in full are gone. The response version that was sent and when it was sent survive.
None of the 92 resolved issues needed more than that.
