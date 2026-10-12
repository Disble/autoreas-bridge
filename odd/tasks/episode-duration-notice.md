# Episode duration notice — work tracking

Architecture and technical detail live in [`docs/episode-duration-notice.md`](../../docs/episode-duration-notice.md).
This file tracks work units and evidence only; it is not the design document.

## Authorized scope

Four work units, approved by the user. Documentation-as-an-ODD and download-cursor migration are
explicitly excluded.

- [x] **ODD 1 — Duration.** VERIFIED PASS by an independent re-verifier. Three commits (`cfb066a`, `fe561de`, `53bd348`); the third adds test files only, 38 insertions, no deletions. The rule is unchanged: below 20 min Short, 20 to 30 inclusive Normal, above 30 Long, and zero/negative/non-finite/unreadable Unavailable. Ditto over the committed scope: 50 mutants, 48 killed, 2 survived at 0.96; both survivors are the `strconv.ParseFloat` bitSize 64→63 and 64→65 pair, proven equivalent from the installed Go source (`src/internal/strconv/atof.go:719–733` selects the float32 path only when bitSize == 32). The verifier independently killed both former gaps with hand mutations and restored each file to its recorded SHA-256:
      - `runtime <= 0` → `runtime <= 1` fails `TestClassify/short_smallest_positive_runtime` (`Classify(1ns) = Unavailable, want Short`), duration.go f47af35c… before and after.
      - `math.IsInf(seconds, 0)` → `(seconds, 1)` fails `TestParseDurationErrorReasons/negative_infinity_is_not_finite`, probe.go 7154564b… before and after.
      `go.mod` and `go.sum` untouched; production files 68 and 132 lines, tests 79 and 356; repository status clean throughout. Residual limitation: ffprobe is an external binary end users may lack, so a missing probe degrades to Unavailable and never to a guess.
      Worktree `autoreas-bridge-worktrees/episode-duration`, branch `feat/episode-duration` from
      `dev`. Commits `cfb066a` (pure constant rule) and `fe561de` (ffprobe probe adapter), four
      files, 597 insertions, all under `internal/anime/duration/**`, `go.mod` and `go.sum`
      untouched. Verified by the writer: boundaries 19m59s/20m0s/29m59s/30m0s/30m1s/41m/90m/zero/
      negative; fail-closed Unavailable; ditto mutation 0.92 with 33 killed and three proven
      equivalent survivors; manual mutation of the 30-minute guard fails the suite and restores
      exactly; real read-only probe of the Slime 24 file returns 1440.042 s and Kind Normal.
      Self-contained: no catalogue lookup, nothing computed from the folder.
      Findings: a real coverage gap (the guard `runtime <= 0` mutated to `runtime <= 1` survives because
      the boundary table never pins the smallest positive duration) and a survivor wrongly called fully
      equivalent (the `math.IsInf` sign mutant leaves classification intact but changes the negative-infinity
      diagnostic). The committed mutation scope is 50 mutants, 46 killed, 4 survived at 0.92, not the
      33/3 the writer reported while staged. The two `strconv.ParseFloat` bitSize mutants are genuinely
      equivalent. Verifier independently reproduced both real probes: the Slime episode 24 MP4 at
      1440.042 s as Normal, and an MP3 at 118.7 s as Short, agreeing with raw ffprobe. No catalogue,
      folder enumeration, mean, median or ratio logic exists in the package.
