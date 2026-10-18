# Rollout

## Delivery rule

All work happens on branch `feat/debug-capture` in worktree `autoreas-bridge-worktrees/debug-capture`.
Nothing is merged into `dev` until the whole feature is finished, MCP and UI included, and the owner has
reviewed the worktree. `dev` is merged into the branch from time to time, never the other way round.
Sub-worktrees for parallel lanes branch from `feat/debug-capture` and return to it.

## No legacy

Owner decision, 2026-10-17: "Todo lo que es features antiguas de Activity y toda su UI, nada de legacy.
… Todo se borra. No se deja rastro de eso."

The delivered branch contains **nothing** of the old Activity:

- **UI:** the `features/network` screen with its Overview, Transactions and Runtime Events tabs, its
  stores (`network-store`, `transaction-store`), its sources (`capture-transaction-source`,
  `runtime-event-source`), its contracts, helpers, tests and fixtures.
- **Bindings:** the old Wails bindings (`ListCaptureTransactions`, `GetCaptureTransaction`,
  `SummarizeCaptureTransactions`, `ResolveCaptureTransactions`, `SearchRuntimeEvents`,
  `SummarizeRuntimeEvents`, `RuntimeEventsAvailable` and their helpers).
- **Readers and tables:** the old capture and event readers, and the row-capped `request_captures` and
  `runtime_events` storage, once the new layers replace them.
- **MCP:** the old MCP tools that read those tables, replaced by tools on the new layers.
- **Docs:** current product docs that describe the old screen.

There are no compatibility shims, feature flags, `legacy` folders, deprecated aliases or "kept for
reference" copies. Old and new may coexist **inside the branch** while a stage is being built, but the
stage that replaces a piece deletes the old one in the same delivery. Historical records stay as history:
ADRs, `docs/learning-log.md`, `odd/tasks/*` and `openspec/`. They describe what happened, not what ships.

## Stages

| # | Stage | Delivers | Status |
|---|---|---|---|
| 0 | Docs and development database | this section, ADR-028, the data-directory override | docs written 2026-10-17 |
| 1 | Record quality | P1 error cause, P2 ms time, P3 correlation, P7 frontend errors, 4xx triggers, incremental vacuum, the detail read by id (H1), a metadata audit of internal events (130 of 173 carried metadata in the measured week), a test that an internal error event opens an incident | done 2026-10-17 (`b4d0971c`) |
| 2 | Mobile correlation | the phone sends its id in an optional header; the bridge reads it when present | done on the bridge side: header accepted and echoed (T3d), announced in openapi; the phone sends it on its own schedule |
| 3 | Ledger | write journal, event and WS ledger, hourly rollup, response versions; the old tables still exist inside the branch | done: `edc1bf98`, `dd9ef3a2` |
| 4 | Recorder and incidents | the 2-hour recorder and 90-day incidents replace the row caps; the old capture and event tables and their readers are deleted | done: the existing capture and event tables became the recorder (L15 D-a), the time-based sweeper replaced the row caps |
| 5 | Readers | new MCP tools and the new Activity UI; the old screen, stores, sources, bindings and MCP tools are deleted (see "No legacy") | pending: UI design in `activity-ui-design.md` |
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
