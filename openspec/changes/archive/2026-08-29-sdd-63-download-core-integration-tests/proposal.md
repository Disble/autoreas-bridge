# Proposal — SDD-63 Download Core Integration Tests

Change: `2026-08-29-sdd-63-download-core-integration-tests`
Inputs: `explore.md` (authoritative), archived SDD-61 and SDD-62, deployed
`openspec/specs/download/{observability,orchestration}.md`.
Scope: **one work unit, `single-pr`, test-only.** Production diff MUST be zero lines.

> Deliberate override of the 450-word budget, on the SDD-61/62 precedent: five scenario
> justifications, three structural anomalies and an evidence-based rollback do not compress.
> Everything that can be a table is one.

---

## 1. Intent

`baseDeps` sets `DetectStartPhaseDisabled: true` (`service_test_builders_test.go:72`). Of ~70
full-run invocations, essentially none exercise FASE 1 — the phase where SDD-62's D1 and D3 live.
`t.TempDir()` appears in several tests and is a decoy: `setSvcFakeCounter` follows it, so the real
filesystem is never read. **That is the structural reason incident `run-dl1532pqkk3g` could ship**:
every layer was covered, and the seam between them was not.

This change closes the seam with a **small** battery driving the download core against a real
filesystem and real `filesystem` adapters. Small is a hard constraint, not a preference — a battery
that becomes slow or flaky gets disabled, and a disabled battery is worse than none.

## 2. Scope

### In scope — five scenarios

| # | Scenario | Earns its place because |
|---|---|---|
| **S1** | **Incident replay**: root landing, two hosters, `.part` at t=45s, finished t=55s, driving `enqueueWithFallback`. Asserts success at `attemptIndex 0`, exit `grace_disk_confirmed`, **zero removals**, **Mega never enqueued**, file at root as `Test Anime - 05.mp4`. | The acceptance bar. Only test anywhere producing the closing `.part` window from real file operations. "Mega never enqueued" gives the spec's *MUST NOT start a fallback hoster attempt* for free. |
| **S2** | **Transfer visible, package-subfolder landing**: `.part` at t=25s, finished t=90s. Probe₂ sees it through the real sensor → `detect_start_succeeded`; FASE 2's real `Flatten` moves it; root read confirms `fs_poll_confirmed`. | Only test where the production `.part` sensor transitions false→true **inside a run** (see §5 C1). Only real-depth subfolder coverage. Proves S1's new guard does not swallow the normal path. |
| **S3** | **Nothing lands**: empty real folder throughout, post-grace JD reports offline. Asserts dead, `grace_classified_dead`, exactly one removal, disk still empty. | Without it S1 proves the guard *fires*, not that it is **conditional**. The only thing between the fix and turning every failure into a success. |
| **S4** | **Two-level residue**: `folder/pkg/sub/leftover.mp4` present before the attempt, root empty, nothing new lands. Asserts not-a-success, falls through to post-grace evaluation, residue **still in its subfolder**. | SDD-62's R-3 rests on *"Flatten is one level deep, so residue survives forever"* — today that rests on reading `flattenOneSubdir`. `svcFakeCounter` has no notion of depth. Only a real filesystem can pin it. |
| **S5** | **Two consecutive episodes**: ep 5 lands as JD's opaque `d2ouiemgt90z.mp4`, is renamed and flattened; the loop must then attempt **episode 6**. | The only scenario closing the loop from bytes-on-disk back to "which episode next". Without the rename `highest`=0, `count`=1, the cursor reads 1, and the run re-downloads ep 5 forever. |

### Out of scope

- Any production-code change. A production diff in this change is a defect, not a bonus.
- Deleting or wiring `filesystem.Renamer` — dead in production (`service.go:74` declared, never
  read; the service renames via `JD.RenameEpisodeByDestination`). Drift recorded, Engram #8808.
- Any new `openspec/specs/download/*` requirement — see §4.
- Touching frozen files: `service_hoster_watch_test.go` (523), `service_run_status_test.go` (469),
  `app_download_test.go` (~497), `service_pipeline_exit_test.go` (424).

## 3. Approach

**A virtual clock that also drives real file operations.** The suite is single-goroutine, so there
is nothing to race:

```go
deps.Clock     = func() time.Time { return *now }
deps.PollSleep = func(d time.Duration) { *now = now.Add(d); sim.advanceTo(*now) }
```

`jdSim` embeds `svcFakeJDClient`, overrides only the four methods the core calls, and drains a
timestamped action script performing real `os.WriteFile`/`os.Rename` on `t.TempDir()`. "JD writes
the file between probe 2 and probe 3" becomes lexical ordering in one goroutine, not a timing
window: both offsets fall inside the single sleep carrying t 40→60.

