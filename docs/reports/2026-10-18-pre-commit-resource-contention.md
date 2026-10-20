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

## Follow-up: the eight coverage failures in the 2.1.1 release hook (2026-10-20)

The release 2.1.1 fix commit ran the whole hook and failed on `frontend-coverage` alone: 7 files,
8 tests, 3,871 passing, 286.61 s. Everything before it passed (`quick` 5.21 s, `go-heavy` 56.43 s,
`frontend-quality` 133.65 s, `frontend-typecheck` 31.25 s); the two smoke jobs were skipped after
the failure. The section above asked for per-test durations measured inside a failing run. This is
that measurement, taken from the run itself.

| Suite | Failing test | Sibling tests in the same file, same run |
|---|---|---|
| `HistoryFilterBar.test.tsx` (19 tests, 37.4 s) | calendar pick 7,025 ms; year picker 6,716 ms | 2,983 / 3,685 / 3,922 / 4,101 ms passed |
| `AnimeEditorWorkspace.covers.test.tsx` (7 tests, 14.6 s) | saved-cover refetch 6,667 ms | 3,386 / 3,192 ms passed |
| `NotificationCenterPanel.chrome.integration.test.tsx` | none | 3,663 / 3,731 / 4,625 ms passed |
| `check-airis-assets`, `generate-feature`, `summarize-mutation-audit` (`|node|`) | 5,000 ms each | their own files passed |

The full suite also logged 23 `[vitest-pool]: Timeout terminating forks worker` lines, and the run was
2.1× the same suite without instrumentation (136 s plain, 286.61 s under v8, 379.99 s of cumulative
test time). What the table shows is that the failing cases are not the only expensive ones: their
siblings were also using 60–90 % of the same 5 s budget. That is consistent with a per-test cost problem
and equally consistent with a machine that was slow for every heavy test; this run does not separate the
two, and the second pass below measured how large that gap actually is.

### The one defect found, and corrected

`NotificationCenterPanel.test.tsx` did not time out. It failed its own assertion (`Unable to find an
element with the text: No matches`) with `zzz` already in the search input, because it produced the
300 ms debounce through `vi.waitFor` while the clock was faked. In Vitest 4.1.6 that poll loop advances
the fake clock by `interval` (50 ms) per poll and gives the whole loop a 1,000 ms *real* budget, so the
debounce alone consumes 6 of the 20 polls, and the panel then has to render the list, the loading state
and the empty state inside the remaining ~700 ms. A plain run renders those in well under that; an
instrumented run does not. The case now advances the debounce explicitly
(`vi.advanceTimersByTimeAsync(NOTIFICATION_FILTER_DEBOUNCE_MS)` inside `act`) and holds no wall-clock
budget at all, with `beforeEach`/`afterEach` uninstalling the fake clock so a failed assertion cannot
leak it into the next case. Assertions, the 5 s test timeout and the suite's real-timer cases are
unchanged.

### No scheduling or threshold change in the first pass (2026-10-20)

At that point `vite.config.ts` kept `fileParallelism: true` and `maxWorkers: 4`. No measurement in this
run separates a starved worker from a test that honestly costs what it costs, so the cap was neither
raised nor lowered in that pass: lowering it would add wall-clock to a lane that already takes 290 s on
the strength of a hypothesis. The two levers that would move these seven failures are both owner
decisions already recorded above — scoping the coverage job to `enforcedPrefixes` (measured 12 s vs
174 s at 385 files) and splitting the heaviest integration suites — and neither belongs to a
release-correction slice. The owner then authorized the resource correction recorded in the next
section, which changes the cap and nothing else.

### Open

- Seven failures remained after the first pass: four heavy DOM cases (`HistoryFilterBar` calendar ×2,
  `AnimeEditorWorkspace` covers + selection) and three `|node|` script cases that spawn or decode real
  files. The second pass below corrects the two calendar cases and records an exact blocker for each of
  the other five; it does not ask for a coverage-scope decision on any of them.
- The failing run left orphaned `node.exe` workers behind: ≈60 resident `node` processes were observed
  afterwards, most of them started before the run began, so neither their ownership nor their load is
  established. Nothing here is proof of CPU saturation, and none was terminated.

### Correction pass: what changed, and the 9x measurement (2026-10-20, second pass)

