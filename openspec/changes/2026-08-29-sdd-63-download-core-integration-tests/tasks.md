# Tasks — SDD-63 Download Core Integration Tests

Change: `2026-08-29-sdd-63-download-core-integration-tests`
Authority: `design.md` wins over every other document, including `proposal.md` and `explore.md`.

> **Deliberate override of the 530-word budget**, on the SDD-61/62 precedent. Three corrections had
> to be absorbed in the artifact or a later reader reintroduces the falsified versions; the RED step
> has no failing-first commit and must be described exactly or `sdd-verify` reads it as skipped; and
> two mutants are each killed by exactly one scenario, which is the only thing standing between this
> battery and a scenario someone later cuts for size.

**Spec keys: NONE.** `sdd-spec` was deliberately skipped — every assertion targets behaviour the
deployed `openspec/specs/download/{observability,orchestration}.md` already require (proposal §4).
`openspec/specs/download/*` MUST be absent from this change's diff. Do not task spec work.

**Threat matrix: N/A** (design §10 — no routing, shell, subprocess, VCS or executable boundary), so
no threat-matrix RED tasks exist. The one safety property that does apply is task 1.6.

## Settled — do not reopen

- **All five scenarios stay.** Size pressure is resolved by FILE ORGANISATION (the Phase 1 / Phase 2
  split), never by cutting scope. Proposal §7's "cut S3" lever is WITHDRAWN by the orchestrator.
- **Production Go diff is ZERO lines.** A production change here is a defect, not a bonus.
- **Two files by default** (design D1/§7). One file only if task 2.7 measures the harness under 150
  effective lines and the total under 380.
- **Do NOT chain PRs.** A half-landed battery is the disabled-battery failure mode this change exists
  to avoid.

## Corrections already absorbed — do NOT reintroduce the older versions

- **K1 — S5's old justification was FALSE.** Proposal §2 and explore say *"without the rename
  `highest`=0 and `count`=1, the cursor reads 1 and the run re-downloads ep 5 forever"*. Falsified in
  design §9 F1: `downloadedEpisodeBaseline` is `max(highest, count)`
  (`service_pipeline.go:350-357`), so with four pre-existing episodes an un-renamed ep 5 gives
  `count` = 5 and the cursor advances anyway. S5's two REAL justifications: rename-before-flatten has
  zero real-file coverage, and `CountAtRoot` is non-recursive so Flatten is what moves the cursor.
- **K2 — `hasPartFilesRecursive` is NOT uncovered.** Five direct unit tests at
  `service_hoster_watch_test.go:332-401`, plus `:504-506` inside a run. S2's narrower and true
  justification: that in-run use points at a **non-existent folder**, so no test has ever observed
  the production sensor return `true` inside a run.
- **K3 — `baseDeps` needs EIGHT overrides, not one.** Design §4 is the complete table. The five
  non-obvious ones: fixed `Clock` (`service_test_builders_test.go:56`/`:69`), no-op `PollSleep`
  (`:71`), fake `Flattener` (`:64`, installed independently of `setSvcFakeCounter`),
  `DetectStartPhaseDisabled: true` (`:72`), and `RenameEpisodes` defaulting to false
  (`service.go:176-178`). Repoint `Clock` **and** `PollSleep` at one shared `*time.Time` or every
  `probe.elapsedMs` reads 0 and the sim never advances.

## Defect D4 — recorded, NOT fixed, NOT asserted

Design §9 F2 / Engram #8814: `pollForCompletion` (`service_hoster_watch.go:245-256`) checks root,
then flattens, then completes on the NEXT iteration. On a subfolder landing that Flatten runs BEFORE
the rename — the exact inversion `completeDownloadedEpisode`'s own doc comment
(`service_rename.go:11-22`) calls out. SDD-62 did not touch that path.

**S2 (task 2.3) deliberately stops short of asserting the rename outcome there.** Whether real JD's
link-rename survives the move is not verifiable from this repository — the JD adapter is a network
client — so an assertion would pin only the harness's own model of JD. That is the unfaithful-fixture
failure class that already bit this project in SDD-62's C5. Do not "helpfully" add the assertion.
D4 needs its own change; a fix here would put a production diff in a change whose strongest success
criterion is a zero-line production diff.

## TDD shape — there is no red commit, and that is expected

