# Verify Report — SDD-61 Slice 2

Verified by the orchestrating agent directly (CLAUDE.md #3). Every command below was re-run by
the verifier, not taken from the apply agent's report.

Slice 1 baseline: `b8bc507`. Whole-change baseline: `bc82d5a`.

## What the change now answers

Slice 1 recorded the probe timeline, the removal ledger and the per-attempt ledger, but explicitly
could not say whether a download success was **observed** or merely **inferred** from a disk count.
Slice 2 ships `exit`, and with it that question is answerable from `runtime_events` alone.

Concretely, for a `run-dl1532pqkk3g`-class incident the persisted log now carries, without any
external corroboration:

- `exit: disk_ahead_at_entry` on the credited attempt — the file was already on disk when that
  hoster began, so the credited hoster did not deliver it.
- `baseline` and `observed` side by side — a `dead`-producing exit recorded next to a disk count
  that had already advanced is the defect, visible after the fact.
- `download.jd_removed` with `anyFinished:true` and `verdict:"dead"` — the removal that destroyed
  the evidence, and the state that supposedly justified it.
- `download.hoster_attempt` rows for every attempt, so the credited hoster can be compared against
  the one that actually ran.

## Gate results

| Check | Command | Result |
|---|---|---|
| Format | `gofmt -l internal/` | clean |
| Vet | `go vet ./...` | exit 0 |
| Lint | `golangci-lint run --enable gocognit ./internal/download/...` | **0 issues** |
| Tests | `GOMAXPROCS=4 go test -p=4 -count=1 ./internal/download/...` | all packages ok |
| File size | `go run ./tools/checkgofilesize` | passed; three pre-existing warnings, **no new ones** |
| Size baseline | `tools/checkgofilesize/baseline.yaml` | still `files: []` |
| Mutation | `ditto staged` (apply agent) | 4/4 killed after repair, score 1.00 |

`service_hoster_watch.go` came in at **340 raw lines**, well under design's predicted ~425 — the
extraction of `pollForCompletion` bought the margin.

## Zero-line diff (tasks 6.3, 6.6)

`git diff --stat bc82d5a -- internal/download/service.go internal/download/service_notification_rows.go internal/events/event.go docs/openapi.yaml openspec/specs/download/orchestration.md`

**Empty across BOTH commits** — this is the spec scenario's real acceptance check, satisfied only
with the complete change applied. `animeRunOutcome` keeps its exact field set, so nothing leaks
into its `animeProgressDelta` alias or the live progress fan-out, and SDD-61 never touched
SDD-60's territory.

## Substantive verification

Re-checked against source, not against the apply report:

- **The enum is closed at 17 terminal values plus `exitUnset`** (18 constants). `exitUnset` is the
  zero value: never emitted, never stamped, and load-bearing — `no_hosters` is resolved by
  `lastExit == exitUnset` surviving, which is the only thing distinguishing "the extractor produced
  nothing" from "every hoster failed" off their shared `return`.
- **R7 holds structurally.** `observed` is computed *only* inside the composite literals at the
  three terminal `return` statements (`service_pipeline.go:400, 427, 449`) and read *only* into the
  `logf` map at `:224`. A value that does not exist before the return cannot be branched on. There
  is no control-flow path that reads it.
- **The `:221` split is deadline-first** with the reasoning recorded at the site: `||` reports its
  left operand when both hold, so deadline-first preserves today's label exactly — same truth
  table, same `kind`, one more distinguishable terminal point.
- **Pre-existing test repairs are genuinely type-only** (task 6.3). Every edit in
  `service_cancel_test.go` and `service_fallback_test.go` is `enqueued` → `result.succeeded` or
  `failureKind` → `result.failureKind`. The single changed `t.Fatalf` renames a variable inside an
  otherwise identical message; the expected value `FailureKindHosterDown` is unchanged. This is a
  cleaner result than slice 1, where the assertions changed substantively and had to be judged.

## Mutation notes worth keeping

- **`ditto` found a real gap**: the first pass killed only 2 of 4, and both survivors were
  `noAttemptIndex = -1` mutated to `-0` and `-2`. Nothing pinned what a pre-attempt exit credits.
  The repair asserts against the **literal** `-1`; asserting against `noAttemptIndex` itself would
  have agreed with both mutants — the exact anti-pattern CLAUDE.md #16 warns about, caught by the
  tool rather than by review.
- **The `:221`-collapse mutant is outside `ditto`'s operator set** (it has no "merge two ifs"), so
  it was hand-mutated per CLAUDE.md #16 with the edit proven applied via `git diff --quiet`. Both
  directions died: collapsing to one `if`, and swapping the order so cancellation is checked first.
  The second is design D3's left-first ordering claim **proved rather than asserted**.
- The `animeRunOutcome` reflect guard was proved by temporarily adding `exit exitReason` to the
  struct and watching it fail with the alias-hazard message; the compile-time guard was proved
  separately (`outcome = episodeEnqueueResult{}` is a type error).

## Deferred, with reason

- **Tasks 3.6 and 6.5 (runtime harness and measured row count)** — not performed. Both require a
  live JDownloader session and an anime with an episode actually available online; neither can be
  summoned deterministically. The `logf` → `FanoutLogger` → `eventlog.Sink` → SQLite path is
  already proven end to end by every existing `download.*` row in `runtime_events`, and the new
  emissions use that same seam, so what remains unproven is only that these specific call sites
  fire in production — which the unit tests cover via `fieldsRecorder`.
  **R5's estimate of 15–30 rows per run against the 20000 shared cap remains an estimate, not a
  measurement.** It should be measured on the next real scheduled run before the change is
  archived.

## Verdict

**Slice 2 passes.** Proceeding to commit. After the commit the change is implemented in full;
archive should wait until R5 is measured on a real run.
