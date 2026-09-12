---
name: lean-tests
description: "Trigger: writing tests, killing a surviving mutant, a slice over its line budget. Keep strict-TDD tests lean: table rows, stdlib, one shared helper per package."
license: Apache-2.0
metadata:
  author: autoreas-bridge
  version: "1.0.0"
  scope: project
---

# Lean Tests

## Activation Contract

Load at three moments under strict TDD: the RED step of any task, the MUTATE step that kills a
survivor, and whenever a slice's `wc -l` passes its changed-line budget. The slice budget already
counts TDD and mutation tests, so test volume never explains an overrun — bloat does.

## Hard Rules

1. Kill a surviving mutant with a new **row** in the table for that behavior.
2. Write two cases sharing a setup→act→assert shape as **one table**, one row per case.
3. Use the stdlib: `slices.Equal`, `slices.Contains`, `slices.Sorted(maps.Keys(m))` in Go;
   `it.each` / `describe.each` in Vitest.
4. Keep **one** helper per package per shared job — open the test DB, seed a row, build the input.
   When a struct literal repeats with only a few fields changing, give it a short constructor; that
   constructor is what makes a table shrink.
5. Add a builder or helper at its third call site.
6. Cut by **mutants killed**: delete a test, re-run scoped `ditto`, keep the deletion only if the
   score holds. Keep every case that kills a mutant nothing else kills, whatever the line count.

## Decision Gates

| About to... | Do this |
|---|---|
| Add a test function for one mutant | Add a row to that behavior's table |
| Copy a test and change its literals | Turn both into rows |
| Write a slice, map or sort helper | Use the stdlib |
| Open a DB or seed data a new way | Reuse the package's helper |
| White-box test a helper whose effect the public function shows | Add a row on the public function |

## Execution Steps

1. RED: write the first case as a one-row table.
2. GREEN and MUTATE: grow that table; each survivor becomes a row.
3. REFACTOR before handoff: walk the diff against the gate table, collapse shapes, merge helpers.
   Lean is a pre-commit discipline — a refactor after the slice lands cannot lower the ledger count.
4. Measure `wc -l` per file, split production from test, and re-run scoped `ditto` once per
   package.
5. Still over budget with no smell left: report the remainder as a planning miss.

## Output Contract

Return production and test `wc -l` per file, the mutation score before and after step 3, and each
surviving mutant with the reason it is equivalent.

## References

- `references/smells.md` — smell → refactor table and the measured slices that set these rules.
- `AGENTS.md` → "Sizing a Change" — budgets and the overrun policy.
- `docs/mutation-testing.md` — the scoped `ditto` command and its cost.
