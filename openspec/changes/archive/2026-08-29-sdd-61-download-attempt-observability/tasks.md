# Tasks — SDD-61 Download Attempt Observability

Change: `2026-08-29-sdd-61-download-attempt-observability`
Authority: `design.md` wins over every other document. Spec keys below map to
`specs/download/observability.md` (8 ADDED reqs / 26 scenarios) and `specs/download/sites.md`
(1 MODIFIED req / 6 scenarios).

> **Deliberate override of the 530-word budget**, on the same basis as the upstream artifacts. Strict
> TDD mandates a RED task per behavior, the brief mandates explicit MUTATE, commit and measurement
> tasks, and a 17-value enum split across two commits cannot be compressed without losing the split.

| Key | Requirement |
|---|---|
| PT | Download-Start Probe Timeline Is Persisted |
| RM | Every Package Removal Is Recorded With the Status That Justified It |
| HA | Every Hoster Attempt Is Recorded, Success Included (+ `sites.md` MODIFIED) |
| EX | Episode Terminal Exit Is Recorded |
| OB | The Observed Disk Count Is Recorded and Never Acted On |
| NB | Forensic Instrumentation Changes No Behavior |
| NW | The Anime Run-Outcome Structure Is Not Widened |
| SV | Forensic Records Survive the Persistence Pipeline |

**Threat matrix: N/A** (design §11 — no routing, shell, subprocess, VCS or executable boundary), so
no threat-matrix RED tasks exist.

**Final probe field name and origin — stated once, so apply never chooses between documents.**

- **Name: `elapsedMs`.** The spec writes `{at, found}`; design's §7 and §8 code blocks still write
  `atMs`. Spec names are indicative, design owns naming, and **`elapsedMs` is the shipped name**.
  `atMs` reads as epoch-millis in the same units as `occurred_at_ms` sitting beside it in every row,
  and the reader who misreads it is exactly the audience this change serves.
- **Origin: the top of `awaitHosterOutcome` (attempt start), per design D5.** NOT the start of the
  detect phase. Detect-relative offsets are always exactly 20000/40000/60000 — constant, therefore
  information-free, and the array degenerates into three booleans plus decoration. Anchored at
  attempt start, the FIRST offset exposes the JD pre-check round-trip, while the SPACING between
  consecutive entries still shows the 20 s schedule.
- **Design §2.2, §6, §7, §8, §9 and §13 still carry the superseded detect-phase framing and the
  `atMs` name. D5 wins; ignore those.**

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~545 total — slice 1 ~340, slice 2 ~205 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Slice 1 (commit 1) → Slice 2 (commit 2), sequential on `main` |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

The proposal cached `single-pr`; the orchestrator resolved it to two sequential commits, which is
`auto-chain` with a `stacked-to-main` chain. This repo has no PR workflow — it commits directly to
`main`, so each slice is a commit, not a PR. No `size:exception` is needed.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Items 1, 1b, 2, 4 — probe timeline (both paths), `jd_removed` on every removal, per-attempt ledger. No cross-file signature change. | Commit 1 on `main` | `go test ./internal/download/ -run "DetectStartPhase\|JdRemoved\|HosterAttempt"` | One real download run; confirm `download.detect_start_succeeded` and `download.jd_removed` rows exist in `runtime_events` | `git revert` commit 1 — touches `service_hoster_watch_exit.go` (new), `service_hoster_watch.go`, two `logf` sites in `service_pipeline.go`, two test files |
| 2 | Item 3 — closed 17-value `exit` enum, `:221` split, `episodeEnqueueResult`, E5 on `episode_downloaded`/`failed`. | Commit 2 on `main` | `go test ./internal/download/ -run "Exit\|EnqueueWithFallback\|Observed"` | One real download run; COUNT actual `runtime_events` rows (R5) | `git revert` commit 2 — restores `enqueueWithFallback`'s `(bool, string)` and the two repaired test files |

---

# SLICE 1 — commit 1 (items 1, 1b, 2, 4)

