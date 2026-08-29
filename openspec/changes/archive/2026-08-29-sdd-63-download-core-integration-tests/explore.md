# Explore — SDD-63 Download Core Integration Tests

A **small** battery that drives the download core against a real filesystem. "Small" is a hard
constraint from the user: a sprawling real-FS suite would be slow and brittle, and a battery
people later disable is worse than none.

Sequenced AFTER SDD-62, which changes the very code these tests cover. All assertions target
post-SDD-62 behaviour.

## The gap this closes

| Layer | Coverage today | Where |
|---|---|---|
| `awaitHosterOutcome` / `enqueueWithFallback` / `processAvailableEpisode` | Heavy, all-fake | 16 files, via `baseDeps` |
| `filesystem.EpisodeCounter`, `Flattener` | Real `t.TempDir()`, isolated | `filesystem/counter_test.go` |
| `hasPartFilesRecursive` — FASE 1's ONLY sensor | Unit-tested; **never seen returning `true` inside a run** | `service_hoster_watch_test.go:332-401` (5 direct tests), `:504` |
| Real adapters *inside* a run | **One test** | `service_hoster_watch_test.go:210-212` |
| Rename-before-flatten against real files | **ZERO** | that one test leaves `RenameEpisodes` false |
| Disk state → next episode's cursor | **ZERO** | fakes write the cursor into a map |

The load-bearing fact: `baseDeps` sets **`DetectStartPhaseDisabled: true`** by default
(`service_test_builders_test.go:72`). Of ~70 full-run invocations, essentially none exercise
FASE 1 — the phase where D1 and D3 live. `t.TempDir()` appears in several tests but is a decoy:
`service_behavior_test.go` creates one and then calls `setSvcFakeCounter`, so the directory is
only a path string and the real filesystem is never read.

## Three corrections to the briefing, all verified

