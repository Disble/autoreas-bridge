# Test Smells and Their Refactors

The single source of truth for what over-engineered tests look like in this tree. `AGENTS.md` →
"Sizing a Change" points here.

| Smell | The refactor |
|---|---|
| The same setup→act→assert shape written N times with different literals | One table-driven test, N rows. Each distinct behavior survives as row data |
| A new test function added to kill one surviving mutant | A row in the existing table for that behavior |
| A struct literal typed out many times with only two or three fields varying | A short constructor such as `step(before, after, at, cycle)`. Without it a table saves no lines, which is how a table conversion gets wrongly judged "no reduction" |
| Two helpers doing the same setup (opening the test DB and applying the schema) | One helper per package |
| Several ways to seed the same row in one package | One seeding helper |
| A hand-rolled slice equality, `contains`, or sorted-keys helper | `slices.Equal`, `slices.Contains`, `slices.Sorted(maps.Keys(m))` — this repo targets Go 1.27 |
| A builder taking `Partial<T>` overrides with one or two call sites | Inline the literal. A parameterized builder earns its keep at three |
| A white-box test of an unexported helper whose effect the public function exposes | A row on the public function — but only after measuring. A guard later in the public function can mask the helper's mutant, and then only the white-box test kills it. SDD-69's R2 moved `isFiniteNonNegativeChange`'s "+Inf After" case onto `Derive`, where `int64(math.Floor(+Inf))` overflows and the 5000 ceiling returns `EffectNone` regardless; two mutants survived and the score fell from 0.91 to 0.88 |
| A mocked test asserting a collaborator was called, beside an end-to-end test asserting the real observable of the same wiring | Keep the end-to-end one. Mocked *negative* cases (not-called-when-absent, not-called-on-failure) stay, since an e2e cannot assert them cheaply |
| A flag field whose job is "ignore the next field" | The rows are not one shape; split the table |
| A row field that picks which function the row calls (e.g. an anime filter routing to `AnimePage` instead of `Page`) | Those rows are not one shape; give that case its own test. The branch it adds is also what pushes a table body over `gocognit` |
| Three or four short cases converted to a table that then needs its own row type and `assertX` helper | Keep the short tests with one shared extractor. SDD-69's R2 turned three paging tests (74 lines) into a table costing 89 — the file grew from 199 to 211 |
| A helper taking many positional arguments where the row struct belongs | Name the row type and pass it whole, as `assertX(t, tc)` |
| A table whose `t.Run` body nests loops fails `gocognit` (limit 15, second lint profile only) | Move the body into `assertX(t, tc)`. SDD-69's R1 table scored 18 and blocked its commit; a bare `golangci-lint run` reports clean because it skips that profile |
| A doc comment re-narrating what the row names already say | Delete it |

## Verifying a test refactor

Verify by breaking production, never by reading the diff, and compare the score before and after.

- **A test-only diff cannot use `ditto staged`.** It mutates staged *production* lines only, so a diff
  touching only tests reports "nothing staged is worth mutating" and measures nothing. Commit, then run
  `ditto changed --since <commit before the production landed>` on the clean checkout. That mutates the
  same production against the refactored tests, so the mutant count matches the earlier run exactly.
- **Measure one test's unique contribution without editing a file** by skipping it in the test command:
  `--test-command "go test -count=1 -json -skip TestName ./<pkg>/"`. If the score drops, that test kills
  something nothing else does and it stays. SDD-69's property test looked redundant on reading; skipping
  it dropped the score from 0.91 to 0.88, because it was the only test reaching `After == 0`.
- **One package per run.** A staged scope spanning two packages under one package's test command marks
  every mutant in the other as surviving: it reported 0.63 on a slice whose real scores were 0.90 and 1.00.
  Name the package in the test command and `--exclude-prefix` the others.

## The measured slices that set these rules

**SDD-67 slice 2 — 884 changed lines against a 600 cap.** Four hand-copied instances of one test
shape, `Partial`-override builders for a single call site, and a mocked positive case re-proving
wiring an end-to-end test already proved. The cleanup took test code from 864 to 813 lines with every
mutant still dying, while the ledger count moved only 884 → 881: the metric counts deletions too.

**SDD-69 slice 1 — 1,456 changed lines against a 600 cap; tests 927 against a 330 forecast.** Two
MUTATE survivors were killed with new test functions although the task said "new table row". The
tests also reimplemented `slices.Equal` and sorted map keys by hand, carried two helpers that each
opened the test DB, repeated one 24-line paging test shape three times, and typed the same `Change`
literal about fourteen times. The apply agent then reported that no further cuts existed, because it
tried tables without the constructor that makes them shrink. About 270 test lines were confirmed
removable. Production (458 lines) was not bloated; that slice was also too large and should have been
two, so it ended as both an over-engineering finding and a planning miss.
