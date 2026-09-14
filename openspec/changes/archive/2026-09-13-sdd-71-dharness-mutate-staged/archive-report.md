# Archive Report: 2026-09-13-sdd-71-dharness-mutate-staged

**Archived**: 2026-09-13
**Change**: Frontend staged mutation via upstream `dharness mutate --staged`
**Status**: Complete and verified (PASS WITH WARNINGS)
**Mode**: hybrid (OpenSpec authoritative, Engram mirror)
**Implementation commit**: `368a69d` on `feat/dharness-mutate-staged`

## Summary

The hand-rolled `frontend/scripts/dlinter-mutation-staged.mjs` resolved `--show-toplevel` to `frontend/` in a
linked worktree and silently mutated nothing. It is deleted. The repo-owned `lefthook.yml` job
`frontend-mutation` now runs `dharness mutate --staged` from dharness `v1.8.0`, built for this change,
released (https://github.com/Disble/dharness/releases/tag/v1.8.0) and installed with `go install`. The
gate blocks on any in-scope Survived or NoCoverage mutant and has no score.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| frontend-staged-mutation-gate | Created | New capability at `openspec/specs/frontend-staged-mutation-gate/spec.md`: zero-tolerance verdict, reasoned disable honored, scope is the added lines of staged `src/` TS/TSX (tooling and root config out of scope), absent tests never rescue, type-only scoping, fast exit, cross-environment correctness, tooling continuity, observable wall time |

No existing spec mentioned the retired runner, so nothing else changed.

## P8 delivery facts

| Fact | Evidence |
|---|---|
| Migration commit through the FULL gate | `368a69d`, `summary: (done in 127.65 seconds)`, every job green; `frontend-mutation` printed `nothing staged to mutate` (0.11 s) on a commit that edits root config files |
| Committed bytes equal the smoke-tested bytes | `git diff --quiet 7e034fd HEAD -- . ':!openspec'` passed (B2 = `7e034fd`; B1 was superseded by P7b) |
| End-to-end gate time (verify warning 3) | Go + frontend commit, full gate 127.65 s; frontend-heavy lane 127.59 s, under the 300 s trip |

## Final state vs. the snapshot artifacts

- `verify-report.md` warning 3 had estimated the tracked-layout gate at 240–255 s. The migration commit measured
  127.65 s for the whole gate, but its mutation job exited fast (`nothing staged to mutate`). A commit that really
  mutates adds the ~92 s measured in 7b.7 (S3) to the lane, which is still under the 300 s trip.
- P7b in `tasks.md` is the gate-found correction: the `gocognit` refactor of the policy test, plus exact
  `--exclude-prefix` names for `scripts/` and the four root config files. It was re-proved by 10/10 hand-mutations
  and a re-smoke on B2.
- Learning-log lesson appended at archive: seed acceptance fixtures at the scope boundary, not only inside it.

## Open follow-ups (not blocking)

- A new root-level JS/TS file enters scope until it is named in `lefthook.yml`. It fails loudly with "No tests were
  found", never silently.
- dharness could derive `--staged` scope from the mutation suite's `include`. Nothing was filed.
- The published mirror of dharness's Markdown docs needs updating (PR #52).
- Pre-existing drift left as found: `docs/pre-commit-performance.md` is cited but absent, and
  `vitest.dlinter-mutation.mts` still excludes the dead `.dlinter-mutation-tmp` path.

## Traceability

**Archived to**: `openspec/changes/archive/2026-09-13-sdd-71-dharness-mutate-staged/`
**Engram topic key**: `sdd/sdd-71-dharness-mutate-staged/archive-report`
**Upstream**: dharness PR #52 (feature, rebase-merged), Release PR #53, tag `v1.8.0`
