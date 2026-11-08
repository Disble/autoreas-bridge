# Mobile reports

Bridge validates a mobile report, stores it and checks it for one thing: a failure. A failed sync also gets
a reading: what Bridge makes of that failure. Bridge does not otherwise compare reports, summarise them or
notice that they stopped arriving. This page records what happens to a report from arrival to display, what
the stored reports can and cannot tell, and what is still undecided. The same path as a decision tree is in
[the observability workflow](../architecture/contexts/observability/workflow.md).

Figures were measured on 2026-11-06 on the owner's database, read-only. Code is the runtime truth; if this
page disagrees with it, the code wins.

## From arrival to display

Mobile sends every report to `POST /api/sync/diagnostics`. Five kinds exist:

| Kind | One report is | Idempotency key | Observed time | Row cap |
|---|---|---|---|---|
| `cycle_report` | One sync cycle; `cycle_id` must be non-empty since 2026-11-07 | `cycle_id` | Receipt time only | 5,000 |
| `episode_action` | One step of an episode action | `observation_id` | `observed_at_ms` | 20,000 |
| `screen_stall` | One screen that took 2 s or more to paint | `observation_id` | `observed_at_ms` | 5,000 |
| `hourly_summary` | One closed hour of the tablet's sync attempts per trigger and outcome, plus process deaths | `observation_id` (install id + hour); the first write wins | `hour_start_ms` | 2,160 |
| `runtime_transition` | One real state change of the `main` or `sync` process, one of 14 agreed `subject` and `transition` pairs; `process` + `died` only for `sync` | `observation_id` | `observed_at_ms` | 2,340 |

The last two caps size the 50 new reports a day agreed with mobile for 90 days: 24 hourly summaries a day and
the remaining 26 for transitions. Their wire shapes are `SyncDiagnosticsHourlySummary` and
`SyncDiagnosticsRuntimeTransition` in `docs/openapi.yaml`. Since 2026-11-07 both are stored and logged like
any other kind, but neither opens an incident or shows in Activity yet.

