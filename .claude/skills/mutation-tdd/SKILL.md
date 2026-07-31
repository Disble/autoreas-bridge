---
name: mutation-tdd
description: "Mutation checking as the REFACTOR-phase step of the TDD cycle. Use after a test goes green, when writing or reviewing any test that guards a conditional, a defensive branch, an error path, or concurrency, and whenever a test looks rigorous but you have not proven it fails. Answers 'does this test actually assert anything?'. Keywords: mutation testing, mutation, kill the mutant, survived, TDD, red green refactor, does the test fail, vacuous test, guard deleted, ooze, gremlins, coverage lie."
metadata:
  author: autoreas-bridge
  version: "1.0.0"
  scope: project
  updates: living
---

# Mutation Checking in the TDD Cycle

**A test that cannot fail is not a test.** This skill makes that check a step you
perform, not a tool you run.

## Why this is a prompt and not a hook

Mutation tooling exists here and is documented in `docs/mutation-testing.md`
(gremlins, and `go run ./tools/mutationstaged` for ooze). Neither is in
`lefthook.yml`, deliberately:

- gremlins produces non-reproducible scores on Windows (94.44% / 0% / 0% across
  three identical runs).
- ooze costs ~100s for a single staged file, roughly doubling a ~90s
  pre-commit gate, and mutates whole files rather than changed lines.

So the deterministic gate cannot carry this. **You carry it.** The manual check
below is faster, fully deterministic, and has already caught two vacuous tests
in this repo that both tooling and coverage missed.

## The cycle

RED → GREEN → **MUTATE** → REFACTOR.

The new step sits after green and before refactor, because refactoring behind a
test that asserts nothing is how a regression ships.

## The check

For every guard your test claims to cover:

1. **Delete the guard** in the production file — the whole `if` body, the
   `return`, the clamp, the branch.
2. **Run only that test.**
3. **It must fail.** If it passes, the mutant survived: the test proves nothing.
4. **Restore the file** — `git checkout -- <file>` is the safe restore.

```sh
# 1-2. break it, run the one test
go test ./internal/observability/eventlog/ -run TestQueueSetErrIgnoresNil -count=1
# 4. always restore from git, never by hand-retyping
git checkout -- internal/observability/eventlog/queue.go
```

Do this for **each** guard separately. A test that dies when any of three
guards is removed has told you nothing about which one it covers.

## When it is mandatory

Do not skip the check for:

- **Any concurrency test.** This is the highest-risk category in this repo.
- **Defensive branches** — nil guards, clamps, `if err == nil { return }`.
- **Error paths** and timeout branches.
- **Any test you wrote to close a coverage gap** — coverage proves execution,
  never assertion.

## Branches the scheduler cannot reach

Some guards are unreachable through the public API. `Sink.writeUnbound`'s
raced-`Bind` branch and `Queue.setErr(nil)` are both real examples: no amount of
goroutine stress produces them.

**Call the unexported function directly** from an in-package test to reproduce
the state. Do not write a stress loop and assume it got there.

The proof that this matters: `TestSinkConcurrentWriteDuringBindDeliversExactlyOnce`
ran 100 iterations of a deterministic state-spin and **passed with the guard
deleted**. It looked more rigorous than the direct-invocation test that replaced
it, and it was worthless. See `docs/learning-log.md`, 2026-07-30.

## Two traps that make a test silently vacuous

### Racing internal deadlines

`TestQueueStopClampsNegativeUnfinishedCount` passed while covering **0%** of its
target block. `Queue.Stop` wraps the caller's context in its own 5s budget and
`persist` independently gives each write a 5s context — with one in-flight
record either can win, and when `persist` won, `Stop` returned through the clean
path and never evaluated the branch under test.

**When a test targets a timeout branch, pass an explicit short context** so the
deadline you are testing provably fires first. Runtime dropped 5.00s → 0.05s and
the block went from uncovered to covered.

### Trusting the green tick

Both vacuous tests in this repo were **passing**. Neither `go test` nor the
coverage percentage flagged them. The only signal was deleting the guard.

## Verifying with coverage first

Cheaper than mutating, and it catches the "never executed" case:

```sh
go test ./internal/observability/eventlog/ -coverprofile=/tmp/c.cov -count=1
go tool cover -func=/tmp/c.cov | rg "queue\.go"
rg "queue\.go" /tmp/c.cov | awk '$NF==0 {print}'   # uncovered blocks
```

A block at `0` executions cannot possibly be asserted. Fix that before
mutating — but **do not stop there**: covered and asserted are different
things, and the gap between them is exactly what this skill exists for.

## When to reach for the tooling instead

Batch auditing a whole package, not a single change:

```sh
go run ./tools/mutationstaged -dry   # what would be mutated
go run ./tools/mutationstaged        # gate the staged change (~100s/file)
```

Read `docs/mutation-testing.md` first — both tools have traps on this repo
(whole-tree copies over `node_modules`, Windows path separators, ooze's
`Parallel()` deadlock).

## Reporting

When you have mutation-checked something, say which guards you deleted and
whether each mutant was killed. "Tests pass" is not the claim; "the test fails
when the guard is removed" is.

Never report a test as covering a guard you did not break.
