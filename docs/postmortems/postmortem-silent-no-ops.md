# Postmortem: the Go mutation check that checked nothing

**Date:** 2026-08-10
**Repo:** `autoreas-bridge` (Wails desktop app; Go backend)
**Scope:** the Go mutation-testing workflow only — the tooling, not the bug that
happened to be under it
**Audience:** anyone who runs mutation testing, or owns a check that can pass
without executing
**Outcome:** one vacuous test found, one broken tool caught before it shipped,
one measurement retracted, and MUTATE redefined to mean running the wrapper.

While fixing an ordinary bug, the mutation step around it failed **three times**,
in three different ways, and never once said so. Each failure printed the
vocabulary of success.

The bug being fixed is irrelevant here beyond one fact: it produced new guards,
and this repo's cycle is RED → GREEN → **MUTATE** → REFACTOR. Everything below is
about that third step.

---

## 1. No-op 1 — the mutations that never applied

The MUTATE step at the time was manual: delete the guard a test claims to cover,
run only that test, confirm it fails, restore. Four guards, scripted:

```sh
sd 'pattern' 'replacement' "$F"     # sd: command not found
```

`sd` is not installed in this environment, despite a global instruction that says
to prefer it. Every substitution failed. The file was never modified. All four
tests then ran against **unmutated code** and printed four reassuring `ok` lines.

The transcript was indistinguishable from a successful mutation check. It was
reported as one.

**The tell:** every mutant dying instantly, and the whole thing finishing
suspiciously fast. The fix is one line, and belongs in every scripted mutation:

```sh
perl -0pi -e 's/old/new/' "$F"
git diff --quiet -- "$F" && echo "!! MUTATION DID NOT APPLY"
```

Assert the mutation **applied** before believing it was **killed**.

## 2. No-op 2 — the test that pinned nothing

With mutations actually applying, all four died. The guards looked covered.

Then the real runner (`go run ./tools/mutationstaged`, driving ooze) was run over
the same change, and reported a surviving mutant on a constant the manual check
had just "verified":

```go
const maxEpisodeListingPages = 100
...
if len(walked) != maxEpisodeListingPages {   // the test
```

The assertion compared against **the production constant itself**. Mutating the
constant to 101 made the walk do 101 pages — and made the test expect 101. Both
sides moved together. The test passed for every possible cap. It pinned nothing.

The hand-check had missed it for a structural reason, not a careless one: it
mutated the **comparison** (`page <= max+1`), because that is where attention
already was. The comparison mutant died honestly. The constant was never
considered, because considering it was the thing being tested.

**A mutant you choose yourself covers only what you already suspected.** Systematic
mutation and hand-mutation are not substitutes: one is broad and indifferent, the
other narrow and informed. The narrow one confirms a suspicion; it does not
survey a change.

Fix — expected values are literals:

```go
const wantCappedPages = 100   // deliberately NOT maxEpisodeListingPages
```

## 3. No-op 3 — the tool built to prevent this, silently doing nothing

ooze mutates **whole files**, so a one-line edit paid for all 89 mutants in the
file, about six minutes. Too slow to be a routine step, which is precisely why
the step had stayed manual — and therefore why no-op 2 was possible.

So a filter was built: a decorator around each of ooze's fourteen mutators that
withholds nodes outside the staged diff's byte ranges. Nine unit tests, all
green. Run against the real change:

```
┃ • Total:        0     ┃
┃ ⨯ Score:    -1.00     ┃
--- FAIL: TestStagedMutation (0.98s)
```

Zero mutants, in under a second. The cause:

```go
if node.Pos() == token.NoPos {   // panics when node is nil
```

`ast.Inspect` calls its visitor with a **nil node after every subtree** — roughly
as often as it passes a real one. Every unit test had constructed a node, so
nothing in the suite reached that path.

Two things nearly let it through.

**It failed, but for the wrong reason.** A zero-mutant run scores `-1.00`, which
trips the 0.80 threshold. The exit code was right and the diagnosis was
unavailable: "score below 0.80" reads as ordinary test-quality debt, not as "the
tool mutated nothing." One exit code covering both states is one diagnosis short.

