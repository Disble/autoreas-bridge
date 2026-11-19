# Test suite debt

Objective: classify every test, then make the suites faster and smaller without losing quality.
Branch: `chore/test-suite-debt` from `dev`. Delivery: ask-on-risk. Runners: `go test`, Vitest via Bun.

## Specs

- S1. "clasifiy all the tests of the proyect. By date, performance, feature, module, language, etc."
  Acceptance: every tracked test file has a row with those dimensions, backed by a measured run.
- S2. "maximize the performance of the tests reducing them without lose quality."
  Acceptance: measured wall time drops against the S1 baseline; the number of tests drops against the
  S1 baseline (owner, L23); no behavior loses its guarding test.
- S3. "the mutation tests are not allowed until the end of the refactor, because the mutations tests
  increments the development time in 10 times."
  Acceptance: no `ditto` or Stryker run before the final task.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1 | inline | done | `docs/reports/2026-11-18-test-suite-inventory.md` + CSV, `scripts/test-inventory/` |
| T2 | S2 | inline | done (acf468c4) | Go queue Stop ceiling injectable (`StopTimeout`): deadline tests 5.0 s → 0.05 s each; eventlog pkg 6.5 → 1.4 s, requestcapture 5.4 → 1.9 s; verifier PASS |
| T3 | S2 | inline | done (dbd91d3c) | `setupFiles` in the `dom` project only: node project setup 18.6 s → 0, wall ~23.5 → 14.5 s |
| T4 | S2 | inline | done (dbd91d3c) | 20 DOM-free suites renamed `*.node.test.ts(x)` (R100); full suite 319.75 s → 244–276 s over three runs, 463/463 files, 5,022/5,022 tests; verifier PASS |
| T4b | S2 | delegated (context backstop) | done (ed401e95) | `ActivityRangeField` Esc test: wait for the HeroUI trigger refocus before reopening; solo 6-8/8 fail → 10/10 pass |
| T5 | S2 | folded into T7c-T7e | done (37d38efa, e829be63, 863a45c9) | real sleeps and timers replaced where they cost measurable time: fake clocks in frontend suites, injected waits in Go |
| T6 | S2 | inline | done | owner approved ("ok"); `docs/reports/2026-11-18-coverage-tier-draft.md`: tier per Go and frontend module, speed band per test type, 5 open questions; `coverage-tiers.json` unchanged until approved |
| T7 | S2 | inline | done (merge 43ca1627) | 7a: 3 INFRASTRUCTURE suites deleted (keymap-panel.constants, keymap-panel.types, keymap.constants), each behavior covered elsewhere; 3 constants suites kept (they guard rules) |
| T7b | S2, S3 | delegated (parallel, worktree `tsd-anime-editor`) | done (bf3fb412) | 37 → 29 files (27 → 19 jsdom), 456 → 452 cases (4 folded into lifecycle flows), real 250 ms reload debounce mocked to 0 outside its own burst test, 5 ms waitFor poll for hook suites, summed tests ~52 → ~30 s, 11 hand mutations; B: fewer jsdom files in `features/anime-editor` (27 jsdom / 10 node); pure logic tested in `node` |
| T7c | S2, S3 | delegated (parallel, worktree `tsd-season`) | done (e829be63) | 76 → 56 files (58 → 38 jsdom), 946 → 944 cases (2 duplicates, guards cited), autosave and lookup waits on a fake clock, 9 hand mutations, closed a pre-existing gap in the duplicate-weekday autosave guard; B: fewer jsdom files in `features/season` (58 jsdom / 18 node) |
| T7d | S2, S3 | delegated (parallel, worktree `tsd-fe-slow`) | done (37d38efa) | 13 of 14 cases faster (e.g. readiness 1115 → 119 ms, run-history 909 → 154 ms), test files only, 13 hand mutations; A: frontend tests >= 500 ms outside anime-editor and season (13 files, ~12 s cumulative) |
| T7e | S2, S3 | delegated (parallel, worktree `tsd-go-slow`) | done (863a45c9) | verifier FAIL on 2 lost guards (dev asset retry default, AwaitState upper bound), one correction batch, recheck PASS; 11 tests into band (e.g. activityread bound 5840 → 100 ms, schedule tie-break 3540 → 150 ms, AwaitState 2000 → 20 ms), one desktop seam with a pinned 250 ms default, 11 hand mutations; template-DB copy (~7 ms vs ~45 ms bootstrap) noted as follow-up; A: Go tests >= 500 ms except webview2 and the T2 deadline tests (~15 packages, ~20 s cumulative) |
| T8 | S2, S3 | inline | done (003e0fb9, 893253c9) | `ditto changed --since fe516e48` over the 6 changed Go production files: 18/18 killed (score 1.00, bar 0.80) after two 1 ns rows killed the only survivors; no frontend production logic in range |
| T9 | S2 | inline | in progress (68233410: 9,663 -> 8,595, -11.1%; owner ruling pending) | count reduction, owner target "min 20% sounds good for me to begin". Counted unit: executed leaf cases (Go leaf tests incl. subtests, Vitest cases), so table rows never count as a reduction. Baseline fe516e48: Go 4,641 + frontend 5,022 = 9,663; target <= 7,730 (Go <= 3,712, frontend <= 4,017) |
| T9a | S2 | inline | done | maps in scratch: Go per-leaf own-package map (1,420 identical-path candidates of 4,525; too coarse: a path through another package looked identical), rerun with -coverpkg over the module; frontend per-test V8 map in one run (5,003 tests, 611 identical-path candidates). Deletes nothing |
| T9b | S2, S3 | delegated (parallel, worktree `t9-fe-season`) | done f0e94647 | features/season, shared/ordering, shared/season: 1,112 -> 968 (-13%), quota >= 223 missed by 79: the rest are boundary rows of pure helpers. Verifier PASS, 9 hand mutations |
| T9c | S2, S3 | delegated (parallel, worktree `t9-fe-notify`) | done 586974e6 | notifications, history, anime-detail, catalog, dashboard, devices, navigation, preferences: 1,081 -> 1,033 (-4%), merges only. Verifier FAIL fixed: a Back+Edit merge clicked both before asserting; now asserts after each click |
| T9d | S2, S3 | delegated (parallel, worktree `t9-fe-download`) | done 661e8684 | download, activity, episodes, backup: 1,052 -> 928 (-12%). Verifier FAIL fixed: a schedule merge made setEnabled(false) vacuous after a refetch already returned false; now setEnabled(true) |
| T9e | S2, S3 | delegated (parallel, worktree `t9-fe-editor`) | done a15adc45 | anime-editor, anime-create, infrastructure, app, scripts: 966 -> 858 strict, 771 with 87 disputed (71 pure-helper case merges + 16 it.each folds). Verifier PASS. Uncommitted until the owner rules on folded cases |
| T9f | S2, S3 | delegated (parallel, worktree `t9-fe-shared`) | done 6eb3d3f2 | src/shared except ordering and season: 792 -> 631 (-20%), quota met. Verifier PASS; restored the idle empty-array row; 15 cases are static-render merges (disputed) |
| T9g-T9k | S2, S3 | delegated (parallel, one worktree per unit) | done | Go leaves: desktop 1,134 -> 973 (46ead607), anime 1,050 -> 987 (9cca2506), observe 1,131 -> 994 (f1d5c7f7), sync 1,110 -> 906 (219d129e), tools 186 -> 173 (afeec2d7). Verifiers: observe FAIL fixed (2 restored validator rows, route test decodes each payload); others PASS. Gate gocognit fixes by helper extraction, no limit change. Merged in 68233410 |
| T9z | S2, S3 | inline | pending | ditto on CORE packages touched, final count against the target |

