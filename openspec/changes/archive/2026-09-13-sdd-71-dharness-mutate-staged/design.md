# Design: SDD-71 Frontend Staged Mutation via `dharness mutate --staged`

## Technical Approach

Swap the job for `dharness mutate --staged`, delete the script, rename the config, pin the wiring in Go. Drift: the job sits in `frontend-heavy`, not `quick` (Engram 9470); `docs/pre-commit-performance.md` (CLAUDE.md note 18) is missing.

## Architecture Decisions

| # | Choice | Evidence; rejected |
|---|---|---|
| AD1 | Repo-owned `lefthook.yml`, `frontend-heavy`, after `frontend-test`: `frontend-mutation` | Sync owns `.dharness/lefthook.yml`. Siblings are `frontend-*`. The old name, unused by dharness, names a deleted script. |
| AD2 | `dharness mutate --staged --exclude-prefix src/test/ --concurrency 4`, `root: frontend`; amended at P7b to add `--exclude-prefix` for `scripts/`, `eslint.config.js`, `vite.config.ts`, `vite.layout.config.ts`, `vitest.dlinter-mutation.mts` | Matches gate pins and the retiring `concurrency: 4`; literal follows AT15. The amendment restores the retired script's `src/`-only scope after the first gate run of the migration commit failed on root config files (P7b). Exact names, not a broad `vite` prefix, so no future path is hidden by accident. |
| AD3 | `git mv frontend/stryker.dlinter.json frontend/stryker.config.json`; drop `thresholds`, `concurrency`, `tempDirName` | Default name (`config-file-formats.js:19-22`, `detect.go:237`). dharness passes these flags (`tool.go:286-297`); `break` would override its verdict (Engram 9459). |
| AD4 | `npm pkg delete scripts.test:mutation:staged`; `npm pkg set "scripts.test:mutation=stryker run --concurrency 4"` | Unset, Stryker starts 19 runners here (`concurrency-token-provider.js:46-49`). Bare `stryker run` rejected. |
| AD5 | Keep `vitest.dlinter-mutation.mts`; fix only its false "break threshold of 80" comment (:27-28) | Proposal:14; no rename. |
| AD6 | Delete `frontend/.gitignore:2-3`, `vite.config.ts:82`; retarget `eslint.config.js:50` to `.stryker-*` | Only removed files wrote `.dlinter-mutation-tmp` (grep); manual runs use `.stryker-tmp` (`.gitignore:13`); dharness's sandbox self-ignores (`evidence.go:83-95`). |
| AD7 | Equivalent deps-array mutants: `// Stryker disable ArrayDeclaration: <reason>` … `// Stryker restore ArrayDeclaration` | `next-line` stays Survived; the range gives Ignored plus `statusReason` (Engram 9482). Omitting restore disables it file-wide. |

### Concurrency rule (AT15, pre-registered)

Stryker runs BELOW_NORMAL (`exec_windows.go:125`); CPU percentage cannot show harm.

- **T**: a warm full-gate commit takes > 300 s (AGENTS.md:71 timeout). ~90 s is reported only: N cannot shorten `vitest list`.
- **S**: a 2-second `node -e 0` canary's median is > 3× idle during the job (starvation, per `lefthook.yml:9-11`).

Sequential shapes: A = AT1 (twice, first discarded); B = A + Go edit. No trip: 4. Trip: rerun at 2 and keep it if it clears. **Kill:** still tripped: no commit, blocked.

## File Changes

| File | Action |
|---|---|
| `lefthook.yml:291-294` (job), `:67` (comment) | Modify |
| `frontend/`: AD3, AD5, `package.json`, `.gitignore`, `vite.config.ts`, `eslint.config.js`, `.fallowrc.json:17,46`; `scripts/dlinter-mutation-staged.mjs` | Modify, rename, delete |
| `tools/checkgofilesize/`: `repository_policy_test.go`, `main_test.go:20` (`Root`), `merge_gate_test.go:52` | Modify |
| `CLAUDE.md:30`, `AGENTS.md:48,75`, `docs/fallow-usage.md:21`, `docs/mutation-testing.md:77-83,264-269` (+"Retired 2026-09-13"), `README.md:502-503`, `docs/adr/015-frontend-architecture-rails.md:67`, `.claude/skills/keyboard-shortcuts/SKILL.md:171` (AD7), `postmortem-silent-no-ops.md` §7, `log-lesson.mjs` | Modify |
| `AGENTS.md:71`, CLAUDE.md note 18 | If AT15 warm wall > 120 s |

## Interfaces / Contracts

