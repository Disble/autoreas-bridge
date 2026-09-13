# Tasks: SDD-71 Frontend Staged Mutation via `dharness mutate --staged`

Change: `sdd-71-dharness-mutate-staged`
Inputs: `proposal.md`, `design.md` (AD1–AD7, Testing Strategy, Threat Matrix, Migration/Rollout),
`specs/frontend-staged-mutation-gate/spec.md` (authoritative).

> Written by the orchestrator. The delegated `sdd-tasks` run terminated on a provider rate limit before
> producing an artifact. Its handoff constraints are followed as written.

## Planning Notes

**A. External gates order everything.** `tools/checksdd` rejects a Go-touching commit while any box
below is unchecked (`tools/checksdd/main.go:119-127`) or `verify-report.md` lacks a PASS verdict. So the
single migration commit (P8) is the last implementation step, and archive is a separate phase.

**B. G1 is owned elsewhere.** The dharness session (or, per the agreed fallback, the orchestrator in a
separate dharness worktree) implements WU1–WU9. This change only consumes the build.

**C. Resource rule.** One Stryker process at a time, `--concurrency` ≤ 4, never a full-tree mutation or
full-suite dry run (M10a timed out at 306 s).

**D. Fixture paths** (throwaway branch `sdd71/at-scratch` only): `frontend/src/shared/helpers/sdd71-at.helpers.ts`
+ `frontend/src/shared/helpers/__tests__/sdd71-at.helpers.test.ts`; AT16 adds `sdd71-at-second.helpers.ts`.

## Review Workload Forecast

Measured with `wc -l` on 2026-09-13. Deletions count against the cap.

| Item | Insertions | Deletions |
|---|---|---|
| `frontend/scripts/dlinter-mutation-staged.mjs` (151 lines) | 0 | 151 |
| `stryker.dlinter.json` → `stryker.config.json` (21 lines; drop thresholds/concurrency/tempDirName) | 0 | ~7 |
| `package.json` scripts (`npm pkg`) | 1 | 2 |
| `lefthook.yml` job block + `:67` comment | ~8 | ~5 |
| Go policy test (comparable `TestRepositoryHookKeepsFrontendLintAsTheFileSizeFailurePath` = 23 lines) | ~45 | 0 |
| `merge_gate_test.go:52`, `main_test.go:20` | ~3 | ~3 |
| `vitest.dlinter-mutation.mts` comment, `.gitignore`, `vite.config.ts`, `eslint.config.js`, `.fallowrc.json` | ~6 | ~8 |
| Docs: CLAUDE.md, AGENTS.md ×2, `mutation-testing.md` (77-83, 264-269, retired note), `fallow-usage.md`, README, SKILL.md:171, ADR-015, postmortem, learning-log | ~55 | ~35 |
| **Total** | **~118** | **~211** |

Estimated changed lines: ~330 (range 280–420). 400-line budget risk: Low–Medium. 800-line budget: within.
Chained PRs recommended: No. Decision needed before apply: No. Delivery: single local commit (`auto-chain`
resolves to one unit below budget).

## P0 — G1: dharness pre-release build