The battery lands AFTER the fix it covers (SDD-62, `31ef4d5`), so no failing-first commit exists.
**The RED step is Phase 3**: `ditto staged` plus one named hand-mutation — delete the
`recheckDiskAfterGrace` call at `service_hoster_watch.go:228-230` and S1 must go red. Recorded here
verbatim so `sdd-verify` does not read the absent failing-first commit as a skipped step.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | **~460 authored**, 0 deleted — harness ~190, scenarios ~270, `+1` learning-log |
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

**Override breakdown — the number is real and higher than the proposal's.** Proposal §7 forecast
370–400; design §7 F3 corrects it to ~460 at this repo's Go comment density, calibrated against
SDD-62's `service_hoster_watch_recheck_test.go` (233 lines for 10 tests **reusing** an existing
harness — this battery must build its own).

| Component | Lines | Authored? |
|---|---|---|
| `service_download_core_sim_test.go` — `jdSim`, 4 overrides, `advanceTo`, 3 action constructors, builder, helpers | ~190 | yes |
| `service_download_core_integration_test.go` — S1 / S2 / S3 / S4 / S5 | ~270 | yes |
| `docs/learning-log.md` | +1 | yes |
| Production Go | **0** | — |
| `openspec/specs/download/*` | **0** | — |

`delivery_strategy` is `single-pr`, and the orchestrator accepted `size:exception` in this phase's
brief (ruling 3), so `Decision needed before apply` is `No`. The two levers that would have cut the
number are both closed by ruling: cutting S3 is withdrawn, and chaining is forbidden.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | The whole five-scenario battery driving the download core through `enqueueWithFallback` / `downloadAvailableEpisodes` against a real filesystem, real `filesystem.EpisodeCounter` + `Flattener`, and the real `.part` sensor. | Single commit on `main` | `go test ./internal/download -run 'TestDownloadCore' -count=1` | Test-only change, so there is no production runtime evidence to gather; the harness commands (`wails build`, `render:smoke`, bounded `wails dev` — tasks 4.7-4.9) run as regression proof that a test-only diff broke no build, not as evidence of new behaviour | `git revert` the single commit — two new `_test.go` files plus one `docs/learning-log.md` line. Zero production files, zero spec files, no schema, no wire contract, no migration |

---

## Phase 1: The `jdSim` harness — `internal/download/service_download_core_sim_test.go`

- [x] 1.1 Create the file in package `download` with a file doc comment stating what the battery
  covers and why (proposal §4: the file comment plus one learning-log line ARE the durable record,
  because no spec requirement can deterministically enforce "keep real-adapter coverage"). Define
  `jdAction` and `jdSim` exactly per design §3, including the `t`, `folder`, `cancel`, `armed`,
  `armedAt`, `script`, `cursor`, `status`, `finished`, `enqueued`, `removals` and `maxEnqueues`
  fields. Embed `*svcFakeJDClient` so `Connect`/`ListDevices`/`EnsureOnline`/`Disconnect` come free.
  Prefix every new symbol `jdSim*`/`sim*`/`coreIntegration*` — never `svcFake*` (collision risk).
- [x] 1.2 `advanceTo(now time.Time)`: fire every scheduled action whose instant the clock has
  reached, in order, advancing `cursor`. One loop, cognitive complexity ~3. It runs INSIDE
  `PollSleep`, so an action lands lexically between the probe before the sleep and the probe after —
  single-goroutine by construction, so no mutex, channel or `Eventually`.
