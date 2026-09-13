# Verify Report — SDD-70 MyAnimeList metadata autofill

### Verdict

**PASS**

Date: 2026-09-12
Branch: `feat/sdd-70-mal-metadata`
Worktree: `autoreas-bridge-worktrees/sdd-70-mal-metadata`
Verified by: the orchestrating agent, not a sub-agent (CLAUDE.md § 3).

## 1. Gate results

Every command below was run by the orchestrator against the final tree.

| Check | Result |
| --- | --- |
| `go build ./...` | exit 0 |
| `go vet ./...` | clean |
| `go test ./...` | all packages pass |
| `go run ./tools/checkgofmt` | passed |
| `go run ./tools/checkgofilesize` | passed (no new file flagged; baseline still empty) |
| `go run ./tools/checkarchitecture` | passed |
| `go run ./tools/checkopenapi` | passed |
| `scripts/lint.ps1 -Profile all` (both golangci profiles) | **0 issues / 0 issues** |
| `bun --cwd="frontend" run typecheck` | clean |
| `bun --cwd="frontend" run test` | **308 files / 2818 tests passed** |
| `bun --cwd="frontend" run render:smoke` | production bundle renders every checked route |
| `bun --cwd="frontend" run layout:smoke` | **212 assertions passing** |
| `git diff --stat -- docs/openapi.yaml` | empty — desktop-only Wails bindings, no wire surface |

## 2. Requirement coverage

Each of these was verified against the running tree, not inferred from the task list.

| Requirement | Evidence |
| --- | --- |
| Module isolation is ENFORCED, not reviewed | The `myanimelist-speaks-only-mal` depguard rule was proved to fire: a probe file importing `internal/anime` into `internal/myanimelist` was rejected with the rule's exact message, and removing it returned the tree to 0 issues. |
| No feature calls a Wails binding directly | `grep -rln "wailsjs/go/desktop" frontend/src/features/` returns nothing. Every call routes through `infrastructure/metadata-lookup-source/`, which wraps each one in `waitForBindings` because Wails attaches bindings asynchronously. |
| Search issues exactly one request per query | Asserted by a request-counting integration test over `httptest.Server`. There is no retry and no zero-result fallback; `SearchResult` carries no `Fallback` flag. |
| No detail page is fetched before the user confirms | Asserted structurally on the Go side and through the hook's confirm path on the frontend. |
| A single-genre anime fills its genre | Pinned by the `detail_single_genre.html` fixture (Sono Bisque Doll) against the `Genre:`/`Genres:` label set. |
| Duration converts exactly | `parseDurationMinutes` table pins `1 hr. 46 min.` → the literal **106**; the hour component cannot be dropped. |
| Present-but-unparseable is drift, never zero | Asserted for both `Duration:` and `Episodes:`. |
| A missing anchor aborts the whole fetch | `detail_drift.html` (doctored to remove `Type:`) returns a typed `DriftError` naming the anchor, writing no fields. |
| `ONA` is never filed as TV | Pinned on both the parse side and the vocabulary map; the field is left at default and reported unfilled. |
| MAL's `Status:` never reaches the watching estado | Structural: the shared `AnimeMetadataSelection` carries no field for it. Asserted anyway on both surfaces. |
| The never-touched set holds | One test per surface asserts all five simultaneously: download page, folder, watched episodes, watching estado, premiere date. |
| The lookup trigger stays outside the optional-metadata disclosure | Asserted independently of the disclosure's expanded/collapsed state, preserving the scenario the `anime-create-editor` delta was written to protect. |
| The three UI states are exclusive | Driven off one discriminant; every loading test asserts the negative. |
| The placeholder is the height of the row it replaces | `layout:smoke` measures it in headless Edge: placeholder 56px vs row 60px, drift 4px against a 6px tolerance. |

## 3. Mutation testing

| Unit | Score |
| --- | --- |
| Slice 1 — client, errors, search | 1.00 (29/29) |
| Slice 2a — parser | 0.92 |
| Slice 2b — detail, anchor gate | 0.93 |
| Slice 3 — bindings, DTOs | 0.86 |
| Slice 4b — query helpers | 0.83 |
| Slice 5b — modal and states | 0.92 |
| Slice 6 — Create wiring | 1.00 on the touched production files |
| `metadata-lookup-source` | 1.00 (21/21) |

Surviving mutants were inspected rather than excused. The documented equivalents are genuine: a
`<= 0` guard treats `-1` identically to `0`; and for an anchored regex whose content is entirely
optional, "both capture groups empty" and "the whole match is empty" are the same proposition. The
remaining survivors sit in the private Levenshtein distance internals, where the design deliberately
forbids asserting raw scores — only order — so a perturbed matrix boundary rarely changes the
relative order of two real strings.

