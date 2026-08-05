# Pre-commit gate performance

Why the gate is shaped the way it is, and what the shape is worth. Read this
before changing `lefthook.yml`, `scripts/lint.ps1`, or the vitest pool settings
in `frontend/vite.config.ts` — each carries a comment pointing here.

Reference machine: Intel i7-12700K, 12 cores / 20 logical threads, 32 GB RAM.

## The failure it fixes

The gate used to make the desktop unresponsive for its whole duration, on a
single repository, with nothing else running.

The cause was not any one slow check. It was `parallel: true` across 14 jobs
combined with the fact that **Go tools default their internal parallelism to the
logical CPU count**. `go vet ./...`, `go test ./...`, and two `golangci-lint`
passes each tried to claim all 20 threads *simultaneously*, on top of vitest,
tsc, eslint and two Fallow passes. That is 60+ CPU-bound threads on a 20-thread
machine, and nothing was left to redraw the UI.

The tell was in the gate's own log: `frontend-filesize-warning`, nominally a
script that reads file lengths, reported **34 seconds**.

That number turned out to have two independent causes, which is worth recording
because the first one masked the second. Contention was real. But once the gate
was bounded and the machine had CPU to spare, the same job still took 46s — it
was also doing far more work than its name suggests (see below). Starvation is
an easy story to stop at; confirm it by re-measuring the job in isolation.

## The shape

Three top-level groups run concurrently:

| Group | Mode | Contents |
|---|---|---|
| `quick` | parallel | every check that costs seconds — gofmt, file size, architecture, golangci-lint, SDD, OpenAPI, Fallow, typecheck, eslint |
| `go-heavy` | piped | `go vet`, then `go test ./... -cover` |
| `frontend-heavy` | piped | vitest, then staged mutation testing |

Peak load is roughly two heavy tools at four threads each, leaving most of the
machine free. Every Go job pins `-p=4` and `GOMAXPROCS=4`; vitest pins
`maxWorkers: 4`.

An earlier attempt piped the *cheap* frontend jobs behind vitest as well. That
measured **313s — slower than the unoptimised gate** — because typecheck, Fallow
and eslint lost the parallelism they were getting for free. Cheap work belongs
in `quick`; only genuinely expensive work belongs in a piped lane.

## Results

Full gate, both lanes active, warm caches:

| | Before | After |
|---|---|---|
| Wall time | 186–211s | **~60s** |
| golangci-lint job | 43–55s | **2.4s** |
| vitest | 186s | **49s** |
| frontend-filesize-warning | 34–47s | **2.2s** |
| Desktop during run | unusable | responsive |

### Where the wins came from

**Linter binaries are built once.** `scripts/lint.ps1` called
`go run <module>@<version>` on every invocation and rebuilt the 42 MB custom
linter unconditionally — a link step plus a module-proxy round trip per commit.
Both binaries are now cached in `.tools/bin` behind stamp files and rebuilt only
when the pinned version or `.custom-gcl.yml` changes. This also removed a real
fragility: the gate previously **could not run without internet**, because
`go run module@version` always contacts the proxy for deprecation data.

**Vitest got its parallelism back.** `fileParallelism: false` was a workaround
for the contention above — its own comment said "under the concurrent Lefthook
gate". With the gate bounded, four workers cut the suite from 186s to 49s, with
171 files / 1450 tests green on three consecutive runs.

**The file-size warning stopped type-checking the world.** `frontend-filesize-warning`
inherited `eslint.config.js` — the full type-aware preset — to read a single
`max-lines` result, so counting lines paid for building an entire TypeScript
program. It now ignores the project config and parses syntax only, which is all
`max-lines` needs. 47s to 2.2s, byte-identical output. This one hid behind the
contention above: it looked like a starved process, and only became visibly the
slowest job once the machine had CPU to spare.

**Jobs only run when they can change the verdict.** Each job is globbed to the
files it judges, so a docs-only commit no longer compiles and tests the whole Go
module. Unchanged Go source cannot change the Go verdict, so this costs no
coverage. A change to `lefthook.yml` or `scripts/lint.ps1` deliberately triggers
everything: changing the gate re-proves the gate.

## What is guarded, and what is not

`tools/checkgofilesize/hook_order_test.go` and `repository_policy_test.go` parse
`lefthook.yml` and assert the cheap-signal-first ordering (gofmt → go-filesize →
golangci-lint; frontend-filesize-warning → frontend-lint). They flatten `group:`
containers, so the grouping above is free to change but the ordering is not.
Verified by mutation: swapping `gofmt` and `go-filesize` fails the test.

**Nothing enforces the concurrency budget itself.** No test asserts that `-p=4`,
`GOMAXPROCS`, or `maxWorkers` are still present. Deleting them is a one-line
change that brings the freeze straight back and no gate will object. The comments
in each file are the only guard, which is why they state the consequence rather
than just the setting. This is the P01 gap for this work, recorded rather than
hidden — see the deviations section in `AGENTS.md`.