The seven remaining failures were re-read as ordinary tests before anything was changed, looking for
avoidable setup, repeated expensive work, lifecycle leakage or nondeterministic waits.

**Corrected — `HistoryFilterBar.test.tsx`, the two calendar cases.** Day-cell and year-cell lookups used
`screen.getByRole('button', {name})`, which makes Testing Library resolve an accessible name for every
candidate button in the document: the bar's own controls, the calendar's 42 day cells **and** its 20
year cells, because HeroUI renders the year grid on open and hides it with CSS opacity rather than
unmounting it. Those lookups now go through a `calendar()` helper scoped to the open calendar's
`role="application"` surface, the same scoping the file already documents for `rangeTrigger`. The
year-picker case also pinned the clock (`vi.setSystemTime(2026-09-15)`), because the grid it asserts is
centred on "today": without the pin, `2026` exists only while the real date stays near 2026. Every
assertion, including the accessible names and `toHaveBeenCalledExactlyOnceWith`, is unchanged.

**Measured, and it changes the picture.** An isolated focused run of that file (19 tests) now reports
4.10 s of test time: the five calendar cases are 703 / 501 / 495 / 474 / 616 ms. The same five cases in
the failing gate run were 7,025 / 3,685 / 4,101 / 3,922 / 6,716 ms. That is roughly **8–10x per test**,
not the 2.1x the suite-level totals suggested (136 s plain vs 286.61 s under v8). Two honest readings,
neither of which this evidence separates:

- v8 profiling plus a busy machine inflate a jsdom test far more than a suite-level average shows, so
  the heavy integration cases cross 5 s without being wrong; or
- the expensive cases really do carry ~10x of ordinary cost under instrumentation, and no query or
  setup correction closes a 6.7 s → 5 s gap for a test whose cost is the renders its causal transition
  needs.

What the isolated run does rule out is that the *scoping* gain alone is measurable at gate scale: one
document-wide scan costs about 200 ms isolated (703 ms for the two-scan pick case against 501 ms for its
single-scan sibling), which is ~2 s of the instrumented 7 s — necessary, not obviously sufficient.

### Not corrected, and why (exact blocker per case)

- `AnimeEditorWorkspace.covers.test.tsx` — the failing case is a single causal transition
  (select → save a new cover → assert both thumbnails → clear → assert placeholders). Its three
  form-rendering tests are 3,386 / 3,192 / 6,667 ms while the four rail-only tests in the same file are
  177 / 191 / 210 / 819 ms, so the cost tracks how many times the full editor form mounts, not any
  query. Splitting it would evade the budget by breaking the transition, and dropping renders would drop
  the cover-follows-the-save behavior it exists to prove.
- `AnimeEditorWorkspace.selection.test.tsx` — 5,905 ms for one test: mount plus four consecutive
  selections, which is the whole point of "loads each clicked anime, not just the first". Its heading
  queries have only two candidates in the document, so query scoping cannot move it.
- `scripts/__tests__/summarize-mutation-audit.test.mjs` — six `it.each` rows, each already its own test
  with its own 5 s budget, each spawning the real CLI once. Five of the six passed in the failing run and
  one did not, so no per-test property distinguishes the failure from its identical siblings; the real
  CLI boundary may not be mocked, and `spawnSync` also delays the timeout timer itself (hence the
  reported 7,000 ms-plus durations).
- `scripts/__tests__/check-airis-assets.test.mjs` — one real `ffprobe` + `ffmpeg` round trip inside the
  only test that asserts the checked-in asset passes (11.3 s for a two-test file whose other test is
  pure). No repeated work to remove, and replacing the binaries with fixtures is exactly the mock the
  boundary rules forbid.
- `scripts/__tests__/generate-feature.test.mjs` — one test, one real `node` spawn plus eight file reads
  (9.2 s for a one-test file). Nothing is run twice and nothing can be dropped without losing the
  scaffolding contract.

Environment note, stated as observation only: about 60 resident `node.exe` processes were present before
and after the failing run, ~30 of them started at 09:37, before the gate began at 10:17. Ownership and
load causality are unproven either way; none was terminated. A `NODE_V8_COVERAGE` inheritance from the
worker into the spawned children was checked and ruled out (Vitest 4.1.6 does not set it), so the
instrumented cost does not follow the spawns into the CLI.

