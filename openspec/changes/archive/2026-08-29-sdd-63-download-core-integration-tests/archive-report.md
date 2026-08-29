# Archive Report — SDD-63 Download Core Integration Tests

Committed as `596e61a`. Verified directly by the orchestrating agent (CLAUDE.md #3); the commit
itself passed the full pre-commit gate (CLAUDE.md #4).

## Spec sync: none, deliberately

**No delta specs exist for this change, and that was a decision rather than an omission.** The
battery asserts behaviour the deployed specs already require — SDD-62's disk re-check, D2c's
completion on both success paths, SDD-61's probe timeline. It creates no new product behaviour.

The only candidate would have been a meta-requirement about retaining real-adapter coverage, which
is a process rule rather than a system behaviour, and `openspec/specs/` describes system
behaviour. Manufacturing a delta to look complete was the failure mode avoided.

`openspec/specs/` is untouched by this change, confirmed by `git diff --stat`.

## What shipped

Five scenarios driving the download core through `enqueueWithFallback` (S5 through
`downloadAvailableEpisodes`) against a real `EpisodeCounter`, `Flattener` and `.part` sensor on
`t.TempDir()`:

| Scenario | Asserts |
|---|---|
| Episode lands inside the detect phase's blind gap | success at `attemptIndex 0`, exit `grace_disk_confirmed`, zero removals, the fallback hoster never enqueued, `Test Anime - 05.mp4` at root |
| Package-subfolder landing | the real sensor returns `true` inside a run for the first time; Flatten moves the file; exit `fs_poll_confirmed` |
| Nothing lands | dead verdict, exactly one removal, disk still empty — **the proof the re-check is conditional** |
| Two-level residue present before the attempt | not a success; residue still in its subfolder |
| Two consecutive episodes | the cursor for episode 6 is derived from bytes on disk, not written into a fake |

Two files: `service_download_core_sim_test.go` (234 effective) and
`service_download_core_integration_test.go` (179 effective). Neither appears in the size gate's
warnings; `baseline.yaml` remains `files: []`.

## Why this change existed

`baseDeps` sets `DetectStartPhaseDisabled: true` by default, so of roughly seventy full-run test
invocations essentially none exercised the phase where the hoster-verdict defects lived. The
`t.TempDir()` calls in existing tests are a decoy: `setSvcFakeCounter` follows them and the real
filesystem is never read. That combination is the structural reason a defect could ship against a
fully green suite, and it is what this battery closes.

## Verification

| Check | Result |
|---|---|
| Battery | 5/5 pass, **0.04 s** of test time (threshold was 2 s) |
| Package suite | all green, `internal/download` coverage 90.1% |
| `gofmt -l`, `go vet ./...` | clean, exit 0 |
| `golangci-lint --enable gocognit`, gate profile | 0 issues, twice |
| `go run ./tools/checkgofilesize` | passed, no new warnings, baseline empty |
| `wails build -clean` | binary in 21.6 s, exit 0 |
| `bun run render:smoke` | production bundle paints on every checked route |
| `wails dev` | HTTP on `:9876`, bindings generated, dev server on `:34115` |

The runtime number is the one that decides this battery's survival: at 0.04 s against a gate that
already spends 20–50 s on Go work, nobody has a reason to disable it.

## TDD without a red commit

The battery lands after the fix it covers, so there is no failing-first commit. The RED step was a
hand-mutation removing the `recheckDiskAfterGrace` call; the incident scenario went red on **seven
independent readings** while the other four stayed green — design's exact predicted survival set.

**`ditto staged` generated ZERO mutants**, because it scopes to staged production lines and this
change stages only tests. Exit 0 with no output is "none created", not "all killed". The evidence
is therefore eight hand-mutations, each proved to compile before its verdict was read — a
correction learned from SDD-62, whose first mutation harness reported SURVIVED for mutants that
had actually failed to build.

Two mutants are each killed by exactly one scenario: the comparison-basis mutant dies to the
residue scenario alone, and the boundary mutant (`>` → `>=`) dies to the nothing-landed scenario.
Cutting either scenario would leave a shipped guard unpinned.

## Open items carried forward

- **D4, recorded and not fixed.** `pollForCompletion` checks root, then flattens, then completes on
  the next iteration — so on a subfolder landing the flatten runs before the rename, inverting the
  order `completeDownloadedEpisode`'s own doc comment declares load-bearing. SDD-62 did not touch
  that path. Engram #8814. **The subfolder scenario deliberately does not assert the rename
  outcome**: whether JD's link-rename survives the move is not verifiable from this repository, so
  an assertion would pin the harness's model of JD rather than JD. That reasoning is written into
  the test as a comment so a later reader does not "helpfully" add it.
- **D2b and D3** remain live. D3's deferral rests on SDD-61's own requirement: the probe timeline
  exists to decide whether a start-detection miss is a schedule or a predicate defect, and the two
  require opposite fixes. That measurement still has zero production rows.
- **SDD-61's R5** is still unmeasured — 15–30 new `runtime_events` rows per run against a 20000
  shared cap, never counted on a real run.
- **SDD-51** has four unmerged requirements and remains unarchived. Recorded drift; worth one
  reconciliation change.
- **`filesystem.Renamer` is dead in production** — 405 lines of adapter and tests for code no run
  reaches, since the service renames through JD. Engram #8808. Deleting it versus wiring it is a
  behaviour decision, not cleanup.
