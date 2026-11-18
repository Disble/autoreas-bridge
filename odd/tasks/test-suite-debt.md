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
| T3 | S2 | inline | pending | `node` project stops loading the React Testing Library setup it never uses (measure first) |
| T4 | S2 | inline | pending | DOM-free jsdom suites move to the `node` project |
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
- Next: T3, measured before and after.
