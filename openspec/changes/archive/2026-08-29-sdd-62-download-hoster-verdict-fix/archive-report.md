# Archive Report — SDD-62 Download Hoster Verdict Fix

Change: `2026-08-29-sdd-62-download-hoster-verdict-fix`
Archived: 2026-08-29
Archived to: `openspec/changes/archive/2026-08-29-sdd-62-download-hoster-verdict-fix/`
Artifact store: `openspec` (delta specs merged into the main specs, folder moved to the archive).

This report is the terminal record of the cycle. Where it disagrees with `apply-progress`
(Engram #8809), that observation is an intermediate snapshot and this report describes the state at
close.

---

## 1. What shipped

One commit on `main`, through the full pre-commit gate, with the gate never bypassed:

| Commit | Scope | Files / lines |
|---|---|---|
| `31ef4d5` | D1 (post-grace disk re-check before any dead verdict), D1b (the re-check carries its own probe timeline), D2c (every success path completes the episode) | 12 files, +1659 / -51 (SDD artifacts included) |

Baseline before the change: `b05b76f` (the SDD-61 archive commit).

SDD-61 shipped the instrument; SDD-62 is the fix it was built to make reviewable. `awaitHosterOutcome`
now captures a recursive baseline, and `recheckDiskAfterGrace` takes a FRESH filesystem reading
between the failed detect phase and `evaluateJDAfterGrace` — before any package removal, while JD
still holds the package so `RenameEpisodeByDestination` can still resolve. A download that finished
inside the probes' blind gap is no longer declared dead and deleted.

**This is a behaviour change, deliberately.** SDD-61 was instrumentation-only; SDD-62 changes hoster
verdicts, and the merged specs say so.

Verification was performed by the orchestrating agent directly, per `CLAUDE.md` #3, and the commit
was created before the change was reported verified, per `CLAUDE.md` #4.

## 2. Specs merged into the source of truth

| Main spec | Action | Detail |
|---|---|---|
| `openspec/specs/download/observability.md` | Updated | 3 MODIFIED requirements replaced in place + 1 ADDED appended. 540 -> 638 lines; 15 -> 18 requirements; 35 -> 49 scenarios. The 15 requirements not named by the delta are preserved byte-for-byte. |
| `openspec/specs/download/orchestration.md` | Updated | 3 ADDED requirements appended. 158 -> 280 lines; 10 -> 13 requirements; 20 -> 29 scenarios. All 10 pre-existing requirements preserved byte-for-byte. |

### `rules.archive` — destructive-delta WARNING (deliberate removals, not silent)

`openspec/config.yaml` requires a warning before merging destructive deltas. **Two warnings are owed
here, and both removals are the POINT of the change rather than merge collateral.** They are recorded
here, and the merged spec keeps them visible in each requirement's `(Previously: ...)` note, so the
source of truth carries its own record of what it used to mandate.

**Removal 1 — the sentence that mandated the defect.** The deployed scenario
*"A dead verdict over an advanced disk count is recorded, not corrected"* ended with:

> - AND the verdict MUST remain dead, and the package removal MUST still occur

That line was correct as a guard scoped to SDD-61's instrumentation-only change and became a standing
order to keep the bug once archived. It is REMOVED. The scenario is renamed *"...is corrected, and
both counts recorded"* and now mandates the opposite: a fresh filesystem reading BEFORE any dead
verdict, and success when the episode landed.

**Removal 2 — the falsified unscoped premise.** The deployed scenario *"No control flow reads the
observed count"* opened with *"two OTHERWISE IDENTICAL attempts that differ ONLY in the on-disk count
observed at the terminal point"*. SDD-62 falsifies it: two attempts differing only in disk count no
longer reach the same terminal point, because the disk count now decides the outcome through a fresh
reading. The scenario is re-scoped to *"two attempts that reach the SAME terminal point with different
on-disk counts recorded as `observed`"*, which preserves the real invariant — the RECORDED forensic
field is still never read back — without asserting the falsified premise.

A third, smaller de-scoping rides along: *"Forensic Instrumentation Changes No Behavior"* said "the
change is instrumentation only ... may change value as a result of it". Once archived, "this change"
had no antecedent, so it read as forbidding every later behaviour change in this area. It is rewritten
to forbid the INSTRUMENTATION from causing a change, not the system from ever changing.

### Post-merge verification of the three critical merges

Each was confirmed by grep against the merged `openspec/specs/download/observability.md`:

| Check | Result |
|---|---|
| `grep "verdict MUST remain dead"` | ABSENT |
| `grep "package removal MUST still occur"` | ABSENT |
| `grep "two otherwise identical attempts"` | ABSENT |
| `grep "SAME terminal point"` | present at line 452 (the scoped replacement) |
| Scenario heading at line 459 | `A dead verdict over an advanced disk count is corrected, and both counts recorded` |
| `EIGHTEEN values` | present at line 327; `SEVENTEEN` survives only inside the `(Previously: ...)` note at line 309 |
| Enum table rows | 18 |
| `(no rename)` / `(rename performed)` as table labels | ABSENT from the table; the strings survive only inside the `(Previously: ...)` note at lines 309-310, which is their record |
| Repo-wide sweep of `openspec/specs/` for `verdict MUST remain dead` | zero hits |

`"Filesystem Is Success Truth, JD Status Is Failure Truth"` — the requirement the deployed spec never
carried — is now at `openspec/specs/download/orchestration.md:160`.

### Merge mechanics

No file content passed through a Read/Write path. Regions were extracted with `sed`, assembled with
`head`/`tail` into a temp file, and moved into place with `mv`. Every region was then verified by
`diff`:

| # | Comparison | Result |
|---|---|---|
| 1 | observability preserved head (orig 1-298 vs merged 1-298) | empty |
| 2 | observability preserved tail (orig 453-540 vs merged 498-585) | empty |
| 3 | MODIFIED *Episode Terminal Exit Is Recorded* (delta 9-131 vs merged 299-421) | empty |
| 4 | MODIFIED *The Observed Disk Count...* (delta 133-175 vs merged 425-467) | empty |
| 5 | MODIFIED *Forensic Instrumentation...* (delta 177-200 vs merged 471-494) | empty |
| 6 | ADDED *The Post-Grace Disk Re-Check...* (delta 204-253 vs merged 589-638) | empty |
| 7 | orchestration preserved original (orig 1-158 vs merged 1-158) | empty |
| 8 | orchestration appended ADDED blocks (delta 5-125 vs merged 160-280) | empty |

The change folder was moved with `git mv` and verified by `diff -r` against a pre-move recursive
snapshot — empty output, exit 0. `archive-report.md` is additive and excluded from that comparison.

## 3. Task completion — archive-time reconciliation performed

**25 tasks: 25 complete `[x]`, 0 unchecked.** Tasks 5.5-5.9 were `[ ]` when this phase began.

`sdd-apply` left them unchecked deliberately: they are orchestrator-owned (`apply-progress`,
Engram #8809 — *"Tasks 1.1-5.4 complete (20/25); 5.5-5.9 are orchestrator-owned"*). All five completed
after that snapshot was written, which is exactly the case the Final-State Authority hierarchy
covers: an intermediate snapshot's "pending" is valid only for the moment it was written.

`sdd-archive` marked them `[x]` mechanically. The reconciliation record, with per-task evidence, is
appended to the archived `tasks.md` so the audit trail carries it too:

| Task | Evidence | Source rank |
|---|---|---|
| 5.5 `wails build` | `build/bin/autoreas-bridge.exe`, mtime 2026-08-29 14:00 — two minutes before the 14:02 commit. Orchestrator reports exit 0. | repository artifact + launch prompt |
| 5.6 `render:smoke` | Orchestrator launch prompt only. **This run leaves no repository artifact**, so it is the one task marked complete on assertion alone. | launch prompt |
| 5.7 bounded `wails dev` | `build/bin/autoreas-bridge-dev.exe`, mtime 2026-08-29 14:01. Orchestrator reports HTTP on :9876, bindings generated, dev server on :34115. | repository artifact + launch prompt |
| 5.8 `log-lesson.mjs` | `git show 31ef4d5 -- docs/learning-log.md` adds one dated entry: *"A guard written to constrain one change must not enter the permanent spec as an unconditional MUST..."* | repository artifact |
| 5.9 commit | `31ef4d5` on `main`, full pre-commit gate green. | repository artifact |

No task was inferred as complete without saying so: four of five are corroborated by artifacts in this
repository, and the fifth is stated as launch-prompt-only above rather than presented as verified.

## 4. Gate results at close

Carried from the orchestrator's direct verification (`CLAUDE.md` #3). No work landed after it.

| Check | Result |
|---|---|
| `go test ./internal/download/...` | pass |
| `gofmt` | clean |
| `go vet ./...` | exit 0 |
| `go run ./tools/checkgofilesize` | passed; `tools/checkgofilesize/baseline.yaml` still `files: []` |
| `golangci-lint` (with `gocognit`) | clean |
| Zero-line diff on the frozen paths | empty |
| `wails build` | exit 0 |
| `bun --cwd="frontend" run render:smoke` | bundle paints |
| Bounded `wails dev` | HTTP on :9876, bindings generated, dev server on :34115 |
| Full pre-commit gate | green |

**Review gate:** `reviewGate` is structurally absent for this candidate, so the archive proceeded
under ordinary repository policy — the repo-owned pre-commit gate, which the commit passed.

## 5. The cost of instrumenting before fixing — three SDD-61 artifacts had to be corrected here

SDD-61 shipped hours earlier. Three of its artifacts pinned the defect in place, and each had to be
corrected by SDD-62. **They did not fail equally, and that asymmetry is the finding.**

| # | Artifact | How it behaved when the fix landed |
|---|---|---|
| 1 | A spec MUST — *"the verdict MUST remain dead, and the package removal MUST still occur"* | Fails LOUDLY. `sdd-verify` reads the fix as a spec violation. |
| 2 | A test assertion — `service_hoster_watch_exit_test.go:180`, *"expected an entry-guard success to skip completion handling entirely"* | Fails LOUDLY. Inverted in place under task 4.1, declared in `tasks.md` so it would not read as a regression. |
| 3 | An unfaithful fixture that advanced only the ROOT count | **Stayed GREEN.** It would have passed with `recheckDiskAfterGrace` deleted. |

The third is the one worth remembering: an instrument-first change can leave behind a fixture whose
shape encodes the defect, and that fixture is SILENT. Nothing in the gate distinguishes "the fix works"
from "the fixture cannot see the fix". Only mutation testing catches it — mutant M3
(`recursiveBaseline` -> `baselineCount`) is killed by exactly ONE test (T3, the subfolder-residue case);
T1, T2 and T4 all survive it.

**Guidance for the next instrument-first change:** after the fix lands, deliberately audit the
instrumenting change's fixtures for ones that stayed green, and mutate against them. The loud failures
announce themselves; the silent one has to be looked for.

## 6. Open items carried forward — NOT closed by this change

### 6.1 D2b and D3 remain live defects

- **D2b** — the `awaitHosterOutcome` entry guard still credits a disk delta to whichever hoster is
  being watched. Not fixed here.
- **D3** — `detectDownloadStartPhase` still probes for `.part` three times over 60s with 20s blind
  gaps, so a transfer shorter than a gap is invisible to the probe schedule.

**D3's deferral rests on a measurement that has not been taken.** SDD-61's own requirement
*"Download-Start Probe Timeline Is Persisted"* states that the probe timeline exists to decide whether
a start-detection miss is a SCHEDULE defect or a PREDICATE defect, **"and they require opposite fixes"**.
That measurement still has **ZERO production rows**. D3 is deferred pending evidence that does not yet
exist — which is a reason to collect it, not a reason to consider D3 understood.

### 6.2 D2a needs no fix

`exit: disk_ahead_at_entry` already reports it honestly. Recorded so it is not re-opened as a defect.

### 6.3 SDD-51 is still unarchived, and its spec gap is only partly closed

`openspec/changes/2026-07-17-sdd-51-download-failure-hoster-fallback/` remains an ACTIVE change folder.
SDD-62 merged exactly ONE of its requirements — *"Filesystem Is Success Truth, JD Status Is Failure
Truth"*, carrying SDD-51's original scenario plus the converse case SDD-51 never covered.

**Four SDD-51 requirements remain unmerged into the source of truth** (verified by grep at archive time):

| Delta | Requirement | Section | Deployed? |
|---|---|---|---|
| `download-orchestration` | Hoster-Ordered Enqueue | MODIFIED | No — `openspec/specs/download/orchestration.md:59` still carries the pre-SDD-51 text (no JD `dead` polling, no 5s cadence) |
| `download-orchestration` | Dead Package Removed From JD Before Advancing | ADDED | No |
| `download-orchestration` | Fallback and Failure Transitions Surface in Real Time | ADDED | No |
| `download-sites` | JD Status Classification by Destination Folder | ADDED | No |

The launch prompt named three; the fourth (`download-sites`) was found at archive time and is recorded
here for completeness. Recorded drift under `CLAUDE.md` #2 — the code is runtime truth and these specs
lag it. **Deliberately not fixed here.** Merging them is a separate change: it is a spec-reconciliation
job with its own verification surface, and folding it into a behaviour fix would have hidden it.

### 6.4 `filesystem.Renamer` is dead code in production

Verified independently at archive time: a repo-wide grep for `.Renamer` excluding `_test.go` returns
**exactly one hit** — the field declaration `Renamer filesystem.Renamer` at
`internal/download/service.go:74`. The service renames via `s.deps.JD.RenameEpisodeByDestination`.
That is ~144 lines of adapter plus ~261 lines of `renamer_test.go` that no run reaches.

**Deleting it versus wiring it is a BEHAVIOUR decision, not cleanup.** The JD-side rename fails when
the package is already gone; a filesystem-side rename would not. Recorded drift, Engram #8808.

### 6.5 SDD-61's R5 is still unmeasured

15-30 new `runtime_events` rows per run is an ESTIMATE against a 20000-row cap shared across every
domain (`internal/observability/eventlog/store.go`, `defaultRowCap`). It has never been counted on a
real run. SDD-62 adds emissions on the confirmed path, so the estimate is now, if anything, low.

### 6.6 A follow-up is already planned — SDD-63

`SDD-63 download-core-integration-tests`. Its exploration is written at
`openspec/changes/2026-08-30-sdd-63-download-core-integration-tests/explore.md` and is **untracked on
purpose** — this archive neither staged nor moved it.

It closes the reason this defect could ship at all: `baseDeps` sets `DetectStartPhaseDisabled: true`
by default, so of roughly 70 full-run test invocations essentially NONE exercise the phase where D1
and D3 live. The defect was not missed by weak assertions; it was outside the tested region entirely.

## 7. Traceability

Engram observations for this change, all read via `mem_search`/`mem_get_observation` or produced by
this phase:

| Artifact | Observation |
|---|---|
| proposal | #8802 |
| spec | #8803 |
| design | #8804 |
| tasks | #8806 |
| apply-progress | #8809 |
| archive-report | this document, topic `sdd/2026-08-29-sdd-62-download-hoster-verdict-fix/archive-report` |

Related discovery: **#8808** (`filesystem.Renamer` dead in production, section 6.4).

**No `sdd/{change}/verify-report` observation and no `verify-report.md` exist.** The artifact store is
`openspec` and verification was performed by the orchestrating agent directly per `CLAUDE.md` #3; the
record is section 4 above plus the commit's green gate. This differs from SDD-61, which left two
slice-scoped verify reports in its archived folder.

## 8. Next

- **Merge SDD-51's four remaining requirements as a separate spec-reconciliation change** (section 6.3),
  then archive SDD-51.
- **SDD-63** (section 6.6) — integration coverage over the detect-start phase.
- **Collect D3's evidence**: count probe-timeline rows on real runs, so the SCHEDULE-vs-PREDICATE
  question SDD-61 posed can actually be answered (section 6.1).
- **Measure SDD-61 R5** on the next real scheduled run (section 6.5).
- **Decide `filesystem.Renamer`: delete or wire** (section 6.4). It is a behaviour decision.
