# Frontend Staged Mutation Gate Specification

## Purpose

Every frontend commit MUST run a staged-scope mutation check that blocks any
in-scope Survived or NoCoverage mutant, the same way from a linked worktree
and the main checkout. Replaces `dlinter-mutation-staged.mjs`, which silently
skipped every file in a linked worktree.

## Requirements

### Requirement: Zero-tolerance verdict, no score

The gate MUST fail the commit on any in-scope Survived or NoCoverage mutant.
It MUST NOT compute or compare a numeric score.

#### Scenario: Killable survivor blocks

- GIVEN a staged mutant has no killing test
- WHEN `git commit` runs
- THEN it blocks, printing the survivor's location

#### Scenario: Killing test passes

- GIVEN the killing test is staged in the same change
- WHEN `git commit` runs
- THEN it passes

#### Scenario: Untested code blocks as NoCoverage

- GIVEN a staged function has no covering test
- WHEN `git commit` runs
- THEN it blocks, reporting NoCoverage

#### Scenario: Multi-file survivors are all printed

- GIVEN two staged files each contain a survivable mutant
- WHEN `git commit` runs
- THEN it blocks, printing both survivors

### Requirement: A reasoned disable is honored

A staged mutant marked `// Stryker disable next-line <mutator>: <reason>`
MUST NOT block. The gate MUST print it as Ignored with its reason.

#### Scenario: Reasoned disable passes with its reason printed

- GIVEN a staged mutant carries a disable comment with a reason
- WHEN `git commit` runs
- THEN it passes, printing the mutant as Ignored with that reason

### Requirement: Scope is added lines of staged production TS/TSX

The gate MUST mutate only added lines of staged production `.ts`/`.tsx`
files, excluding tests and `src/test/`. Production means `frontend/src/`:
the mutation suite (`vitest.mutation.mts`, renamed from `vitest.dlinter-mutation.mts` in SDD-75) runs only `src/**` tests,
so JS/TS under `frontend/scripts/` or in a root config file can never have a
related test there and MUST stay out of scope. Renames bill zero mutants;
deletion-only changes pass; a partially staged file is judged on its staged
bytes only (through the hook) and refused when the command runs directly.

#### Scenario: Tooling and root config code stays out of scope

Measured 2026-09-13: the first gate run of the migration commit put two edited
root config files in scope and failed with "No tests were found".

- GIVEN the staged change adds code only under `frontend/scripts/` or to a
  frontend root config file
- WHEN `git commit` runs
- THEN it passes with "nothing staged to mutate" and no Stryker run
- AND when a killable survivor in `frontend/src/` is staged alongside such a
  change, the commit is still blocked on that survivor alone

#### Scenario: Rename-only bills nothing

- GIVEN a staged rename has no content change
- WHEN `git commit` runs
- THEN it passes with zero mutants billed

#### Scenario: Deletion-only passes

- GIVEN a staged change only deletes production lines
- WHEN `git commit` runs
- THEN it passes

#### Scenario: A partially staged file is judged on its staged bytes only

Measured 2026-09-13 (AT11): lefthook 2.1.4 hides unstaged changes while
pre-commit runs and restores them afterwards, so through the hook the gate
never sees the unstaged hunk. The mutation run reads the index snapshot, so the
verdict judges exactly the bytes being committed. Invoked directly outside the
hook, `dharness mutate --staged` refuses the same state and names the file.

- GIVEN a tracked production file has both staged and unstaged hunks
- WHEN `git commit` runs through the hook
- THEN the verdict covers only the staged hunks and the commit contains only them
- AND the unstaged hunk is still present in the working tree afterwards

#### Scenario: A scoped commit measures only its file

- GIVEN multiple files are staged
- WHEN the commit runs as `git commit --only <file>`
- THEN only that file's staged lines are mutated

#### Scenario: An all-tracked commit measures every tracked modification

- GIVEN two tracked production files are modified and neither is staged
- WHEN the commit runs as `git commit -a`
- THEN the added lines of both files are mutated

### Requirement: An absent test never rescues a survivor

A survivable mutant MUST still block the commit when its killing test is not
part of the staged change.

#### Scenario: Unstaged test edit does not rescue

- GIVEN a staged mutant would survive
- AND its killing test edit is tracked but unstaged
- WHEN `git commit` runs
- THEN it is still blocked

#### Scenario: Untracked test does not rescue

