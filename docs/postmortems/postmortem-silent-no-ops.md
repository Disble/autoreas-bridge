# Postmortem: four silent no-ops in one day

**Date:** 2026-08-10
**Repo:** `autoreas-bridge` (Wails desktop app; Go backend, React/TypeScript frontend)
**Audience:** anyone who owns a check — a test, a linter, a guard, a scheduled job
**Outcome:** one shipped bug fixed, one vacuous test found, one broken tool caught before it shipped, one measurement retracted.

A routine question — *"review the logs of the last scheduled download run"* — turned
into four separate failures in one session. They looked unrelated. They were the
same failure four times: **a thing that reported success while doing nothing.**

None of the four produced an error. That is the point. Every one of them was
*louder in its silence* than a crash would have been, and every one was found by
measurement rather than by reading.

---

## 1. What happened

The scheduled download run at 22:00 reported `status: ok`, three anime checked,
one episode downloaded, zero failures. A clean, green run.

It was wrong. Of the three anime, two had a new episode. The run found one.

Everything downstream of that was an investigation into checks that do not check.

## 2. The four no-ops

### No-op 1 — the run that reported "up to date" without looking

jkanime serves its episode listing through a paginator at **16 entries per page**.
The adapter requested page 1 and took the highest episode number on it:

```go
ajaxURL := fmt.Sprintf("%s/ajax/episodes/%s/1", a.baseURL, animeID)
```

So for any anime past episode 16, the "latest episode online" was **always 16** —
not a scrape failure, not a network error, but the page size wearing the costume
of an answer. `NeedsDownload(16, 16)` is false, so the run logged:

```
anime … up to date: latest online 16 not greater than on disk 16
reason: no_new_episode
```

and moved on. Long-running series had been silently stalling at episode 16, with
a green run every night saying otherwise.

**The tell:** the number 16 appeared in the log as a *result*. It was a
*configuration constant of the remote API*. Any value that shows up in your output
and also happens to be a round page size deserves one direct check.

### No-op 2 — the mutation run that never mutated

Fixing the bug meant new guards, and this repo's cycle is RED → GREEN →
**MUTATE** → REFACTOR: delete the guard, confirm the test fails, restore. Four
mutants were applied with a scripted edit:

```sh
sd 'pattern' 'replacement' file    # sd: command not found
```

`sd` is not installed here. Every substitution failed, the file was never
modified, and all four tests ran against **unmutated code** — printing four
reassuring `ok` lines. The transcript read exactly like a successful mutation
check.

**The tell:** a mutation run in which *every* mutant dies instantly and the whole
thing finishes suspiciously fast. The fix was one line, and it belongs in every
scripted mutation:

```sh
mutate() { perl -0pi -e "$1" "$F"; git diff --quiet -- "$F" && echo "!! MUTATION DID NOT APPLY"; }
```

Assert that the mutation *applied* before trusting that it was *killed*.

### No-op 3 — the test that pinned nothing

With mutations actually applying, all four died. The guards looked covered. Then
the real mutation tool (ooze) was run over the same change and reported a
surviving mutant on a constant the manual check had already "verified":

```go
const maxEpisodeListingPages = 100
...
if len(walked) != maxEpisodeListingPages {   // the test
```

The assertion compared against **the production constant itself**. Mutating the
constant to 101 made the walk do 101 pages — and made the test expect 101. Both
sides moved together. The test passed for any cap and pinned nothing.

The hand-check had missed it for a structural reason worth stating plainly: it
mutated the **comparison** (`page <= max+1`), because that is where attention was.
A self-chosen mutant cannot cover the blind spot that chose it. **You mutate where
you were already looking.**

Fix: expected values are literals.

```go
const wantCappedPages = 100   // deliberately not maxEpisodeListingPages
```

### No-op 4 — the tool built to prevent no-ops, silently doing nothing

ooze mutates **whole files**, so a one-line edit paid for all 89 mutants in the
file (~6 minutes). A filter was built to scope mutation to the staged lines: a
decorator around each mutator that withholds nodes outside the changed byte
ranges.

Nine unit tests, all green. Run against the real change, it produced:

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
nothing reached that path.

Two things nearly let it through:

1. **It failed, but for the wrong reason.** A zero-mutant run scores `-1.00`,
   which trips the threshold. The exit code was correct, the diagnosis was
   unavailable, and "score below 0.80" is indistinguishable from ordinary
   test-quality debt.
