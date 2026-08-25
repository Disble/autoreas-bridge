# Postmortem: "Committing freezes my computer"

**Date:** 2026-08-05
**Repo:** `autoreas-bridge` (Wails desktop app; Go backend, React + TypeScript frontend)
**Audience:** any team whose pre-commit hook, CI job, or task runner fans out across multiple tools
**Outcome:** 186–211s → ~33s, desktop responsive throughout. No check was removed.

This is written for teams outside this project. The specifics are Lefthook, Go
and Vitest, but the failure mode is generic and stack-independent:

> **Every tool you run defaults to owning the whole machine. Run fourteen of
> them at once and you have oversubscribed by an order of magnitude — without
> writing a single line of concurrent code.**

The instinct when a gate becomes hostile is to delete checks. That was never
necessary here. Everything that ran before still runs.

---

## 1. What happened

`git commit` made the machine unusable — mouse stuttering, windows not
redrawing — for the two-to-three minutes the hook took. It happened **with a
single repository, nothing else running**, on hardware that should laugh at
this workload: an i7-12700K (12 cores / 20 threads) with 32 GB of RAM.

The hook config looked entirely reasonable. Fourteen jobs, declared
`parallel: true`, on a machine with twenty threads:

```yaml
pre-commit:
  parallel: true
  jobs:
    - name: go-vet
      run: go vet ./...
    - name: go-cover
      run: go test ./... -cover
    - name: golangci-lint
      run: ...        # two full analysis passes
    - name: frontend-test
      run: vitest run
    # ...ten more
```

Fourteen jobs, twenty threads. What could go wrong?

## 2. What was actually true

**Job count is not thread count.** Go's toolchain defaults `-p` (package build
and test parallelism) and `GOMAXPROCS` to the number of logical CPUs. So on this
machine:

| Job | Threads it believes it may use |
|---|---|
| `go vet ./...` | 20 |
| `go test ./... -cover` | 20 |
| `golangci-lint` (pass 1) | 20 |
| `golangci-lint` (pass 2) | 20 |
| vitest, tsc, eslint, 2× Fallow, 4× `go run` | more |

Each tool is behaving correctly in isolation. Each assumes it is the only thing
running. Fourteen correct local decisions compose into **60+ CPU-bound threads
on a 20-thread machine**, and the desktop compositor is just another process
competing for a slice it never gets.

This is why the freeze needed no second repository, no browser, no dev server.
The gate alone was three times oversubscribed.

### The evidence was in our own logs

The gate printed this every single run, and it had been read past for months:

```
✔️ frontend-filesize-warning (34.69 seconds)
```

That job reads file lengths. It has no business taking 34 seconds. A number
that absurd is not a slow job — it is a **starved** one, and it was the
oversubscription showing up in plain text.

**Lesson:** your gate already reports per-job timings. A job whose duration is
wildly out of proportion to its work is a scheduling signal, not a slow job.
Read your own output.

## 3. The measurement traps

Four ways we got the wrong answer before getting the right one. Every one is
easy to repeat.

### Trap 1 — reproducing the failure as the first diagnostic step

The obvious way to benchmark a slow gate is to run it. But running it *was* the
failure — it froze the user's machine, and doing that repeatedly to collect
numbers is a hostile way to debug someone's workstation.

We profiled each job **individually** instead, which was safer and turned out to
be better science: with jobs run one at a time, the peak-load question answers
itself. If each job needs N threads and they all run concurrently, the peak is
the *sum*. No composite run required.

**Lesson:** when the bug is "this saturates the machine," measure the parts and
add them up. You often do not need to reproduce the outage at all.

### Trap 2 — a plausible cause that the user falsified in one sentence

The initial theory was cross-repository contention: this developer routinely
commits in two or three projects at once, so of course three gates collide.

An entire coordination design was drafted — a global mutex, serialized commits
across repos, a CPU budget per repo. It was moments from being proposed.

The user said: *"even with only one project, I experience freezing."*

That one sentence killed the theory. Cross-repo contention was real but
**secondary**; a single gate was already oversubscribed 3×. Had the mutex
shipped, it would have added machinery, slowed multi-repo work, and left the
actual bug untouched.

**Lesson:** a plausible cause that explains the symptom is not the same as the
cause. Ask what the *minimal* reproduction is — here, "does one repo alone do
it?" — before designing for the complicated case.

### Trap 3 — one symptom, two independent causes, the first hiding the second

