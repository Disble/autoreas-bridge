# Archive Report: Loading Skeletons Completion

**Date:** 2026-09-08
**Branch:** `dev`
**Commit:** `f97e1de` (full pre-commit gate passed, exit 0)
**Status:** Complete — implemented, verified, and committed

## Executive Summary

`loading-skeletons` converted three surfaces and left nine behind. This change finishes the sweep: no
surface in `frontend/src` answers an unresolved request with a sentence, no skeleton draws itself
without announcing what is loading, and the rule is now mandatory in `autoreas-theme` so the next
surface starts correct instead of being caught in review. All four phases are delivered; the gate
passes at 2452 tests with a staged mutation score of 80.95 against a threshold of 80.

Mid-change the user rejected the work with a screenshot: skeletons and real anime cards rendered at
the same time. That defect, its root cause in the tests rather than the markup, and the rule that now
prevents it are the most important thing this change produced.

## Change Closure

### Scope Delivered

- **Shared bars (Group C):** `shared/ui/LoadingBars/` — one component owning the bars *and* the status
  region, adopted by eight surfaces (`HosterPriorityEditor`, `RunHistoryPanel`, `EpisodeRenamePanel`,
  `SchedulePanel`, `JDLimitsPanel`, `JDConfigPanel`, `SeasonWorkspace`, `HistoryTable`). The seven
  `<section aria-label="Loading X">` copies are gone.
- **Text surfaces (Group A):** `AnimeDetailSkeleton`, `SoloAnimeDownloadSkeleton` and
  `SyncingAnimeSkeleton` replace the loading paragraph and the two spinner-plus-sentence states.
- **Tables (Group B):** skeleton `Table.Row`s in `NetworkTable`, `TransactionTable` and both
  `ActivityOverview` tables, keeping the header and column widths, with `aria-busy` on the table
  wrapper and an adjacent status region. `renderEmptyState` no longer conflates loading with empty.
- **The rule (Group D):** `autoreas-theme` v1.1.1 gained a mandatory loading-and-empty-state section
  naming both components, the exact status-region markup, and why `aria-labelledby` is required.
- **Two surfaces the inventory could not see:** `BridgeStatusCard` (a bare `<Spinner>`, silent to a
  text-based grep) and `ActivityOverview`'s "Newest events" `<ul>`.
- **Layout proof:** `loading-skeletons-fixture.tsx` gained a table comparison, which failed on its
  first run against a real 9px drift nobody had noticed.

### Measured Results

| Check | Result |
|---|---|
| `bun --cwd=frontend run test` | 270 files / 2452 tests (2425 before) |
| `bun --cwd=frontend run typecheck` | Clean |
| `bunx eslint <staged>` | 0 problems — 27 pre-existing JSDoc gaps paid off |
| `fallow audit --gate new-only` | exit 0 |
| `bun --cwd=frontend run layout:smoke` | Green at 1280×900 and 1600×1000 |
| `bun --cwd=frontend run render:smoke` | Green, 6 routes |
| `bun --cwd=frontend run test:mutation:staged` | 80.39, raised to 80.95 (threshold 80) |
| `lefthook run pre-commit` | exit 0 (685s; the mutation step alone was 572s) |

Measured placeholder drift, both viewports, tolerance 6px: Today 0px, Editor Library 2px, Catalog 4px,
Network table row 3px.

### Spec Deltas Merged

| Delta | Destination |
|---|---|
| `loading-skeletons` (2 MODIFIED, 1 ADDED) | `openspec/specs/loading-skeletons/spec.md` |

- **Shape-mirroring loading placeholders** — broadened from the three named surfaces to *any* surface,
  and gained the exclusivity scenario "A placeholder replaces the content rather than joining it".
- **Loading is announced, not merely drawn** — broadened likewise, and gained "A landmark label is not
  an announcement" and "A loading table is marked busy". The Catalog-specific scenario was dropped as
  subsumed by the broadened one.
- **One shared placeholder for uniform bar skeletons** — ADDED, requiring that the shared component
  carry the status region so no adopter can render bars silently.

## Decisions Worth Carrying Forward