- OPEN CONCERN on ODD 2 — CONFIRMED AND ESCALATED: independent reproduction gives 331 killed / 340 survived / 671 scored, score 0.49, exit 1 (718 generated, 47 compile-excluded); on Windows 14 more mutants are measurable and killed than the writer could see. Below the repository's 0.80 bar, and two REAL GAPS were found whose tests still pass: `propose.go:209` a Range Break mutation deletes label support, and `triage.go:131` an inversion erases every nonempty list through `orEmpty`. The verifier argues the human-readable evidence is exported observable data surfaced by the product, so unpinned evidence text is a genuine coverage hole rather than equivalent trivia. ODD 2 must be hardened before any merge; a blanket documented deviation was rejected by the verifier. Its survivor sample: 20 adjudicated, 16 REAL GAPS against 4 genuine logical equivalents, including behaviour-changing negative and fractional context guards, nil-timestamp panic guards, and birth-order sorting being skipped. It also refuted the writer's attribution: `ctime_windows.go` generates ZERO mutants while `observe.go` generates exactly 14, so those 14 are not unmeasured Windows-only mutants. The Windows creation-time numeric value itself is never asserted, because the helper returns early.
      POSITIVE RESULT: fixture independence was positively reproduced. Running the TypeScript prototype over the two allowed corpora regenerates the fixture expectations exactly, 20 prototype cases against 20 fixture cases with zero mismatches and no schema adjustment, so the parity evidence is prototype-derived rather than self-referential.
      Hardening writer `mv4cd8f0-k-7lmt` launched: extend the prototype-derived fixture to pin the full observable surface (verdicts, assignments, sources, support, contradictions, label summary, global notes, global assumptions, next reason) and deep-compare it; then cover the guards the corpus cannot reach; then repair the genuine defects the new assertions expose; then re-measure toward the 0.80 bar. The commit gate does not enforce a Go mutation threshold, so the low score did not block the commits; the bar is AGENTS.md practice. An independent verifier is mandated to adjudicate at least 15 survivors itself and to decide between hardening, an accepted documented deviation, or rejection. Not to be silently accepted.
- [~] **ODD 2 — Identity. REBUILT FROM SCRATCH.** The first attempt (branch `feat/episode-identity`, commits `1c8c8ee` and `cdd1a6c`) ported the prototype wholesale — its module layout, an input snapshot envelope, a tolerant JSON layer and a full per-file evidence report — none of which the application consumes, yielding 671 mutants and 340 survivors that no amount of hardening could justify. New worktree `autoreas-bridge-worktrees/episode-identity-core`, branch `feat/episode-identity-core` from `dev`, writer `mv4gywxj-1-f0r4`, with the scope bounded by the user to **the algorithm as a port and an adapter and nothing else**: no folder observer, no I/O, no snapshot or convention types, no evidence report, no duration, coordination, notification or UI. Contract in `docs/episode-duration-notice.md` section 7, governing rule "no field and no branch enters without a named consumer". Parity asserted on the decision only, with the fixture generated by running the TypeScript prototype. Progress: commit `72584a7` decomposed `decide` from cognitive complexity 86 to an 18-line orchestrator over sixteen named passes, moved diagnostics to its own file, split `parseName` into nine helpers, and reached 0 lint issues on both profiles with parity unchanged (dev 16/16, supplemental 4/4). Mutation measured at 0.69 (408 scored, 283 killed, 125 survived), up from 0.49 on the old port with about a third of the code; survivors sit in recognition guards (parse 55, resolve 41 of which 26 CORE and 15 IMPORTANT, partition 21, order 8). Subsequent passes closed the CORE cluster and resolved two semantic deviations, landing `809496a` and `282a23f`, and the parent killed a third real gap at `resolve.go:339` where episode 0 breaks the watched prefix (a mutant `o := 1` to `o := 2` selected instead of abstaining; the writer had called it equivalent and was wrong).

Independent audit findings still being closed: the inference-horizon divergence. At progress 2^53 - 1 with two opaque pendings, Go infers the distinct ordinals 2^53 and 2^53 + 1 and selects, while the prototype computes them in float64, rounds both onto the same value, and reconciliation suspends them into an abstention. An earlier parent attempt to tighten only the context bound to 2^53 - 1 was insufficient: the divergence lives in the arithmetic horizon of the inference, so the guard must cover next plus the pending count.

Fixture provenance was rebuilt because the recorded recipe could not reproduce its own output. It failed on an unexported variable, on stamping the inner command rather than the wrapper, on a prototype path that does not exist in a fresh worktree, and on MSYS path mangling. It is now a committed generator script at `internal/anime/identity/testdata/gen-parity-fixture.sh` that stamps a constant provenance string; two consecutive runs produce byte-identical output. Closing commit `139dd7e` (parent-applied, not delegated): the guard now bounds the USABLE REQUESTED NEXT at 2^53 - 1 and the pending-count machinery was deleted, because only a collision at the requested next can lift the winner; integer progress is admitted to 2^53 - 2 so progress + 1 stays inside. Boundary rows pin both two-file counterexamples and the longer-list later-collision cases. New `diagnosticfacts_test.go` pins the five diagnostic facts with the audit's own counterexamples, and new `reasonfacts_test.go` resolves the reason-prose tension by asserting WHICH FACT the reason states, never the wording. Section 7 reconciled: Tags and Changed named with their consumers, size recorded as deliberately absent, Diagnostics documented as an unordered fact set, the parseNs comment corrected, and the Go-specific guard text rewritten for the requested-next bound.

