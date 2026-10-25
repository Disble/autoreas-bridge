# Schedule run settled

Objective: make every reader of a download run's outcome (Downloads, Season, Activity, logs, the request MCP) see the finished run, not the in-flight one, by announcing the point where the scheduler has released its run guard and stored the run's outcome. Branch `feat/season-pick-checkboxes` (worktree `autoreas-bridge-worktrees/season-pick-checkboxes`, dev merged at 177fa161). Delivery: ask-on-risk. Runners: `go test`, Bun/Vitest.

## Specs

- S1 The defect, as confirmed by four blind judges on c830f0ee: `download.run_finished` is published synchronously from inside the run, before the scheduler's `releaseGuard` and before `markScheduledRun`/settlement store the outcome; nothing re-reads afterwards, so a read on that event can keep the old `lastRunAtMs`/`lastRunStatus` until the next run, a schedule save or a restart. A stale `running: true` is practically unreachable; the stale last-run ("did not complete" after a successful run) is plausible but unmeasured.
- S2 The scheduler announces a settled run once its bookkeeping is complete, on every path that ran a download (scheduled, manual, missed-day Run now), and never for an ignored missed day (no run).
- S3 The desktop forwards it to the WebView as `schedule.run_settled`; the shared Downloads read-model re-reads on it, and a read answered after a newer one cannot overwrite it.
- S4 Cross-cutting, per the owner: "Considera que esto afecta de manera transversal a varias áreas. Incluido la área de downloads, de activity, de logs, de MCP, etc. Incluso tienes actualización nueva de Downloads en dev." Scope of each area is set from the read-only map (see Log L3), not assumed.
- S5 Existing behaviour stays: run events, missed-day settlement event, the season scheduler (no hook), and the frontend's other run-event consumers.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2, S3 backend hook + Wails event + read-model guards; S4 log row (Activity Task line, MCP `schedule` scope), settlement failure warned | inline (one understood change; no Writer trigger) | done (RED→GREEN; ditto schedule 3/3, desktop 8/8; Stryker store 31/31) | 50c362bb |
| T2 | S4 Run History story re-read on stored rows of the run | inline (one hook, ~100 lines) | done (RED "expected 2 times, got 1" → GREEN; Stryker 24/24, one equivalent disabled with reason) | 6516f3b3 |
| T3 | S5 regression + docs (openapi changelog, architecture, observability, activity-events skill) | inline | done; independent verifier PASS S1-S5 | 50c362bb |

Risk: item 4 (async ordering between the run, the scheduler and the readers).

## Log

- L1 (2026-10-24) User: "Ese fallo que tú dices no es poca cosa. Si vas a asegurarlo, tienes que hacerlo bien. Manda un judgment day."
- L2 (2026-10-24) User: "Amigo, el Judgment Day era para validar el error. O sea, para que valides que lo que me estás diciendo es cierto, no para validar el fix de algo que aún no has validado, que es cierto. Pero ya no deshagas lo que hiciste, valida ahora cuatro veces para compensar." Four blind judges (A-D) on c830f0ee: S1 above, unanimous; all rated WARNING.
- L3 (2026-10-24) User: "Está bien, continúa con el desarrollo del fix entonces. Considera que esto afecta de manera transversal a varias áreas. Incluido la área de downloads, de activity, de logs, de MCP, etc. Incluso tienes actualización nueva de Downloads en dev." dev merged (177fa161; conflict in internal/download/service.go resolved by keeping RunAnime in service_scoped_runs.go with dev's logAnimef). The gate's react-doctor bunx cache was corrupted (oxlint 1.81.0 without dist/index.js); cleared and the gate passed. Read-only map of the areas launched.
- L4 (2026-10-24) Map outcome: Run History's per-anime story missed its last rows (runtime_events persist after `download.run_finished`), and no scheduler outcome ever reached runtime_events. Decisions: the log row lives in `internal/desktop` because the scheduler is shared with Season availability; recorded outcomes only (a manual run stores nothing and writes no row); always info, so no new incidents; no correlation id, because RunFunc returns only a status and widening it churns every fake. The failed day settlement, previously discarded, is now a warning. Story re-read: the History recorder announces each stored row; rows whose correlationId is the selected run re-read the story after 250 ms of quiet. Mobile realtime consumes none of these events. The solo-run guard released after the publish is advisory, out of scope.
- L5 (2026-10-24) Independent verifier: PASS S1-S5, no blockers. Go packages schedule/desktop/activityread/download ok, vet, checkgofilesize, checkarchitecture clean; frontend typecheck, full suite 412 files / 4160 tests, eslint clean; RunSettled tests stable at -count=20. `go test -race` unavailable (no cgo C compiler). Advisories kept out of scope: a panicking RunFunc in a missed-day Run now notifies with an empty status (out of domain); the missed-day notify fires before the day claim is released (no reader checks it); run_settled also re-reads run history once; no test pins exactly-once.
- L6 (2026-10-24) First commit attempt failed the gate's lint profile: funlen on startDownloadOrchestration (61 > 60, the RunSettled line) and gocognit on the three new tests. Fixed without touching limits: the scheduler wiring moved to startDownloadScheduler in internal/desktop/app_download_scheduler.go (renamed from app_schedule_run_settled.go), and the test assertions moved to helpers. Commits: 50c362bb (scheduler signal, log row, store guards, docs), 6516f3b3 (run story re-read). Not merged to dev.