`frontend-filesize-warning` at 34s was diagnosed as starvation. That was
correct. It was also incomplete.

After the concurrency fix, with the machine mostly idle, the same job took
**46 seconds**. Starvation had been real and had masked the actual problem: the
script inherited the project's full ESLint config — including type-aware linting
— to read one `max-lines` result. It was **building an entire TypeScript program
in order to count lines.**

Scoped to a syntax-only parser: **46s → 2.2s**, byte-identical output.

**Lesson:** when contention is fixed, re-measure the jobs you already explained.
"It was starved" is a satisfying story that stops investigation early. A
component under contention can be *both* starved and independently broken.

### Trap 4 — a benchmark sweep that silently measured the same thing three times

Tuning Vitest worker counts from the command line produced a perfectly flat
curve:

| `--maxWorkers` | 6 | 8 | 12 |
|---|---|---|---|
| Duration | 47.9s | 48.1s | 48.2s |

Read naively, that is a scaling wall — evidence that the suite is I/O-bound and
more workers cannot help. It nearly ended the investigation.

The real explanation: a `maxWorkers` value had been added to `vite.config.ts`
earlier in the same session, and **the config value silently overrides the CLI
flag.** All three runs used the same worker count. The flat line was measurement
error.

Setting the value where it actually takes effect:

| workers | 4 | 8 | 12 |
|---|---|---|---|
| Duration | 48s | **31s** | 28s |

**Lesson:** a suspiciously flat result is a reason to verify your knob is
connected, not a finding. Change the input by a large factor and confirm the
output moves *at all* before trusting any point on the curve.

## 4. The half-measure we nearly shipped

The first restructure bounded concurrency the naive way: group the jobs and run
each group sequentially.

It measured **313 seconds — significantly slower than the broken gate it
replaced.**

The mistake was serializing *cheap* work. Typecheck (10s), Fallow (3s) and
ESLint (4s) had been getting their parallelism for free — they were never the
problem, and queueing them behind a 186-second test run added their full cost to
the critical path for no benefit.

Bounding concurrency does not mean "run things one at a time." It means **stop
tools from each claiming the whole machine.** The final shape keeps every cheap
check running concurrently, and pipes only the two genuinely expensive lanes:

| Group | Mode | Contents |
|---|---|---|
| `quick` | parallel | all sub-10s checks — format, size, architecture, lint, typecheck, OpenAPI |
| `go-heavy` | piped | `go vet`, then `go test -cover` |
| `frontend-heavy` | piped | vitest, then staged mutation testing |

**Lesson:** serialization is a blunt instrument. Cap each tool's internal
parallelism first; serialize only what is genuinely expensive.

## 5. How the remaining decisions got made

Once the freeze was fixed, "make it faster" needed a target. Wall time is:

```
max(quick, go-heavy, frontend-heavy)  =  max(20s, 26s, 31s)  =  31s
```

**Only the longest lane matters.** This reframed everything:

- `go vet ./...` is genuine duplicate work — golangci-lint already runs `govet`.
  Removing it saves ~10s of CPU and **zero seconds of commit time**, because
  `go-heavy` is not the critical path. It stayed.
- Making `tsc` incremental would shave `quick`, which is already the shortest
  lane. Pointless.
- Every second removed from Vitest is a second off every commit.

**Lesson:** in a parallel pipeline, optimizing anything but the critical path
lowers your electricity bill and nothing else. Identify the longest lane before
optimizing, and re-identify it after every change — the critical path moves.

## 6. What we changed

1. **Pinned every tool's internal parallelism.** `-p=4` and `GOMAXPROCS=4` on Go
   jobs; `maxWorkers: 8` for Vitest. Peak is now ~12 of 20 threads with both
   heavy lanes active, leaving real headroom for the desktop.
2. **Restructured into one parallel group plus two piped lanes** (see above).
3. **Scoped jobs to the files they judge.** A docs-only commit no longer
   compiles and tests the whole Go module. This weakens nothing: unchanged Go
   source cannot change the Go verdict. Staging the gate's own config
   deliberately triggers everything — changing the gate re-proves the gate.
4. **Stopped rebuilding tools on every commit.** The lint script called
   `go run <module>@<version>` per invocation and unconditionally rebuilt a
   42 MB custom linter binary. Both are now built once behind stamp files.
   43–55s → 2.4s.
5. **Gave the test suite its parallelism back.** `fileParallelism: false` was a
   workaround for the contention above — its own code comment said so. With the
   gate bounded, the premise was gone. 186s → 31s.
