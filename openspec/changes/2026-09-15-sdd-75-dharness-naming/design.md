# Design: SDD-75 dharness Naming

## Technical approach

The staged change renames the frontend mutation-suite config file to
`frontend/vitest.mutation.mts` and updates its consumers:

- `frontend/stryker.config.json` selects the renamed config.
- `lefthook.yml` excludes the renamed config from staged mutation scope.
- `frontend/.fallowrc.json` retains the config as an explicit entry point.
- The Go repository-policy test pins the new hook command.
- The canonical `frontend-staged-mutation-gate` specification and operational
  documentation name the new file.

The config also removes the retired `.dlinter-mutation-tmp` exclusion. No
runtime mutation-gate behavior is otherwise redesigned.

## Artifact design

`tools/checksdd` requires `proposal.md`, `design.md`, `tasks.md`, at least one
nested `spec.md`, and `verify-report.md` with a passing verdict. These files
are intentionally compact because they document an existing staged change and
must not alter it.

## Verification boundary

Focused policy, mutation, and prior hook evidence is recorded in
`verify-report.md`. The required remaining step is a full `lefthook run
pre-commit` after the parent sets the local active-change selector; it is not
represented as completed evidence.
