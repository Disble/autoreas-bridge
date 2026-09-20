---
name: lean-tests
description: "Trigger: writing tests, killing a surviving mutant, a slice over its line budget. Keep strict-TDD tests lean: table rows, stdlib, one shared helper per package."
license: Apache-2.0
metadata:
  author: autoreas-bridge
  version: "1.2.0"
  scope: project
---

# Lean Tests

## Activation Contract

Load at the RED step, at the MUTATE step, and when a slice's `wc -l` passes its budget. That budget
already counts TDD and mutation tests, so an overrun means bloat, never "the tests".

## Hard Rules

1. Kill a surviving mutant with a new **row** in that behavior's table.
2. Put cases in **one table** only when they share the same act and assert and the table stays
   smaller than the copies. A case that calls another function, or needs a flag to branch, is its
   own test.
3. Use the stdlib: `slices.Equal`, `slices.Contains`, `slices.Sorted(maps.Keys(m))` in Go;
   `it.each` / `describe.each` in Vitest.
4. Keep **one** helper per package per shared job (open the DB, seed a row, extract IDs). When a
   literal repeats with a few fields changing, add a short constructor — it is what makes a table
   shrink.
5. Add a reuse helper at its third call site. Exception: when a `t.Run` body nests loops, move it
   into `assertX(t, tc)`, since `gocognit` fails functions above 15.
6. Cut by **mutants killed**, measured, never by reading. Keep any case that kills a mutant nothing
   else kills.
7. **Resolve an equivalent mutant; never report it as the end state.** Equivalence is evidence of
   redundant or unobservable code, not of a weak test. In preference order: delete the dead clause;
   or make the difference observable by making the input injectable; or, only when neither is
   possible, report it with a proof. `dharness` offers a `// Stryker disable` for equivalents, and
   that offer loses here: `AGENTS.md` forbids suppressing a survivor. Never add a test for an
   equivalent mutant — it would pass under the mutant too.

## Decision Gates

| About to... | Do this |
|---|---|
| Add a test function for one mutant | Add a row to that behavior's table |
| Copy a test and change only its literals | Turn both into rows |
| Add a field choosing which function a row calls | Give that case its own test |
| Write a slice, map or sort helper | Use the stdlib |
| Seed data a new way | Reuse the package's helper |
| White-box test a helper the public function exposes | Move it to a public-function row, then measure: a later guard can mask the helper |
| A mutant that survives because no input can distinguish it | Delete the dead clause, or make the input injectable. Do not add a test |
| An equivalent mutant, where the guard really is load-bearing and nothing can vary it | Prove the equivalence by exercising it — probe every reachable input — and report the proof. Reading the mutant text is not a proof |

## Execution Steps

1. RED: write the first case plainly.
2. GREEN and MUTATE: when a second case shares its act and assert, table them; each survivor is a row.
3. REFACTOR before handoff: walk the diff against the gate table. A slice's count is final once it
   lands, so lean happens here or not at all.
4. Measure `wc -l` per file, production apart from test, and measure mutation the way
   `references/smells.md` → "Verifying a test refactor" says.
5. Still over budget with no smell left: report the remainder as a planning miss.

## Output Contract

Return per-file `wc -l` split by production and test, the mutation score before and after step 3,
and each surviving mutant with why it is equivalent, and the disposition applied: the clause you
  deleted, the input you made injectable, or the proof that neither was possible.

## References

- `references/smells.md` — smell table, how to measure a test refactor, and the slices that set these rules.
- `AGENTS.md` → "Sizing a Change" — budgets and the overrun policy.
- `docs/mutation-testing.md` — scoped `ditto` and its cost.
