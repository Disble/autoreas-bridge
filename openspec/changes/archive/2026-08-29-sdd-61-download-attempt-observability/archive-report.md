# Archive Report — SDD-61 Download Attempt Observability

Change: `2026-08-29-sdd-61-download-attempt-observability`
Archived: 2026-08-29
Archived to: `openspec/changes/archive/2026-08-29-sdd-61-download-attempt-observability/`
Artifact store: `openspec` (delta specs merged into the main specs, folder moved to the archive).

This report is the terminal record of the cycle. Where it disagrees with
`verify-report-slice-1.md` or `verify-report-slice-2.md`, those are intermediate snapshots and this
report describes the state at close.

---

## 1. What shipped

Two commits on `main`, both through the full pre-commit gate, never `--no-verify`:

| Commit | Slice | Scope | Files / lines |
|---|---|---|---|
| `b8bc507` | Slice 1 | Probe timeline, `download.detect_start_succeeded`, `download.jd_removed` on every removal, `download.hoster_attempt` per attempt | 14 files, +2648 / -40 (SDD artifacts included) |
| `1f69a84` | Slice 2 | The closed 17-value `exit` discriminator plus `baseline`, `observed`, `hoster`, `attemptIndex` | 11 files, +989 / -77 (SDD artifacts included) |

Baseline before the change: `bc82d5a`.

The change is **instrumentation only**. No hoster verdict, failure classification, run counter,
persisted run row or event-bus payload changed value. The zero-line-diff acceptance criterion was
re-run across both commits and returned empty output for `internal/download/service.go`,
`internal/download/service_notification_rows.go`, `internal/events/event.go`, `docs/openapi.yaml`
and `openspec/specs/download/orchestration.md`.

Verification was performed by the orchestrating agent directly, per `CLAUDE.md` #3, and the commits
were created before the change was reported verified, per `CLAUDE.md` #4.

## 2. Specs merged into the source of truth

| Main spec | Action | Detail |
|---|---|---|
| `openspec/specs/download/observability.md` | Updated | 8 ADDED requirements / 26 scenarios appended. The 9 pre-existing requirements are preserved byte-for-byte; the file now holds 17 requirements / 44 scenarios. |
| `openspec/specs/download/sites.md` | Updated | 1 MODIFIED requirement — "Failure-Cause Classification Is Telemetered" replaced by the delta's full block (3 unchanged scenarios + 3 new). The other 4 requirements are preserved byte-for-byte; the file now holds 5 requirements / 17 scenarios. |
| `openspec/specs/download/orchestration.md` | **Not touched** | Deliberate. This change modified no orchestration behaviour, and its zero-line diff is a verified acceptance criterion. |

### `rules.archive` — destructive-delta check

`openspec/config.yaml` requires a warning before merging destructive deltas. **No warning is
needed.** Both deltas are additive:

- `observability.md` removes nothing; the merge is a pure append.
- `sites.md` is a block replacement whose only "removed" line is the original single-line mandate
  paragraph, re-wrapped across four lines. The unwrapped text was compared word-for-word and is
  identical. All three original scenarios survive verbatim; three scenarios and four paragraphs are
  added.

### Merge mechanics

Sections were extracted with `sed` and appended with `cat`; no file content passed through a
Read/Write path. Each merge was verified by `diff` against both the extracted source region and the
preserved original region — all four comparisons empty. The change folder was moved with `git mv`
and verified by `diff -r` against a pre-move recursive snapshot, also empty.

## 3. Open item carried forward — R5 is UNMEASURED

**Tasks 3.6 and 6.5 are `[~] DEFERRED`, not complete.** Both need a live JDownloader session and an
anime with an episode actually available online; neither can be summoned deterministically.

- **The 15-30 new `runtime_events` rows per download run is an ESTIMATE, never a measurement.** The
  cap is 20000 rows (`internal/observability/eventlog/store.go`, `defaultRowCap`, pruned every 200
  writes) and it is **shared across every domain**, not reserved for `download`.
