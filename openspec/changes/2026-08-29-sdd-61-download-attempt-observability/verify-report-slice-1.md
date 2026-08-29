# Verify Report — SDD-61 Slice 1

Verified by the orchestrating agent directly (CLAUDE.md #3). Every command below was re-run by
the verifier, not taken from the apply agent's report.

Baseline commit: `bc82d5a`.

## What slice 1 does NOT answer

**"Was the download success observed, or merely inferred from a disk count?" is still
unanswerable.** That question is answered by `exit`, which ships in slice 2. Slice 1 records the
probe timeline, the removal ledger and the per-attempt ledger — it does not close the
observability gap that motivated this change. A `run-dl1532pqkk3g`-class investigation run against
slice 1 alone would still require JDownloader's log to attribute the download.

This section exists because the change is easy to mis-summarise as "the gap is closed". It is not,
until slice 2 lands.

## Gate results

| Check | Command | Result |
|---|---|---|
| Format | `gofmt -l internal/` | clean |
| Vet | `go vet ./...` | exit 0 |
| Lint | `golangci-lint run` | **0 issues** (U1000 passes with only the four exit values declared) |
| Tests | `GOMAXPROCS=4 go test -p=4 -count=1 ./internal/download/...` | all packages ok |
| File size | `go run ./tools/checkgofilesize` | passed; three pre-existing warnings, **no new ones** |
| Size baseline | `tools/checkgofilesize/baseline.yaml` | still `files: []` |
| Mutation | `ditto staged` (apply agent) | 17/17 killed, 0 survived, score 1.00 |

## Zero-line diff (task 3.4)

`git diff --stat HEAD -- internal/download/service.go internal/download/service_notification_rows.go internal/events/event.go docs/openapi.yaml openspec/specs/download/orchestration.md`

**Empty output — passes.** `animeRunOutcome` is untouched, so nothing leaks into its
`animeProgressDelta` alias or the live progress fan-out, and slice 1 stays disjoint from
in-flight SDD-60.

## Substantive verification

Re-checked against source rather than against the apply report:

- **Probe anchor** — `attemptStart := s.deps.Clock()` at the top of `awaitHosterOutcome`
  (`service_hoster_watch.go:199`), passed to `detectDownloadStartPhase` at `:216`, offsets computed
  as `Clock().Sub(attemptStart)`. `awaitHosterOutcome`'s signature is unchanged; all 8 call sites
  untouched.
- **`exitUnset` correctly absent.** Apply proved by a real failing lint run that it cannot ship in
  slice 1: `unused` rejects it, and staticcheck's "one used constant marks the group used"
  leniency does not apply to a typed non-iota group. Deferred to slice 2 where `lastExit` consumes
  it. Only four values are declared, all matching the spec names.
- **`hoster_attempt` has both emit sites** — `service_pipeline.go:350` on the enqueue-error path
  before its `continue`, and `:355` after `awaitHosterOutcome`. Extracted into
  `recordHosterAttempt` so the two sites cannot drift, with the reason recorded in a comment at
  the call site.
- **`jd_removed` payload is counts and booleans only** — `len(status.Links)`,
  `len(status.PackageSignals)`, never the arrays (design D6, so the all-or-nothing 4 KB bound
  cannot destroy the probes array). `statusKnown` distinguishes a blind removal from an
  evidence-based one. The emit precedes the removal, so it records what was observed rather than
  what the removal confirmed.
- **The `run-dl1532pqkk3g` signature is now expressible**: `anyFinished:true` together with
  `verdict:"dead"` on a `download.jd_removed` row is exactly the condition that made the original
  incident invisible.
- **Anchor mutant killed by exactly one test.** `ditto` cannot generate the "anchor moved back to
  the detect phase" mutant, and under a zero-latency pre-check fake both anchors produce identical
  offsets. The test that kills it injects 3 s of pre-check latency and asserts `{23000, 43000,
  63000}`; the leading `23000` exists only under attempt-start anchoring.

## Task 3.5 — design §9.1 guard (b): judged, not rubber-stamped

The guard says every pre-existing test edit must be a **type-only** call-site repair, with no
`t.Fatalf` and no expected-value literal changed. **As literally written, this guard fails**: four
tests in `service_hoster_watch_test.go` changed both their `t.Fatalf` lines and their assertions.

Judged on substance, it holds, and the reason matters:

`detectDownloadStartPhase`'s second return value changed from `*hosterOutcome` to `[]probe`, so
`outcome.kind != hosterOutcomeDead` was impossible to preserve — that type no longer occupies that
position. More decisively, **the old return value was already dead code in production**: its only
production call site read `started, _ :=` and discarded it (recorded in `explore.md`). The removed
assertions were pinning a value production never read.

The replacements are strictly stronger — `len(probes) != 1` / `!= 3` / `probes != nil` pin the
recorded probe count on the immediate-hit, exhausted-schedule and disabled paths respectively,
where the old assertions only checked a discarded pointer. The `started` assertions, which are the
values production actually branches on, are unchanged in all four tests.

Recommendation for slice 2: state the guard as "no assertion on a value production reads may
change" rather than "no `t.Fatalf` may change", which is what it was reaching for.

## Deferred

- **Task 3.6 (runtime harness)** — not performed. It requires a live JDownloader session and an
  anime with an episode actually available online; neither can be summoned deterministically here.
  Mitigation: the `logf` → `FanoutLogger` → `eventlog.Sink` → SQLite path is already proven end to
  end by every existing `download.*` row in `runtime_events`, and the new emissions use that same
  `logf` seam. What remains unproven is only that these specific call sites fire in production,
  which the unit tests cover via `fieldsRecorder`. Carry to slice 2 verification, where one real
  run can validate both slices at once.
- **Task R5 (measured row count per run)** — deferred to slice 2 for the same reason; the estimate
  of 15–30 rows per run against the 20000 shared cap remains unmeasured.

## Verdict

**Slice 1 passes.** Proceeding to commit, then slice 2.
