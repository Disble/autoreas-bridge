# Verify Report — Loading Skeletons Completion

### Verdict

PASS

Verified by the orchestrating agent directly, not delegated (CLAUDE.md #3). Phases 1–3 were
implemented by two delegated apply agents on disjoint file sets; Phase 4 — the skill rule, the layout
proof, the sweep, the gates and this report — was done here, along with three gaps the delegated work
surfaced but did not close.

## Spec coverage

| Requirement | Where it is proved |
|---|---|
| No surface answers an unresolved request with a sentence | The sweep below: zero rendered loading sentences across `frontend/src` |
| A table keeps its header while loading | Per-table tests asserting the column headers and `aria-busy`, plus the layout fixture's header check |
| Placeholders disappear once resolved | Resolved-branch assertions on every converted surface |
| Every loading surface exposes a named status region | `getByRole('status', { name })` per surface; 11 files carry one |
| A landmark label is not an announcement | The seven `<section aria-label="Loading X">` sites are gone; `grep` returns none |
| A loading table is marked busy | `container.querySelector('[data-slot="table"][aria-busy="true"]')` per table |
| One shared placeholder for uniform bar skeletons | `shared/ui/LoadingBars/`, adopted by eight surfaces |
| The shared placeholder cannot be used without announcing | It owns the status region; its own suite asserts the role and name |

## Final sweep

| Check | Result |
|---|---|
| Loading sentences rendered as text | **none** |
| `<section aria-label="Loading …">` | **none** |
| `<Spinner>` as a content-loading state | **none** |
| Files exposing `role="status"` | 11 |
| Skeleton components | 9, plus the shared `LoadingBars` |

The one surviving `<Spinner>`, in `DevicesWorkspace`, is deliberate: it sits inside a `Button`'s
`isPending` render prop — a busy control, not content being loaded.

## The bug a user found, and why the tests could not

A user screenshotted Today with three skeleton cards stacked directly on top of three real anime
cards. The placeholder had been written as a block **added above** the content instead of one that
**replaces** it, and the content branch was gated on the collection rather than on the request.

Three surfaces had it, all introduced by this change series:

| Surface | What was written | Why it renders both |
|---|---|---|
| `EpisodeSchedulePanel` | `{rows.map(…)}` with no condition | `items` keeps the previous day's rows while the next day is in flight |
| `SoloAnimeDownloadPanel` | `{options.length > 0 ? … }` | a reload keeps the previous readiness list |
| `ActivityOverview` samples | `{eventSamples.map(…)}` with no condition | same, on the event summary |

On first mount the collection is empty, so `isLoading && rows.length > 0` is never true and the bug is
invisible. It only appears on a refetch — switching a day, a filter or a tab — which is why it reached
a screenshot rather than a test.

**The root cause was in the tests, not the markup.** Every loading test asserted two things: the
skeleton appears while loading, and it is gone once resolved. Neither can fail while both blocks
render. The missing third assertion is the negative — *no real content is present while loading*. It
was written first, reproduced the screenshot, and only then were the three branches fixed.

That assertion now exists on all six remaining surfaces as well, and it was proved load-bearing rather
than assumed: un-gating `CatalogPanel`'s content branch on purpose turned it red, and reverting
restored green. Two of those surfaces reach a true refetch state (the Editor Library through its
post-deactivate reload, ActivityOverview through a rerender with a stalled source); the four
hook-mocked or prop-driven ones set `isLoading` with a non-empty collection, which is the same prop
shape a refetch produces — a dumb component cannot tell the two apart.

Made normative in three places so it cannot recur by forgetting: `autoreas-theme` v1.1.1 gained "The
states are EXCLUSIVE", with both wrong patterns written out; rule 14 of `CLAUDE.md` and `AGENTS.md`
carries the same; and the spec delta gained "A placeholder replaces the content rather than joining
it".

## Three gaps the delegated work surfaced, closed here

**A surface the inventory could not see.** The scope was built by grepping for `Loading [a-z]`, which
finds a loading state only if it says something. `BridgeStatusCard` rendered a bare `<Spinner>` where
its status `Chip` goes, with no text at all, so it was invisible to that inventory and to the previous
change's. The verification sweep — which greps for `<Spinner>` as well as for sentences — found it. It
is now a chip-shaped placeholder in a named status region, sharing one class with the chip so the row
height does not change when the status lands. Method note worth keeping: an inventory built from text
misses every silent loading state, and a spinner is silent by construction.

**A list the table work did not cover.** `ActivityOverview`'s "Newest events" `<ul>` had no
placeholder. The agent flagged it as outside its enumerated scope and was right to; it is inside the
MODIFIED requirement's scope, so it was closed here as a component rather than a builder — a plain
`<ul>` has no collection walker to satisfy.

**Test infrastructure with no guard.** Adding loading assertions to `SyncingAnimePanel.test.tsx` made
a later query find elements a previous test had left behind. That is not one file's oversight: Testing
Library registers cleanup only under `globals: true`, this project runs `globals: false`, and 19 of
115 component suites never registered `afterEach(cleanup)` themselves. Leaked DOM is worse than the
loud failure it caused here — a query can also *succeed* against an element the previous test
rendered, which is a green test proving nothing. `src/test/setup.ts` now registers it once. Measured:
this unmasked **zero** latent failures; nothing was relying on the leak.

## Two corrections to the design, applied during implementation

**`LoadingBars` needs `useId`, not a static id.** The design said a static id is acceptable where the
surface is single-instance per route. That is true of the three original surfaces and false of this
one: six of `LoadingBars`' eight adopters render together on `DownloadsRoute`, and `aria-labelledby`
resolves through `getElementById`, so duplicate ids would name every region after whichever span the
browser found first — silently, with only one region correct. A test asserts two co-rendered instances
keep their own names. The rule generalises: a shared component can never assume single instancing.

**`SoloAnimeDownloadPanel`'s row is single-line.** The design called it "the Editor rail's two-line row
shape". The resolved JSX is a name and a status tag inside one `Button`. The code won, per CLAUDE.md
rule 2, and `design.md` was corrected.

## Two React Aria constraints found by measurement

Both were verified against rendered HTML rather than assumed, and both are recorded because they look
like oversights to a later reader:

- **`Table.Content` silently drops unrecognised `aria-*` props.** `aria-busy` had to go on the outer
  `<Table>` wrapper (`data-slot="table"`), and the tests query it there.
- **Skeleton table rows must be plain builder functions, not components.** React Aria's static table
  collection walks the literal `Table.Row` elements passed as `Table.Body` children, so
  `buildXSkeletonRows()` called inside the children is discoverable where `<XSkeletonRows />` is not.

## The layout gate failed on its first run, against a real defect

The table comparison was added to `loading-skeletons-fixture.tsx` and immediately reported:

```
FAIL network-table: the placeholder is the height of the row it replaces
     — placeholder 45px vs row 36px, drift 9px, tolerance 6px
```

The placeholder pills were `h-5`; at `h-4` the drift fell to 5px, which passed but left one pixel of
headroom, and at `h-3.5` it settled at 3px. That is a better proof than the deliberate break this
task planned: the gate caught a defect nobody had noticed rather than one planted to test it.

Measured drift at both viewports:

| Surface | Placeholder | Real row | Drift |
|---|---|---|---|
| Today | 128px | 128px | 0px |
| Editor Library | 56px | 58px | 2px |
| Catalog | 70px | 74px | 4px |
| Network table row | 39px | 36px | 3px |

Tolerance 6px.

## Artwork stability, investigated on report

The user reported the empty-state artwork disappearing when the dev server is reloaded repeatedly. The
evidence was in the Wails log: `[ExternalAssetHandler] Proxy error: dial tcp [::1]:5173 …`.
`wails.json` sets `frontend:dev:serverUrl: "auto"`, so under `wails dev` the shell proxies asset
requests to Vite; while Vite restarts, that proxy cannot dial it. The already-loaded bundle keeps
rendering, so exactly one picture fails in an otherwise healthy screen. A built binary embeds the
assets (`main.go:14`, `//go:embed all:frontend/dist`) and cannot reproduce it.

So the assets are not unstable — but the `<img>` had no `onError`, and a failed decorative image left
the browser's broken-image glyph, which reads as an app defect rather than a missing decoration.
`AirisEmptyState` now drops the artwork on failure and keeps the copy and the action, following the
repo's own precedent at `AnimeDetail.tsx:75`. State lives in a colocated `use-airis-empty-state.ts`,
matching `shared/ui/CodeBlock/`.

## Complexity paid down

Adopting `LoadingBars` and threading `isLoading` touched four functions whose pre-existing complexity
the changed-code gate then attributed to this change. All four were brought under threshold by
extraction; no `fallow-ignore` was added anywhere.

| Function | Cognitive before | After | How |
|---|---|---|---|
| `SchedulePanel` | 16 | 5 | six colocated disclosure components |
| `RunHistoryPanel` | 17 | 7 | four components, including the nested-map block that carried JSX depth 6 |
| `SoloAnimeDownloadPanel` | 16 | 3 | five components; its loading gate became an early return in the extracted rail, which reads better than the inline condition it replaced |
| `useNetworkPanel` | 23 | 14 | three focused hooks, mirroring the `useEpisodeSchedulePanel` split |
| `measureTableComparison` (fixture) | CRAP 30 | under | header check and placeholder count extracted |

`useNetworkPanel` lands at 14 against a threshold of 15 — one point of headroom, and that is honest
rather than comfortable. Its remaining score is hook density (each hook call counts one), and the
structure holding it there is a ref bridge between the window and sync hooks that avoids a circular
dependency and predates this change. Adding indirection to shave one more point would trade a real
structure for a number.

## Gates (run by the orchestrator, actual output)

| Gate | Result |
|---|---|
| `bun --cwd=frontend run test` | 270 files / **2452 tests** passed |
| `bun --cwd=frontend run typecheck` | Clean |
| `bunx eslint <staged>` | 0 problems — 27 pre-existing JSDoc gaps in touched test files were paid off |
| `fallow audit --gate new-only` | exit 0 |
| `bun --cwd=frontend run layout:smoke` | Green at 1280×900 and 1600×1000 |
| `bun --cwd=frontend run render:smoke` | Green on all six routes |
| `bun --cwd=frontend run test:mutation:staged` | **80.39** against a break threshold of 80 — see the note below |
| `lefthook run pre-commit` | **Green, exit 0** (685s; the mutation step alone was 572s) |

### Margin raised by strengthening existing tests, not by adding new ones

Four existing tests gained the assertion their surviving mutants were pointing at. No new test file or
case was written; each survivor was a line an existing test already executed without asserting its
effect.

| Test strengthened | What it was missing |
|---|---|
| `useCatalogPanel` "restores every filter to the all-records default" | It called every setter and then asserted only the state **after** the reset. A setter that did nothing, or wrote to the wrong key, produced the same cleared object. It now asserts the intermediate state field by field, and exercises all seven setters instead of four |
| `useEpisodeSchedulePanel` "fetches the cover once per distinct animeID" | Its `rerender()` calls could never reach the once-per-id guard: the cover effect depends on `items`, which a rerender does not change. It now pushes an anime change, which refetches and hands back a new array of the same rows — the only path that re-enters the effect with ids it has already fetched |
| `SoloAnimeDownloadPanel` "mirrors the rail row shape with placeholder rows" | It passed `options: []`, so the rail returned early on `options.length === 0` and the loading guard was never the deciding branch. It now passes a non-empty list — the real refetch prop shape — and asserts no row renders |
| `RunHistoryPanel` detail-pane tests | Neither asserted the status chip's colour, the only thing separating a failed run from a successful one. Both halves are now asserted, because either alone still passes when the colours are swapped |

Verified load-bearing rather than assumed: un-gating `SoloAnimeDownloadResultRail`'s loading guard
turned its test red, and restoring it turned it green.

Result: **80.39 → 80.95**.

### The staged mutation score is a floor, not the value

Chasing the remaining survivors stopped being worthwhile once two of them were checked by hand.
Stryker reported both `use-catalog-filters.ts` mutants below as survived:

```
- const onQueryChange = useCallback((query: string) => setField('query', query), [setField]);
+ const onQueryChange = useCallback(() => undefined, [setField]);
+ const onEstadoChange = useCallback((estado: string) => setField("", estado), [setField]);
```

Applied by hand, **both fail `use-catalog-panel.test.ts`**. The suite kills them; Stryker did not run
that test against them. Its "Tests ran" list for each names only the windowing and App-routing suites.

`stryker.dlinter.json` sets no `coverageAnalysis`, so the vitest runner defaults to `perTest`, which
picks a per-mutant test subset from per-test coverage. Hook tests defeat that attribution: a
`renderHook` + `act` state update settles outside the window Stryker credits to the running test, so
the file-to-test link is lost and the mutant is measured against the wrong subset.

The consequence matters more than the number: **the reported score understates the suite**, and
survivors in hook files must be hand-checked before being treated as coverage gaps. `coverageAnalysis:
"all"` would fix the attribution by running the whole suite per mutant, but the mutation step already
costs ~570s of a 685s gate, so that trade is a team decision rather than one to make inside this
change.

### The score passed on the first run with 0.39 to spare — stated plainly

That is not comfortable, and it should not be reported as though it were. Earlier runs in this change
series sat at 83–87.

The drop is explained rather than mysterious: the complexity paydown extracted sixteen new files, and
extraction moves **pre-existing untested JSX branches into new lines**, which puts them inside the
staged mutation scope for the first time. Coverage did not get worse; previously invisible gaps became
visible. The largest concentrations are `use-catalog-filters.ts` (20 survivors), `use-episode-covers.ts`
(16), `use-network-panel-sync.ts` (15), and the newly extracted `RunHistoryDetailPane` (14) and
`SoloAnimeDownloadResultRail` (12) — presentational branches that were untested inside their former
parents and are still untested in their new homes.

Nothing here is a regression this change introduced, and the gate's own threshold is met. But a change
that lands at 80.39 leaves the next staged edit in these files with almost no room, so this is
recorded as a real follow-up rather than a rounding detail: the extracted presentational components
deserve their own tests.

Every Go job skipped: this change stages no `.go` file.

## Receipt-driven development

RDD is enabled on this repository and held this candidate. The selectorless STATUS preflight was run
and its exact provider-issued START executed unchanged, which returned a
`gentle-ai.review-integration.consent/v3` envelope. The envelope was relayed to the human losslessly
and answered by them: **declined**. The exact declined invocation was run once and confirmed
`consent: "declined_this_candidate"` on target `sha256:3413c9d9…e0b9c007`, with no lineage and no
receipt created. A decline is candidate-scoped and is not the kill switch; delivery follows ordinary
repository policy, which is the pre-commit gate above.

Recorded for the next candidate: the identity moved three times during this change
(`6d61c71d…` → `cabd4177…` → `a0207f2b…` → `3413c9d9…`) because normalization and then a requested
hardening kept mutating source. The contract's normalization ordering rule is what prevents freezing a
candidate that is about to change, and it was applied deliberately rather than discovered.