- GIVEN a staged mutant would survive
- AND its killing test exists on disk, untracked
- WHEN `git commit` runs
- THEN it is still blocked

### Requirement: Type-only changes are scoped correctly

A staged change confined to type annotations in a runtime module MUST pass.
A staged change confined to files that compile to no runtime code MUST pass
without starting a mutation run, and MUST name each such file in the output.
A classifier that cannot run MUST say so and fail closed rather than pass.

Evidence: all 97 `*.types.ts` files under `frontend/src` compile to empty
output and carry zero Stryker mutants, and all 421 other production files
compile to runtime code (Engram 9472, 9473; upstream M11d/M11e).

#### Scenario: Runtime type-only edit passes

- GIVEN the staged change only edits type annotations in a runtime `.ts` file
- WHEN `git commit` runs
- THEN it passes

#### Scenario: A types-only file passes without a mutation run

- GIVEN the staged change is confined to a `*.types.ts` file
- WHEN `git commit` runs
- THEN it passes
- AND the output names that file as having no runtime code
- AND no Stryker run starts

### Requirement: Non-applicable changesets exit fast

The gate MUST NOT start Stryker, a snapshot, or `vitest list` when no staged
production TS/TSX file is in scope.

#### Scenario: Docs-only or Go-only commit skips mutation

- GIVEN all staged files are documentation or `.go` files
- WHEN `git commit` runs
- THEN it passes without any Stryker, snapshot, or `vitest list` step

#### Scenario: Code under the excluded test-setup prefix skips mutation

- GIVEN the only staged production-looking change is a code line in
  `frontend/src/test/setup.ts`
- WHEN `git commit` runs
- THEN it passes without any Stryker, snapshot, or `vitest list` step

#### Scenario: An empty commit skips mutation

- GIVEN nothing is staged
- WHEN the commit runs as `git commit --allow-empty`
- THEN it passes without any Stryker, snapshot, or `vitest list` step

### Requirement: Correctness holds across environments

The gate MUST resolve the repository root and staged scope the same way
from a linked worktree and the main checkout. It MUST fail loudly, not pass
silently, when staged code depends on absent `wailsjs/` bindings. It MUST
NOT reuse a stale on-disk report to pass unevaluated mutants.

#### Scenario: Linked worktree is measured, not skipped

- GIVEN the same staged survivor is committed from a linked worktree and
  from the main checkout
- WHEN each `git commit` runs
- THEN both are blocked identically; neither reports zero mutants

#### Scenario: Missing wailsjs/ blocks loudly

- GIVEN a staged file imports absent `wailsjs/` output
- WHEN `git commit` runs
- THEN it blocks, printing the missing-bindings failure

#### Scenario: A stale all-Killed report is ignored

- GIVEN an on-disk report shows all mutants Killed
- AND the staged change adds a new survivable mutant
- WHEN `git commit` runs
- THEN it is blocked

### Requirement: Tooling continuity and repository enforcement

`test:mutation` MUST keep resolving the renamed `stryker.config.json` with no
config argument. A Go policy test MUST pin the job in `lefthook.yml`.
The job MUST NOT run under `pre-merge-commit`, since a merge has no
staged-line scope.

Verification is scoped on purpose: a full-tree dry run exceeded Stryker's
5-minute timeout on the owner's machine (Engram 9472, M10a), so continuity is
proven by the config loading on a narrow `--mutate` range, not by a full run.

#### Scenario: `test:mutation` resolves the renamed config

- GIVEN `stryker.dlinter.json` is renamed to `stryker.config.json`
- WHEN the `test:mutation` command runs with a narrow `--mutate` range
- THEN Stryker loads that config, uses `vitest.mutation.mts`, and
  writes a report for the range

#### Scenario: Removing the job fails the Go suite

- GIVEN the job is removed from `lefthook.yml`
- WHEN `go test ./tools/checkgofilesize/...` runs
- THEN the policy test fails

#### Scenario: Merges skip the job

- GIVEN a merge commit is created with `git merge`
- WHEN `pre-merge-commit` runs
- THEN the staged mutation job does not execute

### Requirement: Per-shape wall time is observable

The gate's wall time per measured shape MUST be observable against the
repository's ~90-second commit budget.

#### Scenario: Wall time is measured per shape

- GIVEN a staged changeset of a given shape
- WHEN `git commit` runs
- THEN its wall time is observable against the ~90s budget
