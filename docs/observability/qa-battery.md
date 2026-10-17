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

## Adding an issue

When a bug is resolved:

1. Add an entry with the evidence the diagnosis actually read, its delay and its recurrence.
2. Rerun the battery. If the chosen design does not resolve it, that is a design finding: record it in
   `budgets.md` or in a new ADR before changing any retention number.

## Limits

- The evidence classes and recurrence are judgments made from what each source wrote, not measurements.
- The replay uses one week of one phone's traffic.