2. **The safety net written for exactly this case could not fire.** The harness
   counts kept/dropped nodes and fails when it kept none — but `ooze.Release`
   calls `t.Fatal` first, so the counter check is unreachable in the very
   scenario it was written for. The net was real; the ordering made it decorative.

It was found by **A/B against a known baseline**: the same change had produced 89
mutants an hour earlier. 89 → 0 is not an improvement, and only the earlier
number made that legible.

## 3. Why all four look identical

| | Reported | Actually did |
|---|---|---|
| Scheduled run | `status: ok`, 1 downloaded | Missed an available episode |
| Scripted mutation | 4× `ok` | Tested unmutated code |
| Cap test | pass | Asserted a tautology |
| Line filter | `Total: 0`, fast | Mutated nothing |

Each one is **absence rendered as success**. A crash announces itself; a no-op
inherits the vocabulary of the happy path. Worse, three of the four got *faster*
when they broke — a run that does nothing is always quicker than one that works,
so the one signal a human notices points the wrong way.

The common structural cause: **every check was validated against its own
output.** The test asserted against the constant it pinned. The mutation script
trusted its own edit. The line filter's unit tests built the nodes the filter
would judge. The scheduler believed the number the scraper handed it.

## 4. What we changed

1. **The bug.** `fetchEpisodes` walks the paginator to `last_page`, stops on an
   exhausted page, and is bounded by a page cap. A page that fails mid-walk is a
   **loud error** rather than a truncated listing — returning what was collected
   so far would under-report the latest episode, reproducing the original bug
   through the error path.
2. **The spec.** `openspec/specs/download/sites.md` said nothing about pagination;
   that gap is how this shipped. It now carries the requirement, including the
   fail-loud scenario and bounded termination.
3. **The line filter,** with three failure modes closed explicitly:
   - nil node handled, with a regression test that panics without the guard;
   - a scope that matches nothing fails loudly instead of reporting a clean run;
   - an underivable scope falls **open** to whole-file mutation, never closed.

   Measured on the same change: **89 mutants / ~6 min → 18 mutants / ~53 s, all
   18 killed.** The dropped 71 are pre-existing debt in untouched parts of the
   file. The score now describes the change, not the file it landed in.
4. **The flow.** The wrapper is now the default MUTATE step rather than an
   occasional audit. The manual delete-the-guard check remains, demoted to what
   it is good at: one guard, instantly, with no staging. It is no longer the
   thing we rely on to be complete, because on this change it was not.

## 5. Transferable rules

1. **A check must be able to fail for the reason you care about.** "Score below
   threshold" fired here, but it fired for *test quality* while the actual fault
   was *the tool mutated nothing*. One exit code covering both is one diagnosis
   short.
2. **Never assert against the production symbol you are pinning.** Expected values
   are literals. If both sides of a comparison can move together, the test has no
   opinion.
3. **Assert that a mutation applied before concluding it was killed.** A failed
   edit and a perfectly-covered guard produce identical output.
4. **Self-chosen mutants cover only what you already suspected.** Systematic
   mutation and hand-mutation are not substitutes: one is broad and dumb, the
   other narrow and informed. The narrow one confirms; it does not survey.
5. **Keep a baseline number.** 89 → 0 was legible only because 89 existed. Any
   tool whose output is a count should have a known-good count recorded next to
   it.
6. **Suspect the run that got faster.** Doing nothing is always the quickest
   implementation.
7. **Check where your safety net sits in the call order.** A guard placed after a
   `t.Fatal` — or after any early exit — is unreachable in exactly the failure it
   was written for.
8. **A number in your output that is also a round constant somewhere else
   deserves one direct check.** Page sizes, batch limits and default timeouts
   impersonate results convincingly.
9. **When a tool reports a large uniform result — 0, or everything — do not read
   it as a verdict until you have proven the tool ran.** Zero findings and zero
   execution look the same from the outside.

## 6. Related

- [`docs/mutation-testing.md`](../mutation-testing.md) — how mutation testing is run here
- [`openspec/specs/download/sites.md`](../../openspec/specs/download/sites.md) — the pagination requirement
- [`docs/learning-log.md`](../learning-log.md) — running log of non-obvious calls
- [`docs/postmortems/postmortem-fallow-barrel-false-positives.md`](postmortem-fallow-barrel-false-positives.md) — a linter's uniform findings were true, not noise
