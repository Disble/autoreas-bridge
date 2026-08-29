# Tasks — SDD-62 Download Hoster Verdict Fix

Change: `2026-08-29-sdd-62-download-hoster-verdict-fix`
Authority: `design.md` wins over every other document. Spec keys below map to
`specs/download/observability.md` (3 MODIFIED + 1 ADDED, 14 scenarios) and
`specs/download/orchestration.md` (3 ADDED, 9 scenarios).

> **Deliberate override of the 530-word budget**, on the SDD-61 precedent. Strict TDD mandates a RED
> task per behavior; the orchestrator mandates explicit MUTATE, runtime-harness and commit tasks plus
> an auditable forecast breakdown; and the one legitimate assertion inversion has to be declared in
> the artifact or `sdd-verify` reads it as a behaviour regression.

| Key | Requirement | Delta |
|---|---|---|
| EX | Episode Terminal Exit Is Recorded | observability MODIFIED |
| OB | The Observed Disk Count Is Recorded and Never Acted On | observability MODIFIED |
| NB | Forensic Instrumentation Changes No Behavior | observability MODIFIED |
| RE | The Post-Grace Disk Re-Check Records Its Own Evidence | observability ADDED |
| FT | Filesystem Is Success Truth, JD Status Is Failure Truth | orchestration ADDED |
| CB | The Post-Grace Success Comparison Uses One Counting Basis | orchestration ADDED |
| SC | Every Success Path Completes the Episode | orchestration ADDED |

**Threat matrix: N/A** (design §9 — no routing, shell, subprocess, VCS or executable boundary), so no
threat-matrix RED tasks exist.

## Settled — do not reopen

- **R-3.** `recursiveBaseline := s.downloadedEpisodeRecursive(folder)` is a LOCAL in
  `awaitHosterOutcome` (signature unchanged). The re-check compares recursive against THAT, never
  against `baselineCount`. Design §2.1 falsifies recursive-vs-root twice.
- **D1b.** Reuse `download.detect_start_failed`. No new event type, no spec change to the probe
  requirement. **The `diskConfirmed` key and the `failureKind` omission are WITHDRAWN** (design
  update): the entry was never a failure marker — it already appears today on attempts that go on to
  succeed through `fs_poll_confirmed` — and the ADDED requirement binds "the same metadata shape",
  which the omission would have violated. One extracted `logDetectStartFailed` emits **byte-identically
  on both paths**, so shape identity is structural instead of something tests must police, and
  `service_hoster_watch_observability_test.go` stays out of the diff entirely.
- **Ordering.** The re-check runs BEFORE `evaluateJDAfterGrace`, because
  `RenameEpisodeByDestination` only resolves while JD still holds the package.

## Corrections to design/brief, verified against source

- **K1 — `jd.recordedRemovals()` does not exist.** `svcFakeJDClient.RemoveByDestination`
  (`service_test_helpers_test.go:143-145`) records nothing. T1 asserts "no removal" through the
  recorder instead: `recorder.byEventType("download.jd_removed")` must be empty. `jdRemove` logs that
  entry unconditionally BEFORE calling `RemoveByDestination`, so absence of the entry is absence of
  the removal, and it still kills M4. No new fake is needed.
- **K2 — a THIRD comment de-staling.** Design §5 lists two. `exitDiskAheadAtEntry`'s doc comment
  (`service_hoster_watch_exit.go:32-35`) says *"It flattens and returns without renaming, which is
  what separates it from exitFSPollConfirmed"* — D2c makes both clauses false. Task 4.3 fixes it.
- **K3 — D1 breaks no existing test, and D2c breaks exactly one.** Verified: `NewService` defaults
  `RenameEpisodes` to `false` (`service.go:176-177`), and only `successExit`
  (`service_hoster_watch_exit_test.go:159`) sets it true, so no frozen test renames. `postGraceDeadEnd`
  (`:99-110`) and `postGraceProceed` (`:199-210`) hold `recursive == atRoot == baseline`, so the
  re-check reads equal and returns nil. Both stay green untouched.
- **K4 — a FOURTH comment de-staling, found at apply time.** Design §5 lists two, K2 found a third.
  `hosterOutcome`'s own doc comment (`service_hoster_watch.go:81`) says *"exit is what the pipeline
  RECORDS and has thirteen"* — that thirteen counts the ATTEMPT-level values, so the 18th value makes
  it fourteen. Fixed alongside task 1.2; the file's two other counts were already correct.
