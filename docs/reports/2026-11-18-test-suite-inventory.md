# Test suite inventory — 2026-11-18 baseline

Phase 1 of the test-suite debt work (`odd/tasks/test-suite-debt.md`): classify every test before
reducing anything. Measured on `dev` at `fe516e48`; no mutation testing in this phase.

Per-file data: [`2026-11-18-test-suite-inventory.csv`](2026-11-18-test-suite-inventory.csv)
(1,015 rows). Regenerate it with the scripts in `scripts/test-inventory/` (see [Method](#method)).

## Headline numbers

| Suite | Files | Lines | Cases | Wall time | Cumulative test time |
|---|---:|---:|---:|---:|---:|
| Go (`go test ./... -cover -p 4 -parallel 4 -count=1`) | 552 | 101,942 | 2,627 top-level funcs | 81 s | 174 s across 81 packages |
| Frontend (`vitest run`, `maxWorkers: 2`) | 463 | 65,621 | 5,022 | 320 s | 197 s in test bodies |

Both suites passed with zero failures and zero skips. Each ran alone on the machine, not inside the
pre-commit gate, so gate times are higher.

Vitest's own breakdown is `transform 10 s, setup 77 s, import 85 s, tests 197 s, environment 224 s`.
These are cumulative across workers, and **per-file overhead (environment + setup + import = 386 s)
exceeds test-body time**. Every extra jsdom file costs time even when its tests are instant.

## Dimensions recorded per file

| Column | Meaning |
|---|---|
| `lang`, `area` | `go`, `ts`, `tsx`, `mjs`; `go` or `frontend` |
| `context`, `module` | Bounded context (`internal/<x>`, `features/<x>`, `shared/<x>`) and owning package/folder |
| `env` | Execution environment: `go`, Vitest `node` project, or `jsdom` project |
| `kind` | Go: `unit`, `sqlite-integration`, `filesystem`, `http-integration`, `process-integration`, `repo-contract`. Frontend: `pure`, `hook`, `component`, `component-integration`, `repo-contract` |
| `tier` | Coverage tier of the code under test, from `coverage-tiers.json` |
| `origin`, `lastChange`, `age`, `commits`, `churn` | Git origin date (follows renames), last change, age bucket, commit count, churn bucket |
| `lines`, `tests`, `subtests`, `linesPerCase` | Size and case density |
| `seconds`, `speed`, `slowest` | Measured time and the three slowest cases |
| `smells` | `real-sleep`, `jsdom-unused`, `over-400-lines` |

Kinds and smells are static heuristics (pattern matches on the source). Treat them as candidates to
verify, not verdicts.

## By kind

| Area | Kind | Files | Lines | Cases | Seconds |
|---|---|---:|---:|---:|---:|
| go | unit | 310 | 49,793 | 1,372 | 54.6 |
| go | sqlite-integration | 134 | 29,959 | 704 | 47.1 |
| go | process-integration | 9 | 1,313 | 27 | 20.9 |
| go | filesystem | 65 | 14,564 | 361 | 14.8 |
| go | http-integration | 25 | 4,749 | 127 | 1.6 |
| go | repo-contract | 9 | 1,564 | 36 | 1.4 |
| frontend | jsdom: hook | 135 | 21,658 | 1,048 | 87.6 |
| frontend | jsdom: component | 137 | 19,618 | 1,014 | 86.8 |
| frontend | jsdom: component-integration | 8 | 1,446 | 54 | 11.1 |
| frontend | jsdom: pure | 38 | 4,120 | 201 | 6.7 |
| frontend | jsdom: repo-contract | 14 | 1,564 | 88 | 1.2 |
| frontend | node: repo-contract | 12 | 1,314 | 62 | 2.4 |
| frontend | node: pure | 119 | 15,901 | 1,311 | 0.6 |

## By speed

Go thresholds per file: fast <0.1 s, medium <1 s, slow <5 s, very-slow ≥5 s. Frontend: fast <0.5 s,
medium <2 s, slow <5 s, very-slow ≥5 s.

| Area | Speed | Files | Seconds |
|---|---|---:|---:|
| go | fast | 363 | 2.6 |
| go | medium | 154 | 55.3 |
| go | slow | 32 | 55.1 |
| go | very-slow | 3 | 27.3 |
| frontend | fast | 353 | 31.1 |
| frontend | medium | 89 | 92.3 |
| frontend | slow | 19 | 55.4 |
| frontend | very-slow | 2 | 17.5 |

Go top-level tests: 1,674 under 10 ms, 516 under 100 ms, 426 under 1 s, 7 under 5 s, 3 at ≥5 s.

## By age and churn

| Area | Age | Files | Seconds | | Area | Churn (commits) | Files | Seconds |
|---|---|---:|---:|---|---|---|---:|---:|
| go | >4 months | 157 | 29.3 | | go | low (1–2) | 289 | 49.7 |
| go | 2–4 months | 193 | 46.2 | | go | medium (3–7) | 212 | 53.9 |
| go | 1–2 months | 128 | 27.1 | | go | high (≥8) | 51 | 36.8 |
| go | <1 month | 74 | 37.9 | | frontend | low | 218 | 34.7 |
| frontend | >4 months | 108 | 61.6 | | frontend | medium | 171 | 92.3 |
| frontend | 2–4 months | 169 | 63.1 | | frontend | high | 74 | 69.4 |
| frontend | 1–2 months | 86 | 49.0 | | | | | |
| frontend | <1 month | 100 | 22.7 | | | | | |

287 files were never changed after the commit that created them.

## By context (top 18 by time)

| Area | Context | Files | Lines | Cases | Seconds |
|---|---|---:|---:|---:|---:|
| frontend | features/anime-editor | 37 | 7,206 | 383 | 42.6 |
| frontend | features/season | 76 | 11,475 | 655 | 31.9 |
| go | observability | 61 | 11,545 | 304 | 29.6 |
| go | desktop | 110 | 21,239 | 551 | 28.6 |
| frontend | features/notifications | 54 | 7,225 | 415 | 25.2 |
| go | cfclearance | 13 | 2,048 | 55 | 19.1 |
| go | sync | 32 | 7,120 | 168 | 17.6 |
| frontend | features/activity | 40 | 5,376 | 322 | 15.7 |
| go | anime | 87 | 14,365 | 327 | 14.4 |
| frontend | features/download | 29 | 4,511 | 304 | 13.3 |
| go | notification | 28 | 4,275 | 133 | 10.4 |
| frontend | features/anime-detail | 13 | 3,284 | 163 | 7.9 |
| frontend | features/history | 12 | 2,176 | 84 | 7.8 |
| frontend | features/episodes | 7 | 1,742 | 116 | 6.6 |
| frontend | shared/metadata-lookup | 7 | 1,580 | 84 | 5.4 |
| frontend | features/preferences | 9 | 983 | 47 | 5.1 |
| frontend | app | 14 | 1,158 | 45 | 5.0 |
| frontend | features/anime-create | 7 | 1,141 | 62 | 4.7 |

## Slowest files

| File | Kind | Seconds | Slowest case |
|---|---|---:|---|
| `internal/cfclearance/webview2/engine_windows_test.go` | process-integration | 17.3 | `TestEngineClearsAFixtureCookieWithoutShowingAWindow` 17.3 s |
| `internal/observability/eventlog/queue_test.go` | unit | 5.1 | `TestQueueStopReportsUnfinishedItemsAfterDeadline` 5.0 s |
| `internal/observability/requestcapture/queue_test.go` | unit | 5.0 | `TestQueueStopReportsUnfinishedItemsAfterDeadline` 5.0 s |
| `internal/sync/sqlite_vacuum_test.go` | sqlite-integration | 4.4 | spread across cases |
| `internal/observability/activityread/sync_readings_test.go` | unit | 4.0 | `TestFailedSyncsReadsAreBounded` 2.7 s |
| `frontend/.../EpisodeDurationsSection/__tests__/EpisodeDurationsSection.test.tsx` | component | 8.8 | 20 cases |
| `frontend/.../AnimeEditorWorkspace/__tests__/use-anime-editor-workspace.cards.test.ts` | hook | 8.7 | 25 cases |
| `frontend/.../OrderingBoard/__tests__/use-ordering-board.test.ts` | hook | 5.0 | 34 cases |
| `frontend/.../ActivityScreen/__tests__/ActivityScreen.test.tsx` | component | 4.9 | 23 cases |
| `frontend/.../RunHistoryPanel/__tests__/use-run-history-panel.test.tsx` | hook | 4.3 | 29 cases |

## Observations for the reduction phase

These are measured facts that point at levers. They are not a plan yet.

1. **The frontend is the bottleneck** (320 s vs 81 s), and its cost is per file, not per case.
   Merging or relocating small jsdom suites saves environment, setup and import time without
   removing any assertion.
2. **21 jsdom suites never touch the DOM** (`smells` contains `jsdom-unused`). The config comment
   estimates ~700 ms of jsdom setup each; they can move to the `node` project.
3. **The Go cost is a long tail.** Three tests account for 27 s of 174 s. Two of them wait out a real
   5 s shutdown deadline, which an injected clock or a shorter test deadline would remove.
4. **35 files use real sleeps or timers** (22 frontend, 51 s; 13 Go, 29 s).
5. **Tiers are mostly unassigned.** 975 of 1,015 files test code with no tier in
   `coverage-tiers.json`, which only covers `features/activity`. "Reduce without losing quality"
   needs a tier per module first, so deletions target INFRASTRUCTURE and duplicated IMPORTANT
   coverage, never CORE.
6. **61 test files exceed 400 lines** (41 Go, 20 frontend), a signal of duplicated setup that
   table-driven rows or shared helpers could collapse.

## Method

Each suite ran alone, on the reference machine, never in parallel with the other:

```sh
go test ./... -cover -p 4 -parallel 4 -count=1 -json > go-test.json
cd frontend && bunx --no-install vitest run --reporter=default --reporter=json --outputFile.json=vitest.json
```

Then, from the directory that holds both JSON files (scratch, outside the worktree):

```sh
node <repo>/scripts/test-inventory/inventory.mjs <repo> inventory.json  # static pass + git history
node <repo>/scripts/test-inventory/gotiming.mjs <repo>                  # joins Go timings
node <repo>/scripts/test-inventory/fetiming.mjs                         # joins Vitest timings
node <repo>/scripts/test-inventory/classify.mjs <repo>                  # derived columns + inventory.csv
```

Set `TEST_INVENTORY_DATE=YYYY-MM-DD` to reproduce the age buckets of an earlier baseline.
