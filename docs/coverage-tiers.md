# Coverage tiers

Every new feature is assessed against this table before deciding how much test coverage it gets.
The governing question is which code can break the business.

| Tier | Question | Target | Examples |
|---|---|---|---|
| CORE | If it fails, do we lose money directly? | 100% | Money calculations, payment processing, data validation |
| IMPORTANT | If it fails, are users frustrated? | 80% | UI components, user interactions |
| INFRASTRUCTURE | Is it validated automatically? | 0% | Types, constants |

## How a tier is decided

- **CORE** is the decision logic and the data validation it depends on. If a wrong answer here
  reaches the user, the feature is broken. CORE gets full coverage, and every mutation survivor in
  CORE is either killed or proven equivalent.
- **IMPORTANT** is what the user or a caller observes: rendered output, messages, reports, the
  state a caller can read back. IMPORTANT targets 80% and is asserted at the level of structure and
  outcome — a list is non-empty, a code or ordinal is exact, an order holds. Prose that nothing
  observes is not worth pinning.
- **INFRASTRUCTURE** is validated automatically: type definitions, exported constants, plain wiring
  and dependency injection. It gets no tests and no mutation chasing, and infrastructure-only files
  stay out of the mutation scope so the denominator reflects real risk instead of code the compiler
  already guarantees.

Coverage is a proxy, not the goal: a passing percentage with a surviving CORE mutant is a failure,
and a mutation run without declared tiers measures the wrong denominator.

## Mutation and resource decisions

A mutation score is read tier by tier, never as a single global number. The question is not "is the
score high enough" but "does this survivor matter for this tier".

**Kill or prove.** A survivor is closed by a test that kills it, or by a proof of equivalence. Both
count as done.

**CORE never skips.** A surviving mutant in CORE code is an open defect until it is killed or proven
equivalent, because CORE is the decision logic and its validation: a wrong answer there reaches the
user.

**IMPORTANT may skip on purpose.** A survivor in IMPORTANT code may be left alive with a recorded
reason when the only observable difference is prose, wording or a diagnostic that nothing in the
product surfaces. Pinning a sentence no one reads is not worth a developer's afternoon, and the
honest move is to say so rather than to write a decorative test.

**INFRASTRUCTURE stays out.** Types, constants and wiring are not mutated for scoring at all.

**Every skip is recorded.** A skip is a decision with a reason, written next to the unit's evidence,
so review can disagree with it. An unrecorded skip is indistinguishable from an oversight, and
chasing a score to hide one is the same defect as deleting a failing test.

**Finishing is a criterion.** The bar exists to protect users, not to consume a budget without end.
When the residual survivors are all skips by the rules above, the unit is done, and its report states
the tally, the tier of each survivor and the reason for every skip.

## Status: guidance, not enforced

This policy is a working guideline, applied by whoever scopes a feature and stated explicitly when a
unit is opened. It is deliberately **not** machine-enforced today.

A previous attempt built a deterministic gate for it — a manifest, a checker tool and a hook job —
and that work was discarded: the checker carried fail-open paths, and one of its tests could exhaust
a developer's machine. A more reliable enforcement process is expected from dharness in a future
release. Until then, do not build a bespoke gate for this policy.

## Exceptions

An exception is a reviewed decision, not a silence. Deviating from a tier target is stated when the
unit is scoped, in the same place the rest of the unit's evidence lives, so the deviation is visible
in review. Skipping a test that a tier calls for is the same defect as deleting a failing test.

## Not retroactive

The policy applies to new features from the moment it lands. Code written before it keeps its
recorded evidence until its own next unit touches it; a unit is not re-opened merely to re-score it.

## References

- `AGENTS.md` — the repository contract that cites this policy under "Testing and mutation".
- `docs/mutation-testing.md` — how mutation evidence is produced.
- `docs/file-size-policy.md` — the sibling rule that limits file size.