Measured on the committed tree: 412 scored, 376 killed, 36 survived, score 0.91, with all eight targeted mutants dead (five diagnostic gaps, three reason facts). Note the recurring trap: ditto writes its sandbox from the INDEX, so a measurement run before committing silently scores the previous tree. Commit first, measure after.

A further audit of `139dd7e` found one more real IMPORTANT gap: two survivors at `resolve.go:385:6` reported a SUSPENDED watched target as already watched when it has no accepted file. The parent adjudicated it a real gap rather than an interchangeable policy, added the counterexample as a row in `reasonfacts_test.go`, and hand-proved both mutants dead with hash-restored edits. Commit `05cb50c`, measured 412 scored, 378 killed, 34 survived, score 0.92.

The delta verifier for that commit failed with a provider error, so the final delta round was self-verified by the parent: gates all green, parity `dev 16/16` and `supplemental 4/4` (the symbol is `TestParity`, not `TestParityReport`, which belongs to the earlier branch), the boundary expectations reproduced against the prototype by bun (progress 2^53 - 1 abstains; 2^53 - 2, -3, -4 select the earliest), and the single remaining survivor at `resolve.go:385:25` (the watched predicate replaced by true) shown equivalent by argument plus a full-suite pass under the mutation. Contract drift found by the audit and fixed: section 7 no longer claims the timestamp parser distinguishes an empty reading from a corrupt one. The old branch stays as read-only reference until the rebuild passes verification, then it is deleted. Worktree `autoreas-bridge-worktrees/episode-identity`,
      branch `feat/episode-identity` from `dev`, writer task `mv48u9ei-e-0df4` (first attempt `mv48t1id-c-lmrw` stopped the same way). Two work units:
      the pure triage ported from the prototype with frozen-corpus parity tests, and the read-only
      folder observer. Independent of ODD 1. Serves Path B. Forbidden from reading the held-out
      corpus; that stays with the independent verifier.
      Commits `1c8c8ee` (pure triage, 15 files including two byte-identical corpus copies and a
      prototype-generated decisions fixture) and `cdd1a6c` (read-only folder observer, 4 files).
      Parity as measured: development 7/7 actionable positives matched with 9 negatives abstaining,
      and supplemental 4/4, no mismatches. `go.mod` and `go.sum` untouched; every file at or below
      500 lines; working tree clean.
      Blocked for about an hour by the size gate, now understood: new files are capped at 500
      EFFECTIVE lines while revive enforces 400 NON-COMMENT lines, so the binding budget is 400;
      gocognit also applies to test files and the sanctioned fix is to move each `t.Run` body into
      an `assertX(t, tc)` helper; and a second package godoc in a test file fails godoclint. The
      parent diagnosed the exact failing file (`triage_test.go`, 586 effective lines) so the writer
      could split it instead of looping.
## Feature deliverable branch

The user asked for a branch cut from `dev` holding the merged feature, as the deliverable of the
complete feature. Created as `feat/episode-duration-notice` in worktree
`autoreas-bridge-worktrees/episode-duration-notice`, with explicit integration merges so the history
shows each unit arriving:

- `4f15380` merge of `feat/episode-duration` (ODD 1: the constant rule and the ffprobe probe adapter).
- `96baff4` merge of `feat/episode-identity-core` (ODD 2: the identity decision port and adapter, eight commits).
- `9296af3` and `d544e23` carry the feature documentation: `docs/episode-duration-notice.md` and the
  component and ODD diagrams in `docs/episode-duration-notice.html`.

Verified on the integrated tree: `internal/anime/duration`, `internal/anime/duration/probe` and
`internal/anime/identity` all pass, parity is `dev 16/16` and `supplemental 4/4`, `go vet`, the
formatter and the size gate are clean, `go.mod` and `go.sum` are untouched, and the tree is clean.
26 files and 3592 insertions against `dev`, all under `internal/anime/duration/`,
`internal/anime/identity/` and `docs/`.

Still outside the deliverable, uncommitted in the main worktree: the repo-wide coverage-tier policy
(`docs/coverage-tiers.md` plus the `AGENTS.md` section) and the why-log entries. Also note a collision
risk: `docs/episode-duration-notice.md` and `.html` are now tracked in the branch while the main
worktree still holds untracked copies, so checking `dev` out in the main worktree later would refuse
until those copies are removed.