> **Apply correction (slice 1).** Task 1.1 also listed `exitUnset`, but nothing in slice 1 uses it and
> `unused` (U1000) rejected it -- verified by a failing `golangci-lint run`. It moves to task 4.1, where
> `lastExit` consumes it, honouring design §3's own rule that every constant lands in the commit that
> uses it.

## Phase 1: Infrastructure

- [x] 1.1 Create `internal/download/service_hoster_watch_exit.go`: `type exitReason string`, `const exitUnset exitReason = ""`, `type probe struct{ elapsedMs int64; found bool }`, and **only the four removal-stage values** — `precheck_dead`, `grace_query_error_first`, `grace_classified_dead`, `grace_no_signal_first` (design §3, which adopts the spec's indicative names verbatim). Declaring the other 13 here fails `unused` (U1000), which is enabled in `.golangci.yml`. → RM
- [x] 1.2 Doc-comment `elapsedMs` on the `probe` type: milliseconds elapsed since `attemptStart` — the `Clock()` read at the top of `awaitHosterOutcome` — and **not** an absolute instant. State the reconstruction a reader needs: on a `download.detect_start_failed` row, which fires just after the last probe, probe *n*'s absolute instant is `occurred_at_ms - (probes[last].elapsedMs - probes[n].elapsedMs)`. **Use the last recorded offset, never a literal 60000** — under the attempt-start anchor the last probe lands at `preCheckLatency + 60000`, so a hardcoded 60000 is wrong by exactly the pre-check round-trip. That join is what ties a probe window to JD's transfer window — the arithmetic the original `run-dl1532pqkk3g` investigation had to do by hand against an external log. → PT, SV
- [x] 1.3 Create `internal/download/service_hoster_watch_observability_test.go` with `fieldsRecorder`: implements **`logger.Logger`** (NOT `logger.EntrySink`) and is installed as `s.deps.Logger`; retains the full `logger.Fields` including `Metadata` and `Level`. Build it by **embedding `logger.Logger` and overriding only `Logf`**, so the four convenience methods need no no-op boilerplate. The nil embedded interface is safe here and it was verified, not assumed: `Logf` is the only method ever called on `deps.Logger` anywhere in `internal/download` (`service_effects.go:118`, sole call site). Do **not** widen `renameEventRecorder` — `service_rename_test.go` stays untouched (D9). → SV
- [x] 1.4 **No new service builder.** The probe tests reuse `newWatchTestService` (`service_hoster_watch_test.go:162`, which already advances the clock via `PollSleep`) with post-construction steering — the established pattern at `service_hoster_watch_test.go:503-506`: `s.deps.DetectStartPhaseDisabled = false`, `s.deps.HasPartFiles = ...`, `s.deps.Logger = rec`. **The R6 trap is `baseDeps`** (`service_test_builders_test.go:69,71` — fixed `Clock`, no-op `PollSleep`), which the four existing probe tests use directly; a probe test written in their style records `elapsedMs` 0/0/0 and passes vacuously. Steering `newWatchTestService` is what avoids it. → PT

## Phase 2: Implementation (RED → GREEN)

- [x] 2.1 RED: probe offsets are real elapsed time. Drive `awaitHosterOutcome` through a steered `newWatchTestService` with `.part` never found, then assert, every expected value a **literal** — never `int64(config.X)`:
  - `len(probes) == 3`
  - `probes[1].elapsedMs - probes[0].elapsedMs == 20000`
  - `probes[2].elapsedMs - probes[1].elapsedMs == 20000`
  - `elapsedMs` is strictly increasing across the array (the spec's "Probe timestamps advance across the schedule")

  **Leave the first offset free** (at most `probes[0].elapsedMs >= 20000`). Do NOT assert the triple `{20000, 40000, 60000}`: those are the *detect-relative* values, so pinning them re-pins the degenerate anchor the D5 ruling rejected, and under the attempt-start anchor they hold only because the fake JD pre-check costs zero simulated time. Spacing is what kills the fixed-clock mutant — a constant clock yields spacing 0. → PT
- [x] 2.2 RED: probe 2 finds `.part` → exactly one `info` `download.detect_start_succeeded`, `probes` length 2, last entry `found:true`. → PT
- [x] 2.3 RED: exactly ONE entry per detect phase on both outcomes, never one per probe. → PT
- [x] 2.4 GREEN: add `attemptStart := s.deps.Clock()` as the **first statement of `awaitHosterOutcome`** and pass it down. **`awaitHosterOutcome`'s own signature does NOT change** — `attemptStart` is a local, and its 8 call sites in the frozen `service_hoster_watch_test.go` (`:186, 216, 240, 270, 288, 311, 326, 508`) stay untouched. `detectDownloadStartPhase` gains that one parameter and returns `(bool, []probe)`, appending `probe{elapsedMs: s.deps.Clock().Sub(attemptStart).Milliseconds(), found}` per check; emit E1 on the found path. Leave the existing `s.publish` and the `DetectStartPhaseDisabled` early return byte-identical (`:105` still emits nothing). → PT, NB
- [x] 2.5 GREEN: repair the four existing probe tests in `service_hoster_watch_test.go` (`:415`, `:441`, `:459`, `:475`) **in place** for both the new return type and the new `attemptStart` parameter — call-site types only, **zero assertion edits**. Append nothing; the file is 422 effective lines and frozen. → PT
- [x] 2.6 RED: `download.detect_start_failed` carries the ordered 3-probe array with every `found:false`. → PT
- [x] 2.7 GREEN: `awaitHosterOutcome:200` stops discarding the second value and forwards it; `evaluateJDAfterGrace` gains a `probes []probe` param and widens its existing E2 map; its return narrows to `*hosterOutcome` (nil ⇒ proceed), **deleting the `hosterOutcome{}` sentinel at `:261`** (D2 — no test calls it directly). → PT
- [x] 2.8 RED: every removal persists one `warn` `download.jd_removed`, **including a successful removal**, with a `stage` distinct per site. → RM
- [x] 2.9 RED: the removal after a failed status query (`:248`) records `statusKnown:false` and does not report zeroed counts as measured. → RM
- [x] 2.10 RED: a removal over a `dead` verdict with finished work records both `anyFinished:true` and `verdict:"dead"`, and the entry contains no package names, file names, link URLs or destination paths. → RM
- [x] 2.11 GREEN: `jdRemove` gains `stage exitReason` and `status *jdownloader.DestinationStatus` (nil-able); it emits `warn` `download.jd_removed` **before** `RemoveByDestination`, carrying counts and booleans only — `links`/`packages` as `len(...)`, never the arrays (D6) — and writes `stage` into the message text as well (R3: metadata is unfilterable). Pass the stage at all four call sites: `:146`, `:248`, `:255`, `:265`. → RM, SV
- [x] 2.12 RED: N hosters → exactly N `info` `download.hoster_attempt` rows, including an enqueue-error hoster **and** the winning one; `attemptIndex` `0` then `1` across a fallback chain. → HA
- [x] 2.13 RED: the existing failure-taxonomy `download.failed` emits stay unchanged in level, event type and `failureKind`; the ledger is additive and never alters `error_summary`. → HA, NB
- [x] 2.14 GREEN: emit `download.hoster_attempt` at **TWO** sites in `enqueueWithFallback` — inside the switch (`:351-364`, all three branches) **and** on the enqueue-error path (`:343-349`), which `continue`s at `:348` and never reaches the switch. A single emit in the switch silently violates "exactly one row per attempt". `outcome` vocabulary: `success`, `dead`, `timeout`, `enqueue_error`. → HA
- [x] 2.15 RED: every new metadata map marshals under the persistence bound — assert `len(jsonBytes) < 4096` against the **literal** 4096, never `maxMetadataBytes` (another package's unexported symbol, and the very constant being pinned). → SV

## Phase 3: Verification and commit

- [x] 3.1 Run `gofmt -w .`, `go vet ./...`, `golangci-lint run` (U1000 must pass with only the four exit values declared) and `go test ./internal/download/...`.
- [x] 3.2 MUTATE: stage slice 1, run `ditto staged` (`--dry` first to confirm the scope resolved to the staged lines, not the whole file). **The mutant that must die: reverting `s.deps.Clock()` to a constant in `detectDownloadStartPhase`.** Hand-picking mutants is the fallback only.
- [x] 3.3 **RUN** `go run ./tools/checkgofilesize` — do not assume. Confirm `tools/checkgofilesize/baseline.yaml` is still `files: []` (design predicts `service_hoster_watch.go` ~375 raw at this point).
- [x] 3.4 **Verification step, NOT a Go test.** The zero-line-diff guarantee is diff-checkable; asserting it from a unit test would be an orphan assertion that proves nothing. Run, against the pre-change baseline, `git diff --stat <base>..HEAD -- internal/download/service.go internal/download/service_notification_rows.go internal/events/event.go docs/openapi.yaml openspec/specs/download/orchestration.md` and require **empty output**. `animeProgressDelta` is a type ALIAS of `animeRunOutcome` (`service.go:228`, declared with `=`, 24 non-test references: `service.go` 4, `service_pipeline.go` 19, `service_single_anime.go` 1) — one type, no seam to be careful at, so widening the outcome IS widening the live progress payload. If an emit site appears to need a forensic field there, **move the emit site**. → NW, NB
- [x] 3.5 Design §9.1 guard (b) — **check the diff, do not trust the claim**: every pre-existing test edited by this slice must be a **type-only call-site repair**. Confirm no `t.Fatalf` line and no expected-value literal changed in any pre-existing test (slice 1 touches only the four probe call sites in `service_hoster_watch_test.go`). A changed assertion means behavior moved. → NB
- [~] 3.6 [DEFERRED to slice 2 - needs live JD] Runtime harness: one real download run; confirm `download.detect_start_succeeded` and `download.jd_removed` rows actually reach `runtime_events` (proving `logf` persistence end to end, not just the unit assertions).
- [x] 3.7 **R8 — the slice 1 verify report MUST state plainly that "was the success observed or inferred" is still unanswerable until slice 2 lands.** It must not read as "the observability gap is closed".
- [x] 3.8 Commit slice 1. Conventional commit, **no Co-Authored-By and no AI attribution**, command timeout ≥ 300000 ms, never `--no-verify`.

---

# SLICE 2 — commit 2 (item 3)

> **Apply correction (slice 2).** Three things the brief and design did not have right, recorded
> where the next reader will look:
>
> 1. **`enqueueWithFallback` had SEVEN test call sites, not five.** Task 5.10 lists
>    `service_cancel_test.go:204` and `service_fallback_test.go:37,57,83,125`; slice 1 added two more
>    in `service_pipeline_observability_test.go` (`:26`, `:169`). All seven are repaired, all
>    type-only.
> 2. **Two gate findings that a bare `golangci-lint run` does not report.** Splitting `:221` pushed
>    `awaitHosterOutcome` to gocognit 16, and the result literals pushed `enqueueWithFallback` to
>    funlen 62. FASE 2 is now `pollForCompletion`, extracted verbatim with nothing reordered and no
>    condition changed; the three result literals were reflowed to two lines each. `scripts/lint.ps1
>    -Profile all` is the run that sees these -- plain `golangci-lint run` reported 0 issues at the
>    same moment the gate profile reported 2.
> 3. **`service_hoster_watch.go` measured 340 raw lines, not the ~425 the design predicted.**
>    Extracting the poll and keeping the enum in its own file is why. `baseline.yaml` stays `files: []`.

## Phase 4: Infrastructure

- [x] 4.1 Extend `service_hoster_watch_exit.go` with the remaining **13** `exitReason` values **plus `exitUnset` (`""`)**, closing the enum at **17**. Names come from the design §3 table verbatim — including the three fallback mirrors `grace_client_absent_fallback`, `grace_query_error_fallback`, `grace_no_signal_fallback`, and `cancelled_during_poll` (which pairs with `fs_poll_deadline`). → EX
- [x] 4.2 Add `exit exitReason` to `hosterOutcome`; declare `episodeEnqueueResult{succeeded, failureKind, hoster, attemptIndex, exit, baseline, observed}` in `service_pipeline.go` as a **DISTINCT named type with no relationship to `animeRunOutcome`** — assigning one to the other must be a COMPILE ERROR. That is the structural half of the no-widening rule (design §8); the reflect guard in 5.16 is the other half, and neither is sufficient alone. Comment that the struct is consumed inside `processAvailableEpisode` and dies in that local scope. → EX, NW

## Phase 5: Implementation (RED → GREEN)

- [x] 5.1 RED: `:221` split — deadline exceeded → `fs_poll_deadline`; cancelled context → `cancelled_during_poll`; **both true → `fs_poll_deadline`**. → EX
- [x] 5.2 GREEN: split `:221` into two sequential `if`s with the **deadline checked first**, preserving today's `||` left-first label. Same truth table, same `kind`. → EX, NB
- [x] 5.3 RED: the same post-grace condition reached as first hoster vs as fallback records **different** `exit` values. → EX
- [x] 5.4 RED: entry-guard success (`disk_ahead_at_entry`, no rename) is distinguishable from poll-confirmed success (`fs_poll_confirmed`, renames) **from `exit` alone**. → EX
- [x] 5.5 RED: no emitted `exit` is `exitUnset` — every `hoster_attempt`, `episode_downloaded` and `failed` row asserts `exit != ""`. → EX
- [x] 5.6 RED: the post-grace proceed-and-continue path carries **no** `exit`; the recorded value comes from the attempt's eventual terminal point. → EX
- [x] 5.7 GREEN: stamp `exit` at all 13 attempt-level terminal returns in `service_hoster_watch.go` per the design §3 site → value → kind table. → EX
- [x] 5.8 RED: pre-attempt exits (`jd_unavailable`, `cancelled_before_attempt`, `no_hosters`) differ from an exhausted chain, which carries the **last attempt's** exit, not a synthetic `exhausted`. Cover both users of the shared `:366` return: empty `ordered` → `no_hosters`; every hoster failed → the last attempt's exit. → EX
- [x] 5.9 GREEN: `enqueueWithFallback` returns `episodeEnqueueResult` and tracks `lastExit exitReason` initialised to `exitUnset`. Stamp the four pipeline exits; at `:366` return `no_hosters` **iff `lastExit == exitUnset`**, otherwise `lastExit` (design §3 #17). `exitUnset` is the discriminator because it can only survive when no attempt ever ran — this separates "the extractor produced nothing" from "every hoster failed" **without branching on any behavior-carrying value**, and needs no 18th enum value. `enqueue_error` is always an ATTEMPT exit (it emits its own `hoster_attempt` row) and becomes the episode exit only by surviving as `lastExit`. Add `exit` to the slice-1 `hoster_attempt` map. → EX, HA
- [x] 5.10 GREEN: repair the five broken call sites for the struct return (R4) — `service_cancel_test.go:204` and `service_fallback_test.go:37`, `:57`, `:83`, `:125`.
- [x] 5.11 RED: E5 — `download.episode_downloaded` and the episode-level `download.failed` carry `exit`, `hoster`, `attemptIndex`, `baseline`, `observed`, with `failureKind` unchanged. → EX
- [x] 5.12 GREEN: unpack the struct at `service_pipeline.go:181` into the `logf` maps at `:192` and `:183` and **discard it there** — never assigned to `outcome`, never passed to `emitProgress`, never crossing into `animeRunOutcome`. → NW
- [x] 5.13 RED (flagship, R7): the `run-dl1532pqkk3g` replay — JD classifies dead in FASE 1B **while the disk count has advanced past baseline**. Assert the episode still reports **failed**, the package removal still occurs, and `download.failed` carries `observed > baseline`. This fails the moment anyone branches on `observed`. → OB
- [x] 5.14 RED: two attempts differing ONLY in the observed disk count produce the same verdict, the same failure classification and the same run counters; only the recorded `observed` differs. → OB, NB
- [x] 5.15 GREEN: compute `observed` **only** inside the terminal `return` that builds `episodeEnqueueResult` (D7) — a value that does not exist before the return cannot be branched on. → OB
- [x] 5.16 RED: the `animeRunOutcome` run-time guard (D10). Reflect over `animeRunOutcome`'s fields and fail if any is named in the forbidden forensic set `{exit, hoster, attemptIndex, baseline, observed, winningHoster}`, with a failure message naming the alias hazard. Also assert `reflect.TypeOf(animeRunOutcome{}) == reflect.TypeOf(animeProgressDelta{})`, so converting the alias into a defined type — which would silently void the guard's second half — fails loudly. Pin the forbidden **vocabulary**, never the field list or field count: SDD-60 legitimately adding a notification field must stay green. This is the run-time half that 4.2's compile-time guard cannot cover, because a distinct result type does not stop anyone adding `exit string` directly to `animeRunOutcome`. → NW

## Phase 6: Verification and commit

- [x] 6.1 Run `gofmt -w .`, `go vet ./...`, `golangci-lint run` and `go test ./internal/download/...`.
- [x] 6.2 MUTATE: stage slice 2, run `ditto staged` (`--dry` first). **The mutant that must die: collapsing the `:221` split back into one `if`.**

> **Apply note (slice 2, task 6.2).** `ditto staged` generated 4 mutants over the staged production
> lines and finished **4/4 killed** (first pass 2/4: both survivors were `noAttemptIndex = -1`
> mutated to `-0`/`-2`, because nothing pinned what a pre-attempt exit credits; `assertNothingCredited`
> and `assertCredited` in task 5.8 close that gap). `ditto` generates no "merge two ifs" mutant, so
> the `:221` collapse was hand-mutated per `CLAUDE.md` #16 and **died**, as did the order-swap mutant
> that checks cancellation first: the collapse fails `cancelled before the deadline`
> (`cancelled_during_poll` -> `fs_poll_deadline`) and the swap fails `both true keeps the deadline
> label` (`fs_poll_deadline` -> `cancelled_during_poll`), which is design D3's ordering claim proved
> rather than asserted.
- [x] 6.3 Design §9.1 guard (b) for this slice — confirm the repairs in `service_cancel_test.go` and `service_fallback_test.go` (5.10) are **type-only**, with no `t.Fatalf` line and no expected-value literal changed in any pre-existing test. → NB
- [x] 6.4 **RUN** `go run ./tools/checkgofilesize` — design predicts `service_hoster_watch.go` reaches ~425 raw after this slice. `baseline.yaml` stays `files: []`.
- [~] 6.5 [DEFERRED - needs a live scheduled run; measure before archive] **R5 MEASURE**: run one instrumented download run and **count the actual `runtime_events` rows it produced**. Report the measured number against the 20000 shared cap; the 15–30/run figure is an estimate, not a measurement. → SV
- [x] 6.6 Re-run 3.4's `git diff --stat` with the range spanning **both** commits and require empty output — this is the scenario's real acceptance check with the complete change applied. Report the untouched `docs/openapi.yaml` and mobile sync contract as a positive finding, not an omission. → NW, NB
- [x] 6.7 Append one lesson with `node scripts/log-lesson.mjs "..."` — one line, ≤300 characters, never by editing `docs/learning-log.md` by hand.
- [x] 6.8 Commit slice 2. Conventional commit, **no Co-Authored-By and no AI attribution**, command timeout ≥ 300000 ms, never `--no-verify`.
