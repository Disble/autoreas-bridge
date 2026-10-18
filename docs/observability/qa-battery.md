# QA battery: 92 resolved issues

The battery asks one question of a retention design: **when this bug was investigated, was its evidence
still on disk?** It replays every issue the project has resolved against each candidate design.

## The catalog

`data/resolved-issues.json` holds 92 issues: 55 from the docs and commits, 52 from Engram, merged and
deduplicated. 44 of them involve the phone. Each issue records:

| Field | Meaning |
|---|---|
| `needs` | the evidence classes the diagnosis read (`evidence-classes.md`) |
| `detection_delay` | `session`, `days`, `weeks` or `unknown`: how late someone looked |
| `recurrence` | `reproducible` (63), `recurring` (16) or `rare` (13) |
| `triggered` | the bug produced a failed request, so an incident trigger would have fired (10) |
| `routes` | optional: narrows body evidence to the routes the diagnosis read |
| `confidence` | how sure the classification is, from what the source wrote |

## Scenarios

Each design is scored in six scenarios: two readings times three assumptions.

- **Strict**: each issue is checked at the upper bound of its delay (session 1 h, days 7 d, weeks 89 d).
- **Realistic**: recurrence earns credit. A reproducible bug is investigated with fresh evidence, and a
  recurring one with its next occurrence.
- 49 issues have no recorded delay. Each run assumes they were found in the same session, after days, or
  after weeks.

An issue counts as resolvable when at least 95% of every class it needs is still held.

## Results

| Design | Size | Strict, weeks | Strict, days | Realistic, session |
|---|---|---|---|---|
| Today (row caps) | 15.1 MB | 16 | 24 | 52 |
| Recorder + incidents | 2.5 MB | 22 | 22 | 52 |
| + P1–P3, P7, 4xx triggers | 2.6 MB | 46 | 46 | 87 |
| + 30-day ledger, rollup, versions | 8.2 MB | 66 | 91 | 92 |
| **Chosen: 90-day ledger** | **≈10.8 MB** | **92** | **92** | **92** |

## Running it

Today the battery runs in the POC simulator (worktree `poc-retention`, `poc/retention`), against a
`VACUUM INTO` snapshot, never the live file:

```bash
go run ./poc/retention -db <snapshot.db> -battery docs/observability/data/resolved-issues.json \
  -unknown weeks -battery-out out.json
go run ./poc/retention -db <snapshot.db> -battery ... -realistic -unknown session
```

Stage 6 of `rollout.md` ports the scoring to the real stores, so the battery runs against what the bridge
actually kept rather than against a model.

## Real stores (stage 6, 2026-10-18)

**Store.** The 90-day steady state of `budgets.md` ("How it was measured"): the live copy replayed through
the shipped ledger, incident and sweep code.

**Readers.** The shipped `autoreas-request-mcp` binary over stdio. For each class, the battery checked
whether the store holds the evidence at 1 h, 7 d and 89 d, and whether a tool returns it. Each issue is
then scored with the scenarios above.

- **Stored**: the rows are on disk at that age.
- **Readable**: a tool lists or returns them without knowing an id in advance.

| Scenario | Stored | Readable |
|---|---|---|
| Strict; unknown = session, days, weeks | 92, 92, 92 | 83, 70, 70 |
| Realistic; unknown = session, days, weeks | 92, 92, 92 | 92, 90, 90 |

**Compared with the simulator's 92/92.** Retention matches the design: no issue lost its evidence. The
gaps are in the readers.

**Per class.** The tool that answered and what it reached:

| Class | Answered by | Reached |
|---|---|---|
| C1 | `search_history` incident lines → `get_incident` → `get_request` | 89.7 d, with the window and the bodies. `list_incidents` lists the last 7 d only |
| C2 | `get_request` (recorder); `list_response_versions` | Every body is stored. The tool returns the latest 20 per route, which reaches 0.88 d for `/api/sync/reconcile` (20 of 67 stored) and about 18 d for `/api/animes` |
| C3, C11 | `get_request` by id; `search_history` change lines | 89 d |
| C4 | `list_recorder`, `get_status` (24 hourly bars), `search_history` calendar | The calendar has 90 days of day totals. No tool returns the rollup's route, status, device or maximum duration |
| C5 | `search_history` connection lines; `get_request` by id | Connects and disconnects to 89.8 d. Broadcasts older than 2 h are listed by no tool |
| C6, C12, C13 | `search_history` event lines; `get_status` start | Non-noise events and startups to 89.9 d. There is no stop event, so an unclean stop shows only as a gap |
| C7, C8 | `get_request` (`error_message`, `client_request_id`, ms times); `get_incident` cause | The fields exist. The copy's rows predate P1–P3 and P7, so they carry none |
| C9 | `search_history` phone-report lines | All 241 stored reports, 22 d (row caps) |
| C10 | `search_history` change lines | 89.9 d |

**Per item (strict, unknown = weeks).**

- Yes: the other 70.
- Partial (stored, not readable at the issue's delay), 22:
  - B01, B05, B06, B09, B14, B21 and E03 need C5 broadcasts.
  - B03, B09, B10, B16, B17, B25, B29, B53, E05, M02 and M08 need C2 beyond the version list's reach.
  - B03, B04, B05, B06, B15, B20, B25, B29, B53, M05, M06 and M08 need C4 detail.
  - Some issues appear in more than one group.
- No: 0.
- In the realistic reading, only B10 and B16 stay partial: both are rare, and they need `/api/sync` versions.

**Running it.** The probe and scoring programs were scratch code, not shipped. Rerun them after the
rehearsal against the real database: rows written by this branch exercise C7, C8 and C13.

## Adding an issue

When a bug is resolved:

1. Add an entry with the evidence the diagnosis actually read, its delay and its recurrence.
2. Rerun the battery. If the chosen design does not resolve it, that is a design finding: record it in
   `budgets.md` or in a new ADR before changing any retention number.

## Limits

- The evidence classes and recurrence are judgments made from what each source wrote, not measurements.
- The replay uses one week of one phone's traffic.