## Log

- L1 (2026-11-18, owner): "Good, today we are going to take the tecnical debt. First of all, we need
  clasifiy all the tests of the proyect. By date, performance, feature, module, language, etc. With
  all this information we are going to maximize the performance of the tests reducing them without
  lose quality. In this phase, the mutation tests are not allowed until the end of the refactor,
  because the mutations tests increments the development time in 10 times."
- L2 (2026-11-18): baseline measured on `fe516e48`, with each suite run alone. Go: 81 s wall, 174 s
  cumulative, 0 failures. Vitest: 320 s wall, 5,022 cases, 0 failures; per-file overhead (386 s
  cumulative) exceeds test bodies (197 s). The repo scripts reproduce the scratch CSV byte for byte.
  One glob-mirror bug (`shared/store/**` matching zero directories) was found and fixed before export.
- L3 (2026-11-18, owner): "about your plan i approve". Approved order: speed-ups that delete no tests
  first (T2-T5), then coverage tiers (T6) before any deletion (T7).
- L4 (2026-11-18): T2 verifier PASS; it found the 5 s production default no longer pinned (a 1 h ceiling
  would pass). Restored with `TestNewQueueShutdownCeilingDefaultsToFiveSeconds` in both packages; a hand
  mutation to `time.Hour` failed it and was reverted. The old `-short` skip is gone, so mutation runs now
  include the deadline test.