**C1 — "real `Renamer`" is unreachable; the service never calls it.** `service_rename.go:48`
renames through `s.deps.JD.RenameEpisodeByDestination`. A repo-wide grep for `.Renamer` excluding
tests returns exactly one hit: the field declaration at `service.go:74`. It is never read. That
is 144 lines of adapter plus 261 lines of `renamer_test.go` for code no run reaches. A real
`Renamer` in the battery would silently do nothing. **Drift recorded (Engram #8808), not fixed
here** — deleting it versus wiring it is a behaviour decision, since the JD-side rename fails when
the package is already gone and a filesystem-side one would not.

**C2 — do not gate on `testing.Short()`.** `lefthook.yml:128` runs `go test ./... -cover -p 4
-parallel 4` with no `-short`, so gating saves the gate nothing. Where `-short` could appear is a
future `ditto` invocation — and a Short-gated battery would then vanish from the exact step it
exists to serve.

**C3 — `Flatten` is already covered** in `counter_test.go:148-260` against real `t.TempDir()`.
No duplication risk, no gap.

**C4 — correction to an earlier claim in this document.** An earlier draft said
`hasPartFilesRecursive` has ZERO coverage and that every test injects `HasPartFiles`. **Both
halves were wrong.** Five direct unit tests exist at `service_hoster_watch_test.go:332-401`
against real `t.TempDir()` (empty folder, `.part` at root, `.part` in a subfolder, non-`.part`
ignored, inaccessible path skipped), and `:504-506` runs the real sensor inside a full run
without injecting.

The narrower claim survives and is the better justification for S2: **that in-run use points at a
non-existent folder**, so the sensor is permanently `false` there. **No test has ever observed it
return `true` inside a run.** Separately, `service_hoster_watch.go:96` slices the last five bytes
(`len(d.Name()) > 5 && ...== ".part"`), and every fixture uses a name far longer, so a file named
exactly `.part` is invisible and nothing says so — genuinely unpinned, but that is a one-line unit
case beside the existing five, not grounds for an integration scenario.

**C5 — `baseDeps` needs three replacements, not one.** Beyond `setSvcFakeCounter`, it wires a
FIXED `Clock` (a closure over a local `fixedNow`, `:56`/`:69`), a NO-OP `PollSleep` (`:71`), and a
fake `Flattener` (`:64`) installed independently. The battery must repoint `Clock` **and**
`PollSleep` at a shared `*time.Time`, or every `probe.elapsedMs` reads 0 and the simulator never
advances. `newWatchTestService:162-170` is the reference wiring but is itself unusable, because it
calls `setSvcFakeCounter`.

## Three helper constraints that shape the harness

- `setSvcFakeCounter` (`service_test_builders_test.go:25-37`) replaces **both** `Counter` and
  `Flattener`. Both `newWatchTestService` and `newProbeWatchService` call it, so **neither is
  usable by this battery**.
- `newProbeWatchService` always overwrites `HasPartFiles` — the very sensor the battery must
  leave alone. `detectDownloadStartPhase:119-122` falls back to `hasPartFilesRecursive` when it
  is nil, so leaving it unset post-construction is safe.
- `NewService` defaults `RenameEpisodes` to **false** (`service.go:176-178`). Without setting it
  true, every rename assertion is vacuous.

The seed already exists: `TestAwaitHosterOutcomeFlattensJDownloaderPackageWhenRootSignalsCompletion`
(`service_hoster_watch_test.go:192-229`) builds from `baseDeps` and swaps in
`filesystem.NewEpisodeCounter()` + `NewFlattener()`. The battery generalises that one test.

## The crux, dissolved rather than mitigated

**The virtual clock IS the scheduler, and there is nothing to race.** The suite is
single-goroutine; `PollSleep` advances a fake clock and returns instantly. Make it also drain a
JD-simulator action queue that performs **real** file operations:

```go
deps.PollSleep = func(d time.Duration) {
    *now = now.Add(d)
    sim.advanceTo(*now)   // executes every scheduled action whose instant has passed
}
```

```
type jdAction { at Duration; do func(t, *jdSim) }

type jdSim {
    *svcFakeJDClient        // embed; override only the four methods the core calls
    t, folder, armedAt      // armedAt set by AddAndStart, == t0
    script []jdAction, cursor int
    finished string         // the path JD believes it holds
    statuses []DestinationStatus, calls, removals int, enqueued []string
}

advanceTo(now):
    while cursor < len(script) && now >= armedAt + script[cursor].at:
        script[cursor].do(t, sim); cursor++
```

Actions:

- `startsTransfer(name)` → `os.WriteFile(folder/name + ".mp4.part")`. **The name must exceed five
  characters**: `hasPartFilesRecursive` (`service_hoster_watch.go:96`) tests the last five bytes,
  so a bare `.part` is invisible to the sensor.
- `finishesTransfer(name)` → `os.Rename(name+".mp4.part" → name+".mp4")`, then sets
  `sim.finished`.
- `startsTransferIn(pkg, name)` / `finishesTransferIn` for the subfolder scenarios.
- `RenameEpisodeByDestination` renames `sim.finished` **and nothing else** — never a fresh scan.
  That is what makes flatten-before-rename break here exactly as it breaks JD's real link record.
- `RemoveByDestination` → `removals++; finished = ""`. **Files stay** — verified against
  `jdownloader/status.go:174-213`, which removes LinkGrabber and Downloader package records only
  and makes no `os.` call.

"JD writes the file between probe 2 and probe 3" becomes something written down, not hoped for:

```
script: {45s: startsTransfer("d2ouiemgt90z"), 55s: finishesTransfer("d2ouiemgt90z")}
```

`detectDownloadStartPhase` sequences `Sleep(20s)` → probe₁(t=20) → `Sleep(20s)` → probe₂(t=40) →
`Sleep(20s)` → probe₃(t=60). Both offsets fall inside the single sleep carrying t 40→60,
**lexically between** probe₂'s `pf(folder)` and probe₃'s. Nothing can observe the intermediate
state — this is lexical ordering in one goroutine, not a timing window.

Anchor: t=0 is `AddAndStart` (`service_pipeline.go:404`), immediately before `awaitHosterOutcome`.

## The acceptance bar is met — with one correction

**The battery CAN reproduce `run-dl1532pqkk3g` against pre-SDD-62 code, but only with a ROOT
landing.** An earlier draft had the file landing in a package subfolder; that was wrong and does
not reproduce the incident.

Traced against pre-SDD-62 `awaitHosterOutcome`, two hosters, `baselineCount = 4`:

| | Attempt 0 (Mediafire) | Attempt 1 (Mega) |
|---|---|---|
| Entry guard (root) | root 4, not > 4 → no fire | root **5** > 4 → **fires** |
| FASE 1 | `.part` at t=45s, finished t=55s; all three probes miss | — |
| FASE 1B | `verdictFinishedOK`, `hasPositiveJDSignal` false, `isFirstHoster` → **`jdRemove`** → dead, `grace_no_signal_first` | — |
| Terminal | dead → fall back | success, `disk_ahead_at_entry`, flatten only, **no rename** |

That is the recorded signature exactly. Two verified facts make it work: JD writes to the
destination root in the common case (`AddAndStart` is called without a package name specifically
to avoid the subfolder — `filesystem/flatten.go:12`), and `RemoveByDestination` destroys records
rather than files, which is why attempt 1's entry guard still found the episode at root.

With a subfolder landing the incident does **not** reproduce: attempt 1's entry guard reads root
too and misses, so the run reaches FASE 2, `pollForCompletion:245` flattens, and the next
iteration credits Mega with `fs_poll_confirmed`. Still a misattribution, different exit, package
already destroyed — a worthwhile variant, but not the incident.

**Consequence:** S1 must drive **`enqueueWithFallback`**, not `awaitHosterOutcome`. The "credits a
fallback that transferred nothing" half needs two hosters, and driving at that level yields
`attemptIndex`, removal count and which hosters were enqueued for free.

## Minimum scenario set — five

| # | Scenario | Earns its place because |
|---|---|---|
| **S1** | **Incident replay**, root landing, two hosters. `.part` at t=45s, finished t=55s. Post-fix: success at **`attemptIndex 0`**, exit `"grace_disk_confirmed"`, **zero** removals, **Mega never enqueued**, file at root as `Test Anime - 05.mp4`, `downloadedEpisodeBaseline == 5`. | The acceptance bar, and the only test anywhere that produces the closing `.part` window from real file operations. "Mega never enqueued" gives the spec's *"MUST NOT start a fallback hoster attempt"* for free. |
| **S2** | **Transfer visible, package-subfolder landing.** `.part` at t=25s, finished t=90s. Probe₂ sees it through the real sensor → `detect_start_succeeded`; FASE 2's `Flatten` really moves it; root read confirms → `"fs_poll_confirmed"`. | Triple duty: the **only** test that ever runs the production `.part` sensor (whose `len(name) > 5` slice is an unpinned off-by-one); the only real-depth subfolder coverage; and it proves S1's new guard does not swallow the normal path. |
| **S3** | **Nothing lands.** Empty real folder throughout, post-grace JD reports offline. Asserts dead, `"grace_classified_dead"`, exactly one removal, disk still empty. | Without it, S1 proves the guard *fires*, not that it is **conditional**. It is the only thing standing between the fix and turning every failure into a success. |
| **S4** | **Two-level residue.** `folder/pkg/sub/leftover.mp4` present before the attempt, root empty, nothing new lands. Asserts: not a success, falls through to post-grace evaluation, residue **still in its subfolder**. | SDD-62's R-3 decision rests on the claim "Flatten is one level deep, so residue survives forever", which today rests on reading `flattenOneSubdir:99`. `svcFakeCounter` has no notion of depth, so only a real filesystem can pin the premise that decision was made on. |
| **S5** | **Two consecutive episodes.** Ep 5 lands in a package subfolder as JD's opaque `d2ouiemgt90z.mp4`, is renamed and flattened; the loop must then attempt **episode 6**. | The only scenario closing the loop from bytes-on-disk back to "which episode next". Rename-before-flatten has **zero real-file coverage**, and `CountAtRoot` is non-recursive, so Flatten is what makes the cursor move at all. Asserting the literal `Test Anime - 05.mp4` at root is the only thing in the repo pinning the order rule `completeDownloadedEpisode`'s doc comment declares. |

All five carry weight. **If forced to four, cut S3** and fold its assertions (`removals == 1`,
disk unchanged) into a fake-based test in `service_hoster_watch_exit_test.go` (222 lines, has
headroom) — it is the only one of the five whose subject is not filesystem-specific. S1, S2, S4
and S5 each assert something no fake can.

## TDD shape — there is no red commit, and that is expected

The battery lands *after* the fix, so there is no literal failing-first commit. **The RED step is
`ditto staged` plus one hand-mutation: delete the `recheckDiskAfterGrace` call and S1 must go
red.** `tasks.md` must say this explicitly so `sdd-verify` does not read the absence of a red
commit as a skipped step.

## Layout, cost and risks — orchestrator decisions

*The exploration was truncated before these; recorded here as the orchestrator's calls, to be
confirmed at design.*

**Layout: a new file in package `download`, not a new package.** The battery needs `baseDeps`,
`ServiceDeps`, `awaitHosterOutcome`, `enqueueWithFallback`, `downloadAvailableEpisodes` and
`svcFakeJDClient` — all unexported. A separate package would require exporting internals purely
to test them, which is a worse trade than one more file in `internal/download`.

**Cost:** five scenarios, each performing a handful of small `os.WriteFile`/`os.Rename` calls on
a `t.TempDir()`, with no real sleeping — the clock is virtual. Expected well under a second
total, against the gate's existing ~20–50 s of Go work. Measure at verify rather than assume.

**Risks:**
- The sim holds mutable state, so each scenario must own its own `jdSim` and `t.TempDir()`. Shared
  state across `t.Parallel()` subtests is the one realistic route to flakiness here.
- A battery people later disable is worse than none. The guard against that is keeping it at five
  scenarios and sub-second — if it grows, it dies.
- S4 asserts a premise SDD-62 already shipped on. If S4 fails, SDD-62's R-3 decision needs
  revisiting, not S4.