- [x] 0.1 Record the dharness branch SHA, the scratch build path (`go build -o <scratch>/dharness.exe ./cmd/dharness`, built outside the dharness tree), and `dharness.exe --version` output. — `feat/mutate-staged` @ `8648599` (PR Disble/dharness#52); built to `<scratchpad>/dharness-prerelease/dharness.exe`; `--version` → `dharness 1.7.7-0.20260913090719-8648599c20f2`.
- [x] 0.2 Confirm the build contains WU1–WU9 by reading its `mutate --help` (`--staged`, `--exclude-prefix`) and the commit list. — help lists `-staged` ("never installs Stryker") and `-exclude-prefix` (repeatable); 11 commits d96043d..8648599 cover WU1–WU9 plus two docs commits.

## P1 — RED: policy test

- [x] 1.1 Add `TestRepositoryHookRunsStagedMutationAfterFrontendTests` to `tools/checkgofilesize/repository_policy_test.go`. Literals: job `frontend-mutation` in group `frontend-heavy` after `frontend-test`, root `frontend`, run `dharness mutate --staged --exclude-prefix src/test/ --concurrency 4`; `test:mutation:staged` absent; exactly one pre-commit run contains `dharness mutate`; no `pre-merge-commit` run does.
- [x] 1.2 `go test -count=1 ./tools/checkgofilesize/` FAILS on the current tree, naming the missing job (record the output).

## P2 — GREEN: tracked changes

- [x] 2.1 `lefthook.yml:291-294`: replace the `dlinter:owned` job with `frontend-mutation` per AD1/AD2; update the `:67` comment.
- [x] 2.2 `git mv frontend/stryker.dlinter.json frontend/stryker.config.json`; remove `thresholds`, `concurrency`, `tempDirName` (AD3).
- [x] 2.3 `npm pkg delete scripts.test:mutation:staged`; `npm pkg set "scripts.test:mutation=stryker run --concurrency 4"` (AD4), run from `frontend/`.
- [x] 2.4 Fix only the false "break threshold of 80" comment in `frontend/vitest.dlinter-mutation.mts:27-28` (AD5).
- [x] 2.5 AD6: delete `frontend/.gitignore:2-3` and `frontend/vite.config.ts:82`; retarget `frontend/eslint.config.js:50` to `.stryker-*`; retarget `frontend/.fallowrc.json:17,46` comments to `stryker.config.json`. Prove each dead entry with a grep before deleting.
- [x] 2.6 Delete `frontend/scripts/dlinter-mutation-staged.mjs`.
- [x] 2.7 `tools/checkgofilesize/merge_gate_test.go:52` comment and `main_test.go:20` follow the new job name.
- [x] 2.8 `go test -count=1 ./tools/checkgofilesize/` PASSES.
- [x] 2.9 Docs: CLAUDE.md note 16 (frontend half); AGENTS.md:48 and :75; `docs/mutation-testing.md:77-83` (threshold reason) and `:264-269` plus a "Retired 2026-09-13" paragraph; `docs/fallow-usage.md:21`; `README.md:502-503`; `docs/adr/015-frontend-architecture-rails.md:67`.
- [x] 2.10 `.claude/skills/keyboard-shortcuts/SKILL.md:171`: teach the disable/restore RANGE form with its restore line (AD7, Engram 9482); remove the "document in prose" advice.
- [x] 2.11 `docs/postmortems/postmortem-silent-no-ops.md` §7: dated bullet naming the retirement.
- [x] 2.12 `node scripts/log-lesson.mjs "<≤300 chars>"`: the worktree no-op class is retired by moving scope derivation upstream; point at SDD-71.
- [x] 2.13 Repository grep for `test:mutation:staged`, `dlinter-mutation-staged`, `stryker.dlinter.json`, scoped to tracked text outside `openspec/changes/archive/`. Only historical mentions remain (list them).

## P3 — MUTATE: the policy test

- [x] 3.1 `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./tools/checkgofilesize/" --dry`: record that zero production lines are in scope.
- [x] 3.2 Hand-mutate the GREEN `lefthook.yml` with `perl -0pi -e`, one at a time: concurrency 4→2; root removed; job moved before `frontend-test`; old name restored; `--staged` removed; job copied into `pre-merge-commit`; old job kept alongside. For each: `git diff --quiet -- lefthook.yml && echo "!! DID NOT APPLY"`, the test FAILS, then `git checkout -- lefthook.yml`. Record 7/7 killed.

## P4 — G2: acceptance tests (throwaway branch, pre-release binary)

Setup per design Migration/Rollout, with one recorded deviation: B0 (`c0a3b81`) keeps the FINAL tracked job (`dharness mutate …`), and every AT runs the identical command through an untracked `lefthook-local.yml` job `at-mutate` pointing at the pre-release binary, with `LEFTHOOK_EXCLUDE=quick,go-heavy,frontend-heavy,dharness`. The tracked job itself is exercised in P6 with the installed release. Pre-release: `dharness 1.7.7-0.20260913110800-ebd8fa0f1b89` (PR #52 @ ebd8fa0). Full per-AT table (prediction / observed / wall): session scratchpad `at-results.md`, reproduced in `verify-report.md`.

- [x] 4.1 AT1 killable survivor → blocked, survivor `file:line` printed ("Killable survivor blocks"). — exit 1; `1 killed, 3 survived`; 3× `sdd71-at.helpers.ts:23 ArithmeticOperator`; 75.4 s.
- [x] 4.2 AT2 + killing test staged → passes ("Killing test passes"). — commit created; `4 killed`; 71.6 s.
- [x] 4.3 AT3 untested exported function beside tested code → blocked as NoCoverage ("Untested code blocks as NoCoverage"). — exit 1; `4 killed, 6 no coverage`, each "the fix is a test that calls it, not a disable directive"; 72.4 s.
- [x] 4.4 AT4 killing edit to the TRACKED test left unstaged → still blocked ("Unstaged test edit does not rescue"). — exit 1, same 3 survivors; 71.8 s.
- [x] 4.5 AT5 new killing test file never added → still blocked ("Untracked test does not rescue"). — exit 1; 71.6 s.
- [x] 4.6 AT6 edit in `download-runtime-source.helpers.ts:36-58` → dry-run test count equals the working-tree related count (267 at 54d59dc, M1b). — "Ran 267 tests"; `1 killed`; passes; 117.5 s.
- [x] 4.7 AT7 `git commit --only <file>` with another file staged → only that file mutated ("A scoped commit measures only its file"). — `Instrumented 1 source file(s)`; untested second helper out of scope; passes; 72.0 s.
- [x] 4.8 AT7b `git commit -a` with two modified tracked files → both mutated ("An all-tracked commit measures every tracked modification"). — `2 file(s), 2 range(s), 5 killed`; 269 tests; 118.6 s.
- [x] 4.9 AT8a docs-only, AT8b Go comment, AT8c code in `src/test/setup.ts`, AT8d `--allow-empty` → pass with no snapshot, `vitest list`, or Stryker. — 8a/8b/8d: lefthook `(skip) no matching staged files` (~0.05 s); 8c: dharness `nothing staged to mutate` in 0.08 s.
- [x] 4.10 AT9a type annotation edit in a runtime module → passes. AT9b a `*.types.ts` alone → passes, file named, no Stryker. — 9a: `0 in-scope mutant(s)` + "no mutants were generated in the staged ranges" (70.5 s); 9b: `types-only: compiler emitted no runtime code: …connected-devices-panel.types.ts` (3.0 s).
- [x] 4.11 AT10 deletion-only → passes. AT11 partial staging → refused, naming the file. AT12 rename-only (`git mv` + import updates) → passes, zero mutants billed from the moved file. — AT10: `nothing staged to mutate`. AT11: prediction WRONG, not a defect: lefthook 2.1.4 hides unstaged hunks during pre-commit (probe: working tree lacked the line, `git diff` empty); commit contained only staged bytes; direct invocation refuses naming the file; spec scenario amended. AT12: R100 → `nothing staged to mutate`.
- [x] 4.12 AT13 AT6 with `frontend/wailsjs` renamed aside → blocked loudly by the vitest-list guard; `wailsjs` restored after. — "a test file failed to load, so Stryker would silently drop it … vitest exited with code 1"; 59.6 s; restored.
- [x] 4.13 AT14 equivalent mutant wrapped in `// Stryker disable <Mutator>: <reason>` … `// Stryker restore <Mutator>` → passes, Ignored + reason printed. — "4 mutant(s) were skipped by Stryker:" each with reason; `2 killed, 4 ignored`; passes (first try blocked on an unwrapped second equivalent mutant — fixture defect).
- [x] 4.14 AT16 two helpers each with a survivor → both printed ("Multi-file survivors are all printed"). AT17 seeded stale all-Killed report + AT1 change → blocked ("A stale all-Killed report is ignored"). — AT16: survivors from both files printed; AT17: exit 1, seeded report replaced (sha changed).
- [x] 4.15 AT18 100+ staged production files (fixture generator in scratchpad) → correct run or a loud refusal, never a truncated scope. — 110 files, 17,599-char range list: no refusal, `110 in-scope … 110 ignored` (static mutants). Output DEFECT found: printed "Every mutant was caught" with 0 tested → fixed upstream before release; re-verified in 6.4.
- [x] 4.16 AT15 concurrency rule (design): shapes A and B, trips T (>300 s full-gate) and S (canary median >3× idle); record N kept. — idle 40.8 ms; A 146.9 s / 57.5 ms (1.41×); B 163.4 s / 103.6 ms (2.54×); no trip → N=4 kept; job-level `LEFTHOOK_EXCLUDE=frontend-mutation` honoured.
- [x] 4.17 AT-main: standalone clone per design (orchestrator's single isolation exit) → AT1 blocked identically ("Linked worktree is measured, not skipped"). — standalone clone: `1 killed, 3 survived`, same three mutants; 143.8 s; clone deleted.
- [x] 4.18 Throwaway cleanup: branch deleted, `git status --porcelain --ignored -- frontend` shows no leftover sandbox, feature HEAD unchanged, untracked `openspec/changes/sdd-71-*` intact. — `sdd71/at-scratch` and `sdd71/smoke` deleted; ignored entries under `frontend/` are only `.fallow/`, `dist/`, `dist-layout/`, `wailsjs/` (no `.stryker-tmp`, no `reports/`); `lefthook-local.yml` removed; feature HEAD still 54d59dc before the migration commit; openspec artifacts intact. `%TEMP%` held 38 `dh-report-*` dirs from the dharness writer's ditto mutation runs (mutants break cleanup by design); measured: `go test ./internal/cli/ ./internal/staged/` leaves 0 new dirs (40 before, 40 after); all 38 had 0 reparse points and were removed; two unrelated `dh-*.html` files from 2026-09-07 left untouched.

## P5 — Config continuity

- [x] 5.1 `bun --cwd="frontend" run test:mutation --mutate "src/infrastructure/download-runtime-source/download-runtime-source.helpers.ts:36-58" --reporters clear-text,json` loads `stryker.config.json`, uses `vitest.dlinter-mutation.mts`, and writes a report holding only that file. — run from `frontend/` as `bun run test:mutation …` → `stryker run --concurrency 4 --mutate … --reporters clear-text,json` (no config argument); exit 0; "Found 1 of 885 file(s) to be mutated"; 11 mutants; "Ran 267 tests" (the `vitest.dlinter-mutation.mts` suite count seen in every earlier run of this file); report `frontend/reports/mutation/mutation.json` holds only that file (11 mutants). Reports removed after.

## P6 — G3: release installed

- [x] 6.1 Record the dharness release tag and its GitHub Release URL. — `v1.8.0`, https://github.com/Disble/dharness/releases/tag/v1.8.0 (published 2026-09-13T13:17:21Z; goreleaser assets for darwin/linux/windows × amd64/arm64 + checksums.txt). Source: PR Disble/dharness#52 (rebase-merged) → Release PR #53 (squash-merged, 95059fc).
- [x] 6.2 `go install github.com/Disble/dharness/cmd/dharness@<tag>`; `go version -m` shows `github.com/Disble/dharness <tag>`. — `mod github.com/Disble/dharness v1.8.0 h1:qzCSbSWASR6gYonaQxJs8DFilMwm4tnI2qwp3Tys668=`; `dharness --version` → `dharness 1.8.0`.
- [x] 6.3 The tracked job runs plain `dharness` (no pre-release path); commit the migration on `sdd71/smoke` as B1. — B1 = `9e00521` (B0 minus the fixture pair); `git diff --stat feat/dharness-mutate-staged sdd71/smoke` = 21 files, 131+/187−; tracked job `frontend-mutation` runs `dharness mutate --staged --exclude-prefix src/test/ --concurrency 4` against the globally installed v1.8.0.
- [x] 6.4 Smoke AT1, AT2, AT3, AT8a through the TRACKED job with `LEFTHOOK_EXCLUDE=quick,go-heavy,dharness,frontend-typecheck,frontend-test,frontend-render-smoke,frontend-layout-smoke`; each excluded job shows `(skip) <name>`, else the full lane runs once. — every listed job printed `(skip) name`; `frontend-heavy ❯ frontend-mutation` ran: AT1 exit 1 (`18 in-scope: 15 killed, 3 survived`, the three `:23 ArithmeticOperator` lines; 91.7 s); AT2 pass (`18 killed`, "Every mutant was caught"; 93.5 s); AT3 exit 1 (`18 killed, 6 no coverage`; 92.8 s); AT8a `frontend-mutation (skip) no matching staged files` (0.05 s). On the 79d7382 pre-release (same code as v1.8.0) AT18 re-run printed "no mutant was tested: every in-scope mutant was skipped by Stryker" and E1 left a sentinel `frontend/reports/mutation/mutation.json` byte-identical while writing to a per-run `dh-report-*` path.
- [x] 6.5 Restore B1's tree onto the feature branch (`git restore --source=<B1> --staged --worktree -- . ':!openspec'`) and delete `sdd71/smoke`. — ran root-anchored (`-- ":(top)"`, since the shell cwd was `frontend/` and `.` would have restored only that subtree); verified `git diff --cached --quiet 9e00521 -- ":(top)"` (index == B1) and `git diff --quiet` (worktree == index); `sdd71/smoke` deleted; B1 object kept for the post-commit identity check.

## P7 — Verification (orchestrator-owned, CLAUDE.md note 3)

- [x] 7.1 `.atl/active-sdd-change` contains `sdd-71-dharness-mutate-staged`. — written; gitignored (`.gitignore:28 .atl/`).
- [x] 7.2 The orchestrator writes `verify-report.md` from P1–P6 evidence with a verdict line. — `### Verdict` → **PASS WITH WARNINGS** (checksdd accepts PASS / PASS WITH WARNINGS).

## P7b — Findings from the first full-gate attempt of the migration commit

The first P8 attempt was refused by the gate, so no commit was created. Both findings were real defects
in this change, fixed and re-proved here before the next attempt.

- [x] 7b.1 Record the refusal. — `golangci-lint`: `gocognit` 25 > 15 on `TestRepositoryHookRunsStagedMutationAfterFrontendTests`. `frontend-mutation`: "Found 2 of 867 file(s) to be mutated", then "No tests were found", then exit 1. The two files were root config files the migration edits.
- [x] 7b.2 Measure the scope defect. — dharness counts every JS/TS file under `frontend/` as source, but `vitest.dlinter-mutation.mts` includes only `src/**` tests and excludes `scripts/**`. Tracked non-`src/` JS/TS today: `scripts/` plus `eslint.config.js`, `vite.config.ts`, `vite.layout.config.ts`, `vitest.dlinter-mutation.mts`. Across 266 frontend commits, 50 touched JS/TS outside `src/`. That count excludes the since-untracked `frontend/wailsjs/`; a first count of 104 included it and was wrong.
- [x] 7b.3 RED: the policy test's `wantRun` literal names the five new `--exclude-prefix` values. — it failed on the old `lefthook.yml` with `frontend-mutation run = "… --exclude-prefix src/test/ --concurrency 4", want "…"`.
- [x] 7b.4 GREEN: update the `lefthook.yml` run line and its comment, and split the test into `loadLefthookConfig`, `groupJobs`, `jobIndex` and `countRunsContaining`. — `go test -count=1 ./tools/checkgofilesize/` ok; `scripts/lint.ps1 -Profile all` reported `0 issues.` for both profiles; `gofmt -l` empty.
- [x] 7b.5 MUTATE: hand-mutate `lefthook.yml`, confirming each edit applied with `cmp`. — 10/10 killed, each by its intended assertion:
  - `scripts/` exclude dropped;
  - broad `vite` prefix;
  - `root: frontend/src`;
  - job moved before `frontend-test`;
  - job renamed;
  - retired job added;
  - second `dharness mutate` job;
  - `dharness mutate` in `pre-merge-commit`;
  - `frontend-test` dropped;
  - group renamed.

  The first "before `frontend-test`" mutant matched the `pre-merge-commit` copy of that job and was killed by the missing-job check, so it was re-run anchored to `pre-commit`. It was then killed by `frontend-mutation index = 1, want after frontend-test index = 2`.
- [x] 7b.6 Update the docs and artifacts. — `AGENTS.md:48`; the retired-runner note in `docs/mutation-testing.md`; spec scope requirement plus scenario "Tooling and root config code stays out of scope"; design AD2; proposal.
- [x] 7b.7 Re-smoke through the TRACKED job with the installed v1.8.0 and the 6.4 `LEFTHOOK_EXCLUDE`, on throwaway `sdd71/smoke2`. Every excluded job printed `(skip) name`.
  - B2 = `7e034fd`, the exact staged set 7b.1 refused: `nothing staged to mutate`, 0.09 s.
  - S1, a function added to `scripts/static-serve.helpers.mjs`: `nothing staged to mutate`, 0.09 s.
  - S2, an export added to `vite.layout.config.ts`: `nothing staged to mutate`, 0.09 s.
  - S3, the AT1 fixture plus a `scripts/` line: exit 1, `1 file(s), 1 range(s), 18 in-scope mutant(s): 15 killed, 3 survived`, the three `sdd71-at.helpers.ts:23 ArithmeticOperator` lines, 91.6 s.
- [x] 7b.8 Restore B2 onto the feature branch and delete `sdd71/smoke2`. — `git restore --source=7e034fd --staged --worktree -- ":(top)"`; `git diff --cached --quiet 7e034fd` gives index == B2, `git diff --quiet` gives worktree == index; the branch was deleted at `acf7716`, since S3 was never committed.

## P8 — Migration commit (delivery, deliberately not checkboxes)

`checksdd` reads this file at commit time and rejects any unchecked box, so the commit cannot be a box here.
After every box above is checked and `verify-report.md` passes: one conventional commit through the FULL gate
(timeout ≥ 300000 ms, never `--no-verify`), then `git diff --quiet <B2> HEAD -- . ':!openspec'` must pass,
proving the committed bytes equal the smoke-tested bytes. B1 (`9e00521`) no longer applies because 7b changed the tree.
Both facts go into the archive report.