- L5 (2026-11-18): T3 measured on `--project node`: setup 18.6 s → 0 ms, wall ~23.5 s → 14.5 s, same
  2,141 tests. T4: 20 of 21 heuristic candidates pass under a forced node environment;
  `infrastructure/__tests__/activity-recorder-source.test.ts` reads `window` and stays in jsdom. The 20
  move by name to `*.node.test.ts(x)`; `fallow-list.json` is a stale scratch ledger and was left alone.
  Full suite after T3+T4: 319.75 s → 244.37 s and 244.94 s.
- L6 (2026-11-18): both full runs failed one test, `ActivityRangeField` "drops an unapplied pick on Esc"
  (`root.getElementById is not a function`); same config gave fail, fail, fail, pass, so it is a race,
  not a config regression. A stale-reference fix made it fail alone too (`Unable to find ... "dialog"`
  right after `findByRole`), which pointed to the real race: after Esc the closed dialog stays in the
  DOM, hidden, while it exits, and `queryByRole('dialog')` ignores hidden nodes, so the test reopened
  before the old node left. Fix: wait with `{ hidden: true }`.
- L7 (2026-11-18): the `{ hidden: true }` fix also failed (solo 3/5). Decisive check: the ORIGINAL test
  with the base `vite.config.ts` from `HEAD` failed alone 8/8, while it passed 3/3 earlier in the day.
  The failure is pre-existing on `dev` and likely time-dependent (`todayRange()` uses `new Date()`),
  not caused by T3/T4. It blocks every frontend commit through the gate, so a bounded worker is
  root-causing it (surface: that test file only; product code changes need owner input).
- L8 (2026-11-18): root cause found by the bounded worker with logging: HeroUI `DateRangePickerRoot`
  refocuses its trigger in a `requestAnimationFrame` after any keyboard-initiated close; a reopen inside
  that frame is closed by `useOverlay`'s blur, and `findByRole` had returned the dying dialog. Not time
  of day, not a product bug (a user cannot reopen within one frame). Fix: wait for the trigger to have
  focus before reopening. Worker 10/10 solo, parent 5/5 solo. The L6/L7 hypotheses were wrong.
- L9 (2026-11-18, owner): speed bands as the reference per test type: unit "< 10ms por test",
  integration "100-500ms por test", E2E "1-10 segundos por test". Measured: frontend `node` pure
  2,010/2,014 under 10 ms, Go unit 1,018/1,369; ~50 integration tests over 500 ms; no flow E2E exists.
  Owner: "dale" to the tier draft. The native coverage gate is Vitest-only, so Go tiers are guidance
  for T7 and mutation scope, not a gate.