`TestRepositoryHookRunsStagedMutationAfterFrontendTests` literals: `frontend-mutation` in `frontend-heavy` after `frontend-test`, AD2 run line, root `frontend`; no `test:mutation:staged`; exactly one `pre-commit` run containing `dharness mutate`; none in `pre-merge-commit`.

## Testing Strategy

| Layer | Approach |
|---|---|
| RED | Fails on the current tree. |
| MUTATE | `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./tools/checkgofilesize/" --dry` shows zero production lines. Hand-mutate the staged GREEN `lefthook.yml` with `perl -0pi -e`: 4→2, no root, before `frontend-test`, old name, no `--staged`, copied to `pre-merge-commit`, old job kept. Each: `git diff --quiet -- lefthook.yml && echo "!! DID NOT APPLY"`, test fails, `git checkout -- lefthook.yml`. |
| Config | `bun --cwd="frontend" run test:mutation --mutate "<download-runtime-source.helpers.ts>:36-58" --reporters clear-text,json` loads `stryker.config.json`, uses `vitest.dlinter-mutation.mts`, writes that range's report. Never full-tree (M10a). |
| Acceptance | AT1-17 and AT-main, sequential, concurrency ≤ 4. AT9b passes, names the file, starts no Stryker. |

## Threat Matrix

| Boundary | Applicability | RED |
|---|---|---|
| Documentation-like paths | Applicable: non-production skips Stryker | AT8a `frontend/eslint/README.md`, AT8b Go edit ("Docs-only or Go-only commit skips mutation"); AT8c "Code under the excluded test-setup prefix skips mutation"; AT9b |
| Git repository selection | Applicable: worktree `GIT_DIR` vs `.git`, cwd `frontend` | AT1 plus AT-main ("Linked worktree is measured, not skipped") |
| Commit state | Applicable: index, temporary index, empty | AT4, AT5, AT7, AT11; AT7b "An all-tracked commit measures every tracked modification"; AT8d "An empty commit skips mutation" |
| Push state | N/A: no push | — |
| PR commands | N/A: no PR | — |

## Migration / Rollout

    G1 ─▶ G2 ATs ─▶ apply ─▶ G3 install tag ─▶ smoke ─▶ verify ─▶ full-gate commit

- **Throwaway** (session worktree, tracked tree clean): `git switch -c sdd71/at-scratch feat/dharness-mutate-staged`. Commit B0 with `LEFTHOOK_EXCLUDE=quick,go-heavy,frontend-heavy,dharness`: AD3-AD4, the tracked job on the pre-release path, and `frontend/src/shared/helpers/sdd71-at.helpers.ts` plus its test. Then add untracked `lefthook-local.yml`.
- **Fixtures**: helper pair unless noted. AT4: killing edit to the tracked test, left unstaged. AT5: new killing test file, never added. AT16: a second helper. AT17: AT2's report seeded. AT6: `download-runtime-source.helpers.ts:36-58`. AT13: AT6 with `wailsjs` renamed aside. AT9b: a `*.types.ts`. AT15: no `lefthook-local.yml`.
- **Reset** (throwaway only): `git reset --hard <B0>`, `git clean -f -- frontend/src/shared/helpers`, restore `wailsjs`, check `git status --porcelain --ignored -- frontend`. Untracked `openspec/changes/sdd-71-*` must survive: no other `clean`, `add -A` or `--no-verify`.
- **AT-main** (orchestrator's only exit from worktree isolation): `git clone -c core.longpaths=true --branch sdd71/at-scratch <worktree> <scratchpad>\sdd71-main`, never the owner's checkout. Add placeholder `frontend/dist/index.html`; `bun install --frozen-lockfile` (generates `wailsjs`); `lefthook install`; copy `lefthook-local.yml`; commit AT1's fixture. Predicted: AT1's survivor blocks. Delete the clone, then `git switch feat/dharness-mutate-staged`; `git branch -D sdd71/at-scratch`.
- **G3** precedes the commit: `checksdd` rejects unchecked tasks (`main.go:119-127`). Once `go version -m` shows the tag, commit the migration on `sdd71/smoke` as B1. Run AT1-3 and AT8a through the tracked job with `LEFTHOOK_EXCLUDE=quick,go-heavy,dharness,frontend-typecheck,frontend-test,frontend-render-smoke,frontend-layout-smoke`. Each must show `(skip) <name>` in lefthook's summary, else run the full lane. On the feature branch: `git restore --source=<B1> --staged --worktree -- . ':!openspec'`. After committing: `git diff --quiet <B1> HEAD -- . ':!openspec'`; delete `sdd71/smoke`.
- **Rollback**: `git revert --no-commit <sha>`; `git checkout HEAD -- docs/learning-log.md`; commit.

## Open Questions

None.
