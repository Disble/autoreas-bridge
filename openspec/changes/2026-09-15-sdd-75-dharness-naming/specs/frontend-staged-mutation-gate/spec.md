# Delta Specification: Frontend Staged Mutation Gate

## MODIFIED Requirements

### Requirement: Scope is added lines of staged production TS/TSX

The gate MUST mutate only added lines of staged production `.ts`/`.tsx` files,
excluding tests and `src/test/`. Production means `frontend/src/`: the mutation
suite (`vitest.mutation.mts`, renamed from `vitest.dlinter-mutation.mts` in
SDD-75) runs only `src/**` tests, so JS/TS under `frontend/scripts/` or in a
root config file can never have a related test there and MUST stay out of
scope. Renames bill zero mutants; deletion-only changes pass; a partially
staged file is judged on its staged bytes only through the hook.

#### Scenario: Renamed mutation config remains outside staged scope

- GIVEN the staged change includes `frontend/vitest.mutation.mts`
- WHEN `git commit` runs
- THEN that config file is excluded from staged mutation scope
- AND frontend source files remain eligible for mutation.

### Requirement: Tooling continuity and repository enforcement

`test:mutation` MUST resolve `stryker.config.json` with no config argument and
MUST use `vitest.mutation.mts`. A Go policy test MUST pin the matching
`frontend-mutation` job in `lefthook.yml`. The job MUST NOT run under
`pre-merge-commit`, since a merge has no staged-line scope.

#### Scenario: `test:mutation` resolves the renamed config

- GIVEN `stryker.config.json` names `vitest.mutation.mts`
- WHEN `test:mutation` runs with a narrow `--mutate` range
- THEN Stryker loads that config, uses `vitest.mutation.mts`, and writes a
  report for the range.