- **K5 — Phase 3's task text was stale against the withdrawn refinement.** The `D1b` bullet above is
  current; tasks 3.1, 3.2 and 3.4 still described `diskConfirmed` and the conditional `failureKind`,
  which design §3 WITHDREW. All three are amended in place below and were implemented to the
  withdrawn-refinement shape. Confirmed at apply time: the extracted helper's byte-identical
  emission left `service_hoster_watch_observability_test.go` out of the diff entirely (design §7).

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | **~790 authored** — code ~410, spec delta 380 (measured) |
| 400-line budget risk | High |
| Chained PRs recommended | No — **override, recorded below** |
| Suggested split | Single work unit, ONE commit on `main` |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High
```

**Override breakdown — the number is real, the reviewer burden is not.** The orchestrator decided ONE
change, ONE commit, and this records why it is auditable rather than a budget miss.

| Component | Lines | Authored? |
|---|---|---|
| D1 — helper, call site, `recursiveBaseline`, 18th exit + tests | ~245 | yes |
| D1b — `logDetectStartFailed` + `diskConfirmed` + tests | ~55 | yes |
| D2c — one identifier, one comment, inverted assertion + T7/T8 | ~35 | yes |
| Comment de-stalings (4, per §5 + K2 + K4) | ~14 | yes |
| Code subtotal | **~345–410** | yes |
| `specs/download/orchestration.md` (3 ADDED, all new text) | **126** | yes |
| `specs/download/observability.md` | **254** | mostly copy |
| — of which *Episode Terminal Exit Is Recorded* | 123 | **~24 authored, ~99 verbatim copy** |
| — of which *Observed Disk Count* + *Forensic Instrumentation* | 61 | ~30 authored |

The deployed *Episode Terminal Exit* requirement is 105 lines
(`openspec/specs/download/observability.md:299-403`); the delta carries 123 because openspec's
full-block MODIFIED convention forbids a partial block — a partial one silently DELETES the rest at
archive time. Roughly **99 of those lines are mandated verbatim copy a reviewer skims once**, not
change surface. Deduct the copy and the real review surface is ~690, of which ~410 is code.

`delivery_strategy` is `single-pr`, so this lands as `size-exception`, accepted by the orchestrator in
this phase's brief. Cutting D2c (proposal R-8) would save ~35 code lines and none of the spec copy, so
it buys nothing against this budget.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | D1 + D1b + D2c: post-grace disk re-check before any dead verdict, its probe timeline, and completion handling on every success path. | Single commit on `main` | `go test ./internal/download/ -run "RecheckDisk\|GraceDisk\|ObservedSuccessIsDistinguishable"` | `wails build` + `bun --cwd="frontend" run render:smoke` + one bounded `wails dev` startup; production evidence is `download.hoster_attempt{exit:"grace_disk_confirmed"}` beside a `download.renamed` row in `runtime_events` | `git revert` the commit — touches `service_hoster_watch.go`, `service_hoster_watch_exit.go`, one new test file, one assertion in `service_hoster_watch_exit_test.go`. D2c reverts alone; D1 and D1b revert together. |

---

## Phase 1: Infrastructure

- [x] 1.1 `internal/download/service_hoster_watch_exit.go`: add `exitGraceDiskConfirmed exitReason = "grace_disk_confirmed"` as the LAST attempt-level value, after `exitGraceNoSignalFallback` (`:68`), matching enum row 14. Carry design §5's doc comment verbatim in substance: a success the detect phase MISSED, no `.part` evidence during the grace, the filesystem past this attempt's OWN recursive baseline, and the only success exit that fires while JD still holds the package. **It must be consumed in this same commit** — `unused` (U1000) rejects an orphan value in a typed non-iota group (SDD-61 hit this). Task 2.5 is its only return site. → EX
- [x] 1.2 Same file, two de-stalings from design §5: the type comment `The enum is CLOSED at 17 values … thirteen attempt-level terminal points` → **18** / **fourteen**; `exitUnset`'s `…needs no synthetic "exhausted" eighteenth value` → drop the ordinal (`"exhausted" value of its own`) so it cannot go stale on the next added exit. **Plus correction K4's third count**, `hosterOutcome`'s own doc comment in `service_hoster_watch.go`: `exit … has thirteen` → **fourteen**. → EX
- [x] 1.3 Create `internal/download/service_hoster_watch_recheck_test.go`. **Reuse `newProbeWatchService`** (`service_hoster_watch_observability_test.go:81`) — do NOT write a second builder. Set `s.deps.RenameEpisodes = func(context.Context) bool { return true }` post-construction: `NewService` defaults it to `false` (`service.go:176-177`) and T7 asserts a rename. Model the JD fake on `postGraceDeadEnd` (`service_hoster_watch_exit_test.go:99-110`): `stagedJDClient` with two `aliveStatus` answers, so the pre-check does not classify dead. Put per-case assertions in `t.Helper()` functions — `gocognit` limit is 15 and it bounced SDD-61 once.
- [x] 1.4 In the same file, the "a file lands during the grace" side channel: the `hasPart` callback returns `false` on every probe while mutating `counter.recursive[folder]` on probe 3 under `counter.mu`. The clock MUST advance (`newProbeWatchService` → `newWatchTestService`, `PollSleep` moves the shared `now`); a fixed clock makes the guard's own tests pass vacuously (proposal R-2, SDD-61 R6). → RE

## Phase 2: D1 — the post-grace disk re-check (RED → GREEN)

- [x] 2.1 RED (T1): a file lands inside the blind gap. Assert `hosterOutcomeSuccess`, `string(outcome.exit) == "grace_disk_confirmed"` as a **literal** (never the constant — `assertOutcome` at `:15` already enforces this), and that `recorder.byEventType("download.jd_removed")` is EMPTY (K1). → FT, EX, CB
- [x] 2.2 RED (T2): nothing lands. The attempt falls through unchanged — `hosterOutcomeDead` + `grace_no_signal_first` on the first hoster, and the `download.jd_removed` entry IS present. This is the "> not >=" pin. → FT, NB
- [x] 2.3 RED (T3, **the R-3 defence, not optional**): `counter.recursive[folder]` starts ABOVE `baselineCount` (subfolder residue from an earlier failed attempt) and never moves during the attempt. The re-check MUST NOT succeed; the attempt continues to its existing post-grace evaluation unchanged. **This is the only test that kills M3.** → CB
- [x] 2.4 RED (T4): the same landing on a FALLBACK hoster (`isFirstHoster=false`) returns success, not timeout — the exit is position-independent, unlike the three `firstHosterOutcome` pairs. → FT
- [x] 2.5 GREEN: in `awaitHosterOutcome` (`service_hoster_watch.go:199`) capture `recursiveBaseline := s.downloadedEpisodeRecursive(folder)` immediately AFTER the `s.deps.Counter == nil` early return (`:206-208`) and BEFORE the entry guard (`:210`). Add `recheckDiskAfterGrace` with design §5's exact signature and doc comment, and call it inside `if !started` (`:222`) BEFORE `evaluateJDAfterGrace`. On a hit it persists the timeline (Phase 3), calls `completeDownloadedEpisode`, and returns `&hosterOutcome{kind: hosterOutcomeSuccess, exit: exitGraceDiskConfirmed}`; on a miss it returns `nil` and control falls through byte-equivalently. `awaitHosterOutcome`'s signature and `evaluateJDAfterGrace`'s 8 parameters do NOT change. → FT, CB, EX

## Phase 3: D1b — the re-check carries the probe timeline (RED → GREEN)

- [x] 3.1 RED (T5, **amended per K5**): on the confirmed path, `recorder.only(t, "download.detect_start_failed")` returns exactly ONE entry, at `logger.LevelWarn`, carrying 3 probes all `found:false`. No `diskConfirmed` assertion and no `failureKind`-absence assertion — design §3 withdrew both. → RE
- [x] 3.2 RED (T6, **amended per K5 — this is design §7's shape-identity test**): the confirmed-path entry and the fall-through entry agree on event type, level and metadata KEY SET, which is the ADDED scenario *"The probe carrier keeps the shape it has on the failed-detect path"* made deterministic. Values are deliberately NOT compared: two attempts record different probe offsets. → RE, NB
- [x] 3.3 RED (T9): recorded `elapsedMs` values on the confirmed path are strictly increasing — this is what proves the advancing clock is live and the offsets are measured, not constant. → RE
- [x] 3.4 GREEN (**amended per K5**): extract `logDetectStartFailed(runID, anime, hoster, probes)` from `evaluateJDAfterGrace`'s first statement (`:273-275`) and call it from BOTH sites, emitting BYTE-IDENTICALLY. No `diskConfirmed` key, no conditional `failureKind`, no message-text discriminator: the ADDED requirement binds the same metadata shape, and one helper with one key set and one message makes that identity structural rather than test-policed. The D3 query reaches the attempt's outcome through `download.hoster_attempt{exit:"grace_disk_confirmed"}` instead (design §3). → RE

## Phase 4: D2c — every success path completes the episode (RED → GREEN)

- [x] 4.1 RED (T8) — **THE ONE LEGITIMATE ASSERTION EDIT IN THIS CHANGE.** Invert `service_hoster_watch_exit_test.go:180-182` **in place**: `len(jd.recordedRenames())` must be `1`, and the message *"expected an entry-guard success to skip completion handling entirely"* becomes an entry-guard success that completes the episode. Update the subtest's comment block at `:170-173`, whose "rename difference rides on the same distinction" claim dies with the assertion. **Declared here so `sdd-apply` does not read it as a regression and `sdd-verify` does not read the edit as a red flag.** Every OTHER pre-existing test edit in this change MUST be type-only. → SC, EX
- [x] 4.2 RED (T7): the D1 confirmed path persists `download.renamed` — completion handling runs there too, not only at the entry guard. → SC
- [x] 4.3 GREEN: `service_hoster_watch.go:211`, `s.flattenDownloadFolder(ctx, runID, anime)` → `s.completeDownloadedEpisode(ctx, runID, anime, episode)`. Then de-stale `exitDiskAheadAtEntry`'s doc comment (`service_hoster_watch_exit.go:32-35`, correction K2): it now separates from `exitFSPollConfirmed` by WHERE the success was observed, not by whether a rename happened. `exitFSPollConfirmed`'s comment stays true. → SC, EX

## Phase 5: Verification, mutation and commit

- [x] 5.1 Run `gofmt -l .` (expect empty), `go vet ./...`, `go test ./internal/download/...`, and `go run ./tools/checkgofilesize` — confirm `tools/checkgofilesize/baseline.yaml` is still `files: []`. **Run the lint the GATE runs**, `scripts/lint.ps1 -Profile all`, not only `golangci-lint run --enable gocognit ./internal/download/...`: SDD-61 measured a bare run reporting 0 issues at the same moment the gate profile reported 2 (`gocognit` 16 and `funlen` 62).
- [x] 5.2 MUTATE: stage the change, run `ditto staged --dry` first to confirm the scope resolved to the staged LINES (an unexpected multi-minute run means the diff ranges did not resolve and the scope fell open to the whole file), then `ditto staged`. Work design §7's M1–M9. **The mutant that must die is M3: `recursiveBaseline` → `baselineCount`. T3 is the only test that kills it — T1, T2 and T4 all survive it. Report explicitly whether it died.** Hand-mutate M3, M4 (re-check moved after `evaluateJDAfterGrace`) and M8 (baseline captured after the detect phase) if `ditto` generates no equivalent mutant; prove each edit applied with `git diff --quiet -- <file> && echo "!! DID NOT APPLY"`, and use `perl -0pi -e` — `sd` is NOT installed here. → proposal R-1
- [x] 5.3 **Verification step, not a Go test.** Run pre-commit as `git diff --stat --cached --` (no commit exists yet; the orchestrator owns 5.9). Zero-line diff on every file this change must not touch: `git diff --stat <base>..HEAD -- internal/download/service.go internal/download/service_pipeline.go internal/download/service_notification_rows.go internal/events/event.go docs/openapi.yaml` MUST be empty. Report the untouched wire contract and mobile sync surface as a POSITIVE finding, not an omission (proposal §4). → NB
- [x] 5.4 Audit the diff, do not trust the claim: the ONLY changed assertion in any pre-existing test is task 4.1's. Nothing appended to `service_hoster_watch_test.go` (523 raw), `service_run_status_test.go` (469) or `app_download_test.go` (~497 effective) — all three are absent from the diff entirely, as is `service_hoster_watch_observability_test.go`. `service_pipeline_exit_test.go` IS modified, because design §6 mandates C5 there; measured 405 → 424 raw (+19 net, a replacement not an append) and still below the 400-effective warning threshold, so `checkgofilesize` reports the same three warnings as the baseline and no new one. → NB
- [ ] 5.5 **Orchestrator-run (CLAUDE.md #3).** `wails build` — baseline is green (binary produced in 22s, exit 0). A regression here is a compile or bindings break, not a test failure.
- [ ] 5.6 **Orchestrator-run.** `bun --cwd="frontend" run render:smoke` (~4s) — baseline is green. CLAUDE.md 18b: "the process is alive" is never a smoke test; 1.2.0 shipped a blank WebView behind a perfect Go startup.
- [ ] 5.7 **Orchestrator-run, bounded.** `wails dev`: launch, confirm startup, terminate. It needs a human to close it, so keep it time-boxed and do not leave it running — a stale `wails dev` process made SDD-55 look broken at runtime when the code was correct.
- [ ] 5.8 Append one lesson with `node scripts/log-lesson.mjs "..."` — one line, ≤300 characters, never by editing `docs/learning-log.md` by hand.
- [ ] 5.9 **Orchestrator-run (CLAUDE.md #4).** ONE conventional commit, **no Co-Authored-By and no AI attribution**, command timeout ≥ 300000 ms, never `--no-verify`. A killed commit leaves the changes staged but unrecorded — just re-run `git commit`.
