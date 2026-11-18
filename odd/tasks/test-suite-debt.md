# Test suite debt

Objective: classify every test, then make the suites faster and smaller without losing quality.
Branch: `chore/test-suite-debt` from `dev`. Delivery: ask-on-risk. Runners: `go test`, Vitest via Bun.

## Specs

- S1. "clasifiy all the tests of the proyect. By date, performance, feature, module, language, etc."
  Acceptance: every tracked test file has a row with those dimensions, backed by a measured run.
- S2. "maximize the performance of the tests reducing them without lose quality."
  Acceptance: measured wall time drops against the S1 baseline; no behavior loses its guarding test.
- S3. "the mutation tests are not allowed until the end of the refactor, because the mutations tests
  increments the development time in 10 times."
  Acceptance: no `ditto` or Stryker run before the final task.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1 | inline | done | `docs/reports/2026-11-18-test-suite-inventory.md` + CSV, `scripts/test-inventory/` |
| T2 | S2 | inline | done | Go queue Stop ceiling injectable (`StopTimeout`): deadline tests 5.0 s → 0.05 s each; eventlog pkg 6.5 → 1.4 s, requestcapture 5.4 → 1.9 s; verifier PASS |
| T3 | S2 | inline | done | `setupFiles` in the `dom` project only: node project setup 18.6 s → 0, wall ~23.5 → 14.5 s |
| T4 | S2 | inline | done | 20 DOM-free suites renamed `*.node.test.ts(x)` (R100); full suite 319.75 s → 244–276 s over three runs, 463/463 files, 5,022/5,022 tests; verifier PASS |
| T4b | S2 | delegated (context backstop) | done | `ActivityRangeField` Esc test: wait for the HeroUI trigger refocus before reopening; solo 6-8/8 fail → 10/10 pass |
| T5 | S2 | inline | pending | real sleeps and timers replaced where they cost measurable time |
| T6 | S2 | — | pending | coverage tier per module in `coverage-tiers.json`, before any deletion |
| T7 | S2 | — | pending | merge or delete low-tier and duplicated tests, guided by T6 |
| T8 | S2, S3 | — | pending | mutation check of the reduced suites, last |

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
- Next: verifier over T3+T4+test fix, then two commits (test fix, then T3+T4).