- **Action for the next real scheduled run: count the rows the run actually produced.** If the true
  figure is materially above 30 per run, the shared retention cap needs revisiting — a chatty
  download domain would prune other domains' events out of the log, which is a silent loss.
- What remains unproven is only that these specific call sites fire in production. The
  `logf` -> `FanoutLogger` -> `eventlog.Sink` -> SQLite path is already proven end to end by every
  existing `download.*` row, and the new emissions use that same seam; the unit tests cover the call
  sites via `fieldsRecorder`.

**Recorded contradiction, resolved by rank.** `verify-report-slice-2.md` closes with "archive should
wait until R5 is measured on a real run" (written 2026-08-29, at slice 2 verification). The
orchestrator's archive instruction, the more recent account of the change, directed archiving now
with R5 carried forward as an explicit open item. The launch prompt outranks an intermediate
snapshot, so the change is archived; the snapshot's recommendation is recorded here rather than
silently dropped, and **R5 stays open**.

## 4. Open item carried forward — the SDD-51 spec gap belongs to the follow-up

`openspec/changes/2026-07-17-sdd-51-download-failure-hoster-fallback/specs/download-orchestration/spec.md`,
requirement "Filesystem Is Success Truth, JD Status Is Failure Truth", covers only the case "JD
reports finished-ok but the file has NOT landed". It is **silent** on "JD reports finished-ok AND
the file HAS landed", and `evaluateJDAfterGrace` resolves that silence by declaring a completed
download dead and deleting its finished JD package.

The code complies with the letter of the requirement and contradicts its intent. Per `CLAUDE.md` #2,
**code wins as runtime truth**; the gap is recorded, not fixed here. It is preserved in Engram #8787
and in this change's `explore.md`.

**Constraint on the follow-up (D1): it MUST ADD the missing scenario** — "JD reports finished-ok and
the file HAS landed -> MUST re-read the filesystem before any dead verdict" — rather than silently
reinterpreting the existing requirement. Reinterpretation would leave no record that the behaviour
changed.

## 5. Three known defects this change deliberately did NOT fix

SDD-61 instruments; it does not repair. The follow-up starts here.

- **D1 — `evaluateJDAfterGrace` (`internal/download/service_hoster_watch.go`) never re-reads the
  filesystem.** A finished download whose `.part` window was missed is classified dead and its
  finished JD package is deleted. This is the defect behind the `run-dl1532pqkk3g` incident.
- **D2 — the `awaitHosterOutcome` entry guard credits the disk delta to whichever hoster is being
  watched.** `AddAndStart` for hoster N+1 has already run by then, so a redundant transfer is
  started and orphaned.
- **D3 — `detectDownloadStartPhase` probes for `.part` three times over 60 s with 20 s blind gaps.**
  A transfer shorter than the gap is invisible to the probe schedule.

**Why instrumentation shipped first.** The follow-up fix for D1 is now **verifiable from
`runtime_events` alone**, rather than reconstructible only by hand against JDownloader's log and
NTFS timestamps — which is exactly what the original `run-dl1532pqkk3g` investigation had to do. The
persisted log now carries, without external corroboration:

- `exit: disk_ahead_at_entry` on a credited attempt — the file was already on disk when that hoster
  began, so the credited hoster did not deliver it.
- `baseline` and `observed` side by side — a `dead`-producing exit recorded next to a disk count
  that had already advanced is the defect, visible after the fact, with the system never branching
  on it.
- `download.jd_removed` with `anyFinished:true` and `verdict:"dead"` — the removal that destroyed
  the evidence, beside the state that supposedly justified it.
- `download.hoster_attempt` for every attempt, so the credited hoster can be compared against the
  one that actually ran.

That measured baseline is what makes the D1 fix reviewable against evidence instead of against a
narrative.

## 6. Gate results at close

Carried from the two verification reports; no work landed after them.

