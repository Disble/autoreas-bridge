# Local validation and mutation auditing

## What runs where

Local commit checks retain formatting, size, architecture, both Go lint profiles,
vet, ordinary tests, TypeScript and the two real-browser smokes. Only automatic
mutation moved out. One guarded staged quality entry invokes dharness's ESLint,
React Doctor and Fallow; there is no second ESLint job or inherited hook command.

Go work and frontend work have separate lanes. Within frontend, quality,
typecheck, tests, render and layout are sequential. Merge uses whole-tree jobs,
no file filters, with typecheck before frontend tests. Limits of four workers
are per process, not a global CPU cap. Sharing YAML commands does not share scope.

## During development

Run `bun --cwd="frontend" run check:staged` for staged quality. It refuses missing
local ESLint or an unloadable/ignored entry config before dharness can skip anything.
Do not hand-edit generated ESLint/Fallow settings. `dharness sync` can reintroduce
hook inheritance; the repository contract forbids that until the gate is reconciled.

Keep RED → GREEN → MUTATE → REFACTOR. Targeted mutation remains
`bun --cwd="frontend" run test:mutation:staged`, wrapping the existing dharness
staged scope and exclusions. Removing the automatic hook does not make MUTATE
optional for applicable behavior changes.

## Periodic audit

`.github/workflows/mutation-audit.yml` schedules an audit at 03:00 UTC daily and
supports manual execution. GitHub can delay schedules. The workflow must exist on
the default branch to enable schedule/dispatch, but always checks out `dev`.
No PR/push/merge trigger or required mutation check is introduced.

The audit uses a separate Stryker MJS config composed from the original configuration.
It mutates all production frontend source, excludes tests/fixtures using the
existing source/test boundary, keeps Vitest and the existing static-mutant policy,
and uses two Stryker workers. The audit's score threshold is 100: survivor or
NoCoverage findings fail the run, to be resolved retrospectively rather than
blocking local commits or merges.

Reports include HTML, raw JSON, status counts, the actual tested commit,
execution outcome and log, retained for 14 days even when an audit fails.
Empty, compile-only, ignored-only, pending or runtime-error reports are not a
successful audit. A separate report-review agent can consume these files;
this workflow creates no issues and has read-only repository permissions.

For a local general audit, run `bun --cwd="frontend" run test:mutation:audit`.
This is intentionally expensive and is not part of Lefthook.

## Verification boundary

Config/contract tests and a successful local gate do not prove a hosted Windows
run. Publish the workflow and matching scripts to the relevant branches under
separate authorization, then manually run it and inspect the real reports before
claiming CI validation is operational. No full-mutation score or timing improvement
is claimed before observing those runs.
