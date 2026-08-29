# Explore — SDD-62 Download Hoster Verdict Fix

**This change alters behaviour.** SDD-61 shipped the instrumentation that makes it verifiable;
this is the fix that instrumentation was built to measure.

## Recommendation

**One change containing D1 + D2c.** D2a needs no fix. D2b and D3 are deferred and recorded as
open items.

## Two corrections to the briefing, both verified

**C1 — SDD-51's orchestration delta was never merged, and SDD-51 is not archived.** It still sits
at `openspec/changes/2026-07-17-sdd-51-download-failure-hoster-fallback/`. A repo-wide grep for
`Filesystem Is Success Truth` returns only change folders and one code comment: **the requirement
does not exist in `openspec/specs/download/orchestration.md`** (10 requirements, verified).

So the instruction "ADD the missing scenario to the existing requirement" is unexecutable — you
cannot add a scenario to a requirement the deployed spec does not contain. This change must **ADD
the requirement carrying BOTH scenarios** (SDD-51's original, plus the new one for "finished-ok
AND the file HAS landed"), attributed in the delta as originally specified by SDD-51 and never
merged. The other unmerged SDD-51 requirements are **drift to record, not to fix** (CLAUDE.md #2).

**C2 — the fix collides head-on with a requirement SDD-61 shipped hours ago.**
`openspec/specs/download/observability.md`, "The Observed Disk Count Is Recorded and Never Acted
On", scenario "A dead verdict over an advanced disk count is recorded, not corrected":

> THEN the entry MUST record `baseline`, `observed` and the `dead`-producing `exit`
> **AND the verdict MUST remain dead, and the package removal MUST still occur**

That is the D1 defect written as a MUST in the source of truth. It was correct *within SDD-61*,
whose entire point was that instrumentation must not change behaviour — but it was written as an
unconditional mandate rather than scoped to that change, so it now reads as a permanent
instruction to keep the bug. It MUST be MODIFIED, scoping it to "`observed` as recorded on the
episode entry stays non-causal" while carving out the new pre-verdict disk re-check.

`Episode Terminal Exit Is Recorded` also needs modifying twice: the enum is declared **CLOSED at
17 values** and D1 adds an 18th, and row 2's "(no rename)" becomes false once D2c lands.

**Smaller correction:** the exit stamped on the D1 path is **`grace_no_signal_first`**, not
`grace_classified_dead`. `classifyJDStatus` returns `verdictFinishedOK`, so the dead branch is
skipped entirely and control reaches the no-positive-signal tail. The label matters for the
verification query. Note also that on a **fallback** hoster the identical state yields
`grace_no_signal_fallback` + timeout and **no `jdRemove`** — package destruction is a
first-hoster-only symptom, while the misclassification hits both.

## Which defects die if D1 alone lands

- **D3 stops being a correctness defect.** Its failure mode — a transfer that starts and finishes
  inside a blind gap — is caught by the post-grace disk re-check. Residual: up to ~60 s of latency
  and a missing `download.episode_downloading` row. **Corollary: the right D3 fix is not a tighter
  `.part` cadence, it is probing for the COMPLETED file too** — which is exactly what D1's guard
  does.
- **D2a (misattribution) and D2b (orphan transfer) lose their dominant cause.** Hoster N returns
  success at its own FASE 1B, so hoster N+1 never starts. Residual firings (a post-deadline
  landing, a failed `jdRemove` leaving a prior package running) are rare and are already labelled
  honestly by `exit: disk_ahead_at_entry`.
- **D2c (rename asymmetry) survives.** It sits on the entry-guard path D1 does not touch.

## D2c — mild alone, severe in combination

`downloadedEpisodeBaseline` is `max(HighestEpisodeAtRoot, CountAtRoot)`. A raw-named file parses
to episode 0, so `highest` misses it, but `count` still increments and the cursor survives. It
breaks when a **duplicate** video file exists — which is precisely what D2b's orphaned redundant
transfer produces. Then `count` over-reads and the cursor skips a real episode permanently, the
failure `episodeNumberFromName`'s own comment calls "silent and permanent".

The fix is one line (`flattenDownloadFolder` → `completeDownloadedEpisode`) plus a spec MODIFY,
because the shipped exit table says "(no rename)" for that row.

## Recommended implementation shape

Put the guard in `awaitHosterOutcome`, **not** inside `evaluateJDAfterGrace`:

```go
started, probes := s.detectDownloadStartPhase(...)
if !started {
    if outcome := s.recheckDiskAfterGrace(ctx, runID, anime, folder, baselineCount, episode); outcome != nil {
        return *outcome
    }
    if outcome := s.evaluateJDAfterGrace(...); outcome != nil {
        return *outcome
    }
}
```

`baselineCount` is already in scope there, and `evaluateJDAfterGrace` keeps its 8-parameter
signature unchanged. The helper uses `downloadedEpisodeRecursive` (always ≥ root, so it catches JD
package subfolders), calls `completeDownloadedEpisode` (rename **before** flatten), and returns
`hosterOutcomeSuccess` with a new 18th exit `grace_disk_confirmed`.

**Running before `jdRemove` is load-bearing**: `RenameEpisodeByDestination` picks the newest
finished link under the destination, so the rename only works while JD still holds the package.

## Verification from runtime_events

This is why SDD-61 shipped first.

- **Defect signature:** `jd_removed{stage:"grace_no_signal_first", anyFinished:true, verdict:"finished_ok"}`
  + `hoster_attempt{attemptIndex:1, outcome:"success", exit:"disk_ahead_at_entry"}`
  + `episode_downloaded{baseline:N, observed:N+1}`.
- **Fixed signature:** no `jd_removed`; `hoster_attempt{attemptIndex:0, outcome:"success",
  exit:"grace_disk_confirmed"}`; a `download.renamed` row present; zero rows with
  `attemptIndex >= 1`.

Metadata is not filterable, but `recordHosterAttempt` writes the exit into the message text, which
`Text` LIKE reaches — no extra work needed.

## Why D3 is deferred — the strongest argument

SDD-61's shipped requirement "Download-Start Probe Timeline Is Persisted" states, in its own
words, that the probe timeline exists to decide whether a miss is a **schedule** defect or a
**predicate** defect, "and they require opposite fixes". R5 is UNMEASURED: zero production rows
exist yet.

Fixing D3 now would guess at exactly the question the instrument was built to answer. The
requirement is schedule-agnostic, so D3 needs no observability spec change when it does land.

## Budget

D1 + D2c ≈ 355 authored lines, under the 400 budget. Adding D3 ≈ 505, forcing a second slice.
D2b additionally needs a 19th exit value and risks orphaning `exitDiskAheadAtEntry`, re-breaking
the closed-enum requirement.

## Test blast radius

**No existing test asserts the defect, so the suite stays green and gives ZERO protection.**
`ditto staged` is the only real guard here.

New tests need a NEW file: `service_hoster_watch_test.go` is 523 raw, `service_pipeline_exit_test.go`
405, `service_run_status_test.go` 469, `app_download_test.go` ~497 effective. The guard sits inside
`if !started`, so tests MUST use `newProbeWatchService`/`newWatchTestService`
(`DetectStartPhaseDisabled=false`) with an **advancing** clock — SDD-61's R6 warns that a fixed
clock makes exactly this kind of test pass vacuously.