## 4. Deviations accepted during apply

| Deviation | Standing |
| --- | --- |
| `NewHTTPClient` takes a third `userAgent` parameter | Accepted. Reaching `bridgeVersion` from inside the module would require a backwards import that D5 forbids. Slice 3 closed the loop by passing the real ldflags-stamped version. |
| `buildUndoPatch`/`AppliedMetadata` moved into the shared module | Accepted. Both features need them identically, and a features→features import is the wrong direction. |
| The five-field never-touched assertion lives in the hook's test, not the panel's | Accepted. The hook owns the state; the panel is dumb UI with nothing to exercise for that guarantee. |
| `rankCandidates` scores one title rather than "every variant" | Accepted and correct. `prefix.json` returns a single `name` — no English title, no synonyms — so the instruction carried over from a different API. Building indirection for an absent field would be dead code. |

## 5. Gaps the task breakdown lost, found during apply

Two design elements had no owning task. Both were caught by `fallow audit` reporting exports with no
consumer — a signal first dismissed as an artifact of slicing, which it was not.

1. `toAnimeMetadataSelection` (the MAL→bridge producer) was named in the design's data flow but
   appeared in no task. `AnimeMetadataSelection` was declared and nothing produced one. Assigned to
   Slice 5b and implemented.
2. `rankCandidates` was built in Slice 4b and never consumed, leaving the spec's presentation-order
   requirement silently unimplemented. Wired in Slice 5b.

## 6. Defects found and fixed during apply

1. **A feature called a Wails binding directly.** `use-anime-create-rows.ts` imported
   `wailsjs/go/desktop` — the only file under `features/` in the repository to do so. Because Wails
   attaches bindings asynchronously, the call could run before the method existed, and the failure
   mode is silent degradation rather than a crash. No test caught it: the tests inject a fake source,
   so the production path was the one nothing covered. Fixed by routing through a new
   `infrastructure/metadata-lookup-source/`, with the degraded path pinned by its own test asserting
   the outcome is an error and explicitly **not** a no-op.
2. **The candidate row collapsed to 36px** against a 56px placeholder in headless Edge, because an
   image sized only by a Tailwind class does not reserve its box when the browser cannot reach the
   CDN. jsdom has no layout engine, so the whole unit suite passed. Fixed with explicit `width`/
   `height` attributes plus a `min-h-14` floor, and guarded by the layout fixture.
3. **Dead code proved by mutation testing.** HeroUI's `Modal` treats its first `Button` child as an
   implicit trigger, so an explicit `onPress` was unreachable. Deleted rather than given a test.
4. **Real-page markup contradicted the design.** MAL's `itemprop="name"` node wraps both the `<h1>`
   title and the sibling English-subtitle paragraph, so the design's literal "itemprop first"
   guidance would have folded the subtitle into the title. The parser uses the first `<h1>` only.

## 7. Planning miss, reported not trimmed

Measured against the design's own bands, the slices ran 1.3×–3.5× over, and the change totals far
more than the 2,935–3,935 lines forecast. No test was trimmed to close the gap: CLAUDE.md § 22 is
explicit that deleting a case which kills a known mutant is the one forbidden move, and that a
remainder surviving genuine cleanup is reported as a planning miss.

One refactor was attempted and is recorded as a negative result. Slice 1's `client_test.go` held
eleven hand-copied test functions and zero tables — the failure mode CLAUDE.md § 22 records from
SDD-67. Converting to tables saved 36 lines but pushed the merged body past the cognitive-complexity
ceiling; splitting it back by assertion mode spent those lines again. Net movement: one line. The
mechanism is worth keeping: **cases that differ in DATA compress into a table; cases that differ in
which ASSERTIONS RUN do not** — folding both into one table only relocates the branching to where
`gocognit` finds it.

## 8. Drift recorded (CLAUDE.md § 2)

1. `.atl/` is listed in `.gitignore`, so `.atl/active-sdd-change` can never be committed — yet
   `tools/checksdd`'s `detectActiveChange` requires it whenever more than one non-archived change
   directory exists under `openspec/changes/`, which is always (37 today). Every fresh worktree must
   recreate that marker by hand or no commit can land. Recorded, not fixed.
2. `bridge-testing` and `bridge-debugging`, which `CLAUDE.md` notes #5 and #6 instruct agents to
   load, exist neither in the repository nor in the global skills directory.

A third, structural finding: `checksdd` globs on `*.go` and requires the complete change, so the
task breakdown's eleven per-slice commits were impossible in this repository. Those tasks are marked
SUPERSEDED rather than done, because no per-slice commit happened.