| Check | Slice 1 (`b8bc507`) | Slice 2 (`1f69a84`) |
|---|---|---|
| `gofmt -l internal/` | clean | clean |
| `go vet ./...` | exit 0 | exit 0 |
| `golangci-lint run` | 0 issues | 0 issues |
| `go test ./internal/download/...` | all packages ok | all packages ok |
| `go run ./tools/checkgofilesize` | passed, no new warnings | passed, no new warnings |
| `tools/checkgofilesize/baseline.yaml` | `files: []` | `files: []` |
| Mutation (`ditto staged`) | 17/17 killed, score 1.00 | 4/4 killed after repair, score 1.00 |
| Full pre-commit gate | green | green |

`internal/download/service_hoster_watch.go` finished at **340 raw lines**, under the design's
predicted ~425; extracting `pollForCompletion` bought the margin.

### Judged guard exceptions, recorded so they are not re-litigated

- **Slice 1, task 3.5 (design section 9.1, guard b).** As literally written the guard fails: four
  pre-existing tests in `service_hoster_watch_test.go` changed both their `t.Fatalf` lines and their
  assertions. Judged on substance it holds — `detectDownloadStartPhase`'s second return value
  changed type from `*hosterOutcome` to `[]probe`, so the old assertion could not be preserved, and
  that return value was **already dead code in production** (its only production call site discarded
  it). The replacements are strictly stronger, and the `started` assertions that production actually
  branches on are unchanged in all four tests. The verifier's recommendation stands: state the guard
  as "no assertion on a value production reads may change".
- **Slice 2, task 6.3.** The repairs in `service_cancel_test.go` and `service_fallback_test.go` are
  genuinely type-only; the single changed `t.Fatalf` renames a variable inside an otherwise
  identical message, and the expected value is unchanged.
- **`enqueueWithFallback` had seven test call sites, not the five the tasks listed** — slice 1 added
  two in `service_pipeline_observability_test.go`. All seven were repaired, all type-only.
- **Two gate findings a bare `golangci-lint run` does not report** (gocognit 16, funlen 62) were
  found only by `scripts/lint.ps1 -Profile all`, and fixed by extracting `pollForCompletion` and
  reflowing three result literals. Recorded separately in Engram #8796.

## 7. Task completion

**53 tasks: 51 complete `[x]`, 2 deferred `[~]` (3.6 and 6.5), 0 unchecked `[ ]`.** No stale-checkbox
reconciliation was performed and none was needed. The two deferred tasks are the R5 measurement
carried forward in section 3; they remain recorded as deferred in the archived `tasks.md`, not
silently marked complete.

## 8. Traceability

Engram observations for this change:

| Artifact | Observation |
|---|---|
| explore | #8789 |
| proposal | #8790 |
| delivery decision (auto-chain / stacked-to-main) | #8791 |
| spec | #8792 |
| design | #8793 |
| tasks | #8794 |
| apply-progress | #8795 |
| shipped summary | #8798 |
| archive-report | this document, topic `sdd/2026-08-29-sdd-61-download-attempt-observability/archive-report` |

Related discoveries: #8787 (the SDD-51 spec gap), #8788 (two event paths, only one persisted),
#8796 (the pre-commit gate's golangci-lint is stricter than a bare run).

**No `sdd/{change}/verify-report` observation exists.** The artifact store is `openspec` and
verification was performed by the orchestrating agent directly per `CLAUDE.md` #3, so the record is
`verify-report-slice-1.md` and `verify-report-slice-2.md` in this archived folder. Both were read in
full before archiving.

**Review gate:** `reviewGate` is structurally absent for this candidate, so the archive proceeded
under ordinary repository policy — the repo-owned pre-commit gate, which both commits passed.

## 9. Next

- **Measure R5 on the next real scheduled download run** (section 3). This is the only open
  measurement.
- **Open a follow-up change for D1** (section 5), which must ADD the missing SDD-51 scenario
  (section 4) rather than reinterpret the existing one. D2 and D3 are candidates for the same or a
  subsequent change.
