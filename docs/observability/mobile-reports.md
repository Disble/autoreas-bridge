# Mobile reports

Bridge validates a mobile report, stores it and checks it for one thing: a failure. It does not compare
reports, summarise them or notice that they stopped arriving. This page records what happens to a report
from arrival to display, what the stored reports can and cannot tell, and what is still undecided.

Figures were measured on 2026-11-06 on the owner's database, read-only. Code is the runtime truth; if this
page disagrees with it, the code wins.

## From arrival to display

Mobile sends every report to `POST /api/sync/diagnostics`. Three kinds exist: `cycle_report`,
`episode_action` and `screen_stall`.

| Step | What happens | Owner |
|---|---|---|
| Identify | The device comes from the bearer token, the receipt time from Bridge's clock | `sync_diagnostics_handler.go` |
| Validate | Strict decode per kind, closed vocabularies, 8 KiB body limit. A bad report is refused | `telemetry/`, `syncdiag/` |
| Deduplicate | `UNIQUE(kind, event_id)`. A retry is answered 204 and writes no row, event or incident | `telemetry/store.go` |
| Check for failure | Reads outcome, phase, cause and stall duration. See the table below | `telemetry/report_facts.go`, `incident/trigger.go` |
| Count | The request joins the hourly rollup, like every request | request capture |

### What opens an incident

| Kind | Condition | Fingerprint parts |
|---|---|---|
| `cycle_report` | `previous_cycle.outcome` is `failed` | kind, cause |
| `episode_action` | `outcome` is `failed` | kind, phase, cause |
| `screen_stall` | `duration_ms` is at least 10,000 | kind, trigger |

An incident pins the window from 2 minutes before to 30 seconds after. Retention keeps the first 3 and the
latest 3 occurrences of a fingerprint.

### Where a report is shown

| Surface | Shows |
|---|---|
| Activity feed | Failed reports only, each linked to its incident. Failed reports also count in the Traffic buckets |
| Incident detail | Every report received inside the window, and the cause of the report that opened it |
| MCP `search_history` | Every stored report, with its outcome and the "arrived late" mark |

`ListDeviceSyncDiagnostics` reads the cycle fields, but no frontend screen calls it.

## What one report stores

| Record | Kept for | Why | Size |
|---|---|---|---|
| Request capture with its body | 90 days | `JournalCapture` selects by the POST verb, although a report changes no state | about 1 KB |
| Row in `device_telemetry_events` | Row cap, outside the 2 h / 90 d sweep | The report itself | about 340 B |
| `sync.diagnostics_stored` event | 90 days | Non-noise event; Activity hides it because it restates the row | about 225 B, calculated |

Row caps: `cycle_report` 5,000, `screen_stall` 5,000, `episode_action` 20,000. A cap of 5,000 covers 90 days
only up to about 55 reports a day.

Sizes come from the real `retention.Sweep` on a copy, using `episode_action` rows. `budgets.md` lists mobile
reports as "row caps, not replayed", so reports were never part of the retention simulation.

## What the stored reports can tell

None of this is computed today. Each figure was derived from data already stored.

### Episode actions

164 actions and 490 reports, from 2026-09-26 to 2026-11-06.

| Question | Answer |
|---|---|
| Did the local write work? | All 164 finished `committed` |
| How fast? | Tap to commit: 121 ms median, 367 ms at p90, 1,222 ms at most |
| Did sync work? | 162 reached a verdict: 64 `ok`, 98 `failed` |
| Was Bridge reachable? | Delivery delay separates the cases. See below |
| When do failures happen? | 83 of the 98 between 00:00 and 01:59 local time |

| Sync verdict | Delivered under 5 min | 5 to 60 min | 1 to 6 h | Over 6 h |
|---|---|---|---|---|
| `ok` | 64 | 0 | 0 | 0 |
| `failed` | 4 | 1 | 5 | 88 |

A `failed` report delivered hours later means no Bridge was reachable at that time, which is the expected
result of watching at night with the PC off. Only the 5 failures delivered within an hour are candidates for
a real failure. Bridge cannot tell them apart today: all retained incidents share the fingerprint
`mobile_failure|episode_action|sync|`, with an empty cause.

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
| Analysing or aggregating report content | Never discussed | No document found |
| Using `pending_ops_count`, `cursor`, `consecutive_unclosed_cycles` | Never discussed | No document found |
| Detecting that reports stopped | Never discussed | No document found |

`cycle_report` stopped on 2026-09-21 and nothing alarmed. Mobile later removed the JS cycle post-mortem
(`docs/mobile-diagnostic-telemetry.md` in `autoreas-mobile`, "Removed in convergent-sync T18").

## Reading a failed sync

Approved by the owner on 2026-11-06. Not built yet.

A report is data: it records what mobile saw. Bridge's reading of it is an interpretation. The two stay
separate: a reading never changes a stored report. Activity shows the reading, and each level goes one step
closer to the data.

| Level | Shows |
|---|---|
| Feed row | The reading only. "Bridge was off" is a neutral line per start ("3 changes waited for Bridge"), not a failure |
| Detail drawer | The reading and its evidence: last contact, Bridge start, arrival time |
| Technical view | The report exactly as mobile sent it, including its `failed` |

"Bridge was off" opens no incident and does not count as a failure. The other two readings do.

| Reading | Condition | Measured |
|---|---|---|
| Bridge was off | The failure falls after the last contact and before the next start, and the report arrives within 30 minutes of that start | 78 |
| The tablet came back late | Same, but the report arrives more than 30 minutes after that start | 3, all on 2026-11-06 |
| Real failure | Bridge was on: no start in between, or a contact after the failure | 1, on 2026-10-30 |

- **Last contact:** at start, Bridge copies each device's `last_seen_at_ms` into its startup record, before
  the first new contact overwrites it. This covers a power cut and needs no background process.
- **Measured figures:** they use start times only, because last contact is not recorded yet. They cover the
  82 failures with start data. Of 55 failures with hourly traffic data, 11 fall in an hour with traffic and
  cannot be decided.
- **Limit:** a Bridge that was on and idle looks the same as a Bridge that was off, and last contact falls
  short when the tablet had been silent for a while.
- **Scope:** `episode_action` only. A `cycle_report` carries no observed time, so it needs a decision first.

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
