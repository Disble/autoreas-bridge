# Mutation Testing (Go)

Mutation testing answers the one question the coverage number cannot: *if this
code were broken, would any test notice?*

That matters more here than in most repos. `go test -race` cannot run on this
project — the race detector needs a C toolchain on Windows, which the pure-Go
`modernc.org/sqlite` driver exists to avoid. Tests are therefore judged by
whether they actually fail when the code changes, and this is what automates
that judgement.

The runner is [ooze](https://github.com/gtramontina/ooze), driven by
`tools/mutationstaged`. It works. It is deliberately **not** wired into any
hook — see "Why it is not in pre-commit".

## Run it

```sh
go run ./tools/mutationstaged        # mutate the staged production Go files
go run ./tools/mutationstaged -dry   # print the computed scope, run nothing
```

It exits 0 immediately when no `.go` files are staged, and refuses a file that
has unstaged changes on top of its staged ones — the same refusal the frontend
guard makes, for the same reason: mutation would otherwise judge a tree state
that is not what gets committed.

The threshold defaults to `0.80`, matching `stryker.dlinter.json`'s `break: 80`,
so both sides of the repo are held to the same bar. Override with
`AUTOREAS_MUTATION_THRESHOLD`.

To audit a file you are not committing, stage it on a scratch branch:

```sh
git switch -c tmp-mutation-probe HEAD~1
git checkout main -- path/to/package/
go run ./tools/mutationstaged
git switch main && git branch -D tmp-mutation-probe
```

## Reading the output

| Status | Meaning | Act on it? |
| --- | --- | --- |
| `Killed` | A test failed when the mutant was applied. | No — this is the goal. |
| `Survived` | The mutant passed every test. **A test is missing or asserts nothing.** | Yes, if the mutant is meaningful. |

Not every survivor is a real gap. ooze mutates syntax, not intent: it will
happily turn `truncate(body, 200)` into `truncate(body, 201)` inside an error
message and count the survivor against you. Read each one and decide whether a
test *should* have noticed. Chasing the score itself produces tests that assert
on trivia.

### Why it is worth running even though the manual check exists

The `jkanime.go` run above earned its six minutes. Its cap test asserted
`len(walked) != maxEpisodeListingPages` — against the constant itself. Mutating
the constant moved both sides of the comparison together, so the test passed for
any cap and pinned nothing. The guard had already been mutation-checked by hand
and passed, because the hand-check mutated the *comparison* while the assertion
stayed fixed.

That is the blind spot a self-chosen mutant cannot cover: you mutate where you
were already looking. Assertions that reference the constant they are meant to
pin are invisible to the manual check and obvious to ooze. Run it on any test
whose expected value is computed from production code rather than written out.

## Line scoping

ooze mutates whole files and keeps no incremental cache, so on its own a
one-line edit pays for the entire file every time, and touching one function
makes you accountable for every untested branch already in it.

The guard works around the first half. `ooze.WithViruses` accepts arbitrary
`viruses.Virus` implementations, the interface hands over the `ast.Node`, and
ooze parses each file with a fresh single-file `token.FileSet` — so
`int(node.Pos()) - 1` is a plain byte offset. `internal/testsupport/mutation`
wraps all fourteen default mutators in a filter that withholds every node
outside the staged diff's byte ranges, which `tools/mutationstaged` derives from
`git diff --cached -U0` against the index copy of each file.

Measured on `internal/download/sites/jkanime/jkanime.go`, the same staged change
either way:

| | Mutants | Result | Wall clock |
| --- | --- | --- | --- |
| Whole file | 89 | 71 killed / 18 survived, score 0.7978 | ~6min |
| Changed lines only | 18 | 18 killed / 0 survived, score 1.00 | ~53s |

The 18 the filter dropped are pre-existing debt in untouched parts of the file.
That is the whole point: the score now describes the change rather than the file
it landed in.

Ranges from every staged file are unioned, because `Incubate(node)` names no
file. With more than one file staged that over-approximates — a node in one file
can fall inside another's range and survive the filter. Deliberate: keeping
mutants that could have been dropped costs time, dropping mutants that should
have run costs truth.

### Two ways this hid a failure, both now closed

- **`ast.Inspect` sends a nil node** after every subtree. The first version of
  the filter called `Pos()` on it, and ooze reported a flawless **zero-mutant**
  run rather than crashing — 0.98s, score -1.00, no stack trace. Every unit test
  had built a node, so nothing reached it.
  `TestLineScopedSurvivesTheNilNodeAstInspectSends` pins it.
- **A filter that keeps nothing** produces a spotless report over an empty run.
  The harness counts kept/dropped nodes and refuses a run that kept none. Note
  this only fires where ooze itself would pass; a zero-mutant run scores -1.00
  and fails on the threshold first.

An empty or underivable scope falls **open** to whole-file mutation rather than
filtering everything away.

## Why it is not in pre-commit

Even at ~53s, this stays out of the hook. The gate already runs ~90s, ooze still
recompiles and re-runs the package's whole suite per mutant, and cost still
scales with how much you changed rather than with the diff's importance.

| Staged input | Mutants | Result | Wall clock |
| --- | --- | --- | --- |
| Nothing staged | — | exit 0 | 1.0s |
| `internal/observability/eventlog/store.go` (whole file) | 27 | 20 killed / 7 survived, score 0.74 | ~100s |

Use it to audit a change you are about to own. For the per-guard TDD step, the
manual check stays faster and fully deterministic: delete the guard, run only
that test, confirm it FAILS, then `git checkout -- <file>`.

`ooze.Parallel()` is off by default: it deadlocks here. A 30-minute run ended
with goroutines still blocked in `testing.(*T).Parallel` after 29 minutes. Set
`AUTOREAS_MUTATION_PARALLEL=true` only to re-test whether a newer ooze fixed it.

## Why it runs against a sandbox

ooze's `fsrepository.LinkAllToTemporaryRepository` walks the repository root and
calls `os.Symlink` for **every file, with no exclusions**. `IgnoreSourceFiles`
filters which files get *mutated*, never which get *linked*. Against the working
tree that means symlinking `frontend/node_modules` (~130k files) once per
mutant, and a run never finishes.

The guard therefore materialises the index into a temp directory with
`git checkout-index --all --prefix=...` and points ooze there. That is ~1,600
files instead of 130,000, and it also buys the right semantics for free: it
judges exactly the staged content rather than the working tree that merely
resembles it. A `frontend/dist/index.html` stub is created because `main.go`
embeds that directory and the built assets are not in the index.

## Windows path separators

ooze derives each source path with `filepath.Rel`, which yields **backslashes**
on Windows. A forward-slash-only ignore pattern matches nothing, every exclusion
silently drops, and the whole repository gets mutated while the run still looks
correctly scoped. `buildIgnorePattern` emits `[/\]` for each separator;
`TestBuildIgnorePatternMatchesWindowsSeparators` pins it.

## Why not gremlins

`go-gremlins` was evaluated first and abandoned; its config was deleted on
2026-08-09. It is recorded here so nobody spends the afternoon re-discovering
it: results were **not reproducible run to run** on this repo. Three identical
runs on `internal/observability/eventlog` scored 94.44% / 0% / 0% efficacy,
because gremlins derives its per-mutant timeout from the baseline test duration
and nearly everything landed in `TIMED OUT` instead of `KILLED`. Upstream
[#267](https://github.com/go-gremlins/gremlins/issues/267) and
[#81](https://github.com/go-gremlins/gremlins/issues/81) are both still open. A
threshold gate on that would have failed on tool nondeterminism rather than on
code quality.

It shared one trap with ooze, worth remembering for any third tool: an
exclusion option that filters *mutant selection* but not the *file-tree copy* is
useless on this repo, because the copy is what costs.
