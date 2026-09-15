# Tasks: SDD-75 dharness Naming

- [x] Record the already-staged rename from `vitest.dlinter-mutation.mts` to
  `vitest.mutation.mts` and its hook, Stryker, Fallow, policy-test, spec, and
  documentation references.
- [x] Restore the required OpenSpec artifact set and a delta spec for
  `frontend-staged-mutation-gate`.
- [x] Record the focused verification evidence and the three prior pre-commit
  outcomes without claiming a green full gate.

## Remaining verification

After the parent sets `.atl/active-sdd-change` locally to
`2026-09-15-sdd-75-dharness-naming`, run the full `lefthook run pre-commit`.
It must be reported separately; it has not been completed by this artifact
restoration.