**Layout: a new file in package `download`.** The battery needs `baseDeps`, `ServiceDeps`,
`awaitHosterOutcome`, `enqueueWithFallback`, `downloadAvailableEpisodes` and `svcFakeJDClient` —
all unexported. A separate package would mean exporting internals purely to test them.

Four harness constraints, all verified:

| Constraint | Consequence |
|---|---|
| `setSvcFakeCounter` replaces **both** `Counter` and `Flattener` | Neither `newWatchTestService` nor `newProbeWatchService` is usable; `newProbeWatchService` also overwrites `HasPartFiles`, the sensor to leave alone |
| `baseDeps` wires a **fixed** `Clock` and a **no-op** `PollSleep` (`:56`, `:69`, `:71`) | Both MUST be repointed at a shared `*time.Time`, or every `probe.elapsedMs` is 0 and the sim never advances |
| `baseDeps` also installs a fake `Flattener` (`:64`), independent of `setSvcFakeCounter` | `Counter` **and** `Flattener` must both be replaced with real adapters |
| `NewService` defaults `RenameEpisodes` to false | Without setting it true, every rename assertion is vacuous |

**TDD: there is no red commit, and that is expected.** The battery lands AFTER the fix it covers.
The RED step is `ditto staged` plus one hand-mutation — delete the `recheckDiskAfterGrace` call and
S1 must go red. `tasks.md` MUST state this so `sdd-verify` does not read the absent failing-first
commit as a skipped step.

**Do NOT gate on `testing.Short()`.** `lefthook.yml:128` runs without `-short`, so it buys nothing,
and it would silently remove the battery from a future `ditto` step — the exact step it serves.

## 4. Capabilities

### New capabilities
**None.**

### Modified capabilities
**None — and this is a decision, not an omission.**

Every assertion targets behaviour the deployed specs already require: S1 → orchestration *"Filesystem
Is Success Truth, JD Status Is Failure Truth"* + observability `grace_disk_confirmed`; S2 → *"Flatten
JD Subfolders"* + *"Completion Detection via Filesystem Polling"*; S3 → `grace_classified_dead`;
S4 → *"The Post-Grace Success Comparison Uses One Counting Basis"* scenario *"Pre-existing subfolder
residue does not produce a success"*; S5 → *"Online-vs-Disk Trigger Semantic"* + *"Every Success Path
Completes the Episode"*.

A candidate requirement — *"the download core MUST retain real-adapter coverage"* — was considered and
**rejected**: it describes the test suite, not system behaviour, so it has no Given/When/Then over
runtime state, and nothing deterministic enforces it. A spec requirement no guard can check is the
anti-pattern this repo already named. The durable record is the battery's own file doc comment plus
one `docs/learning-log.md` line.

**A delta becomes warranted only if S4 fails** — that would falsify SDD-62's R-3 premise, and *"The
Post-Grace Success Comparison Uses One Counting Basis"* would need revisiting. **If S4 fails, SDD-62
needs revisiting, not S4.**

## 5. Corrections to the brief

**C1 — `hasPartFilesRecursive` does NOT have ZERO coverage.** The explore's table row
(*"ZERO | every test injects `HasPartFiles`"*) is wrong in both cells.
`service_hoster_watch_test.go:332-401` holds five direct unit tests against a real `t.TempDir()`
(empty, root `.part`, subfolder `.part`, non-`.part`, inaccessible path), and
`TestAwaitHosterOutcomeRemovesPackageWhenDetectPhaseReturnsDead:504-506` runs the real sensor
**inside a run** without injecting.

Two things survive, and S2 keeps its place on them:

1. That in-run use points at a **non-existent folder**, so the sensor is permanently `false` there.
   No test has ever observed it return `true` inside a run. That is S2's real justification.
2. The `len(d.Name()) > 5` slice (`service_hoster_watch.go:96`) is genuinely **unpinned**: every
   fixture uses `anime-ep01.part` (15 chars) or `file.part` (9). A file named exactly `.part`
   is invisible to the sensor and no test says so.

**Consequence:** the off-by-one is a **one-line unit case** next to the existing five, not a reason
for an integration scenario. S2's justification narrows from *"only test that runs the sensor"* to
*"only test where the sensor fires inside a run"* — still unique, still worth its place.

**C2 — `baseDeps`'s clock is the unstated load-bearing wiring.** §3 above; not in the brief.

Everything else in the brief verified against source: `DetectStartPhaseDisabled: true` (`:72`),
`setSvcFakeCounter` scope (`:25-37`), `RemoveByDestination` destroys records not files
(`jdownloader/status.go:174-213`), `Renamer` dead, frozen line counts (523/469/424/222).

## 6. Affected areas