- [ ] **ODD 3 — Coordination.** The Path A and Path B coordinators, the gating and the
      notification decision, with no persistence. Needs ODD 1 and ODD 2.
- [ ] **ODD 4 — Surfaces.** The informational notice and the Today mark. Needs ODD 3's result
      shape.

## Reference evidence from the prototype phase

`tools/episode-triage-poc/` remains the reference for the identity component: deterministic
rules over filenames, Windows creation/modification metadata, folder structure and app progress.
Measured on a frozen finite corpus: 15/15 published selections correct, 13/13 negative cases
abstained, zero safety violations. Finite-corpus evidence, not population accuracy, and it does
not cover duration at all.

## Coverage tiers (user policy, effective forward, not retroactive)

Every NEW feature is assessed against this table before deciding how much coverage it gets:

| Tier | Question | Target | Examples |
|---|---|---|---|
| CORE | If it fails, do we lose money directly? | **100%** | Money calculations, payments, data validation |
| IMPORTANT | If it fails, are users frustrated? | **80%** | UI components, user interactions |
| INFRASTRUCTURE | Is it validated automatically? | **0%** | Types, constants |

Applied to this feature: **CORE (100%)** is the coordination gating that decides whether the user is
notified, the threshold comparison, data validation, and the folder observation that feeds a real
decision. **IMPORTANT (80%)** is the informational notice and the Today mark, meaning UI components
and interactions. **INFRASTRUCTURE (0%)** is Go type definitions, the exported boundary constants
themselves, and plain wiring. The policy applies **from ODD 2 onward**, as the user decided: the in-flight ODD 2 hardening is
re-scoped so infrastructure-only files leave the mutation scope, CORE survivors must be killed or
proven equivalent, and IMPORTANT survivors are covered at the behaviour level with each remaining
one justified. It is written into the repository contract at `AGENTS.md` under
"Testing and mutation" → "Coverage tiers (business impact)", so it applies to every agent working
here. ODD 1 was completed before the policy and keeps its recorded evidence.

## Coverage-tier gate (own work unit)

Landed on branch `feat/coverage-tiers-gate` in worktree `autoreas-bridge-worktrees/coverage-tiers-gate`:

- `65e79bb` — the deterministic gate: `coverage-tiers.yaml` (incremental manifest, default undeclared,
  enforced prefixes seeded with `internal/anime/duration/` and `internal/anime/identity/`),
  `tools/checkcovertiers` (10 files), and the `lefthook.yml` wiring in the pre-commit and
  pre-merge lanes. 11 files, 2016 insertions.
- `aa58df7` — the policy registration: `docs/coverage-tiers.md` and the `AGENTS.md` section plus
  reference. 2 files, 89 insertions.

The tool fails deterministically when a file under an enforced prefix has no tier, when a CORE path
is under 100% statement coverage, when an IMPORTANT path is under 80%, or when an INFRASTRUCTURE path
would enter the mutation scope; it derives the mutation exclude list from the same manifest, computes
per-file coverage from a real Go coverprofile, and fails closed with exit 2 on malformed input.
Independent verification returned FAIL (`mv4e0e45-n-xm6e`): one defect reproduced with a real binary and an exhaustive inventory of related weaknesses. Reproduced: a malformed coverage coordinate (`sample/core.go:NOT_A_RANGE 1 1`) was ACCEPTED and the tool exited 0 reporting CORE at 100%. Also confirmed by source: glob infrastructure entries are falsely reported as mutation exposure because exclusions keep the literal pattern while validation matches prefixes; an empty staged scope silently becomes the whole enforced scope; a manifest-only staged change evaluates nothing; interior path traversal such as `sample/../../outside` is admitted; and several fail-closed gaps (early success before reading the profile, regex failures becoming `false`, unsupported glob syntax silently literal, `**/` not matching immediate children, non-strict YAML). State preservation PASSED. Corrective pass landed as `082632c` and `b3d1960`: the malformed coordinate now exits 2 naming the offending line; mutation exclusions are a resolved file list derived from effective resolution so a glob no longer causes false exposure and cannot swallow a specifically declared CORE file; nothing staged now checks nothing while whole-tree mode is explicit; a manifest-only staged change re-evaluates the declared scope; traversal and drive-qualified paths are rejected; the fail-closed gaps (explicit profile on empty scope, regex failure, bracket syntax, double-star-slash, strict YAML) are closed; specificity ranks exact over prefix over glob; duplicates are rejected and deduplicated; staged names are read NUL-separated; a prefix matching no files warns; overflow arithmetic fails closed. `docs/coverage-tiers.md` was updated so the promises match the implementation, with no promise softened. Re-verification running as `mv4epbh9-p-53gx`; the gate is NOT mergeable until it passes.