| Step | What happens | Owner |
|---|---|---|
| Identify | The device comes from the bearer token, the receipt time from Bridge's clock | `sync_diagnostics_handler.go` |
| Validate | Strict decode per kind, closed vocabularies, 8 KiB body limit. A bad report is refused | `telemetry/`, `syncdiag/` |
| Deduplicate | `UNIQUE(kind, event_id)`. A retry is answered 204 and writes no row, event or incident | `telemetry/store.go` |
| Read a failed sync | A failed `episode_action` at phase `sync` that reads "Bridge was off" stops here, with no incident. See [Reading a failed sync](#reading-a-failed-sync) | `syncreading/`, `internal/desktop/app_incidents.go` |
| Check for failure | Reads outcome, phase, cause and stall duration. See the table below | `telemetry/report_facts.go`, `incident/trigger.go` |
| Count | The request joins the hourly rollup, like every request | request capture |

### What opens an incident

| Kind | Condition | Fingerprint parts |
|---|---|---|
| `cycle_report` | `previous_cycle.outcome` is `failed` | kind, cause |
| `episode_action` | `outcome` is `failed`, unless the report reads "Bridge was off" | kind, phase, cause |
| `screen_stall` | `duration_ms` is at least 10,000 | kind, trigger |

An incident pins the window from 2 minutes before to 30 seconds after. Retention keeps the first 3 and the
latest 3 occurrences of a fingerprint.

A report that reads "Bridge was off" pins no window. Its row and its request capture stay, as
[What one report stores](#what-one-report-stores) says, but the requests around it leave with the 2-hour
recorder. Incidents already stored do not change: older ones on those reports stay listed.

### Where a report is shown

| Surface | Shows |
|---|---|
| Activity feed | Failed reports only, plus every `runtime_transition`, under Traffic, which is off by default. A failed episode action shows the reading only: "Sync failed", "Tablet came back late", or one neutral line per start ("3 changes waited for Bridge"). The first two, and a failure with no reading, are failed lines linked to their incident and count as failed in the buckets. The neutral line is not a failure and has no incident link. A failed `cycle_report` reads "Sync cycle · failed while sending" from `previous_cycle.last_stage` (`attempt_started` "failed as it started", `claim_ops` "failed while claiming changes", `http` "failed while sending", `apply_write` "failed while applying"; any other stage "failed while" and the stage as stored; no stage "failed"). A `runtime_transition` reads its process and subject, then its transition as stored ("Sync process · died", "Main service · started"); a `died` transition (only ever `sync` + `process`) is a failed line, every other transition a neutral line the failure switch skips. A transition opens no incident. `hourly_summary` is never a line |
| Detail drawer | The reading and its evidence: for a late tablet the three periods (Bridge off, grace period, first report, overdue by), then last contact and arrival; for a real failure its failure, last contact, Bridge start and arrival times. A failed cycle with one of the four stages draws them in order, green before the stage, red at it ("Stopped here"), gray after it ("Not reached"); another stage shows "Stopped at" as stored. A transition shows its process, subject and change as stored and its recorded reason. Both then show when the report reached the bridge; a transition also shows when it happened on the phone, with the late chip (a cycle report stores no phone time) |
| Technical view | The stored report, read with `GetActivityPhoneReport` |
| Incident detail | Every report received inside the window except `hourly_summary`, and the cause of the report that opened it |
| MCP `search_history` | Every stored report except `hourly_summary`, raw: its outcome and the "arrived late" mark, no reading. A `runtime_transition` carries no outcome, so its stored process, subject and transition stand in ("sync process died") |
| MCP `get_status`, `list_incidents` | Incidents, so fewer mobile incidents than before: "Bridge was off" opens none |

`ListDeviceSyncDiagnostics` reads the cycle fields, but no frontend screen calls it.

## What one report stores

| Record | Kept for | Why | Size |
|---|---|---|---|
| Request capture with its body | 90 days | `JournalCapture` selects by the POST verb, although a report changes no state | about 1 KB |
| Row in `device_telemetry_events` | Row cap, outside the 2 h / 90 d sweep | The report itself | about 340 B |
| `sync.diagnostics_stored` event | 90 days | Non-noise event; Activity hides it because it restates the row | about 225 B, calculated |

Row caps: `cycle_report` 5,000, `screen_stall` 5,000, `episode_action` 20,000, `hourly_summary` 2,160,
`runtime_transition` 2,340. A cap of 5,000 covers 90 days only up to about 55 reports a day.

Sizes come from the real `retention.Sweep` on a copy, using `episode_action` rows. `budgets.md` lists mobile
reports as "row caps, not replayed", so reports were never part of the retention simulation.

## What the stored reports can tell

Apart from [Reading a failed sync](#reading-a-failed-sync), none of this is computed. Each figure was derived
from data already stored.

### Episode actions

164 actions and 490 reports, from 2026-09-26 to 2026-11-06.

| Question | Answer |
|---|---|
| Did the local write work? | All 164 finished `committed` |
| How fast? | Tap to commit: 121 ms median, 367 ms at p90, 1,222 ms at most |
| Did sync work? | 162 reached a verdict: 64 `ok`, 98 `failed` |
| Was Bridge reachable? | Delivery delay is a first hint, see below. Bridge's answer is [the reading](#reading-a-failed-sync) |
| When do failures happen? | 83 of the 98 between 00:00 and 01:59 local time |

| Sync verdict | Delivered under 5 min | 5 to 60 min | 1 to 6 h | Over 6 h |
|---|---|---|---|---|
| `ok` | 64 | 0 | 0 | 0 |
| `failed` | 4 | 1 | 5 | 88 |

A `failed` report delivered hours later usually means no Bridge was reachable at that time, which is the
expected result of watching at night with the PC off. The report alone cannot tell the cases apart: the
retained incidents measured on this date share the fingerprint `mobile_failure|episode_action|sync|`, with an
empty cause. The reading adds what the report lacks: the Bridge starts.

### Cycle reports

303 reports in the retired `device_sync_diagnostics` table, from 2026-09-08 to 2026-09-21, across 6 device
ids. `device_telemetry_events` holds none.

| Signal | Value |
|---|---|
| Previous cycle `never_closed` | 281 of 303, with a median of 601 s |
| `consecutive_unclosed_cycles` | Reached 53 |
| `pending_ops_count` | 2 in 154 reports |
| `recent_events` | 70 `write_failed` with cause `closed_resource` |

These are the signals behind battery issues B05, B31 and M08. People found them by reading the rows by hand.

## What the stored reports cannot tell

| Field or question | Why not |
|---|---|
| `cause`, `reason` on `episode_action` | Empty in all 490 reports |
| `degraded`, `previous_error_fingerprint`, `previous_native_errcode_byte`, `previous_error_stage` | Empty in all 303 cycle reports |
| `previous_error_name` | Present in 2 of 303 |
| `trigger_source`, `app_state` | One value in all 303: no comparison is possible. `app_state` is hardcoded by the client |
| `recent_events` | Empty in 265 of 303 |
| Which anime an episode action changed | The payload has no anime id |
| Exact link from a report to its applied change | The phone's `correlation_id` never matches `activity_log` (0 of 164). Time matches 161 of 164 within 15 s |
| Screen stall patterns | 2 rows, at 2.2 s and 4.4 s, both under the incident threshold |

`degraded` must also not be read as health: the client's size cap decides it, and an aggregate would mislead.
A row count is not a census, because the mobile outbox may evict an envelope.

## Why it is this way

The design documents define storage, validation and failure-to-incident only.

| Topic | Status | Source |
|---|---|---|
| Non-failed reports as feed lines | Decided against: they flood the feed | `odd/tasks/activity-redesign.md` |
| Indexes on report fields | Decided against until a read surface filters on them | ADR-026 |
| `degraded` as a health signal | Decided against | `openspec/changes/mobile-log-ingestion` |
| Analysing or aggregating report content, beyond the reading of a failed sync | Never discussed | No document found |
| Using `pending_ops_count`, `cursor`, `consecutive_unclosed_cycles` | Never discussed | No document found |
| Detecting that reports stopped | Never discussed | No document found |

`cycle_report` stopped on 2026-09-21 and nothing alarmed. Mobile later removed the JS cycle post-mortem
(`docs/mobile-diagnostic-telemetry.md` in `autoreas-mobile`, "Removed in convergent-sync T18").

## Reading a failed sync

Approved by the owner on 2026-11-06 and built in `internal/observability/syncreading`. The window was set on
2026-11-07 from mobile's retry interval, measured from the first start after the failure.

A report is data: it records what mobile saw. Bridge's reading of it is an interpretation. The two stay
separate: a reading is computed on each read, never stored, and never changes a stored report. Activity shows
the reading, and each level goes one step closer to the data.

| Level | Shows |
|---|---|
| Feed row | The reading only |
| Detail drawer | The reading and its evidence. A late tablet shows its periods in order: "Bridge off" (T to N), "Grace period" (N to N + 20 minutes), "First report" (F) and "Overdue by" (F minus the end of the grace period), then "Last contact" and "Arrived". A real failure measured no periods, because Bridge was on: it shows "Failed at", "Last contact", "Bridge started" and "Arrived". A "Bridge was off" group shows its grace period once, then each report's Bridge off period, first report, last contact and arrival. A time or period that does not exist reads "Not recorded". A group has no Requests tab |
| Technical view | The stored report, including its `failed`. It is the validated record, re-serialized by Bridge, not mobile's raw bytes |

### The rule

It applies to a failed `episode_action` at phase `sync` that has an observed time. For a failure at T on
device D, reported at R, the first row that matches decides:

| Test | Reading |
|---|---|
| T is older than the oldest retained start | No reading: the report shows as a plain failure |
| N, the first Bridge start after T, is missing or later than R | Real failure |
| N recorded D's last contact, and it is at or after T: Bridge heard D after the failure | Real failure |
| F, D's first report of any kind received at or after N, falls inside the grace period | Bridge was off |
| F falls after the grace period: the tablet was overdue | Tablet came back late |

When neither real-failure test matches, a failure has three periods:

| Period | From | Until | What it means |
|---|---|---|---|
| Bridge off | T, the failure | N, the first start after it | Bridge was not running |
| Grace period | N | N + 20 minutes (`GracePeriod`) | Bridge is on and the tablet has not had its first retry yet |
| Overdue | N + 20 minutes | F, the tablet's first report | The tablet stayed away past its retry. Evidence carries how long: F minus the end of the grace period |

The reading follows from where F falls. 20 minutes is mobile's longest normal retry: its WorkManager floor is
15 minutes, measured at up to 20m11s on the device. F decides, not R, because mobile sends 3 reports per cycle:
on a healthy tablet the later reports of a backlog arrive later, and they still waited for the same start. The
report itself is one of D's reports, so F is never later than R.

A start is one `api.listening` row, or one older `http server listening on ...` info row in domain `api`,
written before that line had an event type. When a report arrives, the running process counts as a start too,
because its own row may not be flushed yet.

### What each reading does

| Reading | Feed row | Failure? | Incident | Replay |
|---|---|---|---|---|
| Bridge was off | "3 changes waited for Bridge": one neutral line per start N, under Traffic. The failure switch skips it | No | None | 78 reports in 31 lines |
| Tablet came back late | "Tablet came back late" | Yes | Opens one | 6, after 3 starts |
| Real failure | "Sync failed" | Yes | Opens one | 1 |
| No reading | The report as a plain failure | Yes | Opens one | 16 |

The replay ran on a snapshot of the owner's database taken on 2026-11-07, over its 101 failed sync reports. The
late ones follow the starts of 2026-10-12 09:32 (reports 168 and 171), 2026-11-05 10:09 (report 483) and
2026-11-06 09:31 (reports 486, 489 and 492): each time the tablet sent nothing for 5 to 10 hours after the
start. In every Bridge was off line the first report came within 14 minutes of the start, and the longest
backlog, 15 reports after the 2026-10-21 start, drained over 31 minutes. The late tablets were overdue by 5 h 1
min (2026-10-12), 9 h 15 min (2026-11-05) and 6 h 50 min (2026-11-06). Report 434 is the real failure: no
start between its failure and its arrival.

### Details and limits

- **Last contact:** at start, before the HTTP server accepts anyone, Bridge copies each active device's
  `last_seen_at_ms` into the `lastContacts` metadata of the `api.listening` row. This covers a power cut and
  needs no background process and no new table. `last_seen_at_ms` is the last acknowledgement, pairing or
  revoke, not every contact: telemetry ingest does not write it.
- **Older reports:** a start without `lastContacts` is still a start, so older failures read by start times
  and the first report alone. So do long-silent devices, which are not active and so are not in the record.
- **Idle Bridge:** a Bridge that was on and idle looks the same as a Bridge that was off.
- **Clocks:** T comes from the tablet's clock, R and the starts from Bridge's.
- **Caps:** one start records at most 32 devices. A read covers the newest 2,000 starts and 5,000 failed
  actions; a report past the cap has no reading. F costs one indexed seek on `(device_id, reported_at_ms)`,
  asked only when N and the last contact leave the reading open, once per device and start in a read.
- **Feed range:** a neutral line sits at its start N, shows only when N is in the range, and always lists all
  its reports: the read runs from the range start to the newest report, because a backlog has no fixed end.
- **Failed reads:** if the starts or the device's reports cannot be read at ingest, the report opens its
  incident, because losing an incident is the worse error. The warning is `incident.sync_reading_failed`. If the last contacts cannot be
  read at start, the warning is `api.last_contacts_unread` and readings go by start times alone.
- **Scope:** `episode_action` only. A `cycle_report` carries no observed time, so it needs a decision first.
  MCP `search_history` stays raw.

## Open

| Item | State |
|---|---|
| Keep the capture of a delivered report for 2 h instead of 90 days | Not adopted. See the battery result below |
| Actions at 2026-09-26 00:42, 2026-09-26 01:48 and 2026-10-09 01:02 | Committed on the phone with no matching applied change. Unresolved |

### Battery result for the capture change

Run on 2026-11-06 in the POC simulator, on the 2026-10-12 restore point, with the journal pinned at 90 days.

| Scoring | Current design | Capture kept 2 h |
|---|---|---|
| Report copies count as write evidence (C3, C11) | 92 of 92 in all six scenarios | 68 to 89, depending on the scenario |
| Report copies do not count, because the row is the evidence (C9) | 92 of 92 | 92 of 92 in all six scenarios |

The nine catalog issues that mention reports or telemetry read the report table, a failed request or a
reconcile body. None read the capture of a delivered report. That reading is a judgment from what each issue
recorded, and the simulator does not model the row caps at 90 days.

### Battery result for the failed sync readings

Rerun on 2026-11-06 in the POC simulator, same restore point, journal pinned at 90 days: 92 of 92 in all six
scenarios. This run does not measure the readings' retention effect, because the simulator cannot see it:

- It pins mobile windows only from `device_sync_diagnostics` rows, and it found none that qualify in the
  restore point's span (2026-10-06 to 2026-10-12): 0 mobile windows.
- It loads `device_telemetry_events` as evidence but never as a trigger, so `episode_action` incidents are not
  modelled. Removing the mobile trigger changed nothing: the results of the four scenarios compared were
  byte-identical.

The effect is therefore known from the code, not from a measurement: a "Bridge was off" report pins no window.
The accepted cost is the surrounding requests after 2 hours.
