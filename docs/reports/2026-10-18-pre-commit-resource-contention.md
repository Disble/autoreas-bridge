# Pre-commit resource contention (2026-10-18)

From now on the pre-commit gate runs its lanes one after another (`lefthook.yml` → `pre-commit: piped: true`).
The trigger was a frontend commit on `feat/debug-capture` that failed five gate runs in a row. Every
failure was a 5 s test timeout in a suite outside the change. Those same suites pass when they run
without the gate.

## What was observed

| Run | Lane that failed | Tests that timed out (5 s) |
|---|---|---|
| 1 | frontend-test | `AnimeEditorWorkspace.covers`, `AnimeEditorWorkspace.schedule-feedback` |
| 2 | frontend-test | `LoadingBars` ("renders exactly `count` placeholder bars") |
| 3 | frontend-test | `AnimeEditorWorkspace.windowing` |
| 4 | frontend-test | `AnimeEditorWorkspace.covers` (3 tests), `EpisodeDurationsSection` |
| 5 | frontend-coverage | `NotificationCenterPanel.detail.integration` |

Earlier the same day `AnimeEditorListPanel` timed out once, and `TestLoggedEventSurvivesBridgeRestart`
(Go) failed once under load. That Go test also flakes at baseline: it fails 1 run in 8 and recorded
`SQLITE_BUSY` on the second startup.

## Measurements

The suites themselves pass when they run without the gate:

- **Frontend suite:** `bun --cwd="frontend" run test` passed 385 files and 3,845 tests in 133 s with no
  timeouts.
- **`AnimeEditorWorkspace` folder:** 231 tests, 3 of 3 runs passed, about 13 s each.
- **The Go flake:** 0 of 30 isolated runs failed.

What the gate run looked like:

- **Frontend suite inside the gate:** 143–171 s (133 s without the gate).
- **What runs at the same time:** `pre-commit` had `parallel: true` at the top, so three lanes ran side by side:
  - quick: gofmt, filesize, architecture, golangci-lint and openapi;
  - go-heavy: go-vet, then `go test ./... -p 4 -parallel 4`;
  - frontend-heavy: check:staged, typecheck, test, coverage and the smokes.
- **Load from outside the gate:** a sampled `wails dev` vite process used more than one core. Another
  Claude session used about one core.
- **Coverage job:** the `frontend-coverage` lane (dharness tiers, added on this branch) reran all 385
  files under v8 instrumentation in about 174 s.
- **Coverage job scoped:** limited to `src/features/activity` it took about 12 s and produced identical
  threshold results. This scoping was **not** applied; see the decisions below.

The machine has 20 logical processors.

## Diagnosis

The failures are CPU starvation, not defects:

- They move between unrelated suites from run to run.
- Even a trivial render (`LoadingBars`) times out.
- Every one of those suites passes without the gate.

The gate itself caused part of the load, because it ran the Go suite and the frontend suite side by
side. The rest came from processes outside it.

## After the change

Running the lanes one after another helped but did not remove the failures. These are the runs after
the change, with nothing else heavy running on the machine:

| Run | Context | Result |
|---|---|---|
| 1 | `git commit` | frontend-test failed: 3 `AnimeEditorWorkspace` timeouts, in 137 s, with no other lane running |
| 2 | `lefthook run pre-commit --job frontend-test` | passed, 119 s |
| 3 | `lefthook run pre-commit --all-files` | every lane passed, including coverage over all 385 files (156 s) |
| 4 | `git commit` (gate change, `c7ab5d8b`) | passed |
| 5 | `git commit` (activity History) | frontend-test passed; frontend-coverage failed on an `AnimeCreate` `findByText` 1 s wait under v8 instrumentation |
| 6 | `git commit` (same, `0dcb2299`) | passed, with frontend-test 117 s and frontend-coverage 161 s |

So two of four commits failed after the change, and both failures were timeouts in suites that pass
in every other context. Run 1 shows that contention between lanes does not explain every failure. The
remaining margin is thin: the suite now has 385 files and some integration tests sit close to the 5 s
and 1 s budgets. `vite.config.ts` documents the same `AnimeEditorWorkspace` and editor tests starving
at 1,767 tests in August, which the 4-worker cap fixed then. That cause was not proven here. It needs
per-test durations measured inside a failing commit run.

## Decision

- **The lanes now run one after another.** The top-level `parallel: true` became `piped: true`, so quick
  → go-heavy → frontend-heavy. Jobs inside a group keep their own `parallel` or `piped` setting.
  - Pinned by `TestRepositoryPreCommitRunsItsLanesOneAfterAnother` in
    `tools/checkgofilesize/hook_order_test.go`.
  - Side effect: lefthook skips the remaining lanes after the first failure, so a red gate stops sooner.
- **Unchanged:** the 5 s Vitest timeout, the Vitest workers, Go's `-p 4 -parallel 4` and every threshold.
  None was relaxed to make a failure disappear.

## Open for the owner

- **Gate margin.** Measure per-test durations inside a failing commit run and decide whether the slowest
  integration tests (`AnimeEditorWorkspace`, `AnimeCreate`, `EpisodeDurationsSection`) need splitting or
  the worker cap a fresh benchmark at 385 files.
- **Coverage job scope.** `frontend-coverage` still reruns the whole suite under instrumentation, which
  doubles the frontend test time of every frontend commit. Limiting it to the enforced prefix
  (`coverage-tiers.json` → `enforcedPrefixes`) measured the same thresholds in 12 s instead of 174 s.
  A narrower run can only report less coverage, never more. This is a gate decision, left to the owner.
- **Outside load.** A running `wails dev` or a parallel agent session still competes with any gate run.
  Close them before committing when possible.
- **Go flake.** `TestLoggedEventSurvivesBridgeRestart` closes a nil `*sql.DB` after a `SQLITE_BUSY`
  startup failure (`internal/desktop/app.go`). It predates this branch and needs its own fix.

## Follow-up: one Vitest run

The dharness team confirmed that the coverage-tiers job replaces the plain test job, because its config
re-exports `vite.config.ts` and runs the whole suite. Both hooks now run `frontend-coverage` alone after
the typecheck, and `frontend-test` is gone. This removes one full suite run (about 120 s) from every
frontend commit. `TestRepositoryFrontendLanesSerializeTypecheckBeforeTests` fails if the duplicate
returns.

The first version of that change kept the copied `root: frontend/`. Lefthook filters staged files by
`root`, as it does by `glob`, so that commit (`1a725a1c`, which staged no frontend file) skipped the
suite without listing it, and a merge with no frontend file would have done the same. A scratch
repository reproduced it: a rooted job reported "no matching staged files" while a plain job ran. The
job now changes directory in its command, and both policy tests fail on a `root:`. The job `dharness
sync` writes to `.dharness/lefthook.yml` carries the same `root:`, which is worth reporting to the
dharness team.

## Follow-up: the merge hook

`pre-merge-commit` still ran its lanes in parallel. Merging this branch into `dev` failed twice there,
both times on `AnimeEditorWorkspace` timeouts, while the same folder passed 3 of 3 runs alone. Its lanes
now run one after another too, and `TestRepositoryHooksRunTheirLanesOneAfterAnother` pins both hooks.
