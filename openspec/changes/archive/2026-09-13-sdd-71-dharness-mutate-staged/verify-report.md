# Verify Report: sdd-71-dharness-mutate-staged

**Verified on**: 2026-09-13
**Mode**: Automatic, OpenSpec artifact store, Strict TDD
**Verifier**: Root orchestrator, run directly (project CLAUDE.md #3)
**Branch**: `feat/dharness-mutate-staged` in worktree `autoreas-bridge-worktrees/dharness-mutate-staged`
**Upstream**: dharness `v1.8.0` (https://github.com/Disble/dharness/releases/tag/v1.8.0), installed with
`go install github.com/Disble/dharness/cmd/dharness@v1.8.0`

### Verdict

**PASS WITH WARNINGS**

The frontend staged mutation gate now runs `dharness mutate --staged` through the repo-owned lefthook job
`frontend-mutation`, and every spec requirement is backed by a real `git commit` observed through the hook.
The warnings are evidence limits and pre-existing drift, not defects in this change.

## What was verified

| Check | Result |
|---|---|
| `go test -count=1 -p 4 ./tools/checkgofilesize/ ./tools/checksdd/` | ok |
| `go vet ./tools/checkgofilesize/` | exit 0 |
| `scripts/lint.ps1 -Profile all` after P7b | `0 issues.` on both profiles |
| `bun --cwd="frontend" run typecheck` | exit 0 |
| `eslint eslint.config.js vite.config.ts vitest.dlinter-mutation.mts` (frontend) | exit 0 |
| Policy test RED on the pre-migration tree, GREEN after (P1/P2); RED again on the P7b literal, GREEN after | recorded in tasks.md 1.2 / 2.8 / 7b.3 / 7b.4 |
| Hand-mutations of `lefthook.yml` against the policy test | 7/7 killed (tasks.md 3.2); 10/10 on the refactored test (7b.5) |
| `test:mutation` on the renamed config, narrow range | exit 0, 11 mutants, 267 tests, report scoped to the file (5.1) |
| Working tree after smoke restore | index == B2 (`7e034fd`), worktree == index (7b.8); B1 superseded |
| `v1.8.0` code vs the pre-release every acceptance test ran on | `git diff --stat 79d7382 v1.8.0` = CHANGELOG.md + release manifest only |

## Spec compliance

| Requirement | Evidence |
|---|---|
| Zero-tolerance verdict, no score | AT1 blocked (3 survived), AT2 passed, AT3 blocked on NoCoverage, AT16 printed survivors of two files; smoke AT1–AT3 on the tracked job with v1.8.0 |
| A reasoned disable is honored | AT14: range `disable`/`restore` → 4 Ignored mutants printed with their reason, commit passed |
| Scope is added lines of staged production TS/TSX | AT7 (`--only`), AT7b (`-a`), AT10 (deletion-only), AT12 (R100 rename bills nothing), AT8c (`src/test/` excluded); tooling and root config out of scope: B2, S1, S2 → `nothing staged to mutate`, S3 still blocked on the `src/` survivor (tasks.md 7b.7); partially staged files: see warning 2 |
| An absent test never rescues a survivor | AT4 (tracked test edit unstaged) and AT5 (untracked test) both blocked |
| Type-only changes are scoped correctly | AT9a (type edit in runtime module → "no mutants were generated in the staged ranges", pass), AT9b (types-only file → named, no Stryker, 3.0 s) |
| Non-applicable changesets exit fast | AT8a docs, AT8b Go, AT8d empty → job skipped (~0.05 s); AT8c → `nothing staged to mutate` in 0.08 s; smoke AT8a |
| Correctness holds across environments | AT-main standalone clone blocked identically to AT1; AT13 missing `wailsjs/` refused loudly; AT17 stale report did not rescue; E1 per-run report path left a sentinel `frontend/reports/` report byte-identical; AT6 related test count 267 equals the working-tree control |
| Tooling continuity and repository enforcement | 5.1 `test:mutation`; policy test pins the job (7/7 hand-mutations); merge-gate exclusion pinned |
| Per-shape wall time is observable | AT15: frontend-only full gate 146.9 s, Go+frontend 163.4 s; tracked mutation job ~92 s; canary 1.41× / 2.54× idle; no 300 s or 3× trip → `--concurrency 4` kept |

## Acceptance tests

Real `git commit`s through lefthook in this linked worktree. Pre-release builds: `ebd8fa0` for the main run,
`79d7382` for the AT18 re-run and E1; `v1.8.0` for the tracked-job smoke.

| AT | Observed | Wall |
|---|---|---|
| AT1 | exit 1; `1 killed, 3 survived`; `sdd71-at.helpers.ts:23 ArithmeticOperator` ×3 | 75.4 s |
| AT2 | pass; `4 killed` | 71.6 s |
| AT3 | exit 1; `4 killed, 6 no coverage`; "the fix is a test that calls it, not a disable directive" | 72.4 s |
| AT4 | exit 1; unstaged tracked test edit ignored | 71.8 s |
| AT5 | exit 1; untracked test ignored | 71.6 s |
| AT6 | pass; "Ran 267 tests"; `1 killed` | 117.5 s |
| AT7 | pass; 1 file measured with a second untested file staged | 72.0 s |
| AT7b | pass; `2 file(s), 2 range(s), 5 killed` | 118.6 s |
| AT8a/b/d | job `(skip) no matching staged files` | ~0.05 s |
| AT8c | `nothing staged to mutate` | 0.15 s |
| AT9a | pass; `0 in-scope` + "no mutants were generated in the staged ranges" | 70.5 s |
| AT9b | pass; `types-only: compiler emitted no runtime code: …types.ts` | 3.0 s |
| AT10 | pass; `nothing staged to mutate` | 0.16 s |
| AT11 | see warning 2 | 71.5 s |
| AT12 | pass; R100 → `nothing staged to mutate` | 0.14 s |
| AT13 | exit 1; "a test file failed to load, so Stryker would silently drop it … vitest exited with code 1" | 59.6 s |
| AT14 | pass; "4 mutant(s) were skipped by Stryker:" with reasons | 71.1 s |
| AT15 | A 146.9 s / canary 1.41×; B 163.4 s / 2.54×; N=4 kept | — |
| AT16 | exit 1; survivors from both files printed | 73.3 s |
| AT17 | exit 1; seeded all-Killed report not read | 72.1 s |
| AT18 | 110 files, 17,599-char range list, no refusal; first run printed a false "Every mutant was caught" (fixed upstream); re-run on 79d7382: "no mutant was tested: every in-scope mutant was skipped by Stryker" | 80.8 / 92.2 s |
| AT-main | standalone clone: exit 1, same three survivors | 143.8 s |
| E1 | report at `…/Temp/dh-report-*/mutation.json`; sentinel sha unchanged; temp dir removed | 85.0 s |
| Smoke (v1.8.0, tracked job) | AT1 exit 1 (3 survived), AT2 pass (18 killed), AT3 exit 1 (6 no coverage), AT8a skipped; every excluded job `(skip) name` | 91.7 / 93.5 / 92.8 / 0.05 s |
| Re-smoke on B2 (v1.8.0, tracked job) | B2 (the refused staged set), S1 `scripts/`, S2 root config → `nothing staged to mutate`; S3 AT1 + `scripts/` line → exit 1, `1 file(s)`, `15 killed, 3 survived` | 0.09 / 0.09 / 0.09 / 91.6 s |

## Upstream work this change depended on

Found and fixed in dharness before release, each measured first: repeated `--mutate` kept only the last
path; stale report read as the verdict; NoCoverage passed with "Every mutant was caught"; Ignored mutants
invisible; index snapshot wrong when Source ≠ Root; untracked non-ignored files could rescue a verdict;
`vitest list` guard for silently dropped test files; `tsc` TS5112 from a tsconfig in the cwd ancestry;
cmd.exe 8191-character cap (scope moved into a generated JSON config); Ctrl-C cleanup race; false "caught"
line when nothing was tested; concurrency false green via a shared report path. CI green on ubuntu,
windows and SonarCloud for PR #52 and Release PR #53.

## Warnings

1. **Verdict rule evidence is thin.** Zero tolerance rests on one H-C counterexample (score 85.7 with a
   killable survivor); the false-red cost (C2) was never measured. The auditable escape is the
   `disable`/`restore` range form, now printed with its reason on every run.
2. **AT11 prediction was wrong, not the gate.** lefthook 2.1.4 hides unstaged changes while pre-commit
   runs (probe: the working tree lacked the unstaged line, `git diff --name-only` empty) and restores them
   afterwards. The verdict judges exactly the committed bytes because the snapshot is index-based; direct
   `dharness mutate --staged` refuses the same state. The spec scenario was amended to the measured shape.
3. **Gate time in the tracked layout is estimated, not yet measured end to end.** AT15 ran the mutation job
   in parallel; the tracked job is piped after `frontend-test` (lane ≈ 15 + 124–140 + 8 + ~92 s ≈ 240–255 s,
   under the 300 s trip). The migration commit's full-gate run is the first end-to-end measurement.
4. **Pre-existing drift left as found:** `docs/pre-commit-performance.md` is cited by CLAUDE.md note 18 but
   does not exist; `frontend/vitest.dlinter-mutation.mts` still excludes the dead `.dlinter-mutation-tmp`
   path (AD5 scoped that file to a comment fix).
5. **Go MUTATE for the policy test is by hand-mutation.** The staged Go change is test-only, so `ditto staged`
   has no production lines; the seven `lefthook.yml` hand-mutations are the evidence.
6. **Out of scope follow-up:** dharness's changed Markdown docs have a published mirror that needs updating
   (noted in PR #52); ditto and upstream Stryker filings were explicitly excluded.
7. **The first migration commit was refused by the gate, correctly.** Two real defects came out of it
   (tasks.md P7b). The first was `gocognit` on the new policy test. The second was a scope hole no AT
   exercised: every AT fixture lived under `src/`, so none staged a root config file or `scripts/`. It was
   fixed with exact `--exclude-prefix` names. The residual risk is a NEW root-level JS/TS file, which would
   enter scope until it is named in `lefthook.yml`, and fails loudly with "No tests were found" rather than
   passing silently. A possible upstream improvement is for dharness to derive scope from the mutation
   suite's `include`; nothing was filed.