- [x] 1.3 Override the four methods the core actually calls. `AddAndStart`: append the hoster to
  `enqueued`, arm the script **ONCE** on the first call (design D3 — later enqueues do NOT re-arm, or
  S5 replays episode 5's actions), and enforce `maxEnqueues` by calling `sim.cancel()` (design D7).
  `PackageStatusByDestination`: return `sim.status`. `RemoveByDestination` (D4): `removals++`,
  `finished = ""`, **files untouched** — verified against `jdownloader/status.go:174-213`, which
  makes no `os.` call. `RenameEpisodeByDestination` (D5): rename `sim.finished` and nothing else, in
  place; return an error when `finished` is `""` or its path no longer exists. **Never re-scan the
  folder** — a re-scanning fake silently succeeds after a flatten and makes S5's order rule untestable.
- [x] 1.4 The three action constructors: `landsPartAt(at, relDir, name)` writing
  `name+".mp4.part"`, `finishesPartAt(at, relDir, name)` renaming it to `name+".mp4"` in place and
  setting `sim.finished`, and `jdReportsDead(at)` flipping `sim.status` to `CrawlOfflineCount: 1`.
  **Fixture names MUST exceed five characters** — `service_hoster_watch.go:96` slices the last five
  bytes, so a file named exactly `.part` is invisible to the production sensor. Use the real opaque
  shapes `d2ouiemgt90z` and `9gm31meptrvq`; both parse to episode 0 under `episodeNumberFromName`, so
  only `Count*` moves and the `max(highest, count)` arithmetic stays exact.
- [x] 1.5 `newCoreIntegrationService(t, sim, now) (*Service, *fieldsRecorder)`: `baseDeps(t)` plus the
  EIGHT overrides in design §4 — `JD` = sim, `Counter` = `filesystem.NewEpisodeCounter()`,
  `Flattener` = `filesystem.NewFlattener()`, `Clock` = `func() time.Time { return *now }`,
  `PollSleep` = `func(d){ *now = now.Add(d); sim.advanceTo(*now) }`,
  `DetectStartPhaseDisabled = false`, `RenameEpisodes = func(context.Context) bool { return true }`,
  `Logger` = `&fieldsRecorder{}` (`service_hoster_watch_observability_test.go:28`). Leave
  `HasPartFiles` **UNSET** (design D6) — `NewService` defaults it to `hasPartFilesRecursive`
  (`service.go:179-181`), and setting it would delete S2's entire subject. **Neither
  `newWatchTestService` nor `newProbeWatchService` may be used**: both call `setSvcFakeCounter`
  (`service_test_builders_test.go:25-37`), which replaces `Counter` AND `Flattener`, and the second
  also overwrites `HasPartFiles`.
- [x] 1.6 **Safety property (design §10).** Every path the sim constructs is
  `filepath.Join(sim.folder, ...)` where `sim.folder` is a `t.TempDir()`. No action constructor
  accepts an absolute path and none may escape the fixture root. A harness bug that wrote into the
  repository is the one genuinely damaging failure mode here.
- [x] 1.7 `seedRootEpisodes(t, folder, n)` writing `Test Anime - 01.mp4` … `- 0n.mp4`, plus the
  shared `t.Helper()` assertion helpers (file present at root / absent, recorder entry counts).
  `gocognit`'s limit is 15 and the gate's `golangci-lint` is stricter than a bare run (it bounced
  SDD-61 once), so per-case assertion blocks live in helpers, not inline.
- [x] 1.8 Run `go run ./tools/checkgofilesize` after the harness lands and record its effective line
  count — it is one half of task 2.7's collapse decision.

## Phase 2: The five scenarios — `internal/download/service_download_core_integration_test.go`

Every scenario owns its own `jdSim`, `t.TempDir()`, `*time.Time` and recorder (design D8);
`t.Parallel()` at the top level only, no shared-state subtests. Name every test with the
`TestDownloadCore` prefix so the focused command in the work-unit table resolves. Expected values are
written as **LITERALS** — never assert against the production symbol being pinned. **Do NOT gate on
`testing.Short()`**: `lefthook.yml:128` runs `go test ./... -cover -p 4 -parallel 4` with no `-short`,
so it buys nothing and would remove the battery from the exact future `ditto` step it serves.

- [x] 2.1 Create the file with a doc comment naming the incident (`run-dl1532pqkk3g`) and the seam it
  closes: `baseDeps` disables the detect phase, so of ~70 full-run invocations essentially none reach
  FASE 1, and `t.TempDir()` beside `setSvcFakeCounter` is only a path string.
- [x] 2.2 **S1 — the incident replay** (design §5, §6). Seed 4 root episodes; hosters
  `["Mediafire", "Mega"]`; script `landsPartAt(45s, "", "d2ouiemgt90z")` +
  `finishesPartAt(55s, "", "d2ouiemgt90z")`; drive `enqueueWithFallback` for episode 5. Assert:
  `succeeded`; `attemptIndex == 0`; `exit == "grace_disk_confirmed"`; `sim.removals == 0`;
  `sim.enqueued == ["Mediafire"]` (this is the spec's *MUST NOT start a fallback hoster attempt*, for
  free); exactly ONE `download.hoster_attempt` with `outcome:"success"`; `Test Anime - 05.mp4` at
  root; `d2ouiemgt90z.mp4` gone; `result.observed == 5`. Both offsets fall inside the single sleep
  carrying t 40→60, lexically between probe₂ and probe₃.
- [x] 2.3 **S2 — transfer visible, package-subfolder landing.** Empty root; script
  `landsPartAt(25s, "pkg-01", …)` + `finishesPartAt(90s, "pkg-01", …)`; 1 hoster. Assert: exactly ONE
  `download.detect_start_succeeded` with `probes` length **2** and the last `found:true` — the first
  in-run `true` the production sensor has ever returned (K2); `exit == "fs_poll_confirmed"`; the video
  is **at root** and `folder/pkg-01` is **gone**; `sim.removals == 0`; `result.observed == 1`.
  **STOP HERE — do not assert the rename outcome.** See "Defect D4" above; write that reasoning into
  the test as a comment so a later reader does not add it.
- [x] 2.4 **S3 — nothing lands.** Empty root throughout; script `jdReportsDead(30s)`; 1 hoster.
  Assert: `!succeeded`; `exit == "grace_classified_dead"`; `sim.removals == 1`; root **still empty**;
  no `download.renamed` entry. Without S3 the guard is proven to *fire*, never to be **conditional** —
  that is the whole distance between the fix and turning every failure into a success. **S3 is the
  only scenario that kills IM2** (task 3.4).
- [x] 2.5 **S4 — two-level residue.** Pre-create `folder/pkg/sub/leftover.mp4` with root empty, run
  the real `s.flattenDownloadFolder(...)` FIRST (the same call `prepareAnimeDownload:74` makes), then
  the attempt; nothing lands; 1 hoster. Assert: `folder/pkg/sub/leftover.mp4` is **still at that exact
  path** after the real Flatten (one-level depth pinned); zero videos at root; `!succeeded`;
  `exit == "grace_no_signal_first"`; `sim.removals == 1`. **If S4 fails, SDD-62 needs revisiting, not
  S4** — STOP and open a change against its R-3 decision. Never weaken the assertion, fold the residue
  into the baseline, or quarantine it. **S4 is the only scenario that kills IM3** (task 3.3).
- [x] 2.6 **S5 — two consecutive episodes.** Seed 4 root episodes; ep 5 lands in `pkg-05/`
  (`.part` 45 s, done 55 s), then ep 6 at root (`.part` 105 s, done 115 s); drive
  `downloadAvailableEpisodes` with `LatestEpisode: 6`, reusing `svcFakeEpisodeSource`
  (`service_test_helpers_test.go:55`) and `fixedJDGate(true)` (`service_test_builders_test.go:18`).
  Assert: `episodesDownloaded == 2`, `firstEpisodeDownloaded == 5`, `lastEpisodeDownloaded == 6`;
  **`Test Anime - 05.mp4` at root** (the rename ran inside the subfolder BEFORE Flatten moved it —
  the order rule, pinned by real bytes for the first time); `Test Anime - 06.mp4` at root;
  `folder/pkg-05` gone; `sim.enqueued` length 2; no `download.rename_failed`. Set `sim.maxEnqueues`
  and wire `sim.cancel` from the scenario's `context.WithCancel` (design D7): `downloadAvailableEpisodes`
  loops `for current < LatestEpisode` re-reading the cursor from disk, so a mutant that stalls the
  cursor produces an **infinite loop**, not a failure, and `ctx.Err()` at `service_pipeline.go:130`
  is what turns the hang into a normal assertion failure.
- [x] 2.7 Run `go run ./tools/checkgofilesize` again. **Collapse the two files into one ONLY if** the
  harness is under 150 effective lines AND the total under 380; otherwise the split stands, which is
  the default. `tools/checkgofilesize/baseline.yaml` stays `files: []` either way. Append nothing to
  the frozen files: `service_hoster_watch_test.go` (523 raw), `service_run_status_test.go` (469),
  `app_download_test.go` (~497), `service_pipeline_exit_test.go` (424).
  `service_hoster_watch_observability_test.go` (289) is **read** for `fieldsRecorder`, never edited.

## Phase 3: The RED step — mutation (there is no red commit)

- [x] 3.1 **RED — the named hand-mutation (IM1).** Delete these three lines from
  `internal/download/service_hoster_watch.go:228-230`:
  `if outcome := s.recheckDiskAfterGrace(ctx, runID, anime, hoster, folder, recursiveBaseline, episode, probes); outcome != nil { return *outcome }`.
  **S1 must go red on five independent assertions** (`attemptIndex`, `exit`, `removals`, `enqueued`,
  the filename) and S5 on both episodes. Prove the edit applied — `sd` is NOT installed here, use
  `perl -0pi -e` and `git diff --quiet -- <file> && echo "!! DID NOT APPLY"` — then **restore the file
  and re-confirm green**. This task IS the RED step; record its result explicitly.
- [x] 3.2 **MUTATE.** Stage the change, run `ditto staged --dry` first to confirm the scope resolved
  to the staged LINES (an unexpected multi-minute run means the diff ranges did not resolve and the
  scope fell open to the whole file), then `ditto staged`. Budget ~53 s for a small staged change.
- [x] 3.3 **IM3 — the R-3 basis mutant, hand-mutated if `ditto` generates no equivalent.**
  `recursiveBaseline` → `baselineCount` at `service_hoster_watch.go:288`. **S4 is the ONLY scenario
  that kills it** (residue 1 > root 0 ⇒ false success); S1, S2, S3 and S5 all survive it. **Report
  individually whether it died.** Cutting S4 leaves a shipped guard unpinned.
- [x] 3.4 **IM2 — the conditionality mutant, hand-mutated if `ditto` generates no equivalent.**
  `>` → `>=` at `service_hoster_watch.go:288`. **S3 is the ONLY scenario that kills it** on an empty
  folder (0 ≥ 0 fires); S4 also kills it (1 ≥ 1), but S3 is what proves the guard is conditional
  rather than universal. **Report individually whether it died.**
- [x] 3.5 The remaining design §8 mutants, hand-mutated only where `ditto` produced no equivalent:
  IM4 (`recursiveBaseline` captured AFTER the detect phase — killed by S1, S5), IM5 (rename/flatten
  swapped inside `completeDownloadedEpisode` — **S5 only**), IM6 (`completeDownloadedEpisode` →
  `flattenDownloadFolder` on the re-check path — S1, S5), IM7 (the `Flatten` call at
  `service_hoster_watch.go:253-255` deleted — **S2 only**, and it terminates in 360 virtual iterations,
  not 30 minutes), IM8 (`hasPartFilesRecursive`'s `len(d.Name()) > 5` slice broken — **S2 only**).
  Prove every edit applied and restore each one.

## Phase 4: Verification and commit

- [ ] 4.1 `gofmt -l .` (expect empty), `go vet ./...`, `go test ./internal/download/...`.
- [ ] 4.2 `golangci-lint run --enable gocognit ./internal/download/...`, **and** the gate profile
  `scripts/lint.ps1 -Profile all` — SDD-61 measured a bare run reporting 0 issues at the same moment
  the gate profile reported 2 (`gocognit` 16, `funlen` 62).
- [ ] 4.3 `go run ./tools/checkgofilesize`; confirm `tools/checkgofilesize/baseline.yaml` is still
  `files: []` and that no NEW warning appeared beyond the pre-existing frozen-file set.
- [ ] 4.4 **Audit the zero-line production diff, do not trust the claim.**
  `git diff --stat --cached -- internal/download/ ':!internal/download/*_test.go'` MUST be empty, as
  must `git diff --stat --cached -- openspec/specs/ internal/filesystem/ docs/openapi.yaml`. Report
  the untouched production code, wire contract and spec surface as a POSITIVE finding.
- [ ] 4.5 **Measure the battery's runtime and RECORD THE NUMBER** —
  `go test ./internal/download -run 'TestDownloadCore' -count=1`. Sub-second is expected; **2 s is
  the kill threshold** (proposal §9) against the gate's existing ~20-50 s of Go work. An unmeasured
  budget is not a budget, and this number is what decides whether the battery survives.
- [ ] 4.6 Append one lesson with `node scripts/log-lesson.mjs "..."` — one line, ≤300 characters,
  never by editing `docs/learning-log.md` by hand.
- [ ] 4.7 **ORCHESTRATOR-RUN (CLAUDE.md #3).** `wails build`. A test-only diff must not break it; a
  regression here would be a compile or bindings break.
- [ ] 4.8 **ORCHESTRATOR-RUN.** `bun --cwd="frontend" run render:smoke` (~4 s). CLAUDE.md 18b:
  "the process is alive" is never a smoke test.
- [ ] 4.9 **ORCHESTRATOR-RUN, bounded.** `wails dev`: launch, confirm startup, terminate. Do not leave
  it running — a stale `wails dev` process made SDD-55 look broken when the code was correct.
- [ ] 4.10 **ORCHESTRATOR-RUN (CLAUDE.md #4).** ONE conventional commit, **no Co-Authored-By and no
  AI attribution**, command timeout ≥ 300000 ms, never `--no-verify`. A killed commit leaves the
  changes staged but unrecorded — just re-run `git commit`.