- **A loading state and its content are EXCLUSIVE, and the test that proves it is a negative.** Three
  surfaces gated the content branch on the collection instead of on the request, so a refetch drew
  placeholders *and* the previous rows. On first mount the collection is empty, so the bug is
  invisible; it only appears on a day switch, a filter change or a tab change. Every loading test
  asserted the skeleton appears while loading and is gone once resolved — neither can fail while both
  blocks render. The missing assertion is *no real content is present while loading*. It now exists on
  every converted surface, and it was proved load-bearing by deliberately un-gating `CatalogPanel`.
- **An inventory built from text misses every silent loading state.** The scope was built by grepping
  `Loading [a-z]`. `BridgeStatusCard` rendered a bare `<Spinner>` with no text and was invisible to
  that grep and to the previous change's. Sweep for the components too, not only the copy.
- **A shared component can never assume single instancing.** The design allowed a static id for
  `aria-labelledby`; six of `LoadingBars`' eight adopters render together on `DownloadsRoute`, and
  `getElementById` would have named every region after the first span — silently, with one correct.
  `useId()`, with a test asserting two co-rendered instances keep their own names.
- **React Aria's static table collection walks literal elements.** `buildXSkeletonRows()` called inside
  `Table.Body`'s children is discoverable; `<XSkeletonRows />` is not. And `Table.Content` silently
  drops unrecognised `aria-*`, so `aria-busy` belongs on the outer `data-slot="table"` wrapper.
- **The staged mutation score is a floor, not the value.** `stryker.dlinter.json` sets no
  `coverageAnalysis`, so vitest defaults to `perTest`. Two reported `use-catalog-filters.ts` survivors
  were applied by hand and *both* fail `use-catalog-panel.test.ts`: a `renderHook` + `act` update
  settles outside the window Stryker credits to the running test, so the mutant is measured against
  the wrong subset. Hand-check survivors in hook files before treating them as coverage gaps.
- **Extraction moves pre-existing untested branches into the staged scope.** The complexity paydown
  extracted sixteen files and the score fell from 83–87 to 80.39. Coverage did not get worse;
  previously invisible gaps became visible for the first time.
- **Raising the margin by strengthening existing tests beats adding new ones.** Four existing tests
  gained the assertion their survivors were pointing at — no new file, no new case — for 80.39 → 80.95.
- **Testing Library registers no cleanup under `globals: false`.** 19 of 115 component suites never
  registered `afterEach(cleanup)` themselves. Leaked DOM is worse than the loud failure that exposed
  it, because a query can also *succeed* against a previous test's element. `src/test/setup.ts` now
  registers it once; it unmasked zero latent failures and made the windowing suite faster.
- **The artwork was never unstable.** `wails.json` sets `frontend:dev:serverUrl: "auto"`, so under
  `wails dev` the shell proxies asset requests to Vite; while Vite restarts the proxy cannot dial
  `[::1]:5173` and exactly one picture fails in an otherwise healthy screen. A built binary embeds the
  assets and cannot reproduce it. What was missing was `onError`: `AirisEmptyState` now drops the
  artwork and keeps the copy and the action, following `AnimeDetail.tsx:75`.

## Follow-ups Not Taken Here

- The extracted presentational components deserve their own tests. The largest survivor concentrations
  are `use-catalog-filters.ts` (20), `use-episode-covers.ts` (16), `use-network-panel-sync.ts` (15),
  `RunHistoryDetailPane` (14) and `SoloAnimeDownloadResultRail` (12). Landing at 80.39 leaves the next
  staged edit in those files almost no room.
- `coverageAnalysis: "all"` in `stryker.dlinter.json` would fix the attribution defect above by running
  the whole suite per mutant. The mutation step already costs ~570s of a 685s gate, so that is a team
  decision rather than one to make inside a change.
- `useNetworkPanel` sits at 14 against a threshold of 15. Its remaining score is hook density, held
  there by a ref bridge that avoids a circular dependency and predates this change.

## Receipt-Driven Development

RDD is enabled on this repository and held both candidates in this change. Each selectorless STATUS
preflight was run and its exact provider-issued START executed unchanged; each returned a
`gentle-ai.review-integration.consent/v3` envelope, which was relayed to the human losslessly and
answered **declined** (`sha256:3413c9d9…`, then `sha256:fdf0c90a…`). Both exact declined invocations
were run once and confirmed `consent: "declined_this_candidate"`, with no lineage and no receipt
created. A decline is candidate-scoped and is not the kill switch; delivery followed ordinary
repository policy, which is the pre-commit gate above.
