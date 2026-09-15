# Proposal: SDD-75 dharness Naming

## Intent

Restore the SDD artifacts required by `tools/checksdd` for the already-staged
rename from `vitest.dlinter-mutation.mts` to `vitest.mutation.mts`. The staged
source/configuration change is not part of this artifact restoration.

## Scope

### In scope

- Record the staged rename and matching references in the frontend staged
  mutation gate.
- Restore the required proposal, design, tasks, delta specification, and
  verification report under this change directory.

### Out of scope

- Any source, configuration, documentation, hook, or selector change.
- Re-running or claiming a green full pre-commit gate.
- Archiving changes or modifying historical records.

## Capability impact

`frontend-staged-mutation-gate` is modified: its named Vitest mutation config
is `vitest.mutation.mts`. The renamed config continues to run only `src/**`
tests, preserving the existing staged-scope contract.

## Success criteria

- `tools/checksdd` accepts this change when the local active-change selector is
  set to `2026-09-15-sdd-75-dharness-naming`.
- The artifacts accurately distinguish focused evidence from the still-pending
  full pre-commit verification.