6. **Scoped the file-size check** to a syntax-only parser. 46s → 2.2s.

## 7. Result

| | Before | After |
|---|---|---|
| Wall time | 186–211s | **~33s** |
| golangci-lint | 43–55s | **2.4s** |
| Vitest | 186s | **31s** |
| File-size warning | 34–47s | **2.2s** |
| Peak threads | 60+ (of 20) | **~12 (of 20)** |
| Desktop during commit | unusable | responsive |
| Checks removed | — | **0** |

A side effect worth naming: the gate **could not run without internet**, because
`go run <module>@<version>` always contacts the module proxy for deprecation
data. Nobody had reported it, because nobody had tried to commit offline. It
surfaced only because a sandboxed benchmark run had no DNS. Caching the binaries
fixed a bug we did not know we had.

## 8. Measured and rejected

Recorded so the next person does not spend the time twice:

- **`isolate: false` for Vitest.** Reusing environments across test files would
  cut the dominant jsdom cost. The suite fails outright without per-file
  isolation. Not available.
- **Removing the redundant `go vet`.** Real duplication, but off the critical
  path (see §5), and the two analyser sets are not provably identical.
  Redundancy that costs no wall time is not worth the risk.
- **Running only tests related to staged files (`vitest --changed`).** By far
  the largest remaining win — most commits would drop to seconds. **Rejected on
  a non-performance ground:** CI here runs only the Go lint workflow, so the
  frontend suite executes *nowhere else*. Narrowing it locally would mean 1450
  tests never run in full, anywhere. Revisit only once the suite runs in CI.

That last one is the general point: **a speedup that moves work out of the only
place it happens is not a speedup, it is a deletion.** Know what else runs your
tests before you narrow them.

## 9. What guards this, and what does not

The repo's own tests caught the restructure: two Go tests parse the hook config
and assert cheap-signal-first job ordering. Nesting jobs in groups broke them,
which is exactly what a guard on gate configuration is for. They were taught to
flatten groups, and re-verified by mutation — swapping two jobs must fail the
test, and does.

**Nothing enforces the concurrency budget itself.** No test asserts that `-p=4`,
`GOMAXPROCS`, or `maxWorkers` still exist. Deleting them is a one-line change
that silently restores the freeze, and no gate will object. The code comments
are the only guard, which is why each states the *consequence* rather than just
the setting.

This is stated rather than hidden. A guard whose limits are unstated will be
mistaken for a complete one.

## 10. Transferable rules

1. **Job count is not thread count.** Every compiler, linter and test runner
   defaults to all cores. `parallel: N jobs` multiplies that by N.
2. **Cap each tool's internal parallelism before serializing anything.**
   Serialization is blunt and can make things slower — ours measured 313s,
   worse than the bug.
3. **Never serialize cheap work behind expensive work.** It adds its full cost
   to the critical path and buys nothing.
4. **Optimize the critical path or do not optimize.** In a parallel pipeline,
   `max()` is the only function that matters. Re-check it after every change.
5. **Read your own tool's timing output.** A trivial job reporting a large
   duration is a scheduling signal.
6. **Measure the parts, not the outage.** For saturation bugs, per-component
   profiling plus addition beats reproducing the failure — and does not require
   wedging someone's machine.
7. **Re-measure after fixing contention.** Starvation is a satisfying story that
   masks independently broken components.
8. **Distrust flat benchmark curves.** Verify the knob is connected before
   concluding a wall exists.
9. **Ask for the minimal reproduction before designing for the complex case.**
   "Does it happen with just one?" invalidated an entire coordination design in
   one sentence.
10. **Build tools once, not per commit.** Anything with `run <package>@<version>`
    in a hook is a rebuild and usually a network call on every commit.
11. **A gate that needs the network is a gate that fails on a plane.**
12. **Scoping work to changed files is safe; scoping it out of existence is
    not.** Know where else that check runs before narrowing it.
13. **Fixing a hostile gate does not require deleting checks.** We removed zero
    and got 6× faster.

## 11. Related

- [`docs/pre-commit-performance.md`](../pre-commit-performance.md) — the current
  gate's shape, tuning data, and rejected options
- [`docs/learning-log.md`](../learning-log.md) — running log of non-obvious calls
- [`docs/postmortems/postmortem-fallow-barrel-false-positives.md`](postmortem-fallow-barrel-false-positives.md)
  — a prior postmortem on suppressing linter findings
