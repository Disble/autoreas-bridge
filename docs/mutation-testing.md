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

## This is the MUTATE step

RED → GREEN → **MUTATE** → REFACTOR. On Go, MUTATE means running this wrapper
over the staged change — not hand-picking a mutant or two.

That is a deliberate reversal of the earlier guidance, and it was paid for. On
2026-08-09 a change shipped with four hand-picked mutants, all of which died. The
wrapper then found a surviving mutant on a test that asserted against the very
constant it claimed to pin — a test that passed for any value of that constant.
The hand-check had mutated the *comparison*, because that is where attention was.
**A mutant you choose yourself covers only what you already suspected.**

Hand-mutation keeps a job: one guard, mid-edit, nothing staged, instant answer.
It confirms a suspicion. It does not survey a change, and it is not what "MUTATE"
means here. When you do use it, prove the edit applied before believing the
mutant was killed — `sd` is not installed in this environment, and four
substitutions that silently failed once produced four reassuring `ok` lines:

```sh
perl -0pi -e 's/old/new/' "$F"
git diff --quiet -- "$F" && echo "!! MUTATION DID NOT APPLY"
```

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

So it stays a step you run, not a step the gate runs for you. Stage the change,
run it, read the survivors, then commit.

An unexpected multi-minute run is a signal, not slowness: the scope fell open to
whole-file mutation because the diff ranges did not resolve. Check `-dry`.

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

## The frontend guard, and the day it was found doing nothing

The frontend has its own scoped runner: `frontend/scripts/dlinter-mutation-staged.mjs`,
driven by Stryker through `stryker.dlinter.json`, wired into `lefthook.yml` as
`test:mutation:staged`. Unlike the Go side it *is* in pre-commit, because it
mutates only the lines a commit adds.

**On 2026-08-13 it was found exiting 0 without mutating anything, and it had
been doing so for an unknown period.**

The script read its file list with `git diff --cached --name-only`, which
returns paths relative to the **repository root** (`frontend/src/...`). It then
passed that list straight back as a pathspec to a second `git diff` running with
`cwd` set to `frontend/`. Git resolves a pathspec relative to the current
directory, so it looked for `frontend/frontend/src/...`, matched nothing, and
returned an empty diff. No hunks meant no line ranges, and no line ranges took
the early-exit branch:

```
dlinter mutation guard: no added production TypeScript lines.
```

Indistinguishable, from the outside, from a commit that genuinely touched no
production TypeScript.

The tell was in the gate output the whole time, and it is worth internalising
because it is the cheapest detector available: the job reported **0.42 seconds**.
A real scoped run of the same change takes 33. **A gate that got dramatically
cheaper did not get faster — it stopped working.**

Two things changed:

1. The pathspec is now built relative to `cwd`.
2. Staged production files resolving to **zero** ranges is now a hard failure,
   not a quiet pass. Every path in the list came out of a diff, so each one must
   yield at least one hunk; zero is a contradiction that can only mean the diff
   or its parsing broke. This invariant is what would have caught the bug on day
   one, and it costs nothing.

A third thing was found while fixing it: `package.json` declared
`test:mutation:guard` pointing at `scripts/__tests__/mutation-staged.node-test.mjs`,
a file that does not exist. The test guarding the mutation guard was gone, and
no hook invoked it. The dangling script entry was removed.

See `docs/postmortems/postmortem-silent-no-ops.md` — this is the same failure
mode that postmortem was written about, in the tool meant to prevent it.

### The second pathspec defect: a move billed as new code (2026-08-13)

The fix above was incomplete. The same pathspec was also **defeating rename
detection**, and that one failed in the opposite direction: instead of mutating
nothing, it mutated far too much.

`git diff --cached --name-only` reports only the *destination* of a renamed
file. Building the second diff's pathspec from destinations alone hides the
source path, so git cannot pair the two halves, and a moved file comes back as
`new file mode` with a single hunk covering every line. The guard then demands
mutation-grade coverage for the whole file — including every line the commit
never touched.

Measured on the `shared/ordering` extraction: three components moved with
`similarity index 100%`, byte for byte identical, contributed **72 of 146
surviving mutants** — half the deficit. They are dumb presentational `.tsx`
files, so those mutants were overwhelmingly `className` string literals and
inline-handler arrows: killing them means asserting on Tailwind classes, which
pins styling and proves nothing about behavior.

This matters beyond the arithmetic. **A gate that charges for moving a file
penalizes exactly the refactoring the architecture asks for.** Extracting a
shared module became the most expensive possible edit, for no benefit.

What changed:

1. The file list is read with `--name-status`, which carries the rename source,
   and both halves go into the pathspec so detection can pair them. Git runs
   from the repository root and paths stay repo-relative, retiring the prefix
   arithmetic that caused the first defect.
2. The zero-ranges invariant now measures **content-changed** files. A 100%
   rename legitimately yields no hunks, so the previous invariant — "staged but
   no ranges is always a bug" — would have started firing falsely the moment
   rename detection began working.

Point 2 is the interesting one: fixing a defect *activated* a latent false
positive in the guard added alongside the first fix. An invariant is only as
good as the set of cases it was written against.
