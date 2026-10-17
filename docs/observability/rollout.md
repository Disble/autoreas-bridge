# Rollout

## Delivery rule

All work happens on branch `feat/debug-capture` in worktree `autoreas-bridge-worktrees/debug-capture`.
Nothing is merged into `dev` until the whole feature is finished, MCP and UI included, and the owner has
reviewed the worktree. `dev` is merged into the branch from time to time, never the other way round.
Sub-worktrees for parallel lanes branch from `feat/debug-capture` and return to it.

## Stages

| # | Stage | Delivers | Status |
|---|---|---|---|
| 0 | Docs and development database | this section, ADR-028, the data-directory override | docs written 2026-10-17 |
| 1 | Record quality | P1 error cause, P2 ms time, P3 correlation, P7 frontend errors, 4xx triggers, incremental vacuum, the detail read by id (H1), a metadata audit of internal events (130 of 173 carried metadata in the measured week), a test that an internal error event opens an incident | pending |
| 2 | Mobile correlation | the phone sends its id in an optional header; the bridge reads it when present | pending: proposal not sent |
| 3 | Ledger | write journal, event and WS ledger, hourly rollup, response versions, alongside the old tables | pending |
| 4 | Recorder and incidents | the 2-hour recorder and 90-day incidents replace the row caps | pending: the only stage that deletes data |
| 5 | Readers | MCP tools and the new Activity UI | pending: UI design from `activity-ui.md` |
| 6 | Measure | the battery against real stores, budgets measured on disk | pending |

Stage 1 runs in two lanes with disjoint files:

- lane A: the event store and HTTP handlers (P1–P3)
- lane B: the frontend errors, the triggers and the SQLite settings

Every other stage is sequential, because each one builds on the previous one and they share files.

## Coordination with mobile

| When | What |
|---|---|
| Before stage 1 | Draft the header contract (names, format, all optional), show it to the owner, then send it |
| Before the first bridge change | Announce it in `docs/openapi.yaml` |
| End of stage 1 | The bridge accepts the header when present and works the same without it; no joint release date |
| Stage 6 | One session with real phone data to run the battery |

## Owner checkpoints

1. Approve the message to mobile before it is sent.
2. Review the whole worktree before anything reaches `dev`. That review includes the battery run on the
   real code and the rehearsal against the real database, after a backup.