Incident fixed before landing: a test of this tool wrote a bogus `core.worktree` into the SHARED
repository config pointing at a deleted temp directory, which broke every git command repo-wide. The
parent repaired `.git/config` directly (backup at `/tmp/gitconfig-backup-before-repair`), removed a ghost
index entry with `git rm --cached`, and verified that the suite now leaves the config byte-identical.
The writer then isolated its test git environment and added a regression guard.

Merge caution: the main worktree still holds untracked duplicates of `docs/coverage-tiers.md` and a
modified `AGENTS.md`, so the eventual merge into `dev` must run from a separate worktree to avoid an
untracked-file collision.

## Constraints

- Feature branch off `dev`; never commit directly to `main`.
- One work-unit commit per unit, Conventional Commit message, tests and documentation alongside
  the behaviour, and the repository gate runs normally.
- Files stay within the repository size policy; no baseline may be widened to absorb new debt.
- Frozen prototype references, manifests and captures are never edited to make a production
  result look better.
- No production integration, database or media mutation, staging, commit or push without explicit
  authorization.

## Evidence and progress

- 2026-10-12 — 3.1 U3 delivered: the notice is wired and live. `newEpisodeDurationNotice` in
  `internal/desktop` builds the coordination from the pipeline's own extension set and ffprobe from
  PATH, and `ServiceDeps.EpisodeDurationNotice` receives it, so a landed episode whose runtime really
  is long now produces one notice. Acceptance for the path is driven from `completeDownloadedEpisode`
  over the real inventory and the real coordinator: cases 1, 2, 3, 6, 7 and 8, with the folder listing
  compared before and after to prove the feature reads and speaks but writes nothing. The strongest
  case generates a real thirty-one minute video with ffmpeg, measures it with the real ffprobe and
  asserts exactly one notice — the one gap no earlier unit could close, since every previous long
  reading was a number handed to a fake.
- **Debt recorded for ODD 4**: `docs/notification-cta-policy.md` says a new producer gives its
  notification an L1 action, and the notice currently carries none. Adding one needs an intent
  registered on the frontend, which is surface work; ODD 4 also owns the final wording and Table A's
  new row for this kind.

- 2026-10-12 — 3.1 U2 delivered: `internal/anime/notice` (Coordinator A) and the consumer-declared
  seam in `internal/download`. The gate order is part of the decision and is asserted: a type that
  cannot qualify stops the work before any file is read, while an ordinary runtime is only known after
  measuring. When the newest file cannot be trusted the coordinator stays SILENT rather than falling
  back to the next newest, which would measure a different episode and announce the wrong one. A
  failing notifier is discarded, never propagated to the run. The seam is declared and called in the
  same unit, so no field enters `ServiceDeps` without a consumer.
  - Mutation found five survivors. Four were test gaps: the constant `TVKind` was used as its own
    expectation in the tests, a tie between two identical timestamps was untested, and the largest
    representable reading was untested. The fifth was a real defect: `newestNs <= 0` rejected a file
    dated before 1970, re-introducing the invented negative-timestamp rejection already corrected once
    in ODD 2. It is now a `found` boolean, and the table pins the epoch, a pre-epoch reading and the
    largest representable reading as valid readings.

- 2026-10-11 — design agreed with the user: two entry paths, no persistence, fixed threshold
  constant of 20–30 min, notice above 30. Architecture moved from this
  folder to `docs/episode-duration-notice.md`, with the diagram in
  `docs/episode-duration-notice.html`. No code written.
- Recovered decisions that had been lost from memory (never saved): the constant band, and the
  rule that the algorithm must not query MyAnimeList. Both are now recorded.