| Area | Impact | Description |
|---|---|---|
| `internal/download/service_download_core_integration_test.go` | **New** | The five scenarios |
| `internal/download/service_download_core_sim_test.go` | **New (contingent)** | `jdSim` harness, split out only if the single file exceeds 400 effective lines |
| `internal/download/service_hoster_watch_exit_test.go` (222) | Modify **only if S3 is cut** | Folded fake-based assertions |
| `internal/filesystem` | **Exercised, not modified** | Real `EpisodeCounter` + `Flattener` |
| `docs/learning-log.md` | Append | `node scripts/log-lesson.mjs`, never by hand |
| `openspec/specs/download/*` | **Untouched** | §4 |
| All production Go | **Zero-line diff** | The strongest success criterion here |

## 7. Changed-line forecast

Reference: SDD-62's `service_hoster_watch_recheck_test.go` is 233 lines for 10 tests **reusing an
existing harness**. This battery must build its own.

| Item | Lines |
|---|---|
| `jdSim` harness + service builder | 130–160 |
| S1 / S2 / S3 / S4 / S5 | ~55 / 50 / 35 / 40 / 55 |
| `docs/learning-log.md` | +1 |
| **Total added** | **~370–400**, 0 deleted |

**400-line budget risk: High.** It sits AT the budget with no headroom. Two levers, in order:

1. **Cut S3** — pre-designated in exploration as the only scenario whose subject is not
   filesystem-specific. Fold `removals == 1` + disk-unchanged into
   `service_hoster_watch_exit_test.go` (222 lines, headroom). Net ~350–380.
2. `size:exception` under `single-pr`.

**Do NOT split into chained PRs.** A half-landed battery is precisely the disabled-battery failure
mode this change exists to avoid. `sdd-tasks` owns the guard-line call.

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Flakiness from shared mutable sim state | Med | Each scenario owns its own `jdSim` and `t.TempDir()`. Shared state across `t.Parallel()` subtests is the one realistic route to flakiness here. |
| Forecast crosses the 400 budget | **High** | §7 levers, in order |
| Single file crosses 500 effective lines (hard fail) | Med | `go run ./tools/checkgofilesize` at apply; split the harness out. `baseline.yaml` stays `files: []` |
| `gocognit` limit 15 (stricter in the gate than a bare run; bounced SDD-61 once) | Med | Per-case assertions extracted into `t.Helper()` functions |
| Harness symbol collision in package `download` | Low | Prefix new symbols distinctly; do not reuse `svcFake*` names |
| S4 fails | Low | **Not a test defect.** SDD-62's R-3 decision needs revisiting, not S4 |

## 9. Rollback plan

Test-only, so revert is total and risk-free: `git revert` the single commit. No production code, no
schema, no wire contract, no migration.

**Quarantine is a different decision, and it needs evidence.** The battery is skipped or deleted
only on:

| Trigger | Evidence required | Response |
|---|---|---|
| Flake | Non-deterministic failure across ≥2 runs on unchanged code | Root-cause the harness (shared state is the only realistic route). Delete only if the flake is in the harness *design* |
| Runtime | Battery wall time **> 2 s** | Delete or shrink |
| S4 fails | — | **Never a quarantine trigger.** Revisit SDD-62 |

**Runtime budget: sub-second expected, 2 s is the kill threshold.** The clock is virtual, so the only
real cost is a handful of `os.WriteFile`/`os.Rename` on `t.TempDir()`, against the gate's existing
~20–50 s of Go work. 2 s is the ceiling because a battery adding >5% to the gate becomes a target for
whoever is waiting on a commit. **Measure it at verify** — `go test ./internal/download -run
'<battery prefix>' -count=1` — and record the number. An unmeasured budget is not a budget.

## 10. Success criteria

- [ ] Production Go diff is **zero lines**.
- [ ] All five scenarios pass against post-SDD-62 code, `-count=1`, no `-short` gate.
- [ ] Deleting the `recheckDiskAfterGrace` call turns **S1 red** (the RED step, recorded in `tasks.md`).
- [ ] `ditto staged` kills its mutants over the staged lines.
- [ ] `go run ./tools/checkgofilesize` passes; `baseline.yaml` still `files: []`.
- [ ] Full gate green via `git commit` (~90 s budget), including the stricter `golangci-lint`.
- [ ] Measured battery runtime recorded in `verify-report.md` and **≤ 2 s**.
- [ ] `openspec/specs/download/*` unchanged.

## 11. Proposal question round

`execution_mode=auto` — no interactive round was run. Two assumptions carry product judgement and
are flagged for review rather than silently adopted:

1. **No spec delta** (§4). If the project wants durable spec-level protection for real-adapter
   coverage, that is a different change and needs a deterministic guard first.
2. **Five scenarios, S3 as the cut** (§7). If the 400 budget must hold strictly, S3 goes; the other
   four each assert something no fake can.

## 12. Dependencies

- SDD-62 shipped (`31ef4d5`). All assertions target post-fix behaviour.
- No external dependency, no new module.
