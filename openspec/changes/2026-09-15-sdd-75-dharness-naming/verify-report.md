# Verify Report: SDD-75 dharness Naming

**Verified on**: 2026-09-15
**Scope**: Existing staged dharness naming change and its restored OpenSpec
artifacts.

### Verdict

**PASS WITH WARNINGS**

The focused evidence supports the staged naming change. This is not a green
full-gate claim: the full `lefthook run pre-commit` must be run again after the
parent sets the local active-change selector to this restored change.

## Recorded evidence

| Check | Observed result |
|---|---|
| Focused Go repository-policy test | Passed; the policy test accepts the `frontend-mutation` command using `vitest.mutation.mts`. |
| Live old-name scan | Clear of live references; remaining mentions are intentional historical/rename context, including the canonical specification. |
| `ditto staged --dry` for Go production scope | No Go production lines in scope. |
| Policy-test hand mutation | Killed; removing or changing the guarded hook wiring made the focused policy test fail. |
| Narrow Stryker run | 10/10 mutants killed using the renamed `vitest.mutation.mts` configuration. |
| `lefthook run pre-commit` execution 1 | Every non-SDD job passed; `sdd-gate` alone was blocked because the selected change artifacts were absent. |
| `lefthook run pre-commit` execution 2 | Every non-SDD job passed; `sdd-gate` alone was blocked by active-change selector/artifact resolution. |
| `lefthook run pre-commit` execution 3 | Every non-SDD job passed; `sdd-gate` alone was blocked by active-change selector/artifact resolution. |

## Staged-change consistency

The staged diff consistently replaces the live mutation-suite filename with
`vitest.mutation.mts` in Stryker, lefthook, Fallow, the Go policy test, the
canonical mutation-gate specification, and the related operational
documentation. The Vitest config removes only the retired
`.dlinter-mutation-tmp` exclusion.

## Remaining verification

Set the gitignored local selector to
`2026-09-15-sdd-75-dharness-naming`, then run the full `lefthook run
pre-commit`. A passing result is required before claiming a green full gate.