- 2026-10-11 — delegation incident: both first attempts stopped before writing anything because I injected a global path for the `lean-tests` skill, which is project-local. Correct path is `<worktree>/.agents/skills/lean-tests/SKILL.md`. No repository changes were made by either attempt; both were relaunched with the corrected path. Lesson: verify every injected skill path exists before delegating.
- 2026-10-11 — environment precondition discovered by the ODD 2 writer: a fresh worktree cannot pass the commit gate for ANY Go change because `main.go` embeds `frontend/dist`, which is ignored and absent after `git worktree add`. The parent ran the repository-documented setup in both worktrees (`bun --cwd="frontend" install --frozen-lockfile`), which created the ignored `frontend/dist/.keep` and the local bindings, left `frontend/bun.lock` byte-unchanged, and made `go build ./...` pass. Environment setup therefore belongs in the delegation preconditions, not in a writer's scope.
- 2026-10-12 — 3.1 U1 delivered: `internal/anime/media`, 350 lines with its tests. Read-only, one
  level, injected extension set, real Windows creation and modification times, a file reported when
  it cannot be described or changed while being listed, and an absent or unlistable folder returning
  an error rather than an empty list. It classifies nothing. The real-creation-time test asserts an
  mtime set to a fixed past date is not what the creation time reports, so substituting one for the
  other fails.
  - Mutation found two real survivors, both `continue → break`: with `break`, one file that cannot be
    described silently drops every candidate after it. Killed by putting a directory that sorts before
    the candidates in the ordering test, and by making the stat-failure branch reachable through an
    injected stat instead of a permission the machine happens to grant. Each mutant was also applied by
    hand and observed to fail the suite before the fix was trusted.
- 2026-10-11 — execution plan confirmed by the user: ODD 1 and ODD 2 run in parallel in isolated
  worktrees, both cut from `dev`; each closes with its own work-unit commits and an independent
  verification; both merge before ODD 3 starts; ODD 4 follows ODD 3. The user explicitly
  authorized the work-unit commits and the merges. Reference material is untracked in the main
  worktree, so writers read the design and the prototype by absolute path.

## ODD 3 — coordination, delivered as two units

Agreed with the user on 2026-10-12. The scope record with the reasons, the evidence and the rejected
options is `docs/episode-duration-notice-scope.md`; the diagram form is
`docs/episode-duration-notice-odd3.html`. Do not re-derive any of it from this file.

| Unit | Trigger | Delivers |
|---|---|---|
| **3.1 Downloads** | a download completes | `MediaInventory`, the type gate, the finding, Coordinator A and the notice |
| **3.2 Today** | Today opens | Coordinator B, the confidence gate, the read contract, the type in Today's data |

Shared pieces ship in 3.1 so the dependency runs one way. 3.1 is **three** work units, each closing with
its own work-unit commit and its test first. It is not five: the finding is a handful of lines, the
wiring is not a behaviour on its own, and the acceptance cases are the proof of the coordination, not a
separate deliverable.

- [x] U1 — `MediaInventory` at `internal/anime/media/`: one-level listing, the injected extension set,
  Windows creation and modification times, a per-file failure, and an absent or unreadable folder
  reported instead of zeros. KISS: built for this case only, and it classifies nothing.
- [x] U2 — the coordination decision: the finding (one duration reading to LONG / normal / unavailable,
  consuming `duration.Classify`), the narrow port declared in `internal/download`, Coordinator A, and
  the type gate (`Kind == 0`). Provable with fakes. The finding needed no type of its own:
  `duration.Kind` already is that mapping, and a second enum would have had no consumer.
- [x] U3 — the delivery: composition-root wiring, the notice body, and the Path A acceptance cases
  (1, 2, 3, and the shared 6, 7, 8). This is where the notice actually appears.

**3.2 is two work units**, fewer because it reuses the adapter, the finding and the type gate:

- [ ] U4 — Coordinator B: the Today decision (inventory, identity, the confidence gate, the type gate,
  the probe and the finding), producing a mark value, with a probe bound of 4 (`min(4, N)`). Provable
  with fakes. The type comes from `MobileAnime.Kind`, which `ListEpisodeSchedule` already reads, so no
  contract change is needed for it.
- [ ] U5 — the delivery: the mark in the schedule read model and in the contract (one field, whose named
  consumer is the ODD 4 surface), the mapping, the contract tests, the regenerated bindings, and the
  acceptance cases 4, 5 and the shared 6, 7, 8.

## Open decisions

- ODD 3 scope questions are closed and recorded in `docs/episode-duration-notice-scope.md`.
- For 3.2: how many probes run in parallel (a number; propose 4), and how the anime type reaches
  Today's data — `contracts.EpisodeScheduleItem` does not carry it today.
- Still open from the design: the exact notice wording and placement, and whether the fixed-constant
  threshold deserves an ADR.