- L10 (2026-11-18, owner): "sincronizacion con mobile es core". `internal/sync` is CORE as a whole.
- L11 (2026-11-18, owner): "descargas core". `internal/download` with `jdownloader` and `sites` is CORE.
- L12 (2026-11-18, owner): "es menos core que los anteriores, pero mas que important", then
  "ponle el orden important entonces". `shared/ordering` is IMPORTANT as a whole, helpers included.
- L13 (2026-11-18, owner): "a ver, a ver, primero dice que si  y luego que no. Decidete!" after the
  parent first proposed INFRASTRUCTURE for `internal/tracerbullet` without checking its consumers.
  Evidence: `activityread/bridge_runs.go:23-24` uses its "tracer bullet ready" entry as the boot marker;
  `retention/sweep.go:23-25` keeps it. Decision: IMPORTANT.
- L14 (2026-11-18): question 5 decided with evidence: the WebView2 engine test stays in the commit
  gate; `go-cover` in `lefthook.yml:89` is its only runner (CI has no full Go suite; `-short` skips it).
- L15 (2026-11-18, owner): "ok" to the T6 draft; T7 starts.
- L16 (2026-11-18): T7a. Kept `command-registry.constants` (no conflicting chords), `metadata-lookup.constants`
  (an unmapped MAL type is never filed as TV) and `app-layout.constants` (visible nav order). Deleted three
  whose behavior other suites guard: skeleton count and label in `KeymapPanel.test.tsx`, the binding in
  `use-notification-keyboard-scope.test.ts`, the version in `keymap.helpers.test.ts` (hand mutation
  version 1 -> 2 failed 6 remaining tests, reverted); the panel types now have 6 real consumers.
  Typecheck clean; keyboard + notification panel suites 37 files, 340 tests pass.
- L17 (2026-11-18): T7a committed (afa04fb4), full gate green; its time gain is ~0 (node suites under 10 ms). Baseline
  tests >= 500 ms: 68 in 39 files, 78.9 s cumulative; minus webview2 (kept, 18.9 s) and the T2 deadline tests
  (fixed, 10 s) leaves ~50 s cumulative spread over ~35 files. The larger remaining cost is jsdom per-file
  overhead (environment ~160 s cumulative over 312 files).
- L18 (2026-11-18, owner): "sigue nomás autonomanete, igual al final tendras que hacer los dos lados".
  Route: four parallel writers (Writer trigger a: independent units, disjoint surfaces, each several
  minutes of work), one sibling worktree each off this branch, heavy commands behind a machine lock,
  90-minute box each; parent owns git, merges locally, verifier per unit before its commit.
- L19 (2026-11-18): T7c verifier PASS. Pre-existing gap for T8: setting the provider-lookup debounce
  (`use-intake-provider-lookup.ts:59`) to 0 passes all 19 `IntakeProviderLookup.test.tsx` cases; no
  test pins that debounce. T7d verifier PASS; parent fixed its two notes (run-history burst steps
  100 -> 50 ms, still fails without clearTimeout, 5/5 green; JSDoc on `snapshotReads`).
- L20 (2026-11-18): commit gates run in the background were reaped under memory pressure; the T7d gate
  had failed to start layout-smoke with 0xc0000142 (process could not start). Owner: "you know, it exactly
  problem of "the machine ran low on memory" is one of the reasons of this refactors, because the
  machine was not ran high demand process". Measured then: WSL 6.4 GB, 43 MCP node servers 1.5 GB, a
  browser 3.3 GB, plus this run's parallel writers and verifiers. Owner: "please" to retrying T7d alone.
- L21 (2026-11-18): all four units merged with one whole-tree pre-merge-commit gate, green (43ca1627).
  Same-conditions comparison, baseline worktree at fe516e48 vs HEAD, run back to back:
  frontend vitest 338.7 s -> 253.2 s (463 -> 432 files, 5,022 -> 5,003 tests; environment 236.6 -> 172.6 s,
  setup 82.1 -> 43.0 s); peak memory added by the run 1,225 MB -> 933 MB.
  Go full suite (-p 4): three pairs, wall 77/66/66 s vs 59/70/78 s; contention noise exceeds the effect
  (untouched internal/sync varied by 4 s). Changed packages run alone: activityread 13.3 -> 7.7 s, desktop
  12.1 -> 12.2 s, anime 14.8 -> 7.3 s avg, eventlog 7.0 -> 1.9 s, requestcapture 5.8 -> 2.0 s. No regression.