### Resource diagnosis and the authorized 4 → 2 worker cap (2026-10-20, third pass)

The owner authorizing this pass chose "diagnosticar recursos y ajustar concurrencia", with the
consequence "mantener todos los casos, aserciones, cobertura y timeouts; no terminar procesos sin
identificarlos y sin autorización. Publicar solo si pasan los gates". So this pass measures demand with
read-only snapshots and changes one scheduling number.

**Current machine sample — today's observation, not gate evidence.** 20 logical CPUs; 32,509 MiB RAM
with 9,572 MiB free; 50–52 resident `node.exe` processes (503 total processes). CPU time across all
cores, sampled three times in two-second windows while nothing of this task was running: **25.2 %,
24.8 %, 17.8 % busy**. That is roughly 3.5–5 of 20 cores already committed to work this slice does not
own; `os.loadavg()` is meaningless on Windows and is not used here. Process ownership, start time and
per-process current load were **not** established, cumulative CPU time is not current load, and nothing
was terminated. This sample is a snapshot of one minute, not of the failing run: the gate figures it is
compared against were taken on 2026-10-20 at 10:17 and are not re-measured here.

**Demand accounting for the failing lane.** `lefthook.yml` is `piped: true`, so `frontend-coverage` runs
alone: its demand is Vitest's own forks plus what those forks start, not the Go lanes. At
`maxWorkers: 4` that is four forks of jsdom plus v8 instrumentation over 391 files, three of them
running `|node|` suites that spawn a real CLI, `ffprobe` and `ffmpeg`, on top of the ~3.5–5 core
equivalents of background load measured above. What the same-day evidence does establish:

- the same tree is 136 s plain and 286.61 s under v8 (2.1x suite-level), while single heavy cases are
  8–10x (703 ms isolated vs 7,025 ms in the gate), so instrumentation plus contention is not spread
  evenly across the suite;
- `vitest.mutation.mts` records a dose-response for this exact cap on this machine: 8 workers failed
  20+ unrelated tests with timeouts, 4 workers left marginal failures at 5,818 / 5,150 / 5,224 ms
  against an unchanged 5 s budget, i.e. survivors 2–16 % over;
- the failing lane logged 23 `Timeout terminating forks worker` lines, which is a fork budget being
  consumed by load rather than by a defect in any one test.

**Hypothesis, stated as one.** Those eight cases are a small multiple over budget, so returning the
per-worker contention margin should fit them inside the same 5 s. What would falsify it: a measured
gate run at the new cap that still fails the same cases, or one whose wall-clock cost outweighs the
margin it buys.

**What changed.** `frontend/vite.config.ts`: `maxWorkers: 4` → `maxWorkers: 2`. It is one bound for both
projects, because `node` and `dom` inherit that `test` block through `extends: true`; no per-project
concurrency override was introduced and no helper was added for it. Unchanged, deliberately:
`fileParallelism: true`, per-file isolation, the 5,000 ms `testTimeout`, every coverage threshold and
include/exclude, all 391 files and 3,879 test cases with their assertions, the hook commands, the
dependencies, and the absence of retries. Fewer workers is not fewer tests: it trades lane wall-clock
for a verdict that does not depend on how busy the desktop is.

**Status: NOT a measured success.** No command recorded in this section was run at the new cap. The
expected cost is wall-clock — a plain 136 s and a v8 286.61 s were taken at 4 workers, and 2 workers
will take longer, by how much is unmeasured. The proof owed is exactly one full coverage gate run; until
that number exists, the cap is the working hypothesis the config comment says it is, and no approval is
claimed here.


### Measured corrected gate result (2026-10-20)

The exact unchanged coverage command passed with the two test corrections and `maxWorkers: 2`: exit 0, 391 files and 3,879 tests passed, 298.18 s (job wall time 5m03s). Typecheck passed first in 20 s; no other heavy check ran concurrently. Adopted-scope coverage: 99.88% statements, 99.67% branches, 99.73% functions, 100% lines. This validates the combined correction, not an isolated CPU cause or a guarantee against future flakes. Cases, assertions, timeouts, isolation, coverage scope and thresholds are unchanged. Independent final verification and normal commit hooks remain required.