**The safety net written for exactly this case could not fire.** The harness
counts kept/dropped nodes and fails when it kept none — but `ooze.Release` calls
`t.Fatal` first, so the counter check is unreachable in the very scenario it was
written for. The net was real; its position in the call order made it decorative.

It was found by **A/B against a known baseline**: the same change had produced 89
mutants an hour earlier. 89 → 0 is not an improvement, and only the earlier
number made that legible.

## 4. Why all three look identical

| | Reported | Actually did |
|---|---|---|
| Scripted hand-mutation | 4× `ok` | Tested unmutated code |
| Cap test | pass | Asserted a tautology |
| Line filter | `Total: 0`, 0.98s | Mutated nothing |

Each is **absence rendered as success**. A crash announces itself; a no-op
inherits the vocabulary of the happy path. Worse, all three got *faster* when
they broke — doing nothing is always the quickest implementation — so the one
signal a human notices points the wrong way.

The common structural cause: **every check was validated against its own
output.** The test asserted against the constant it pinned. The mutation script
trusted its own edit. The filter's unit tests built the very nodes the filter
would judge.

Mutation testing is supposed to be the answer to "is this test real?" These three
are that question turned on the mutation step itself, and for a while the answer
was no.

## 5. What changed

1. **Line scoping,** so the wrapper is cheap enough to be the default step.
   `ooze.WithViruses` accepts custom `viruses.Virus` implementations,
   `Incubate(node ast.Node)` hands over the node, and ooze parses each file with a
   fresh single-file `token.FileSet` — so `int(node.Pos()) - 1` is a plain byte
   offset that can be compared against the staged diff's ranges.

   Measured on the same change: **89 mutants / ~6 min → 18 / ~53 s, all 18
   killed.** The 71 that disappear are pre-existing debt in untouched parts of
   the file. The score now describes the change rather than the file it landed
   in.

2. **Three failure modes closed explicitly** in the filter:
   - the nil node is handled, with a regression test that panics without the
     guard;
   - a scope matching nothing fails loudly instead of reporting a clean run;
   - an underivable scope falls **open** to whole-file mutation, never closed.

3. **The flow.** MUTATE on Go now means running
   `go run ./tools/mutationstaged`. Hand-mutation is demoted to what it is
   genuinely good at — one guard, mid-edit, nothing staged, instant answer — and
   is no longer what the repo relies on to be complete, because on this change it
   was not. `AGENTS.md`, `CLAUDE.md` and `docs/mutation-testing.md` all say so,
   along with the `git diff --quiet` check that proves a hand-mutation applied.

## 6. Transferable rules

1. **Assert that a mutation applied before concluding it was killed.** A failed
   edit and a perfectly-covered guard produce identical output.
2. **Never assert against the production symbol you are pinning.** Expected
   values are literals. If both sides of a comparison can move together, the test
   has no opinion.
3. **Self-chosen mutants cover only what you already suspected.** Use a tool for
   the survey; use your hands for the confirmation.
4. **A check must be able to fail for the reason you care about.** "Score below
   threshold" covering both *weak tests* and *tool executed nothing* is one exit
   code short of a diagnosis.
5. **Keep a baseline number.** 89 → 0 was legible only because 89 existed. Any
   tool whose output is a count deserves a known-good count recorded beside it.
6. **Check where your safety net sits in the call order.** A guard placed after a
   `t.Fatal`, or any early exit, is unreachable in exactly the failure it was
   written for.
7. **Suspect the run that got faster.**
8. **A tool reporting a large uniform result — zero, or everything — is not a
   verdict until you have proven the tool ran.** Zero findings and zero execution
   look the same from outside.
9. **Do not trust a tool's own docs about itself over a measurement.** These docs
   asserted the Go side had "no runner" and that whole-file mutation "cannot be
   engineered away here." Both were false, and both were believed long enough to
   shape the workflow around them.

## 7. Related

- [`docs/mutation-testing.md`](../mutation-testing.md) — how mutation testing is run here
- [`docs/learning-log.md`](../learning-log.md) — running log of non-obvious calls
- [`docs/postmortems/postmortem-fallow-barrel-false-positives.md`](postmortem-fallow-barrel-false-positives.md) — a linter's uniform findings were true, not noise