- L22 (2026-11-18): T8. First runs: queues + async 12/14 (0.86), desktop 3/4 (0.75); the survivors were
  the same mutant in all three seams, `<= 0` -> `<= 1` on a duration (1 ns configured would fall back to
  the default). One table row each kills it (hand-proven, then ditto 14/14 and 4/4). Frontend range has no
  production logic (vite.config.ts and a comment), so per-test hand mutations stand as evidence.
  Pre-existing gaps found, outside this refactor's diff, left as follow-ups: the provider-lookup debounce
  (`use-intake-provider-lookup.ts:59`, set to 0 passes all tests) and the anime schedule tie-break at
  `schedule_service_normalization.go:92` (survives on the base code too); a migrated-template DB copy
  (~7 ms vs ~45 ms bootstrap) for every SQLite test; NotificationTable.windowing ~650 ms needs a smaller
  production page size.
- L23 (2026-11-18, owner, after the report showed 5,022 -> 5,003 frontend and 2,621 -> 2,627 Go tests):
  "you reduce the time, but the numbers of tests?" then "you order is reduce the number of tests".
  S2 was read as time only; the count reduction is reopened as T9.
- L24 (2026-11-18, owner, on the T9 method and target): "min 20% sounds good for me to begin".
  Go is counted by leaf cases (4,641 at baseline), not top-level functions (2,621), so merging
  functions into subtests cannot fake a reduction.
- L25 (2026-11-18): reduction rule given to every writer. Delete a test only when its path is identical to
  a kept test and its assertions are implied by the kept one's or differ by an input of the same
  equivalence class (never a boundary value). Merge tests that share the same arrange into one test
  keeping every assertion. Converting tests to it.each / table rows is not a reduction. Writers run
  focused tests only, at most four at once, because memory pressure already killed gates in this run.
- L26 (2026-11-18): writers collapsed pure-helper cases and table rows to reach quota; ruled not a
  reduction until the owner decides (asked: does folding a simple function's cases into one test that keeps
  every check count toward the 20%?). fe-notify and fe-season reverted theirs; fe-editor kept its 87 in an
  uncommitted diff (final.patch in scratch).
- L27 (2026-11-18): nine units verified independently (each with its own hand mutations) and merged in
  68233410; three verifier FAILs fixed before commit (vacuous setEnabled after refetch, Back/Edit asserted only
  after both clicks, two deleted validator rows plus a 200-only route merge). Counts at 68233410:
  Go 4,641 -> 4,069 leaves (-12.3%, full suite exit 0, 0 fail events), frontend 5,022 -> 4,526 (-9.9%, merge
  gate run), total 9,663 -> 8,595 (-11.1%). With fe-editor strict (858) the total is 8,487 (-12.2%); with
  its folds (771), 8,400 (-13.1%). Target <= 7,730 is not met under the strict rule. Verifiers flagged about
  215 committed cuts as merges of independent checks that share a fixture (desktop starting->failed 125,
  sync 43, observe about 30, shared 15, tools 2); if the owner rules those out they would be split back.
- L28 (2026-11-18, owner, to "Should folding a simple function's cases, or independent checks on shared
  setup, into one test that keeps every check count toward the 20%?"): "yeah". The ~215 committed
  independent-check merges stay; fe-editor commits with its 87 folds; a second round (T9l-T9o) folds
  table rows and pure-function cases into one test per function, keeping every input, expected value and
  boundary, with non-fatal per-case assertions that name the case.
- Next: fe-editor commit; T9l-T9o folding round toward Go <= 3,712 and frontend <= 4,017; T9z ditto on
  touched CORE packages; final report.
